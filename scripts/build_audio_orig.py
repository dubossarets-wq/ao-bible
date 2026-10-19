#!/usr/bin/env python3
"""Живое чтение оригинала по словам: начала слов в записях иврита и греческого (для подстрочника).

Синтеза речи нет: только принудительное выравнивание нашего текста с живой записью (torchaudio MMS_FA,
тот же выравниватель, что в build_audio.py). Записи не меняются и не кладутся на наш сайт — в модулях
только ссылки на archive.org; копии для расчёта лежат в кэше data-src/audio/… (папка в .gitignore).

  hbo-words — Ветхий Завет, Авраам Шмуэлоф (archive.org/details/HebBible_AShmuelof, CC BY-NC-ND 4.0).
              Время стихов уже есть (разметка авторов, build_audio_hbo.py → segments). Внутри отрезка
              стиха (с небольшими полями) выравниваем слова стиха из oshb.json — в том же порядке, в каком
              приложение делит стих на слова (src/core/verseMarkup.js, tokenize) — и дописываем начала
              слов 4-м элементом: segments["Gen.1.1"] = [файл, начало, конец, [начала слов]].
              Еврейский текст транслитерируется в латиницу (современное израильское чтение: огласовки,
              шва, хатафы, дагеш, шин/син, матер лекционис; кантилляция снимается).
  grc       — Новый Завет, Марилин Фемистер (archive.org/details/
              AudiogreeknewtestamentOfWescott.hort.readByMarilynPhemister, CC BY-NC 3.0 US), текст
              Весткотта — Хорта, эразмово произношение, файл на главу. Главу выравниваем по тексту
              byz-rp2018 (синодальная нумерация): между стихами и частями стиха — «звёздочка», она
              поглощает расхождения WH/Byz и слова чтеца вне текста (название книги и главы); стихов,
              которых нет у WH (Мф 17:21 и т. п.), в записи нет — они остаются без времени. Рим 14:24–26
              (славословие; у WH — 16:25–27) ищем в конце записи 16-й главы. Затем, как для иврита,
              слова внутри каждого найденного стиха. Результат — модуль audio-grc-phemister.json.

Ненадёжные стихи (низкая средняя вероятность букв, слишком длинные или «пустые» слова) начал слов не
получают — приложение подсветит слова примерно, пропорционально длине.

Порядок запуска (из корня проекта, Python с torch/torchaudio — например C:/Users/stude/aob-align):
  python -I scripts/build_audio_hbo.py                       # время стихов иврита (разметка авторов)
  python -I scripts/build_audio_orig.py hbo-words            # + начала слов (можно --books Gen Ps)
  python -I scripts/build_audio_orig.py grc                  # греческий НЗ целиком (или --books Matt John)
  python -I scripts/build_audio_orig.py stats                # проверка согласованности обоих модулей
build_audio_hbo.py сам берёт уже посчитанные начала слов из data-src/audio/hbo/words.json, поэтому его
пересборка их не стирает; hbo-words после него можно не запускать, если записи и разметка не менялись.

Идемпотентно: записи (проверка размера и md5 по метаданным archive.org), эмиссии модели и результаты
выравнивания каждой записи кэшируются в data-src/audio/hbo/ и data-src/audio/grc-phemister/;
повторный запуск только пересобирает JSON. Сменились правила — увеличьте *_VERSION.
"""
import argparse
import json
import re
import statistics
import sys
import time
import unicodedata
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
try:  # torch из окружения, где запущен Python; иначе — из .pylib-audio (как в build_audio.py)
    import numpy as np  # noqa: F401
    import torch  # noqa: F401
    import torchaudio  # noqa: F401
except ImportError:
    sys.path.insert(0, str(HERE.parent / ".pylib-audio"))
    import numpy as np  # noqa: F401
    import torch  # noqa: F401
    import torchaudio  # noqa: F401
import build_audio as BA  # noqa: E402
from extra_lib import merge_catalog, write_module  # noqa: E402

ROOT = HERE.parent
OUT = ROOT / "public" / "modules"
DATA = ROOT / "data-src" / "audio"
APPROVED = HERE / "approved-modules.json"
log = BA.log

HBO_ITEM = "HebBible_AShmuelof"
HBO_ID = "audio-hbo-shmuelof"
HBO_DIR = DATA / "hbo"
HBO_WORDS = HBO_DIR / "words.json"  # итог: {"Gen.1.1": [начало, конец, [начала слов]]} — читает и build_audio_hbo.py
HBO_VERSION = 4

GRC_ITEM = "AudiogreeknewtestamentOfWescott.hort.readByMarilynPhemister"
GRC_ID = "audio-grc-phemister"
GRC_DIR = DATA / "grc-phemister"
GRC_VERSION = 3

# Оценка надёжности стиха (по аналогии с BA.MIN_SCORE для стихов): средняя вероятность букв стиха,
# доля слов с почти нулевой вероятностью, длина слов
WORD_MIN_SCORE = {"hbo": 0.30, "grc": 0.30}
WORD_BAD_SHARE = {"hbo": 0.15, "grc": 0.20}   # слов с оценкой < 0.05 не больше этой доли
WORD_MAX_LEN = 2.5    # звучание слова (от первой до последней буквы) дольше — выравнивание «расползлось»
WORD_MIN_LEN = 0.06   # короче — слово «сжато» в пару кадров (его в записи нет)
EDGE = 0.7            # поля вокруг отрезка стиха, с
PAUSE = 0.3           # пауза между скачиваниями с archive.org, с


# --- Слова стиха — как в приложении (src/core/verseMarkup.js: tokenize + WORD) ----------------------------

def _wc(c):
    return unicodedata.category(c)[0] in "LM"


def plain_words(s):
    """WORD = /[\\p{L}\\p{M}]+(?:[-’'][\\p{L}\\p{M}]+)*/gu"""
    out, i, n = [], 0, len(s)
    while i < n:
        if not _wc(s[i]):
            i += 1
            continue
        j = i
        while j < n and _wc(s[j]):
            j += 1
        while j + 1 < n and s[j] in "-’'" and _wc(s[j + 1]):
            j += 1
            while j < n and _wc(s[j]):
                j += 1
        out.append(s[i:j])
        i = j
    return out


def verse_tokens(text):
    """[(слово, текст после слова до следующего слова)] — слова в порядке токенов kind 'w' приложения."""
    toks = []  # ('w', слово) | ('t', текст)

    def push_plain(s):
        last = 0
        for w in plain_words(s):
            k = s.index(w, last)
            if k > last:
                toks.append(("t", s[last:k]))
            toks.append(("w", w))
            last = k + len(w)
        if last < len(s):
            toks.append(("t", s[last:]))

    i, n = 0, len(text)
    while i < n:
        ch = text[i]
        if ch in "‹›":
            i += 1
        elif ch == "{":
            end = text.find("}", i)
            if end < 0:
                push_plain(text[i:])
                break
            parts = text[i + 1:end].split("|")
            word, s = parts[0], parts[1] if len(parts) > 1 else ""
            if s.split():
                toks.append(("w", word))
            else:
                push_plain(word)
            i = end + 1
        else:
            j = i
            while j < n and text[j] not in "‹›{":
                j += 1
            push_plain(text[i:j])
            i = j
    out = []
    for kind, t in toks:
        if kind == "w":
            out.append([t, ""])
        elif out:
            out[-1][1] += t
    return [tuple(x) for x in out]


# --- Иврит → латиница (современное израильское чтение) ------------------------------------------------------

SHEVA, HSEGOL, HPATAH, HQAMATS = "\u05b0", "\u05b1", "\u05b2", "\u05b3"
HIRIQ, TSERE, SEGOL, PATAH, QAMATS = "\u05b4", "\u05b5", "\u05b6", "\u05b7", "\u05b8"
HOLAM, HOLAM_V, QUBUTS, DAGESH = "\u05b9", "\u05ba", "\u05bb", "\u05bc"
SHIN_DOT, SIN_DOT, QQATAN = "\u05c1", "\u05c2", "\u05c7"
HB_VOWEL = {HSEGOL: "e", HPATAH: "a", HQAMATS: "o", HIRIQ: "i", TSERE: "e", SEGOL: "e", PATAH: "a",
            QAMATS: "a", HOLAM: "o", HOLAM_V: "o", QUBUTS: "u", QQATAN: "o"}
HB_FINAL = {"ך": "כ", "ם": "מ", "ן": "נ", "ף": "פ", "ץ": "צ"}
HB_CONS = {"א": "", "ב": "v", "ג": "g", "ד": "d", "ה": "h", "ו": "v", "ז": "z", "ח": "kh", "ט": "t", "י": "y",
           "כ": "kh", "ל": "l", "מ": "m", "נ": "n", "ס": "s", "ע": "", "פ": "f", "צ": "ts", "ק": "k", "ר": "r",
           "ש": "sh", "ת": "t"}
HB_HARD = {"ב": "b", "כ": "k", "פ": "p"}  # с дагешем
# Варианты чтения (подобраны по средней вероятности букв на выборке глав, см. calibrate):
#   init_hard — ב/כ/פ в начале слова всегда твёрдые (по-современному), а не по огласовке
HB_OPTS = {"init_hard": False, "het": "h", "vocal_sheva": True}
# Огласовки и знаки, которые читаются; всё прочее (кантилляция, метег, рафе, точки) снимается
HB_KEEP = set(HB_VOWEL) | {SHEVA, DAGESH, SHIN_DOT, SIN_DOT}


def _hb_clusters(word):
    """Слово → [{'L': буква (без конечной формы), 'fin': была конечной, 'd': дагеш, 'sin': син, 'v': [огласовки]}]"""
    out = []
    for c in word:
        if "\u05d0" <= c <= "\u05ea":
            out.append({"L": HB_FINAL.get(c, c), "fin": c in HB_FINAL, "d": False, "sin": False, "v": [], "sh": False})
        elif out and c in HB_KEEP:
            x = out[-1]
            if c == DAGESH:
                x["d"] = True
            elif c == SIN_DOT:
                x["sin"] = True
            elif c == SHIN_DOT:
                x["sh"] = True
            else:
                x["v"].append(c)
    return out


def _full(x):
    """Полная гласная (не шва) у буквы — или у буквы-«чтения»"""
    return any(v != SHEVA for v in x["v"]) or x.get("mater")


def hebrew(word):
    """Еврейское слово (с огласовками) → латиница a-z для MMS_FA.

    Израильское чтение: ב/כ/פ с дагешем — b/k/p, без — v/kh/f; ח — h; א и ע не звучат; ש — sh, с точкой
    слева (син) — s. Огласовки: патах/камац — a (камац катан и «כָּל» — o), цере/сеголь — e, хирик — i,
    холам — o, кубуц/шурук — u; хатафы — a/e/o. Шва звучит (e) в начале слова, после другого шва
    (не в конце слова), под дагешем хазак, после начального וּ и между одинаковыми согласными, иначе немое. Матер лекционис: וֹ — o, וּ — u,
    י после i/e — немая, после a — i («ай»), ָיו — «ав»; ה в конце без мапика — немая. Вороватый патах
    (רוּחַ) — перед согласной. Тетраграмматон — «адонай» (с огласовкой хирик — «элохим»)."""
    cl = _hb_clusters(word)
    if not cl:
        return ""
    if not any(x["v"] or x["d"] for x in cl):  # ктив без огласовок: буквы как есть, ו и י — гласные
        return "".join({"ו": "o", "י": "i", "א": "a", "ע": "a"}.get(x["L"], HB_CONS[x["L"]]) for x in cl)
    # Тетраграмматон (с приставками ו ב כ ל מ ש ה)
    skel = "".join(x["L"] for x in cl)
    name = None
    if skel.endswith("יהוה") and len(skel) - 4 <= 3:
        k = len(cl) - 4
        name = "elohim" if any(HIRIQ in x["v"] for x in cl[k:]) else "adonai"
        cl = cl[:k]
    n = len(cl)
    # 1) буквы-«чтения» (матер лекционис) и шурук
    for i, x in enumerate(cl):
        prev = cl[i - 1] if i else None
        nxt = cl[i + 1] if i + 1 < n else None
        x["mater"], x["silent"] = None, False
        if x["L"] == "ו":
            if x["d"] and not x["v"] and (prev is None or not _full(prev)):
                x["mater"] = "u"
            elif x["v"] == [HOLAM] and not x["d"] and prev is not None and not _full(prev):
                x["mater"] = "o"
        elif x["L"] == "י" and not x["v"] and not x["d"] and prev is not None:
            pv = "".join(HB_VOWEL.get(v, "") for v in prev["v"]) or (prev.get("mater") or "")
            if pv[-1:] in ("i", "e"):
                x["silent"] = True
            elif pv[-1:] == "a" and nxt is not None and nxt["L"] == "ו" and i + 2 == n and not nxt["v"]:
                x["silent"] = True  # ָיו — «ав»
            else:
                x["mater"] = "i"
        elif x["L"] == "ה" and i == n - 1 and not x["d"] and not x["v"] and prev is not None:
            x["silent"] = True
        elif x["L"] == "א" and not x["v"]:
            x["silent"] = True
    out = []
    for i, x in enumerate(cl):
        prev = cl[i - 1] if i else None
        nxt = cl[i + 1] if i + 1 < n else None
        if x["silent"]:
            continue
        if x["mater"]:
            out.append(x["mater"])
            continue
        L = x["L"]
        hard = x["d"] or (HB_OPTS["init_hard"] and i == 0)
        cons = HB_HARD[L] if hard and L in HB_HARD else HB_CONS[L]
        if L == "ח":
            cons = HB_OPTS["het"]
        if L == "ש" and x["sin"] and not x["sh"]:
            cons = "s"
        # гласные буквы
        vs = [v for v in x["v"] if v != SHEVA]
        vow = "".join(sorted((HB_VOWEL[v] for v in vs), key=lambda c: c != "a"))  # ירושלִַם — «ай»
        if (L == "כ" and QAMATS in x["v"] and nxt is not None and nxt["L"] == "ל" and i + 2 == n
                and not nxt["v"]):
            vow = "o"  # כָּל — «коль»
        if SHEVA in x["v"] and not vs:
            vocal = (i == 0 and n > 1) or (
                prev is not None and SHEVA in prev["v"] and not _full(prev) and i < n - 1 and i > 1) or (
                nxt is not None and nxt["L"] == L and not x["fin"]) or (
                i == 1 and prev["mater"] == "u") or (  # וּבְ — «уве»
                x["d"] and prev is not None and _full(prev) and L != "ה" and i < n - 1)  # дагеш хазак
            vow = "e" if vocal and (HB_OPTS["vocal_sheva"] or i == 0) else ""
        # вороватый патах: רוּחַ, רֵעַ, גָּבֹהַּ — гласная перед согласной
        if i == n - 1 and n > 1 and vow == "a" and (L in "חע" or (L == "ה" and x["d"])) and (_full(prev) or prev["silent"]):
            out.append("a" + cons)
            continue
        out.append(cons + vow)
    s = "".join(out)
    if name:
        s = s + ("donai" if name == "adonai" and s.endswith("a") else name)
    return re.sub(r"[^a-z]", "", s)


# --- Греческий → латиница (эразмово произношение) ------------------------------------------------------------

GR_LET = dict(zip("αβγδεζηθικλμνξοπρσςτυφχψω",
                  ["a", "b", "g", "d", "e", "z", "e", "th", "i", "k", "l", "m", "n", "x", "o", "p", "r", "s", "s", "t",
                   "u", "f", "k", "ps", "o"]))
GR_DIPH = {"αι": "ai", "ει": "e", "οι": "oi", "υι": "ui", "ου": "u", "αυ": "au", "ευ": "eu", "ηυ": "eu"}
GR_NASAL = {"γγ": "ng", "γκ": "nk", "γξ": "nx", "γχ": "nkh"}
GR_VOWELS = set("αεηιουω")
# Подобрано по правдоподобию записи на кадр (8 глав, calibrate): χ — k, ει — e лучше, чем kh/ei;
# густое придыхание у чтицы почти не слышно модели — без «h» совпадение лучше
GR_ROUGH_H = False


def erasmian(word):
    """Греческое слово → латиница a-z (эразмово чтение: η — e, ει — e, ου — u, αι/οι/αυ/ευ — дифтонги,
    β — b, χ — k, γγ/γκ — ng/nk; густое придыхание — h, если GR_ROUGH_H). Диерезис разбивает дифтонг."""
    t = unicodedata.normalize("NFD", word.lower())
    letters = []  # [буква, густое придыхание, диерезис]
    for c in t:
        if c in GR_LET:
            letters.append([c, False, False])
        elif letters and c == "\u0314":
            letters[-1][1] = True
        elif letters and c == "\u0308":
            letters[-1][2] = True
    if not letters:
        return re.sub(r"[^a-z]", "", "".join(c for c in t if not unicodedata.combining(c)))
    out = []
    # придыхание стоит на первой гласной или на второй букве начального дифтонга
    head = 0
    while head < len(letters) and letters[head][0] in GR_VOWELS:
        head += 1
    if GR_ROUGH_H and any(x[1] for x in letters[:max(head, 1)]) and letters[0][0] != "ρ":
        out.append("h")
    i = 0
    while i < len(letters):
        c = letters[i][0]
        pair = c + letters[i + 1][0] if i + 1 < len(letters) else ""
        if pair in GR_DIPH and not letters[i + 1][2]:
            out.append(GR_DIPH[pair])
            i += 2
            continue
        if pair in GR_NASAL:
            out.append(GR_NASAL[pair])
            i += 2
            continue
        out.append(GR_LET[c])
        i += 1
    return "".join(out)


# --- Выравнивание слов ---------------------------------------------------------------------------------------

class WordAligner(BA.Aligner):
    """BA.Aligner + выравнивание стиха по словам внутри известного отрезка записи."""

    def word_tokens(self, words, lang):
        tr = hebrew if lang == "hbo" else erasmian
        out = []
        for w in words:
            tk = [self.dict[c] for c in tr(w) if c in self.dict]
            out.append(tk or [self.dict["a"]])  # слово без букв латиницы (не бывает, но длина списка важна)
        return out

    def align_words(self, em, wtoks, t0, t1):
        """wtoks — токены слов; отрезок [t0, t1] (с). Между словами — «звёздочка» со штрафом (поглощает
        слова чтеца, которых нет в тексте), по краям — бесплатная (соседние стихи).
        Возвращает (оценка стиха, [(начало, конец, оценка слова)], сколько секунд поглотили звёздочки)."""
        torch = self.torch
        f0, f1 = max(0, int(t0 * self.FPS)), min(em.shape[0], int(t1 * self.FPS) + 1)
        edge, inner = self.star, self.star + 1
        targets, idx = [edge], []
        for k, w in enumerate(wtoks):
            if k:
                targets.append(inner)
            idx.append((len(targets), len(targets) + len(w)))
            targets += w
        targets.append(edge)
        need = len(targets) + sum(1 for a, b in zip(targets, targets[1:]) if a == b)
        if f1 - f0 < need:
            return None
        e = em[f0:f1]
        e = torch.cat([e[:, :self.star], torch.zeros(e.shape[0], 1), torch.full((e.shape[0], 1), BA.STAR_LOGP)], 1)
        tt = torch.tensor([targets], dtype=torch.int32, device=self.dev)
        ali, sc = self.F.forced_align(e.unsqueeze(0).to(self.dev), tt, blank=0)
        spans = self.F.merge_tokens(ali[0].cpu(), sc[0].exp().cpu())
        assert len(spans) == len(targets)
        words, letters = [], []
        gap = int(0.3 * self.FPS)
        for a, b in idx:
            ss = spans[a:b]
            letters += [s.score for s in ss]
            # Первая буква слова может «прилипнуть» к такой же букве в конце предыдущего слова или стиха
            # (ваз «ve…» после «…vanav»): если после первой-второй буквы разрыв > 0,3 с — начало после него.
            # То же для последних букв.
            i0, i1 = 0, len(ss) - 1
            for k in range(1, min(3, len(ss))):
                if ss[k].start - ss[k - 1].end > gap:
                    i0 = k
            for k in range(len(ss) - 1, max(0, len(ss) - 3), -1):
                if ss[k].start - ss[k - 1].end > gap:
                    i1 = k - 1
            if i1 < i0:
                i0, i1 = 0, len(ss) - 1
            words.append(((f0 + ss[i0].start) / self.FPS, (f0 + ss[i1].end) / self.FPS,
                          sum(s.score for s in ss) / len(ss)))
        star = sum(s.end - s.start for s in spans if s.token == inner) / self.FPS
        return sum(letters) / len(letters), words, star


def judge(lang, score, words, seg_end):
    """Надёжно ли выровнен стих. Возвращает причину отказа или None."""
    if score < WORD_MIN_SCORE[lang]:
        return "score"
    if sum(1 for w in words if w[2] < 0.05) > WORD_BAD_SHARE[lang] * len(words):
        return "bad-words"
    if any(b - a > WORD_MAX_LEN for a, b, _ in words):
        return "long"
    # слово «сжато»: до начала следующего меньше WORD_MIN_LEN (короткие слова вроде ὁ звучат 1–3 кадра —
    # поэтому считаем от начала до начала, а не длину букв)
    starts = [a for a, _, _ in words]
    squeezed = sum(1 for a, b in zip(starts, starts[1:]) if b - a < WORD_MIN_LEN)
    if len(words) > 1 and squeezed > max(1, 0.1 * len(words)):
        return "short"
    if words and words[-1][0] >= seg_end:
        return "outside"
    return None


def word_starts(words, seg_start, seg_end, lead=0.04):
    """Начала слов для приложения: начало первой буквы чуть раньше, не раньше конца предыдущего слова,
    в пределах отрезка стиха; строго возрастают."""
    out, prev_end = [], seg_start
    for a, b, _ in words:
        t = round(min(max(a - lead, prev_end, seg_start), seg_end - 0.01), 2)
        if out and t <= out[-1]:
            t = round(out[-1] + 0.01, 2)
        out.append(t)
        prev_end = b
    return out


# --- Записи: скачивание и эмиссии ------------------------------------------------------------------------------

def ia_mp3(item):
    md = BA.cached_json(f"https://archive.org/metadata/{item}", DATA / "meta" / f"{item}.json")
    return {f["name"]: f for f in md["files"] if f["name"].endswith(".mp3")}


def fetch(item, name, meta, folder):
    """Скачивает запись в кэш (проверка размера и md5 по метаданным archive.org)."""
    dest = folder / "mp3" / name
    if dest.exists() and dest.stat().st_size == int(meta["size"]):
        return dest
    url = f"https://archive.org/download/{item}/{name}"
    BA.http_get(url, dest, md5=meta["md5"])
    if dest.stat().st_size != int(meta["size"]):
        raise IOError(f"размер не совпал: {name}")
    time.sleep(PAUSE)
    return dest


class Prefetch:
    """Скачивает записи заранее (2 потока), пока выравниватель занят предыдущими."""

    def __init__(self, item, names, meta, folder, need):
        self.pool = ThreadPoolExecutor(max_workers=2)
        self.fut = {n: self.pool.submit(fetch, item, n, meta[n], folder) for n in names if need(n)}

    def get(self, name):
        return self.fut[name].result()


def emission(al, mp3, folder):
    em_path = folder / "em" / (mp3.stem + ".npy")
    if em_path.exists():
        return al.emission(None, em_path)
    return al.emission(BA.load_wav(mp3), em_path)


# --- Иврит ----------------------------------------------------------------------------------------------------

def load_text(mid):
    d = json.loads((OUT / f"{mid}.json").read_text(encoding="utf-8"))
    return {b["id"]: b["chapters"] for b in d["books"]}


def verse_text(bible, key):
    b, c, v = key.rsplit(".", 2)
    ch = bible.get(b)
    if not ch or int(c) > len(ch) or int(v) > len(ch[int(c) - 1]):
        return None
    return ch[int(c) - 1][int(v) - 1]


def build_hbo_words(args):
    t_start = time.time()
    mod = json.loads((OUT / f"{HBO_ID}.json").read_text(encoding="utf-8"))
    files, segs = mod["files"], mod["segments"]
    bible = load_text("oshb")
    meta = ia_mp3(HBO_ITEM)
    books = set(args.books) if args.books else None
    by_file = {}
    for k, s in segs.items():
        if books is None or k.split(".")[0] in books:
            by_file.setdefault(s[0], []).append(k)
    names = {fi: files[fi].rsplit("/", 1)[1] for fi in by_file}
    missing = [n for n in names.values() if n not in meta]
    if missing:
        log(f"  ! нет в метаданных archive.org: {missing[:5]}")
    order = sorted(by_file, key=lambda fi: names[fi])

    def cache_of(fi):
        return HBO_DIR / "align" / (Path(names[fi]).stem + ".json")

    def fresh(fi):
        p = cache_of(fi)
        if not p.exists():
            return False
        c = json.loads(p.read_text(encoding="utf-8"))
        return c.get("v") == HBO_VERSION and all(
            k in c["verses"] and c["verses"][k]["seg"] == segs[k][1:3] for k in by_file[fi])

    todo = [fi for fi in order if names[fi] in meta and not fresh(fi)]
    log(f"иврит: записей {len(order)}, пересчитать {len(todo)}")
    al = WordAligner() if todo else None
    pre = Prefetch(HBO_ITEM, [names[fi] for fi in todo], meta, HBO_DIR, lambda n: True) if todo else None
    audio_s = 0.0
    for n_done, fi in enumerate(todo, 1):
        t0 = time.time()
        mp3 = pre.get(names[fi])
        em = emission(al, mp3, HBO_DIR)
        res = {}
        for k in sorted(by_file[fi], key=lambda x: segs[x][1]):
            _, s0, s1 = segs[k][:3]
            txt = verse_text(bible, k)
            words = [w for w, _ in verse_tokens(txt)] if txt else []
            if not words:
                continue
            r = al.align_words(em, al.word_tokens(words, "hbo"), s0 - EDGE, s1 + EDGE)
            if r is None:
                res[k] = {"seg": [s0, s1], "n": len(words), "why": "short-seg"}
                continue
            score, ww, star = r
            res[k] = {"seg": [s0, s1], "n": len(words), "score": round(score, 3), "star": round(star, 2),
                      "w": [[round(a, 2), round(b, 2), round(c, 3)] for a, b, c in ww]}
        audio_s += em.shape[0] / al.FPS
        p = cache_of(fi)
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(json.dumps({"v": HBO_VERSION, "file": names[fi], "verses": res}), encoding="utf-8")
        if n_done % 25 == 0 or n_done == len(todo):
            log(f"  {n_done}/{len(todo)} {names[fi]} ({time.time() - t0:.1f} с), всего {(time.time() - t_start) / 60:.1f} мин")
    if pre:
        pre.pool.shutdown()
    hbo_apply(mod, bible)
    log(f"иврит: {audio_s / 3600:.1f} ч аудио, {(time.time() - t_start) / 60:.1f} мин")


def hbo_results(segs):
    """Все кэши выравнивания → {ключ: (начала слов | None, причина)} для стихов с тем же отрезком."""
    out = {}
    for p in sorted((HBO_DIR / "align").glob("*.json")):
        c = json.loads(p.read_text(encoding="utf-8"))
        if c.get("v") != HBO_VERSION:
            continue
        for k, r in c["verses"].items():
            s = segs.get(k)
            if s is None or s[1:3] != r["seg"]:
                continue
            if "w" not in r:
                out[k] = (None, r.get("why", "?"))
                continue
            why = judge("hbo", r["score"], r["w"], s[2])
            out[k] = (None, why) if why else (word_starts(r["w"], s[1], s[2]), None)
    return out


def hbo_apply(mod, bible):
    segs = mod["segments"]
    res = hbo_results(segs)
    words = {}
    n_ok = 0
    for k, s in segs.items():
        del s[3:]
        st = res.get(k, (None, None))[0]
        txt = verse_text(bible, k)
        if st and txt and len(st) == len(verse_tokens(txt)):
            s.append(st)
            words[k] = [s[1], s[2], st]
            n_ok += 1
    HBO_WORDS.parent.mkdir(parents=True, exist_ok=True)
    HBO_WORDS.write_text(json.dumps(words, separators=(",", ":")), encoding="utf-8")
    entry = write_module(mod)
    # В каталоге нужен translation (extra_lib его не переносит): без него приложение подключает аудио к любому переводу
    entry["translation"] = mod["translation"]
    merge_catalog([entry], in_place=True)
    log(f"иврит: начала слов у {n_ok} стихов из {len(segs)}")


# --- Греческий ------------------------------------------------------------------------------------------------

# Порядок и имена файлов: 01Matt01.mp3 … 27Reve22.mp3; однoглавные книги — …00.mp3
GRC_BOOKS = ["Matt", "Mark", "Luke", "John", "Acts", "Rom", "1Cor", "2Cor", "Gal", "Eph", "Phil", "Col", "1Thess",
             "2Thess", "1Tim", "2Tim", "Titus", "Phlm", "Heb", "Jas", "1Pet", "2Pet", "1John", "2John", "3John",
             "Jude", "Rev"]
GRC_FILE_BOOK = {"Matt": "Matt", "Mark": "Mark", "Luke": "Luke", "John": "John", "Acts": "Acts", "Roma": "Rom",
                 "_1Co": "1Cor", "_2Co": "2Cor", "Gala": "Gal", "Ephe": "Eph", "Phil": "Phil", "Colo": "Col",
                 "_1Th": "1Thess", "_2Th": "2Thess", "_1Ti": "1Tim", "_2Ti": "2Tim", "Titu": "Titus", "Phlm": "Phlm",
                 "Hebr": "Heb", "Jame": "Jas", "_1Pe": "1Pet", "_2Pe": "2Pet", "_1Jn": "1John", "_2Jn": "2John",
                 "_3Jn": "3John", "Jude": "Jude", "Reve": "Rev"}
# Стихи синодальной нумерации, которые в записи (WH) стоят в другой главе: в конце записи главы ключа
GRC_MOVED = {"Rom.16": [("Rom", 14, 24), ("Rom", 14, 25), ("Rom", 14, 26)]}
# Стих с оценкой ниже — в записи его нет (у WH нет Мф 17:21 и т. п.: выравнивание «натягивает» его на паузу
# с оценкой около 0.1–0.2, поэтому порог выше, чем BA.MIN_SCORE у LibriVox)
GRC_VERSE_MIN = 0.3
GAP_MIN_SCORE = 0.35  # стих, найденный повторно в промежутке между соседними, принимаем с такой оценкой
GRC_CLAUSE = re.compile(r"[.;:!?·;—–()]")


def grc_files(meta):
    """{("Matt", 1): имя файла} — по метаданным item; проверяет, что глав столько же, сколько в byz-rp2018."""
    out = {}
    for name in meta:
        m = re.match(r"(\d\d)(\w{4})(\d\d)\.mp3$", name)
        if not m or m.group(2) not in GRC_FILE_BOOK:
            log(f"  ? файл вне схемы: {name}")
            continue
        b = GRC_FILE_BOOK[m.group(2)]
        assert GRC_BOOKS.index(b) + 1 == int(m.group(1)), name
        out[(b, max(1, int(m.group(3))))] = name
    return out


def grc_verse_tokens(al, txt):
    """Токены стиха для выравнивания главы: буквы слов, «звёздочка» после знаков препинания."""
    out = []
    for w, after in verse_tokens(txt):
        out += [al.dict[c] for c in erasmian(w) if c in al.dict]
        if GRC_CLAUSE.search(after) and out and out[-1] != al.star:
            out.append(al.star)
    while out and out[-1] == al.star:
        out.pop()
    return out


def grc_chapter(al, em, bible, b, c, vlist):
    """Выравнивание записи главы: стихи, затем слова. vlist — [(книга, глава, стих)] в порядке чтения."""
    vs = []
    for key in vlist:
        txt = verse_text(bible, "%s.%d.%d" % key)
        tk = grc_verse_tokens(al, txt) if txt else []
        if tk:
            vs.append((key, tk))
    found = al.align_stream(em, vs, first_margin_s=30, max_gap_s=30)
    T = em.shape[0] / al.FPS
    # Стихи, которые align_stream счёл пропущенными чтецом, ищем ещё раз — в промежутке между соседними
    # найденными (там, где тексты WH и Byz расходятся сильнее, например имена в родословии Мф 1:4–6).
    # Действительно непрочитанные (Мф 17:21 и т. п.) остаются с низкой оценкой и времени не получают.
    i = 0
    while i < len(vs):
        if vs[i][0] in found:
            i += 1
            continue
        j = i
        while j < len(vs) and vs[j][0] not in found:
            j += 1
        f0 = int((found[vs[i - 1][0]][1] if i else 0.0) * al.FPS)
        f1 = int((found[vs[j][0]][0] if j < len(vs) else T) * al.FPS)
        groups = [t for _, t in vs[i:j]]
        need = sum(len(g) + 1 for g in groups) + 1 + sum(1 for g in groups for a, b in zip(g, g[1:]) if a == b)
        if f1 - f0 > need:
            for (k, _), (a, b, sc) in zip(vs[i:j], al._align(em, groups, f0, f1)):
                if sc >= GAP_MIN_SCORE:
                    found[k] = (a / al.FPS, b / al.FPS, sc)
        i = j
    keys = [k for k, _ in vs if k in found]
    res = {}
    for i, key in enumerate(keys):
        a, e, sc = found[key]
        nxt = found[keys[i + 1]][0] if i + 1 < len(keys) else T
        k = "%s.%d.%d" % key
        words = [w for w, _ in verse_tokens(verse_text(bible, k))]
        r = al.align_words(em, al.word_tokens(words, "grc"), a - 0.4, min(e + 0.4, nxt + 0.2))
        x = {"v": [round(a, 2), round(e, 2), round(sc, 3)], "n": len(words)}
        if r:
            score, ww, star = r
            x.update(score=round(score, 3), star=round(star, 2), w=[[round(p, 2), round(q, 2), round(s, 3)] for p, q, s in ww])
        res[k] = x
    return {"v": GRC_VERSION, "duration": round(T, 2), "verses": res, "order": ["%s.%d.%d" % k for k, _ in vs]}


def build_grc(args):
    t_start = time.time()
    meta = ia_mp3(GRC_ITEM)
    fmap = grc_files(meta)
    bible = load_text("byz-rp2018")
    nch = sum(len(bible[b]) for b in GRC_BOOKS)
    if len(fmap) != nch:
        log(f"  ! записей {len(fmap)}, глав в byz-rp2018 {nch}")
    books = args.books or GRC_BOOKS
    todo = [(b, c) for b in GRC_BOOKS if b in books for c in range(1, len(bible[b]) + 1) if (b, c) in fmap]

    def cache_of(b, c):
        return GRC_DIR / "align" / f"{b}.{c}.json"

    def fresh(bc):
        p = cache_of(*bc)
        return p.exists() and json.loads(p.read_text(encoding="utf-8")).get("v") == GRC_VERSION

    need = [bc for bc in todo if not fresh(bc)]
    log(f"греческий: глав {len(todo)}, пересчитать {len(need)}")
    al = WordAligner() if need else None
    pre = Prefetch(GRC_ITEM, [fmap[bc] for bc in need], meta, GRC_DIR, lambda n: True) if need else None
    audio_s = 0.0
    for n_done, (b, c) in enumerate(need, 1):
        t0 = time.time()
        mp3 = pre.get(fmap[(b, c)])
        em = emission(al, mp3, GRC_DIR)
        vlist = [(b, c, v) for v in range(1, len(bible[b][c - 1]) + 1)]
        moved = {x for xs in GRC_MOVED.values() for x in xs}
        vlist = [x for x in vlist if x not in moved] + GRC_MOVED.get(f"{b}.{c}", [])
        r = grc_chapter(al, em, bible, b, c, vlist)
        audio_s += r["duration"]
        p = cache_of(b, c)
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(json.dumps(r), encoding="utf-8")
        nv, nf = len(vlist), len(r["verses"])
        log(f"  {b}.{c}: стихов найдено {nf}/{nv} ({time.time() - t0:.1f} с)")
    if pre:
        pre.pool.shutdown()
    grc_module(meta, fmap, bible)
    log(f"греческий: {audio_s / 3600:.1f} ч аудио, {(time.time() - t_start) / 60:.1f} мин")


def grc_module(meta, fmap, bible):
    files, segments, chapters = [], {}, {}
    n_words = n_verses = 0
    for b in GRC_BOOKS:
        for c in range(1, len(bible[b]) + 1):
            p = GRC_DIR / "align" / f"{b}.{c}.json"
            if (b, c) not in fmap or not p.exists():
                continue
            r = json.loads(p.read_text(encoding="utf-8"))
            if r.get("v") != GRC_VERSION:
                continue
            name = fmap[(b, c)]
            url = f"https://archive.org/download/{GRC_ITEM}/{name}"
            fi = len(files)
            files.append(url)
            # стихи в порядке чтения; время должно расти; ненайденные (оценка < GRC_VERSE_MIN) — без времени
            vv = [(k, r["verses"][k]) for k in r["order"] if k in r["verses"]]
            vv = [(k, x) for k, x in vv if x["v"][2] >= GRC_VERSE_MIN]
            mono, last = [], -1
            for k, x in vv:
                if x["v"][0] > last:
                    mono.append((k, x))
                    last = x["v"][0]
            al = {k: tuple(x["v"]) for k, x in mono}
            starts = BA.verse_starts([k for k, _ in mono], al)
            dur = float(meta[name].get("length") or r["duration"])
            for i, ((k, x), st) in enumerate(zip(mono, starts)):
                end = min(x["v"][1] + 0.3, starts[i + 1] if i + 1 < len(mono) else dur)
                seg = [fi, st, round(end, 2)]
                if "w" in x and not judge("grc", x["score"], x["w"], end):
                    ws = word_starts(x["w"], st, end)
                    if len(ws) == len(verse_tokens(verse_text(bible, k))):
                        seg.append(ws)
                        n_words += 1
                segments[k] = seg
                n_verses += 1
            own = [(int(k.rsplit(".", 1)[1]), st) for (k, _), st in zip(mono, starts) if k.startswith(f"{b}.{c}.")]
            if not own:
                continue
            chapters[f"{b}.{c}"] = {"url": url, "verses": BA.fill_missing(own, range(1, len(bible[b][c - 1]) + 1)),
                                    "duration": round(dur, 2)}
    mod = {
        "format": "aob-module", "formatVersion": 1, "type": "audio",
        "id": GRC_ID, "name": "Аудио НЗ (греческий)",
        "title": "Новый Завет по-гречески — живое чтение Марилин Фемистер (эразмово произношение)",
        "description": "Греческий текст Нового Завета (издание Весткотта — Хорта) читает Марилин Фемистер — живой голос, "
                       "эразмово произношение, запись на каждую главу. Время стихов и слов найдено выравниванием "
                       "записи с текстом Робинсона — Пирпонта (byz-rp2018); стихов, которых нет у Весткотта — Хорта, "
                       "в записи нет, а там, где тексты расходятся, слова подсвечиваются примерно. Звучит в подстрочнике: "
                       "кнопка «Слушать» у стиха.",
        "language": "grc", "version": "2001 (archive.org, 2009)", "author": "Marilyn Phemister (чтец)",
        "source": f"https://archive.org/details/{GRC_ITEM}",
        "license": "CC BY-NC 3.0 US (по странице archive.org); записи проигрываются с archive.org",
        "translation": "byz-rp2018", "versification": "synodal", "chapters": chapters,
        "files": files, "segments": segments,
    }
    entry = write_module(mod)
    # В каталоге нужен translation (extra_lib его не переносит): без него приложение подключает аудио к любому переводу
    entry["translation"] = mod["translation"]
    merge_catalog([entry], in_place=True)
    approved = json.loads(APPROVED.read_text(encoding="utf-8"))
    if GRC_ID not in approved["ids"]:
        approved["ids"].append(GRC_ID)
        APPROVED.write_text(json.dumps(approved, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    log(f"греческий: глав {len(chapters)}, стихов с временем {n_verses}, с началами слов {n_words}")


# --- Проверка -------------------------------------------------------------------------------------------------

def check_module(mid, bible, sample=10, seed=1):
    import random
    mod = json.loads((OUT / f"{mid}.json").read_text(encoding="utf-8"))
    segs = mod["segments"]
    by_book, durs, problems = {}, [], []
    for k, s in segs.items():
        b = k.split(".")[0]
        st = by_book.setdefault(b, [0, 0])
        st[1] += 1
        if len(s) < 4:
            continue
        st[0] += 1
        ws = s[3]
        n = len(verse_tokens(verse_text(bible, k)))
        if len(ws) != n:
            problems.append(f"{k}: слов {len(ws)} ≠ {n}")
        if any(b2 <= a2 for a2, b2 in zip(ws, ws[1:])) or ws[0] < s[1] - 1e-6 or ws[-1] >= s[2]:
            problems.append(f"{k}: не монотонно или вне отрезка")
        d = [b2 - a2 for a2, b2 in zip(ws, ws[1:] + [s[2]])]
        durs += d
    tot_ok = sum(x[0] for x in by_book.values())
    log(f"\n{mid}: начала слов у {tot_ok} из {len(segs)} стихов ({100 * tot_ok / max(1, len(segs)):.1f} %)")
    if durs:
        durs.sort()
        inside = sum(1 for d in durs if 0.1 <= d <= 2.5) / len(durs)
        log(f"  слов {len(durs)}: медиана {statistics.median(durs):.2f} с, 5 % — {durs[len(durs) // 20]:.2f} с, "
            f"95 % — {durs[len(durs) * 19 // 20]:.2f} с; в пределах 0.1–2.5 с — {100 * inside:.1f} %")
    log("  по книгам (с началами слов / всего): " + ", ".join(
        f"{b} {x[0]}/{x[1]}" for b, x in by_book.items()))
    weak = [f"{b} {100 * x[0] / x[1]:.0f} %" for b, x in by_book.items() if x[1] and x[0] < 0.6 * x[1]]
    if weak:
        log("  слабые книги (< 60 %): " + ", ".join(weak))
    log(f"  нарушений согласованности: {len(problems)}" + (": " + "; ".join(problems[:10]) if problems else ""))
    rnd = random.Random(seed)
    keys = [k for k, s in segs.items() if len(s) >= 4]
    for k in rnd.sample(keys, min(sample, len(keys))):
        s = segs[k]
        ws = s[3]
        d = [round(b2 - a2, 2) for a2, b2 in zip(ws, ws[1:] + [s[2]])]
        words = [w for w, _ in verse_tokens(verse_text(bible, k))]
        log(f"  {k} [{s[1]:.2f}–{s[2]:.2f}] " + " ".join(f"{w}@{t:.2f}({x})" for w, t, x in zip(words, ws, d)))


def stats(args):
    for mid, text in ((HBO_ID, "oshb"), (GRC_ID, "byz-rp2018")):
        if (OUT / f"{mid}.json").exists():
            check_module(mid, load_text(text), sample=args.sample)
    # причины отказа (иврит)
    if (HBO_DIR / "align").exists():
        segs = json.loads((OUT / f"{HBO_ID}.json").read_text(encoding="utf-8"))["segments"]
        why = {}
        for k, (st, w) in hbo_results(segs).items():
            if w:
                why[w] = why.get(w, 0) + 1
        log(f"\nиврит, причины отказа: {why}")


def translit(args):
    """Отладка: транслитерация слов стиха."""
    mid = "oshb" if args.lang == "hbo" else "byz-rp2018"
    bible = load_text(mid)
    tr = hebrew if args.lang == "hbo" else erasmian
    for k in args.refs:
        log(k, " ".join(f"{w}={tr(w)}" for w, _ in verse_tokens(verse_text(bible, k))))


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("hbo-words", help="начала слов в записях иврита (Шмуэлоф)")
    p.add_argument("--books", nargs="*")
    p = sub.add_parser("grc", help="модуль греческого НЗ (Фемистер)")
    p.add_argument("--books", nargs="*")
    p = sub.add_parser("stats", help="проверка согласованности модулей")
    p.add_argument("--sample", type=int, default=10)
    p = sub.add_parser("translit", help="показать транслитерацию стихов")
    p.add_argument("lang", choices=["hbo", "grc"])
    p.add_argument("refs", nargs="+")
    args = ap.parse_args()
    {"hbo-words": build_hbo_words, "grc": build_grc, "stats": stats, "translit": translit}[args.cmd](args)


if __name__ == "__main__":
    main()
