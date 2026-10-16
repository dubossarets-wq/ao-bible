#!/usr/bin/env python3
"""Аудиомодули AO Bible (type: "audio"): записи глав + время начала каждого стиха.

Источники (только явно свободные лицензии, аудиофайлы на наш сайт НЕ кладём — в модуле прямые
ссылки на archive.org):

  rst  — «Синодальный перевод (1876) — полная аудиозапись», Hexapla
         https://archive.org/details/hexapla-audio-synodal-1876 (Public Domain Mark 1.0).
         Синтез речи (Fun-CosyVoice3), по mp3 на главу. У каждой главы есть файл-спутник со временем
         начала стихов — берём его, сверив число стихов с нашим rst.json. Главы, где число стихов
         не совпало (вставки по LXX в Притч 4/13/18, Нав 24, Дан 3), выравниваем сами.
  kjv  — LibriVox «Bible (KJV), Complete», чтец Michael Armenta
         https://librivox.org/bible-complete-king-james-version/ (Public Domain).
         Файлы по 1 ч на несколько глав; времена стихов получаем принудительным выравниванием
         текста kjv.json с записью.

Выравнивание: torchaudio MMS_FA (wav2vec2, обучена на 1100+ языках, латиница; русский текст
транслитерируем). Между стихами — «звёздочка» (*), которая поглощает всё, чего нет в тексте:
объявления LibriVox, «Глава третья», лишние стихи. Работает на CUDA, если есть, иначе на CPU.

Запуск (из корня проекта; torch/torchaudio — в .pylib-audio, см. ниже):
  python -I scripts/build_audio.py rst                 # русский модуль целиком (+ выравнивание 5 глав)
  python -I scripts/build_audio.py kjv --books John    # английский: выровнять книги (по умолчанию — Евангелия)
  python -I scripts/build_audio.py verify-rst John.3 Ps.22   # сверить разметку Hexapla с нашим выравниванием
  python -I scripts/build_audio.py catalog             # только обновить catalog.json по готовым модулям
Установка библиотек (один раз):
  python -m pip install --target .pylib-audio torch==2.7.1 torchaudio==2.7.1 numpy==2.2.6 \
      --index-url https://download.pytorch.org/whl/cu128 --extra-index-url https://pypi.org/simple

Идемпотентно: скачанное (проверка md5), эмиссии модели и результаты выравнивания кешируются
в data-src/audio/… (папка в .gitignore); повторный запуск только пересобирает JSON.
"""
import argparse
import gzip
import hashlib
import json
import os
import re
import subprocess
import sys
import time
import unicodedata
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "modules"
DATA = ROOT / "data-src" / "audio"
PYLIB = ROOT / ".pylib-audio"
ALIGN_VERSION = 13  # меняется — кеш выравнивания пересчитывается
RST_ALIGN_VERSION = 10  # то же для Hexapla (последние правки касались только пропусков в записи — у синтеза их нет)
WWJD_ALIGN_VERSION = 12  # то же для записей wwjdru
STAR_LOGP = float(os.environ.get("AOB_STAR_LOGP", "-0.05"))  # log p «звёздочки» на кадр
MIN_SCORE = 0.15  # средняя вероятность букв стиха ниже — стих в записи не найден (пропущен/сжат)
UA = "AO-Bible-audio-builder/1.0 (+https://github.com/)"

# Протестантский порядок 66 книг (так нумерует Hexapla: 0 = Бытие … 65 = Откровение)
PROT = ("Gen Exod Lev Num Deut Josh Judg Ruth 1Sam 2Sam 1Kgs 2Kgs 1Chr 2Chr Ezra Neh Esth Job Ps Prov "
        "Eccl Song Isa Jer Lam Ezek Dan Hos Joel Amos Obad Jonah Mic Nah Hab Zeph Hag Zech Mal Matt Mark "
        "Luke John Acts Rom 1Cor 2Cor Gal Eph Phil Col 1Thess 2Thess 1Tim 2Tim Titus Phlm Heb Jas 1Pet "
        "2Pet 1John 2John 3John Jude Rev").split()
# Названия книг у LibriVox (в заголовках разделов «John Ch. 1 - 8»)
LV_NAMES = {"Song of Solomon": "Song", "Phillipians": "Phil", "Philippians": "Phil", "Psalms": "Ps", "Psalm": "Ps"}
EN_NAMES = dict(zip(
    ["Genesis", "Exodus", "Leviticus", "Numbers", "Deuteronomy", "Joshua", "Judges", "Ruth", "1 Samuel", "2 Samuel",
     "1 Kings", "2 Kings", "1 Chronicles", "2 Chronicles", "Ezra", "Nehemiah", "Esther", "Job", "Psalms", "Proverbs",
     "Ecclesiastes", "Song of Solomon", "Isaiah", "Jeremiah", "Lamentations", "Ezekiel", "Daniel", "Hosea", "Joel",
     "Amos", "Obadiah", "Jonah", "Micah", "Nahum", "Habakkuk", "Zephaniah", "Haggai", "Zechariah", "Malachi",
     "Matthew", "Mark", "Luke", "John", "Acts", "Romans", "1 Corinthians", "2 Corinthians", "Galatians", "Ephesians",
     "Philippians", "Colossians", "1 Thessalonians", "2 Thessalonians", "1 Timothy", "2 Timothy", "Titus", "Philemon",
     "Hebrews", "James", "1 Peter", "2 Peter", "1 John", "2 John", "3 John", "Jude", "Revelation"], PROT))
EN_NAMES.update(LV_NAMES)
GOSPELS = ["Matt", "Mark", "Luke", "John"]


def log(*a):
    print(*a, flush=True)


# --- Сеть и файлы ----------------------------------------------------------------------------------

def http_get(url, dest=None, md5=None, retries=4):
    """Скачивает URL (в память или в файл dest). Файл с совпадающим md5 повторно не качается."""
    if dest is not None:
        dest = Path(dest)
        if dest.exists() and (md5 is None or file_md5(dest) == md5):
            return dest
        dest.parent.mkdir(parents=True, exist_ok=True)
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=120) as r:
                if dest is None:
                    return r.read()
                part = dest.with_name(dest.name + ".part")
                with open(part, "wb") as f:
                    while True:
                        b = r.read(1 << 20)
                        if not b:
                            break
                        f.write(b)
            if md5 and file_md5(part) != md5:
                raise IOError(f"md5 не совпал: {url}")
            os.replace(part, dest)
            return dest
        except Exception as e:  # noqa: BLE001 — сеть archive.org иногда рвётся
            if attempt == retries - 1:
                raise
            log(f"  повтор ({e}): {url}")
            time.sleep(3 * (attempt + 1))


def file_md5(p):
    h = hashlib.md5()
    with open(p, "rb") as f:
        for b in iter(lambda: f.read(1 << 20), b""):
            h.update(b)
    return h.hexdigest()


def cached_json(url, path, max_age_days=30):
    path = Path(path)
    if path.exists() and time.time() - path.stat().st_mtime < max_age_days * 86400:
        return json.loads(path.read_text(encoding="utf-8"))
    data = json.loads(http_get(url))
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    return data


def ia_files(item):
    md = cached_json(f"https://archive.org/metadata/{item}", DATA / "meta" / f"{item}.json")
    return md, {f["name"]: f for f in md["files"]}


def length_sec(s):
    """'63:19' / '1:02:03' / '288.62' → секунды."""
    if s is None:
        return None
    if ":" in str(s):
        t = 0.0
        for part in str(s).split(":"):
            t = t * 60 + float(part)
        return t
    return float(s)


def load_wav(path):
    """Декодирует запись через ffmpeg в 16 кГц моно float32."""
    import numpy as np
    raw = subprocess.run(["ffmpeg", "-v", "error", "-nostdin", "-i", str(path), "-ac", "1", "-ar", "16000",
                          "-f", "f32le", "-"], check=True, capture_output=True).stdout
    return np.frombuffer(raw, dtype=np.float32).copy()


# --- Текст -------------------------------------------------------------------------------------------

STRONG_RE = re.compile(r"\{([^{}|]*)\|[^{}]*\}")
RU = {"а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "е": "e", "ё": "e", "ж": "zh", "з": "z", "и": "i",
      "й": "i", "к": "k", "л": "l", "м": "m", "н": "n", "о": "o", "п": "p", "р": "r", "с": "s", "т": "t",
      "у": "u", "ф": "f", "х": "kh", "ц": "ts", "ч": "ch", "ш": "sh", "щ": "shch", "ъ": "", "ы": "y", "ь": "",
      "э": "e", "ю": "yu", "я": "ya", "і": "i", "ѣ": "e", "ѳ": "f", "ѵ": "i",
      # украинский, церковнославянский и буквы латиницы, которых нет в NFKD-разложении
      "є": "ye", "ї": "yi", "ґ": "g", "ѡ": "o", "ѿ": "ot", "ѻ": "o", "ꙋ": "u", "ѹ": "u", "ꙗ": "ya", "ѧ": "ya",
      "ѫ": "u", "ѯ": "ks", "ѱ": "ps", "ѕ": "z", "ꙁ": "z", "ѷ": "i", "ꙑ": "y",
      "ß": "ss", "æ": "ae", "œ": "oe", "ø": "o", "ł": "l", "đ": "d", "þ": "th"}
CJK_RE = re.compile(r"[㐀-鿿豈-﫿]")
_PINYIN = None


GREEK_RE = re.compile(r"[Ͱ-Ͽἀ-῿]")
# Греческий — в новогреческом чтении (так читают чтецы LibriVox): диграфы, затем буквы
GR_DI = [("ου", "u"), ("αι", "e"), ("ει", "i"), ("οι", "i"), ("υι", "i"), ("αυ", "av"), ("ευ", "ev"), ("ηυ", "iv"),
         ("μπ", "b"), ("ντ", "d"), ("γγ", "ng"), ("γκ", "g"), ("γχ", "nch"), ("τζ", "dz")]
GR = dict(zip("αβγδεζηθικλμνξοπρσςτυφχψω", ["a", "v", "g", "d", "e", "z", "i", "th", "i", "k", "l", "m", "n", "ks",
                                             "o", "p", "r", "s", "s", "t", "i", "f", "ch", "ps", "o"]))


def greek(t):
    t = "".join(c for c in unicodedata.normalize("NFD", t) if not unicodedata.combining(c))
    for a, b in GR_DI:
        t = t.replace(a, b)
    return "".join(GR.get(c, c) for c in t)


def pinyin(t):
    """Китайский текст → слоги пиньиня без тонов (pypinyin из .pylib-audio/zh)."""
    global _PINYIN
    if _PINYIN is None:
        sys.path.insert(0, str(PYLIB / "zh"))
        from pypinyin import lazy_pinyin
        _PINYIN = lazy_pinyin
    return " ".join(_PINYIN(t))


def plain(v):
    """Снимает разметку модулей: {слово|H123}, ‹курсив›, [скобки]."""
    v = STRONG_RE.sub(r"\1", v)
    return re.sub(r"[‹›\[\]]", "", v)


def romanize(text):
    """Текст стиха → строка латиницы a-z и ' (алфавит MMS_FA); слова через пробел."""
    t = plain(text).lower().replace("’", "'").replace("ʼ", "'")
    if CJK_RE.search(t):
        t = pinyin(t)
    if GREEK_RE.search(t):
        t = greek(t)
    t = "".join(RU.get(c, c) for c in t)
    t = unicodedata.normalize("NFKD", t)
    t = "".join(c for c in t if not unicodedata.combining(c))
    words = [w.strip("'") for w in re.findall(r"[a-z']+", t)]
    return " ".join(w for w in words if w)


def load_bible(mid):
    d = json.loads((OUT / f"{mid}.json").read_text(encoding="utf-8"))
    return {b["id"]: b["chapters"] for b in d["books"]}


# --- Выравнивание ---------------------------------------------------------------------------------

class Aligner:
    """MMS_FA + torchaudio.functional.forced_align. Эмиссии считаются кусками по 30 с с полями 2 с."""
    SR = 16000
    HOP = 320  # 20 мс на кадр
    FPS = 50

    def __init__(self):
        if PYLIB.exists():
            sys.path.insert(0, str(PYLIB))
        os.environ.setdefault("TORCH_HOME", str(DATA / "models"))
        import torch
        import torchaudio
        self.torch, self.F = torch, torchaudio.functional
        self.dev = "cuda" if torch.cuda.is_available() else "cpu"
        bundle = torchaudio.pipelines.MMS_FA
        self.model = bundle.get_model(with_star=False).to(self.dev).eval()
        self.dict = bundle.get_dict(star=None)
        self.star = len(self.dict)  # своя колонка «*» с log p = 0
        log(f"  выравнивание: MMS_FA на {self.dev}")

    def tokens(self, text):
        """Текст стиха → токены. Между предложениями и частями стиха (. ; : ! ? –) ставится «*»:
        внутри стиха чтец может читать то, чего нет в нашем тексте (добавления по LXX у Hexapla),
        и без звёздочки такая вставка «съедает» соседние слова."""
        out = []
        for part in re.split(r"[.;:!?–—()]+", plain(text)):
            tk = [self.dict[c] for c in romanize(part).replace(" ", "") if c in self.dict]
            if tk:
                if out:
                    out.append(self.star)
                out += tk
        return out

    def emission(self, wav, cache=None):
        import numpy as np
        if cache and Path(cache).exists():
            return self.torch.from_numpy(np.load(cache).astype(np.float32))
        torch = self.torch
        chunk, ctx = 30 * self.SR, 2 * self.SR
        out = []
        with torch.inference_mode():
            for s in range(0, len(wav), chunk):
                a, b = max(0, s - ctx), min(len(wav), s + chunk + ctx)
                x = torch.from_numpy(wav[a:b]).unsqueeze(0).to(self.dev)
                em, _ = self.model(x)
                em = torch.log_softmax(em[0], dim=-1).float().cpu()
                off = (s - a) // self.HOP
                n = (min(len(wav), s + chunk) - s) // self.HOP
                out.append(em[off:off + n])
        em = torch.cat(out)
        em = torch.cat([em, torch.zeros(em.shape[0], 1)], dim=1)  # колонка звёздочки
        if cache:
            Path(cache).parent.mkdir(parents=True, exist_ok=True)
            np.save(cache, em.numpy().astype(np.float16))
        return em

    def _align(self, em, groups, f0, f1):
        """groups — списки токенов стихов. Возвращает [(кадр начала, кадр конца, средняя вероятность)]."""
        torch = self.torch
        # Две «звёздочки»: по краям окна — бесплатная (вступление, начало следующей главы), между стихами и
        # частями стиха — с небольшим штрафом за кадр, чтобы текст не «расползался» по похожей речи дальше
        # (переписи, родословия, Числ 1 и 7: одинаковые формулы в соседних стихах).
        edge, inner = self.star, self.star + 1
        targets, idx = [edge], []
        for k, g in enumerate(groups):
            idx.append((len(targets), len(targets) + len(g)))
            targets += [inner if x == self.star else x for x in g]
            targets.append(inner if k < len(groups) - 1 else edge)
        e = em[f0:f1]
        # штраф внутренней звёздочки по кадрам; у потока из нескольких файлов он нулевой у краёв файлов
        ins = em.inner_star(f0, f0 + e.shape[0]) if hasattr(em, "inner_star") else torch.full((e.shape[0], 1), STAR_LOGP)
        e = torch.cat([e[:, :self.star], torch.zeros(e.shape[0], 1), ins], 1)
        e = e.unsqueeze(0).to(self.dev)
        t = torch.tensor([targets], dtype=torch.int32, device=self.dev)
        ali, sc = self.F.forced_align(e, t, blank=0)
        spans = self.F.merge_tokens(ali[0].cpu(), sc[0].exp().cpu())
        assert len(spans) == len(targets), (len(spans), len(targets))
        res, gap = [], int(0.8 * self.FPS)
        for a, b in idx:
            ss = [x for x in spans[a:b] if x.token < self.star]
            # CTC может «растянуть» первую букву стиха на чужую речь перед ним (вступление, «Глава 1»):
            # если после первой-второй буквы разрыв > 0,8 с, начало стиха — после него.
            # То же для последних букв (конец стиха).
            i0 = 0
            for k in range(1, min(3, len(ss))):
                if ss[k].start - ss[k - 1].end > gap:
                    i0 = k
            i1 = len(ss) - 1
            for k in range(len(ss) - 1, max(0, len(ss) - 3), -1):
                if ss[k].start - ss[k - 1].end > gap:
                    i1 = k - 1
            if i1 < i0:
                i0, i1 = 0, len(ss) - 1
            res.append((f0 + ss[i0].start, f0 + ss[i1].end, sum(s.score for s in ss) / len(ss)))
        return res

    def align_stream(self, em, verses, first_margin_s=120, group_letters=2500, max_gap_s=None, gap_ok=None):
        """verses — [(ключ, токены)] в порядке чтения. Выравнивает группами по ~group_letters букв,
        окно каждой группы — от конца предыдущей. max_gap_s — для живого чтения: стих, начавшийся дальше
        этого от конца предыдущего, считается «перескочившим» (чтец пропустил текст).
        Возвращает {ключ: (t_начала, t_конца, оценка)}."""
        T = em.shape[0]
        total = sum(len(t) for _, t in verses)
        rate = max(total / T, 0.05)  # букв на кадр (оценка темпа)
        res = {}

        def run(i, pos, first):
            """Выравнивает группу стихов с i-го от кадра pos. Возвращает (j, результаты) или (j, None)."""
            j, n = i, 0
            while j < len(verses) and (n < group_letters or j == i):
                n += len(verses[j][1])
                j += 1
            if len(verses) - j <= 3:  # хвост не оставляем крошечным
                j = len(verses)
                n = sum(len(t) for _, t in verses[i:j])
            margin = (first_margin_s if first else 30) * self.FPS
            span = int(n / rate * 1.5) + margin
            need = n + sum(1 for _, t in verses[i:j] for a, b in zip(t, t[1:]) if a == b) + (j - i) + 1
            if T - pos < need:
                return j, None
            best = None
            for attempt in range(5):
                f1 = min(T, pos + span)
                if f1 - pos < need:
                    f1 = min(T, pos + need * 2)
                r = self._align(em, [t for _, t in verses[i:j]], pos, f1)
                score = sum(x[2] for x in r) / len(r)
                if best is None or score > best[0]:
                    best = (score, r)
                if f1 >= T or (r[-1][1] < f1 - 3 * self.FPS and score >= 0.6):
                    break
                # текст упёрся в край окна или совпал плохо (в записи длинная вставка) — расширяем окно
                span *= 3
            return j, best[1]

        def mean3(r, m=0):
            x = [y[2] for y in r[m:m + 3]]
            return sum(x) / len(x)

        gap = max_gap_s * self.FPS if max_gap_s else None

        def bad(r, m, pos=None, first=False):  # с m-го стиха текст и запись перестали совпадать
            if r[m][2] < 0.35 and mean3(r, m) < 0.45:
                return True
            if gap:
                prev_end = r[m - 1][1] if m else (None if first else pos)
                # gap_ok(a, b): разрыв между кадрами a и b объясним (граница файлов: объявления LibriVox)
                return prev_end is not None and r[m][0] - prev_end > gap and not (gap_ok and gap_ok(prev_end, r[m][0]))
            return False

        pos, i, first = 0, 0, True
        while i < len(verses):
            j, r = run(i, pos, first)
            if r is None:  # записи не хватает на оставшийся текст — дальше не размечаем
                log(f"  ! не хватило записи на {len(verses) - i} стихов, начиная с {verses[i][0]}")
                break
            if bad(r, 0, pos, first):
                # Чтец пропустил кусок текста (так бывает: 2 Цар 19:17–35 у LibriVox нет) — ищем, через
                # сколько стихов запись снова совпадает с текстом; пропущенные стихи остаются без времени
                base = mean3(r)

                def ok(k):
                    j2, r2 = run(i + k, pos, first)
                    if r2 is None:
                        return None
                    if os.environ.get("AOB_DEBUG"):
                        log(f"    пропуск {k}: {verses[i + k][0]} оценка {mean3(r2):.2f} (было {base:.2f})")
                    good = mean3(r2) >= 0.6 and mean3(r2) > base - 0.1 and not bad(r2, 0, pos, first)
                    return (j2, r2) if good else False

                prev_k = 0
                for k in (1, 2, 3, 5, 8, 12, 18, 25, 35, 50, 70):
                    if i + k >= len(verses):
                        break
                    hit = ok(k)
                    if hit is None:
                        break
                    if hit:
                        # уточняем: самый короткий пропуск между предыдущей пробой и этой
                        for kk in range(prev_k + 1, k):
                            h2 = ok(kk)
                            if h2:
                                k, hit = kk, h2
                                break
                        log(f"  ! в записи нет стихов {verses[i][0]} … {verses[i + k - 1][0]} ({k} шт.)")
                        i, (j, r) = i + k, hit
                        break
                    prev_k = k
            # Конец последних стихов группы ничем не «закреплён»: их хвост может уехать на такие же слова
            # дальше (Исх 14:22 и 14:29 оба кончаются «on their left»). Поэтому два последних стиха
            # группы не принимаем, а выравниваем заново в начале следующей. Так же поступаем со стихами
            # после места, где совпадение резко упало.
            keep = j - i if j == len(verses) else max(1, j - i - 2)
            cut = next((m for m in range(1, keep) if bad(r, m)), None)
            if cut:
                keep = cut
            for (k, _), x in zip(verses[i:i + keep], r[:keep]):
                res[k] = x
            pos = r[keep - 1][1] + 1
            i, first = i + keep, False
        return {k: (a / self.FPS, b / self.FPS, s) for k, (a, b, s) in res.items()}


def fill_missing(found, all_verses):
    """Стихам, которых нет в записи (чтец пропустил надписание псалма или стих), даём время следующего
    найденного стиха: подсветка его просто «проскочит», а переход к нему начнёт с ближайшего места."""
    t = dict(found)
    out, nxt = [], None
    for v in sorted(set(all_verses) | set(t), reverse=True):
        if v in t:
            nxt = t[v]
        if nxt is not None:
            out.append([v, nxt])
    return out[::-1]


def verse_starts(keys, al, lead=0.2):
    """Время начала стихов: начало первой буквы минус небольшой запас, не раньше конца предыдущего."""
    out, prev_end = [], 0.0
    for k in keys:
        a, b, _ = al[k]
        out.append(round(max(prev_end, a - lead, 0.0), 2))
        prev_end = b
    return out


# --- Модуль и каталог ---------------------------------------------------------------------------------

def write_module(mod):
    mid = mod["id"]
    data = json.dumps(mod, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    gz = gzip.compress(data, 9, mtime=0)
    (OUT / f"{mid}.json").write_bytes(data)
    (OUT / f"{mid}.json.gz").write_bytes(gz)
    log(f"  {mid}: {len(mod['chapters'])} глав, {len(data)/1e3:.0f} КБ, gz {len(gz)/1e3:.0f} КБ")
    return catalog_entry(mod, len(data), len(gz))


def catalog_entry(mod, size, size_gz):
    e = {k: mod[k] for k in ("id", "type", "name", "title", "description", "language", "version", "author",
                             "source", "license", "translation", "versification") if k in mod}
    e.update({"url": f"{mod['id']}.json", "urlGz": f"{mod['id']}.json.gz", "size": size, "sizeGz": size_gz})
    return e


def merge_catalog(entries):
    """Слияние по id: свои записи заменяются на месте, новые — после последнего аудиомодуля (или в конец)."""
    p = OUT / "catalog.json"
    cat = json.loads(p.read_text(encoding="utf-8"))
    mods = cat["modules"]
    pos = {m["id"]: i for i, m in enumerate(mods)}
    for e in entries:
        if e["id"] in pos:
            mods[pos[e["id"]]] = e
        else:
            same = [i for i, m in enumerate(mods) if m.get("type") == "audio"]
            at = same[-1] + 1 if same else len(mods)
            mods.insert(at, e)
            pos = {m["id"]: i for i, m in enumerate(mods)}
    p.write_text(json.dumps(cat, ensure_ascii=False, indent=1), encoding="utf-8")
    log(f"catalog: {len(mods)} записей")


def rebuild_catalog():
    entries = []
    ids = ["audio-rst-hexapla", "audio-kjv-librivox"] + [c["id"] for c in WWJD.values()] + [c["id"] for c in LVMODS.values()]
    for mid in ids:
        f = OUT / f"{mid}.json"
        if f.exists():
            data = f.read_bytes()
            gzf = OUT / f"{mid}.json.gz"
            entries.append(catalog_entry(json.loads(data), len(data), gzf.stat().st_size))
    merge_catalog(entries)


# --- Синодальный: Hexapla ------------------------------------------------------------------------------

HEX = "hexapla-audio-synodal-1876"


def hexapla_chapters():
    """[(OSIS, глава, номер книги Hexapla, имя mp3, длительность)] для 66 книг."""
    _, files = ia_files(HEX)
    out = []
    for name, f in files.items():
        m = re.fullmatch(r"(\d+)/(\d+)\.mp3", name)
        if m and int(m[1]) < 66:
            b, c = int(m[1]), int(m[2])
            ogg = files.get(f"{b}/{c}.ogg", {})
            out.append((PROT[b], c + 1, b, name, length_sec(ogg.get("length") or f.get("length")), f.get("md5")))
    return sorted(out, key=lambda x: (PROT.index(x[0]), x[1]))


def hexapla_offsets(b, c0):
    p = DATA / "hexapla-synodal" / "json" / f"{b}_{c0}.json"
    if not p.exists():
        http_get(f"https://archive.org/download/{HEX}/{b}/{c0}.json", p)
    return json.loads(p.read_text(encoding="utf-8"))["offsets"]


def align_hexapla_chapter(al, bid, ch, mp3, verses_text):
    """Наше выравнивание главы Hexapla (кешируется по тексту главы и версии алгоритма).
    mp3 — путь к файлу или функция, которая его вернёт (скачивание — только если кеша нет)."""
    key = hashlib.sha1(json.dumps([RST_ALIGN_VERSION, verses_text], ensure_ascii=False).encode()).hexdigest()[:12]
    cache = DATA / "hexapla-synodal" / "align" / f"{bid}.{ch}.{key}.json"
    if cache.exists():
        return json.loads(cache.read_text(encoding="utf-8"))
    if callable(mp3):
        mp3 = mp3()
    wav = load_wav(mp3)
    em = al.emission(wav)
    vs = [(i + 1, al.tokens(t)) for i, t in enumerate(verses_text)]
    vs = [(k, t) for k, t in vs if t]
    r = al.align_stream(em, vs, first_margin_s=20)
    res = {"verses": [[k, *r[k]] for k, _ in vs if k in r], "duration": len(wav) / 16000}
    cache.parent.mkdir(parents=True, exist_ok=True)
    cache.write_text(json.dumps(res), encoding="utf-8")
    return res


def hexapla_mp3(mp3name, md5):
    return http_get(f"https://archive.org/download/{HEX}/{mp3name}",
                    DATA / "hexapla-synodal" / "mp3" / mp3name.replace("/", "_"), md5=md5)


def compare_hexapla(r, off):
    """Расхождение нашей разметки с разметкой Hexapla: (медиана |Δ|, максимум |Δ|)."""
    d = sorted(abs(v[1] - off[v[0] - 1] / 1000) for v in r["verses"] if v[0] <= len(off))
    return (d[len(d) // 2], d[-1]) if d else (0, 0)


def build_rst(args):
    """Время стихов — наше выравнивание каждой главы; разметка Hexapla служит для сверки
    (--sidecar: взять разметку Hexapla как есть там, где совпало число стихов, без выравнивания)."""
    from concurrent.futures import ThreadPoolExecutor
    rst = load_bible("rst")
    books = set(args.books.split(",")) if args.books else None
    items = [x for x in hexapla_chapters() if x[1] <= len(rst.get(x[0], [])) and (not books or x[0] in books)]
    chapters = {}
    old = OUT / "audio-rst-hexapla.json"
    if books and old.exists():
        chapters = json.loads(old.read_text(encoding="utf-8"))["chapters"]
    al = None if args.sidecar else Aligner()
    pool = ThreadPoolExecutor(6)
    futs = {}

    def prefetch(i):
        for j in range(i, min(i + 12, len(items))):
            if j not in futs:
                futs[j] = pool.submit(hexapla_mp3, items[j][3], items[j][5])

    stats, low, t0 = [], [], time.time()
    for i, (bid, ch, b, mp3name, dur, md5) in enumerate(items):
        texts = rst[bid][ch - 1]
        off = hexapla_offsets(b, ch - 1)
        url = f"https://archive.org/download/{HEX}/{mp3name}"
        if args.sidecar:
            if len(off) != len(texts):
                continue
            verses = [[k + 1, round(ms / 1000, 2)] for k, ms in enumerate(off)]
        else:
            key = hashlib.sha1(json.dumps([RST_ALIGN_VERSION, texts], ensure_ascii=False).encode()).hexdigest()[:12]
            if not (DATA / "hexapla-synodal" / "align" / f"{bid}.{ch}.{key}.json").exists():
                prefetch(i)
            fut = futs.pop(i, None)
            r = align_hexapla_chapter(al, bid, ch, fut.result if fut else (lambda: hexapla_mp3(mp3name, md5)), texts)
            good = [v for v in r["verses"] if v[3] >= MIN_SCORE]
            if len(good) < 0.8 * len(texts):
                log(f"  ! {bid}.{ch}: в записи не нашлось большей части стихов — глава пропущена")
                continue
            keys = [v[0] for v in good]
            verses = fill_missing([[k, s] for k, s in zip(keys, verse_starts(keys, {v[0]: v[1:] for v in good}))],
                                  [v[0] for v in r["verses"]])
            dur = r["duration"]
            if len(off) == len(texts):
                stats.append((f"{bid}.{ch}", *compare_hexapla(r, off)))
            low += [f"{bid}.{ch}:{v[0]}({v[3]:.2f})" for v in r["verses"] if v[3] < 0.3]
        chapters[f"{bid}.{ch}"] = {"url": url, "verses": verses, "duration": round(dur, 2) if dur else None}
        if (i + 1) % 100 == 0:
            log(f"  {i + 1}/{len(items)} глав, {time.time() - t0:.0f} с")
    pool.shutdown(cancel_futures=True)
    if stats:
        good = sum(1 for _, med, mx in stats if med < 0.5 and mx < 1.5)
        log(f"  сверка с разметкой Hexapla: {good} из {len(stats)} глав совпали (медиана |Δ| < 0.5 с, макс < 1.5 с)")
        worst = sorted(stats, key=lambda x: -x[1])[:15]
        log("  наибольшие расхождения (глава, медиана/макс, с): "
            + ", ".join(f"{k} {m:.1f}/{x:.1f}" for k, m, x in worst))
        (DATA / "hexapla-synodal" / "compare.json").write_text(json.dumps(stats), encoding="utf-8")
    if low:
        log(f"  стихи с низкой уверенностью ({len(low)}): {' '.join(low[:30])}{' …' if len(low) > 30 else ''}")
    order = {bk: i for i, bk in enumerate(PROT)}
    chapters = dict(sorted(chapters.items(), key=lambda kv: (order[kv[0].split('.')[0]], int(kv[0].split('.')[1]))))
    mod = {
        "format": "aob-module", "formatVersion": 1, "type": "audio",
        "id": "audio-rst-hexapla", "name": "Аудио RST (синтез)",
        "title": "Синодальный перевод — синтезированное чтение (Hexapla)",
        "description": "Вся Библия (66 книг), запись на каждую главу. Чтение синтезировано (Fun-CosyVoice3, голос "
                       "по образцу согласившегося диктора) — это не живой чтец. Время стихов получено "
                       "принудительным выравниванием текста RST с записью (MMS_FA) и сверено с разметкой Hexapla. "
                       "Записи загружаются с archive.org.",
        "language": "ru", "version": "1.0 (archive.org, 2026-08)",
        "author": "Hexapla (синтез речи); перевод — Святейший Синод, 1876",
        "source": "https://archive.org/details/hexapla-audio-synodal-1876 (https://hexaplabible.com)",
        "license": "Public Domain (Public Domain Mark 1.0)",
        "translation": "rst", "versification": "synodal",
        "chapters": chapters,
    }
    return write_module(mod)


def verify_rst(args):
    """Сравнивает разметку Hexapla с нашим выравниванием для указанных глав."""
    rst = load_bible("rst")
    al = Aligner()
    idx = {(bid, ch): (b, name, md5) for bid, ch, b, name, _, md5 in hexapla_chapters()}
    for ref in args.refs:
        bid, ch = ref.split(".")
        ch = int(ch)
        b, name, md5 = idx[(bid, ch)]
        t0 = time.time()
        r = align_hexapla_chapter(al, bid, ch, lambda: hexapla_mp3(name, md5), rst[bid][ch - 1])
        off = hexapla_offsets(b, ch - 1)
        diffs = [v[1] - off[v[0] - 1] / 1000 for v in r["verses"] if v[0] <= len(off)]
        ad = sorted(abs(d) for d in diffs)
        log(f"{ref}: {len(diffs)} стихов, длительность {r['duration']:.0f} с, {time.time()-t0:.1f} с; "
            f"|Δ| медиана {ad[len(ad)//2]:.2f} с, макс {ad[-1]:.2f} с, сдвиг ср. {sum(diffs)/len(diffs):+.2f} с; "
            f"оценка мин {min(v[3] for v in r['verses']):.2f}")
        if args.show:
            for v in r["verses"]:
                h = off[v[0] - 1] / 1000 if v[0] <= len(off) else float("nan")
                log(f"   {v[0]:3d}  наше {v[1]:8.2f}–{v[2]:8.2f} (оценка {v[3]:.2f})  Hexapla {h:8.2f}  Δ {v[1]-h:+.2f}")


# --- KJV: LibriVox, Michael Armenta ---------------------------------------------------------------

LV_ITEM = "bible_kjv_complete_2001_librivox"


def lv_sections():
    """Разделы LibriVox → [(номер, mp3, книга, первая глава KJV, последняя глава KJV)]."""
    api = cached_json("https://librivox.org/api/feed/audiobooks?id=10501&format=json&extended=1",
                      DATA / "meta" / "librivox-10501.json")
    out = []
    for s in api["books"][0]["sections"]:
        m = re.fullmatch(r"\s*(.+?)\s+(?:Ch\.\s*)?(\d+)\s*(?:-\s*(\d+))?\s*", s["title"])
        out.append((int(s["section_number"]), s["listen_url"].rsplit("/", 1)[1], EN_NAMES[m[1]], int(m[2]),
                    int(m[3] or m[2])))
    return out


def kjv_position():
    """(книга, глава, стих) нашего kjv.json (синодальная нумерация) → (глава, стих) KJV — порядок чтения.
    Таблица соответствия — из scripts/extra_lib.py (SWORD canon_synodal.h); без неё считаем нумерацию общей."""
    try:
        sys.path.insert(0, str(ROOT / "scripts"))
        import extra_lib
        syn = extra_lib.synodal()
        return lambda b, c, v: tuple(syn.to_kjv(b, c, v)[1:3])
    except Exception as e:  # noqa: BLE001
        log(f"  нет таблицы синодальной нумерации ({e}) — нумерация KJV считается совпадающей")
        return lambda b, c, v: (c, v)


def build_kjv(args):
    kjv = load_bible("kjv")
    _, files = ia_files(LV_ITEM)
    books = PROT if args.books == "all" else (args.books.split(",") if args.books else GOSPELS)
    secs = lv_sections()
    pos = kjv_position()
    # Главы KJV, разрезанные между файлами (Деян 10 — конец 102-го и начало 103-го), не размечаем
    cnt = {}
    for n, mp3, bid, a, b in secs:
        for c in range(a, b + 1):
            cnt[(bid, c)] = cnt.get((bid, c), 0) + 1
    split = {k for k, n in cnt.items() if n > 1}
    # Поток стихов каждого файла в порядке чтения KJV
    streams, owner = {}, {}
    for n, mp3, bid, a, b in secs:
        if bid not in books:
            continue
        vs = []
        for c, chap in enumerate(kjv[bid], 1):
            for v, t in enumerate(chap, 1):
                kc, kv = pos(bid, c, v)
                if a <= kc <= b and (bid, kc) not in split and t.strip():
                    vs.append(((kc, kv, c, v), f"{bid}.{c}", v, t))
        vs.sort(key=lambda x: x[0])
        streams[mp3] = (n, bid, a, [(ck, v, t) for _, ck, v, t in vs])
        for _, ck, v, t in vs:
            owner.setdefault(ck, set()).add(mp3)
    shared = {ck for ck, s in owner.items() if len(s) > 1}  # синодальная глава в двух файлах — пропускаем
    if shared:
        log(f"  главы на границе файлов (пропущены): {', '.join(sorted(shared))}")
    al, chapters = None, {}
    old = OUT / "audio-kjv-librivox.json"
    if old.exists():
        chapters = {k: v for k, v in json.loads(old.read_text(encoding="utf-8"))["chapters"].items()
                    if k.split(".")[0] not in books}
    tot_audio, tot_time = 0.0, 0.0
    for mp3, (n, bid, a, texts) in streams.items():
        f = files[mp3]
        key = hashlib.sha1(json.dumps([ALIGN_VERSION, mp3, texts], ensure_ascii=False).encode()).hexdigest()[:12]
        cache = DATA / "librivox-kjv" / "align" / f"{mp3}.{key}.json"
        t0 = time.time()
        if cache.exists():
            r = json.loads(cache.read_text(encoding="utf-8"))
        else:
            al = al or Aligner()
            path = http_get(f"https://archive.org/download/{LV_ITEM}/{mp3}", DATA / "librivox-kjv" / "mp3" / mp3,
                            md5=f.get("md5"))
            wav = load_wav(path)
            em = al.emission(wav, DATA / "librivox-kjv" / "emis" / f"{mp3}.npy")
            vs = [((ck, v), al.tokens(t)) for ck, v, t in texts]
            vs = [(k, t) for k, t in vs if t]
            # начало файла — объявление LibriVox; если первая глава разрезана, её начало тоже пропускаем
            margin = 120 + (900 if (bid, a) in split else 0)
            res = al.align_stream(em, vs, first_margin_s=margin, max_gap_s=30)
            r = {"duration": len(wav) / 16000, "verses": [[ck, v, *res[(ck, v)]] for (ck, v), _ in vs if (ck, v) in res]}
            cache.parent.mkdir(parents=True, exist_ok=True)
            cache.write_text(json.dumps(r), encoding="utf-8")
            tot_audio += r["duration"]
            tot_time += time.time() - t0
            log(f"  {mp3}: {r['duration']/60:.0f} мин аудио, выравнивание {time.time()-t0:.0f} с")
        url = f"https://archive.org/download/{LV_ITEM}/{mp3}"
        # главы в порядке чтения; у каждой берём первый непрерывный отрезок стихов
        runs, order_ck = {}, []
        for i, (ck, v, s0, e0, sc) in enumerate(r["verses"]):
            if ck in shared:
                continue
            if ck not in runs:
                runs[ck] = [[i, v, s0, e0, sc]]
                order_ck.append(ck)
            elif runs[ck][-1] is not None and runs[ck][-1][0] == i - 1:
                runs[ck].append([i, v, s0, e0, sc])
            else:
                runs[ck].append(None)  # стих вне основного отрезка (напр. Рим 14:24–26 = KJV 16:25–27)
        prev_end, dropped = None, []
        for ck in order_ck:
            vv = []
            for x in runs[ck]:
                if x is None:
                    break
                vv.append(x)
            # время стихов должно расти вместе с номером; ненайденные стихи (оценка < MIN_SCORE) — без времени
            n_all, all_vs = len(kjv[ck.split(".")[0]][int(ck.split(".")[1]) - 1]), None
            vv = [x for k, x in enumerate(vv) if (k == 0 or x[1] > vv[k - 1][1]) and x[4] >= MIN_SCORE]
            all_vs = list(range(1, n_all + 1))
            if len(vv) < 0.7 * n_all:
                dropped.append(ck)
                continue
            al_map = {x[1]: (x[2], x[3], x[4]) for x in vv}
            starts = verse_starts([x[1] for x in vv], al_map)
            first = starts[0]
            start = max(0.0, first - 2.5) if prev_end is None else min(first, prev_end + 0.3)
            chapters[ck] = {"url": url, "verses": fill_missing([[x[1], s] for x, s in zip(vv, starts)], all_vs),
                            "duration": round(r["duration"], 2), "start": round(start, 2),
                            "end": round(vv[-1][3] + 0.6, 2)}
            prev_end = vv[-1][3]
        if dropped:
            log(f"  {mp3}: главы не размечены (в записи не нашлось большей части стихов): {', '.join(dropped)}")
        for k1, k2 in zip(order_ck, order_ck[1:]):  # конец главы не заходит за начало следующей
            if k1 in chapters and k2 in chapters:
                chapters[k1]["end"] = round(min(chapters[k1]["end"], chapters[k2]["start"]), 2)
        low = [f"{ck}:{v}({s:.2f})" for ck, v, a_, b_, s in r["verses"] if s < 0.3]
        if low:
            log(f"  {mp3}: стихи с низкой уверенностью ({len(low)}): {' '.join(low[:15])}{' …' if len(low) > 15 else ''}")
    if tot_audio:
        log(f"  выровнено {tot_audio/3600:.1f} ч аудио за {tot_time/60:.1f} мин")
    order = {b: i for i, b in enumerate(PROT)}
    chapters = dict(sorted(chapters.items(), key=lambda kv: (order[kv[0].split('.')[0]], int(kv[0].split('.')[1]))))
    covered = sorted({k.split(".")[0] for k in chapters}, key=order.get)
    what = "вся Библия" if len(covered) == 66 else "книги " + ", ".join(covered)
    mod = {
        "format": "aob-module", "formatVersion": 1, "type": "audio",
        "id": "audio-kjv-librivox", "name": "Аудио KJV",
        "title": "King James Version — LibriVox (чтец Michael Armenta)",
        "description": f"Живое чтение Библии короля Якова (LibriVox, один чтец на всю Библию). Размечены: {what}. "
                       "В одном файле записано несколько глав: у главы есть start/end — секунды от начала файла. "
                       "Время стихов получено принудительным выравниванием текста KJV с записью (MMS_FA). "
                       "Записи загружаются с archive.org.",
        "language": "en", "version": "1.0 (LibriVox 2020)",
        "author": "Michael Armenta (чтец); текст — KJV 1769",
        "source": "https://librivox.org/bible-complete-king-james-version/ (https://archive.org/details/"
                  "bible_kjv_complete_2001_librivox)",
        "license": "Public Domain",
        "translation": "kjv", "versification": "synodal",
        "chapters": chapters,
    }
    return write_module(mod)


# --- Синодальный, живое чтение: wwjdru на archive.org ------------------------------------------------

WWJD = {
    "nt": {"item": "RU-NT-NonDrama", "id": "audio-rst-nt-wwjd", "name": "Аудио НЗ",
           "title": "Новый Завет — живое чтение (без музыки)", "what": "Новый Завет"},
    "ot": {"item": "Russian-NT-NonDrama", "id": "audio-rst-ot-wwjd", "name": "Аудио ВЗ",
           "title": "Ветхий Завет — живое чтение (без музыки)", "what": "Ветхий Завет"},
}
WW_ALIAS = {"revelations": "Rev", "psalm": "Ps", "1king": "1Kgs", "2king": "2Kgs", "songofsolomon": "Song",
            # неканонические книги (Canon-Biblia): «2 Ездры» RST = 1Esd, «3 Ездры» = 2Esd
            "1maccabees": "1Macc", "2maccabees": "2Macc", "3maccabees": "3Macc", "baruh": "Bar", "baruch": "Bar",
            "epistleofjeremiah": "EpJer", "2esdras": "1Esd", "3esdras": "2Esd", "judith": "Jdt", "wisdom": "Wis",
            "sirach": "Sir", "tobit": "Tob"}
DC = ["1Esd", "Tob", "Jdt", "Wis", "Sir", "EpJer", "Bar", "1Macc", "2Macc", "3Macc", "2Esd", "PrMan"]
ORDER_ALL = {b: i for i, b in enumerate(PROT + DC)}
# Ещё записи wwjdru/wwjdua (archive.org, CC BY-NC-SA 3.0): файл = глава, в папках по книгам.
# text — модуль с текстом для выравнивания (по умолчанию rst), translation — к какому переводу привязана запись.
WWJD_NC = "Записи выложены на archive.org пользователем wwjdru под лицензией CC BY-NC-SA 3.0 (некоммерческая)"
WWJD.update({
    "nt-prudovsky": {"item": "NT-Biblia", "id": "audio-rst-nt-prudovsky", "name": "Аудио НЗ (Прудовский)",
                     "title": "Новый Завет — читает И. Прудовский", "what": "Новый Завет",
                     "reader": "И. Прудовский"},
    "dc-prudovsky": {"item": "Canon-Biblia", "id": "audio-rst-dc-prudovsky", "name": "Аудио неканонич. книги",
                     "title": "Неканонические книги — читает И. Прудовский", "what": "Неканонические книги",
                     "reader": "И. Прудовский", "text": "rst-dc", "translation": "rst-dc"},
    "nt-peisti": {"item": "Pestiya-Ctenie", "id": "audio-rst-nt-peisti", "name": "Аудио НЗ, Пс, Притч (Пейсти)",
                  "title": "Новый Завет, Псалтирь, Притчи — читает Я. Н. Пейсти",
                  "what": "Новый Завет, Псалтирь и Притчи", "reader": "Я. Н. Пейсти"},
    "nt-blag": {"item": "Gramatnoe_Cheniye", "id": "audio-rst-nt-blag", "name": "Аудио НЗ (wwjdru, 3)",
                "title": "Новый Завет — живое чтение (третья запись wwjdru)", "what": "Новый Завет", "reader": ""},
    "nt-ogienko": {"item": "UkrainianNewTestament", "id": "audio-ukr-ogienko-nt-wwjd", "name": "Аудіо НЗ (Огієнко)",
                   "title": "Новий Завіт (пер. І. Огієнка) — живе читання", "what": "Новый Завет",
                   "text": "ukr-ogienko", "translation": "ukr-ogienko", "language": "uk",
                   "author": "wwjdua (sites.google.com/site/wwjdua)"},
})


def ww_book(name, num):
    key = (num + name).lower()
    if key in WW_ALIAS:
        return WW_ALIAS[key]
    for en, osis in EN_NAMES.items():
        if en.replace(" ", "").lower() == key:
            return osis
    raise KeyError(name)


def ww_files(item):
    """[(OSIS, глава в имени файла, имя mp3, md5)] в порядке книг и глав.
    Имена: «40Matthew01.mp3» или по папкам «40_Matthew/Bnn-40-01.mp3», «CP-19_Psalms/BP-19-001.mp3»
    (номер книги в папке у разных записей свой — книгу определяем по названию)."""
    _, files = ia_files(item)
    out = []
    for name, f in files.items():
        m = re.fullmatch(r"(\d\d)(\d?)_?([A-Za-z]+?)_?(\d+)\.mp3", name)
        if m:
            out.append((ww_book(m[3], m[2]), int(m[4]), name, f.get("md5")))
            continue
        m = re.fullmatch(r"(?:[A-Za-z]+-)?\d+[-_]((?:\d[-_])?[A-Za-z_]+?)/[A-Za-z]+-\d+-(\d+)\.mp3", name)
        if m:
            out.append((ww_book(re.sub(r"[-_]", "", m[1]), ""), int(m[2]), name, f.get("md5")))
    return sorted(out, key=lambda x: (ORDER_ALL[x[0]], x[1]))


def ww_candidates(bid, c, nch):
    """Синодальные главы, которые может содержать файл с номером c (сначала — самая вероятная)."""
    cand = [c]
    if bid == "Ps":  # нумерация в имени файла может быть еврейской (KJV): Пс 23 KJV = Пс 22 синод.
        cand += [c - 1, c + 1]
    elif bid in ("Joel", "Mal", "Num", "1Kgs", "Job", "Song", "Isa", "Dan", "Jonah", "Exod"):
        cand += [c - 1, c + 1]
    return [x for x in dict.fromkeys(cand) if 1 <= x <= nch]


def build_wwjd(args):
    from concurrent.futures import ThreadPoolExecutor
    cfg = WWJD[args.part]
    item, mid = cfg["item"], cfg["id"]
    rst = load_bible(cfg.get("text", "rst"))
    items = ww_files(item)
    if args.books:
        items = [x for x in items if x[0] in args.books.split(",")]
    base = DATA / f"wwjd-{args.part}"
    old = OUT / f"{mid}.json"
    chapters = json.loads(old.read_text(encoding="utf-8"))["chapters"] if old.exists() else {}
    pool = ThreadPoolExecutor(6)
    futs = {}

    def mp3_path(it):
        return http_get(f"https://archive.org/download/{item}/{it[2]}", base / "mp3" / it[2], md5=it[3])

    def prefetch(i):
        for k in range(i, min(i + 12, len(items))):
            if k not in futs:
                futs[k] = pool.submit(mp3_path, items[k])

    al, t0, audio_s, align_s = None, time.time(), 0.0, 0.0
    problems, cur_book, seen, skipped = [], None, {}, []
    order = ORDER_ALL

    def save():
        ch = dict(sorted(chapters.items(), key=lambda kv: (order[kv[0].split('.')[0]], int(kv[0].split('.')[1]))))
        books = sorted({k.split(".")[0] for k in ch}, key=order.get)
        if "reader" in cfg or "text" in cfg:
            tr = {"rst": "Синодальном переводе", "rst-dc": "Синодальном переводе",
                  "ukr-ogienko": "переводе И. Огиенко"}.get(cfg.get("text", "rst"), cfg.get("text"))
            desc = (f"{cfg['what']} в {tr}, живое чтение без музыки"
                    + (f" (читает {cfg['reader']})" if cfg.get("reader") else "") + ", запись на каждую главу. "
                    + WWJD_NC + ". Время стихов получено принудительным выравниванием текста с записью (MMS_FA). "
                    "Озвучены книги: " + ", ".join(books) + ".")
        else:
            desc = (f"{cfg['what']} в Синодальном переводе, живые чтецы, без музыки, запись на каждую главу. "
                    "Записи выложены на archive.org пользователем wwjdru под лицензией CC BY-NC-SA 3.0; "
                    "вероятно, это записи Faith Comes By Hearing. Время стихов получено принудительным "
                    "выравниванием текста RST с записью (MMS_FA). Озвучены книги: " + ", ".join(books) + ".")
        mod = {
            "format": "aob-module", "formatVersion": 1, "type": "audio",
            "id": mid, "name": cfg["name"], "title": cfg["title"],
            "description": desc,
            "language": cfg.get("language", "ru"), "version": "1.0 (archive.org, 2010)",
            "author": cfg.get("author", "wwjdru (sites.google.com/site/wwjdru)")
                      + (f"; читает {cfg['reader']}" if cfg.get("reader") else ""),
            "source": f"https://archive.org/details/{item}",
            "license": "CC BY-NC-SA 3.0 (по странице archive.org)",
            "translation": cfg.get("translation", "rst"), "versification": "synodal",
            "chapters": ch,
        }
        merge_catalog([write_module(mod)])

    for i, it in enumerate(items):
        bid, c, name, md5 = it
        if cur_book and bid != cur_book:
            save()
        cur_book = bid
        nch = len(rst[bid])
        cands = ww_candidates(bid, c, nch)
        if not cands:
            problems.append(f"{name}: лишний файл (в {bid} всего {nch} глав)")
            continue
        key = hashlib.sha1(json.dumps([WWJD_ALIGN_VERSION, name, [rst[bid][x - 1] for x in cands]],
                                      ensure_ascii=False).encode()).hexdigest()[:12]
        cache = base / "align" / f"{name}.{key}.json"
        if cache.exists():
            r = json.loads(cache.read_text(encoding="utf-8"))
        else:
            prefetch(i)
            ta = time.time()
            al = al or Aligner()
            wav = load_wav(futs.pop(i).result())
            em = al.emission(wav)
            best = None
            for sc in cands:
                vs = [(v, al.tokens(t)) for v, t in enumerate(rst[bid][sc - 1], 1)]
                vs = [(k, t) for k, t in vs if t]
                a = al.align_stream(em, vs, first_margin_s=60, max_gap_s=30)
                found = [k for k, _ in vs if k in a and a[k][2] >= MIN_SCORE]
                score = sum(a[k][2] for k in found) / max(1, len(vs))  # пропущенные стихи тянут оценку вниз
                if best is None or score > best[0]:
                    best = (score, sc, a, [k for k, _ in vs])
                if score >= 0.7:
                    break
            score, sc, a, keys = best
            r = {"chapter": sc, "score": score, "duration": len(wav) / 16000, "all": keys,
                 "verses": [[k, *a[k]] for k in keys if k in a]}
            cache.parent.mkdir(parents=True, exist_ok=True)
            cache.write_text(json.dumps(r), encoding="utf-8")
            audio_s += r["duration"]
            align_s += time.time() - ta
        sc = r["chapter"]
        good = [v for v in r["verses"] if v[3] >= MIN_SCORE]
        # Чтецы иногда сокращают перечни имён (Быт 36, 46 — родословия): такие стихи остаются без времени,
        # а глава размечается, если найденные стихи совпали надёжно
        mean_good = sum(v[3] for v in good) / max(1, len(good))
        if mean_good < 0.6 or len(good) < 0.3 * len(r["all"]):
            problems.append(f"{name}→{bid}.{sc} (оценка {r['score']:.2f}, найдено {len(good)}/{len(r['all'])})")
            continue
        if sc != c:
            log(f"  {name}: это синодальная глава {bid}.{sc}")
        miss = [v for v in r["all"] if v not in {g[0] for g in good}]
        if miss:
            log(f"  {bid}.{sc}: стихов нет в записи (или не найдены): {miss}")
            skipped.append(f"{bid}.{sc}:{miss[0]}" + (f"–{miss[-1]}" if len(miss) > 1 else "") + f" ({len(miss)})")
        keys = [v[0] for v in good]
        starts = verse_starts(keys, {v[0]: v[1:] for v in good})
        ck = f"{bid}.{sc}"
        if ck in seen:
            problems.append(f"{ck}: два файла ({seen[ck]} и {name}) — оставлен второй")
        seen[ck] = name
        chapters[ck] = {"url": f"https://archive.org/download/{item}/{name}",
                        "verses": fill_missing([[k, s] for k, s in zip(keys, starts)], r["all"]),
                        "duration": round(r["duration"], 2)}
        if (i + 1) % 50 == 0:
            log(f"  {i + 1}/{len(items)} файлов, {time.time() - t0:.0f} с")
    pool.shutdown(cancel_futures=True)
    if audio_s:
        log(f"  выровнено {audio_s/3600:.1f} ч аудио за {align_s/60:.1f} мин")
    if problems:
        log(f"  не размечены ({len(problems)}): " + "; ".join(problems))
    if skipped:
        log(f"  главы с пропущенными в записи стихами ({len(skipped)}): " + ", ".join(skipped))
    save()


# --- Проекты LibriVox: выравнивание «потоком» через все файлы проекта ---------------------------------
#
# Запись проекта LibriVox — несколько mp3 (по главе, по нескольку глав или по книге — у разных проектов
# по-разному, а названия разделов бывают на любом языке). Поэтому названия разделов не разбираем: текст
# всех книг проекта в порядке чтения выравнивается с записью всех его файлов подряд, как с одной длинной
# записью (эмиссии файлов читаются с диска по мере надобности). У краёв каждого файла «звёздочка»
# бесплатна — там объявления LibriVox («This is a LibriVox recording…», «End of chapter…»). Затем каждая
# глава получает файл, в котором прочитаны её стихи (глава, разрезанная между файлами, не размечается).

LV_ALIGN_VERSION = 1
EDGE_HEAD, EDGE_TAIL = 60, 30  # с, у начала и конца файла — бесплатная «звёздочка»
TEXTS = DATA / "texts"

# Модули из записей LibriVox. projects — [(id проекта LibriVox, книги OSIS по порядку чтения)];
# если главу озвучили несколько проектов, берётся первый по списку. text — id переводов в public/modules,
# с которыми выравнивать (первый существующий); пока перевода нет — текст eBible (ebible), собранный
# в синодальную нумерацию тем же кодом, что и модуль перевода (scripts/extra_world.py), в data-src/audio/texts.
NT = PROT[39:]
OT = PROT[:39]


def _b(*names):
    return [x for n in names for x in (n if isinstance(n, list) else [n])]


LVMODS = {
    "web": {"id": "audio-web-librivox", "name": "Аудио WEB", "lang": "en", "text": ["web", "engwebp"],
            "ebible": "engwebp", "translation": "web",
            "title": "World English Bible — LibriVox (чтец Ron Altman)", "reader": "Ron Altman",
            "what": "World English Bible (WEB)", "projects": [(21093, PROT)]},
    "web-henson": {"id": "audio-web-librivox-henson", "name": "Аудио WEB (Henson)", "lang": "en",
                   "text": ["web", "engwebp"], "ebible": "engwebp", "translation": "web",
                   "title": "World English Bible — LibriVox (чтец Winfred Henson)", "reader": "Winfred Wardell Henson",
                   "what": "World English Bible (WEB)", "projects": [(11622, PROT)]},
    "asv": {"id": "audio-asv-librivox", "name": "Аудио ASV", "lang": "en", "text": ["asv", "eng-asv"],
            "ebible": "eng-asv", "translation": "asv",
            "title": "American Standard Version — LibriVox (чтец Ron Altman)", "reader": "Ron Altman",
            "what": "American Standard Version (1901)", "projects": [(15545, PROT)]},
    "bsb": {"id": "audio-bsb-librivox", "name": "Аудио BSB", "lang": "en", "text": ["bsb"],
            "translation": "bsb", "title": "Berean Standard Bible — LibriVox (Послание к Евреям)",
            "what": "Berean Standard Bible", "projects": [(19872, ["Heb"])]},
    "kjv2": {"id": "audio-kjv-librivox-2", "name": "Аудио KJV (разные чтецы)", "lang": "en", "text": ["kjv"],
             "translation": "kjv", "title": "King James Version — LibriVox, разные чтецы",
             "what": "Библия короля Якова", "projects": "auto:KJV"},
    "rv1909": {"id": "audio-rv1909-librivox", "name": "Аудио RV 1909", "lang": "es",
               "text": ["rv1909", "spa-rv1909", "spaRV1909"], "ebible": "spaRV1909", "translation": "rv1909",
               "title": "Reina-Valera 1909 — LibriVox, разные чтецы", "what": "Reina-Valera 1909",
               "projects": "auto:Reina Valera",
               # 1–2 Тим: у раздела «1 Timoteo 1» нет записи — проект берём без этой главы
               "extra": [(12486, ["1Tim", "2Tim"], {"1Tim", "2Tim"}, {"1Tim.1"})]},
    "cuv": {"id": "audio-cuv-librivox", "name": "Аудио 和合本", "lang": "zh",
            "text": ["cuv", "cmn-cu89t", "cmn-cu89s"], "ebible": "cmn-cu89t", "translation": "cuv",
            "title": "Chinese Union Version (和合本) — LibriVox", "what": "Chinese Union Version (和合本)",
            "projects": [(13982, ["Ps"]), (2135, ["Matt"]), (5140, ["Mark"]), (5659, ["Luke"]), (13410, ["John"]),
                         (6044, ["Acts"]), (5613, ["Rom"])]},
    "luther1912": {"id": "audio-luther1912-librivox", "name": "Аудио Luther 1912", "lang": "de",
                   "text": ["luther1912", "deu1912"], "ebible": "deu1912", "translation": "luther1912",
                   "title": "Lutherbibel 1912 — LibriVox", "what": "Lutherbibel 1912",
                   "projects": [(2909, ["Esth"]), (2952, ["Matt"]), (4037, ["John"])]},
    "lsg": {"id": "audio-lsg-librivox", "name": "Аудио LSG", "lang": "fr",
            "text": ["lsg", "fra-lsg", "fraLSG"], "ebible": "fraLSG", "translation": "lsg",
            "title": "Louis Segond 1910 — LibriVox", "what": "Louis Segond 1910",
            "projects": [(596, ["Ruth"]), (1454, ["Song"]), (122, ["John"]), (866, ["1Pet", "2Pet"])]},
    "almeida": {"id": "audio-almeida-librivox", "name": "Аудио Almeida", "lang": "pt",
                "text": ["almeida", "porbr2018"], "ebible": "porbr2018", "translation": "almeida",
                "title": "Bíblia de Almeida — LibriVox", "what": "Bíblia (João Ferreira de Almeida)",
                "projects": [(4205, ["Gen"]), (10668, ["Ruth"]), (17520, ["Eccl"])]},
    "grc": {"id": "audio-byz-librivox", "name": "Аудио греч. НЗ", "lang": "grc", "text": ["byz-rp2018"],
            "translation": "byz-rp2018",
            "title": "Греческий Новый Завет — LibriVox (новогреческое произношение)",
            "what": "греческий Новый Завет (чтецы читали Патриаршее издание 1904 г. и Textus Receptus Стефана; "
                    "текст для разметки — Robinson-Pierpont 2018, отличия минимальны)",
            "projects": [(2889, ["Matt"]), (4222, ["John"]), (4115, ["Col"]), (2242, ["Jas"]),
                         (2307, ["1Pet", "2Pet"])]},
    "csl": {"id": "audio-csl-librivox", "name": "Аудио ЦСЯ (Бытие)", "lang": "cu", "text": ["csl-elizabeth"],
            "translation": "csl-elizabeth", "order": "syn",
            "title": "Елизаветинская Библия — LibriVox (книга Бытия)", "what": "Елизаветинская Библия",
            "projects": [(2218, ["Gen"])]},
}

# Номера книг в названиях проектов LibriVox: «Bible (KJV) 19: Psalms», «Bible (KJV) NT 09-12: …»
_LV_SKIP = re.compile(r"Apocrypha|Deuterocanon|\b00:|Selections|Psalm 133|Sermon On|Dramatic", re.I)


def lv_title_books(title):
    m = re.search(r"\)\s+(NT\s+)?(\d+)(?:\s*-\s*(\d+))?\s*:", title)
    if not m:
        return None
    a, b = int(m[2]), int(m[3] or m[2])
    base = 39 if m[1] else 0
    return [PROT[base + i - 1] for i in range(a, b + 1)]


def lv_auto_projects(tag):
    """Все проекты «Bible (<tag>) …» из каталога LibriVox, по одному на книгу: солист лучше хора, новее лучше."""
    cat = DATA / "meta" / f"librivox-search-{re.sub(r'[^A-Za-z0-9]+', '_', tag)}.json"
    found = {}
    if cat.exists():
        found = json.loads(cat.read_text(encoding="utf-8"))
    else:
        off = 0
        while True:
            q = urllib.parse.urlencode({"title": "^Bible (" + tag, "format": "json", "limit": "200",
                                        "offset": str(off)})
            try:
                bs = json.loads(http_get("https://librivox.org/api/feed/audiobooks/?" + q)).get("books", [])
            except Exception:  # noqa: BLE001 — 404, когда больше нет
                bs = []
            for x in bs:
                found[x["id"]] = x["title"]
            if len(bs) < 200:
                break
            off += 200
        cat.parent.mkdir(parents=True, exist_ok=True)
        cat.write_text(json.dumps(found, ensure_ascii=False), encoding="utf-8")
    best = {}
    for lid, title in found.items():
        if not title.startswith(f"Bible ({tag})") or _LV_SKIP.search(title) or "Complete" in title:
            continue
        books = lv_title_books(title)
        if not books:
            continue
        info, files = lv_project(int(lid))
        if not files or any(f is None for f in files):
            continue  # проект не закончен (у части разделов нет записи)
        readers = {r["display_name"] for s in info["sections"] for r in s.get("readers", [])}
        rank = (len(readers) > 1, -int(lid))
        for bk in books:
            if bk not in best or rank < best[bk][0]:
                best[bk] = (rank, int(lid), tuple(books))
    # проект, покрывающий несколько книг, берём, только если он лучший хотя бы для одной из них
    out, seen = [], {}
    for bk in PROT:
        if bk in best:
            lid = best[bk][1]
            if lid not in seen:
                seen[lid] = (lid, list(best[bk][2]), set())
                out.append(seen[lid])
            seen[lid][2].add(bk)
    return out


def lv_project(lid):
    """(описание проекта LibriVox, [(item archive.org, имя mp3, раздел) или None — раздел без записи])."""
    api = cached_json(f"https://librivox.org/api/feed/audiobooks/?id={lid}&format=json&extended=1",
                      DATA / "meta" / f"librivox-{lid}.json", max_age_days=365)
    info = api["books"][0]
    files = []
    for s in sorted(info["sections"], key=lambda s: int(s["section_number"])):
        m = re.search(r"archive\.org/download/([^/]+)/(.+)$", s.get("listen_url") or "")
        files.append((m[1], urllib.parse.unquote(m[2]), s) if m else None)
    return info, files


class StreamEm:
    """Эмиссии нескольких файлов как одна последовательность кадров (np.memmap — в память не грузятся)."""

    def __init__(self, torch, paths):
        import numpy as np
        self.np, self.torch = np, torch
        self.parts = [np.load(p, mmap_mode="r") for p in paths]
        self.offsets = [0]
        for a in self.parts:
            self.offsets.append(self.offsets[-1] + a.shape[0])
        self.shape = (self.offsets[-1], self.parts[0].shape[1])
        star = np.full(self.shape[0], STAR_LOGP, dtype=np.float32)
        for a0, a1 in zip(self.offsets, self.offsets[1:]):
            star[a0:min(a1, a0 + EDGE_HEAD * Aligner.FPS)] = 0
            star[max(a0, a1 - EDGE_TAIL * Aligner.FPS):a1] = 0
        self.star = star

    def __getitem__(self, sl):
        np = self.np
        f0 = max(0, sl.start or 0)
        f1 = self.shape[0] if sl.stop is None else min(self.shape[0], sl.stop)
        out = [np.asarray(a[max(f0, a0) - a0:min(f1, a1) - a0], dtype=np.float32)
               for a, a0, a1 in zip(self.parts, self.offsets, self.offsets[1:]) if a1 > f0 and a0 < f1]
        return self.torch.from_numpy(np.concatenate(out) if out else np.zeros((0, self.shape[1]), np.float32))

    def inner_star(self, f0, f1):
        return self.torch.from_numpy(self.star[f0:f1].copy()).unsqueeze(1)

    def file_of(self, frame):
        import bisect
        return min(len(self.parts) - 1, max(0, bisect.bisect_right(self.offsets, frame) - 1))

    def boundary_between(self, a, b):
        return self.file_of(a) != self.file_of(b)


def ebible_text(eid):
    """Текст перевода eBible в синодальной нумерации (data-src/audio/texts/<id>.json, формат как у модуля).
    Собирается функциями scripts/extra_world.py — так же, как модуль перевода в public/modules."""
    out = TEXTS / f"{eid}.json"
    if out.exists():
        return {b["id"]: b["chapters"] for b in json.loads(out.read_text(encoding="utf-8"))["books"]}
    import zipfile
    folder = TEXTS / eid
    if not folder.exists():
        z = http_get(f"https://ebible.org/Scriptures/{eid}_usfm.zip", TEXTS / f"{eid}_usfm.zip")
        folder.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(z) as zf:  # недоверенный архив: берём только *.usfm/*.SFM без путей
            for n in zf.namelist():
                base = n.replace("\\", "/").rsplit("/", 1)[-1]
                if re.fullmatch(r"[\w.-]+\.(usfm|sfm|SFM)", base):
                    (folder / base).write_bytes(zf.read(n))
    sys.path.insert(0, str(ROOT / "scripts"))
    import extra_world as W
    src, heads = W.read_usfm(folder, strongs=False)
    schemes, best, _ = W.choose_schemes(src)
    from collections import Counter
    log(f"  {eid}: схемы нумерации по книгам {dict(Counter(map(str, schemes.values())))}")
    books = W.collect(src, heads, schemes, eid).books()
    out.write_text(json.dumps({"books": [{"id": b["id"], "chapters": b["chapters"]} for b in books]},
                              ensure_ascii=False), encoding="utf-8")
    return {b["id"]: b["chapters"] for b in books}


def lv_text(cfg):
    """(текст {книга: главы} в синодальной нумерации, откуда он)."""
    for t in cfg["text"]:
        if (OUT / f"{t}.json").exists():
            return load_bible(t), t
    if cfg.get("ebible"):
        return ebible_text(cfg["ebible"]), "eBible " + cfg["ebible"]
    raise SystemExit(f"нет текста для {cfg['id']}: {cfg['text']}")


def lv_stream(text, books, order):
    """[(ключ главы, стих, текст)] в порядке чтения: синодальная нумерация → порядок источника (KJV)."""
    pos = (lambda b, c, v: (c, v)) if order == "syn" else kjv_position()
    out = []
    for bi, bid in enumerate(books):
        for c, chap in enumerate(text.get(bid, []), 1):
            for v, t in enumerate(chap, 1):
                if t.strip():
                    out.append(((bi, *pos(bid, c, v), c, v), f"{bid}.{c}", v, t))
    out.sort(key=lambda x: x[0])
    return [(ck, v, t) for _, ck, v, t in out]


def lv_align_project(al_box, lid, books, text, order="kjv", drop=()):
    """Выравнивает проект LibriVox целиком. Возвращает {files, verses, all} (времена — от начала потока)."""
    from concurrent.futures import ThreadPoolExecutor
    info, files = lv_project(lid)
    if any(f is None for f in files):
        log(f"  ! проект {lid}: у разделов {[i + 1 for i, f in enumerate(files) if f is None]} нет записи")
    files = [f for f in files if f]
    stream = [x for x in lv_stream(text, books, order) if x[0] not in drop]
    key = hashlib.sha1(json.dumps([LV_ALIGN_VERSION, lid, [f[1] for f in files], stream],
                                  ensure_ascii=False).encode()).hexdigest()[:12]
    cache = DATA / "lv" / "align" / f"{lid}.{key}.json"
    if cache.exists():
        return json.loads(cache.read_text(encoding="utf-8"))
    al = al_box[0] = al_box[0] or Aligner()
    t0 = time.time()
    metas = {}
    for item in {f[0] for f in files}:
        metas[item] = ia_files(item)[1]

    def fetch(f):
        item, name, _ = f
        return http_get(f"https://archive.org/download/{item}/{name}", DATA / "lv" / item / "mp3" / name,
                        md5=metas[item].get(name, {}).get("md5"))

    pool = ThreadPoolExecutor(4)
    futs = [pool.submit(fetch, f) if not (DATA / "lv" / f[0] / "emis" / f"{f[1]}.npy").exists() else None
            for f in files]
    paths = []
    for f, fut in zip(files, futs):
        npy = DATA / "lv" / f[0] / "emis" / f"{f[1]}.npy"
        if not npy.exists():
            al.emission(load_wav(fut.result()), npy)
        paths.append(npy)
    pool.shutdown()
    em = StreamEm(al.torch, paths)
    t1 = time.time()
    vs = [((ck, v), al.tokens(t)) for ck, v, t in stream]
    vs = [(k, t) for k, t in vs if t]
    res = al.align_stream(em, vs, first_margin_s=120, max_gap_s=30, gap_ok=em.boundary_between)
    fps = Aligner.FPS
    r = {"files": [[f[0], f[1], (a1 - a0) / fps] for f, a0, a1 in zip(files, em.offsets, em.offsets[1:])],
         "offsets": [o / fps for o in em.offsets],
         "verses": [[ck, v, *res[(ck, v)]] for (ck, v), _ in vs if (ck, v) in res],
         "all": [[ck, v] for (ck, v), _ in vs]}
    cache.parent.mkdir(parents=True, exist_ok=True)
    cache.write_text(json.dumps(r), encoding="utf-8")
    log(f"  проект {lid}: {em.shape[0] / fps / 3600:.1f} ч, {len(files)} файлов; скачивание и эмиссии "
        f"{(t1 - t0) / 60:.1f} мин, выравнивание {(time.time() - t1) / 60:.1f} мин")
    return r


def lv_chapters(r, lid):
    """Главы из результата выравнивания проекта: {ключ: глава модуля}, список проблем."""
    import bisect
    offs, files = r["offsets"], r["files"]
    fidx = lambda t: min(len(files) - 1, max(0, bisect.bisect_right(offs, t) - 1))  # noqa: E731
    allv = {}
    for ck, v in r["all"]:
        allv.setdefault(ck, []).append(v)
    # у каждой главы — первый непрерывный отрезок стихов в порядке чтения
    runs, order_ck = {}, []
    for i, (ck, v, s0, e0, sc) in enumerate(r["verses"]):
        if ck not in runs:
            runs[ck] = [[i, v, s0, e0, sc]]
            order_ck.append(ck)
        elif runs[ck][-1] is not None and runs[ck][-1][0] == i - 1:
            runs[ck].append([i, v, s0, e0, sc])
        else:
            runs[ck].append(None)
    out, problems, low = {}, [], []
    prev = None  # (файл, конец последнего стиха предыдущей главы)
    for ck in order_ck:
        vv = []
        for x in runs[ck]:
            if x is None:
                break
            vv.append(x)
        low += [f"{ck}:{x[1]}({x[4]:.2f})" for x in vv if x[4] < 0.3]
        vv = [x for k, x in enumerate(vv) if (k == 0 or x[1] > vv[k - 1][1]) and x[4] >= MIN_SCORE]
        n_all = len(allv.get(ck, []))
        if len(vv) < 0.7 * n_all:
            problems.append(f"{ck} (найдено {len(vv)}/{n_all})")
            prev = None
            continue
        fs = {fidx(x[2]) for x in vv}
        if len(fs) > 1:
            problems.append(f"{ck} (глава в двух файлах)")
            prev = None
            continue
        fi = fs.pop()
        base = offs[fi]
        al_map = {x[1]: (x[2] - base, x[3] - base, x[4]) for x in vv}
        keys = [x[1] for x in vv]
        starts = verse_starts(keys, al_map)
        first = starts[0]
        start = max(0.0, first - 2.5) if not prev or prev[0] != fi else min(first, prev[1] + 0.3)
        item, name, dur = files[fi]
        out[ck] = {"url": f"https://archive.org/download/{item}/{urllib.parse.quote(name)}",
                   "verses": fill_missing([[k, s] for k, s in zip(keys, starts)], allv[ck]),
                   "duration": round(dur, 2), "start": round(start, 2),
                   "end": round(min(dur, al_map[keys[-1]][1] + 0.6), 2), "_file": fi}
        prev = (fi, al_map[keys[-1]][1])
    ks = list(out)
    for k1, k2 in zip(ks, ks[1:]):  # конец главы не заходит за начало следующей в том же файле
        if out[k1]["_file"] == out[k2]["_file"]:
            out[k1]["end"] = round(min(out[k1]["end"], out[k2]["start"]), 2)
    for c in out.values():
        del c["_file"]
    if low:
        log(f"  проект {lid}: стихи с низкой уверенностью ({len(low)}): {' '.join(low[:12])}{' …' if len(low) > 12 else ''}")
    return out, problems


def build_lv(args):
    cfg = LVMODS[args.key]
    text, tsrc = lv_text(cfg)
    log(f"{cfg['id']}: текст — {tsrc}")
    projects = cfg["projects"]
    if isinstance(projects, str):
        projects = lv_auto_projects(projects.split(":", 1)[1]) + cfg.get("extra", [])
    if args.projects:
        keep = {int(x) for x in args.projects.split(",")}
        projects = [p for p in projects if p[0] in keep]
    al_box = [None]
    chapters, problems, used, taken = {}, [], [], set()
    for p in projects:
        lid, books = p[0], p[1]
        prefer = p[2] if len(p) > 2 else set(books)
        drop = p[3] if len(p) > 3 else set()
        books = [b for b in books if b in text]
        if not books:
            log(f"  проект {lid}: книг {books} нет в тексте — пропущен")
            continue
        r = lv_align_project(al_box, lid, books, text, cfg.get("order", "kjv"), drop)
        ch, pr = lv_chapters(r, lid)
        problems += [f"[{lid}] {p}" for p in pr]
        info, _ = lv_project(lid)
        rd = sorted({x["display_name"] for s in info["sections"] for x in s.get("readers", [])})
        n_new = 0
        for k, c in ch.items():
            # глава берётся из проекта, лучшего для её книги; из остальных — только если её ещё нет
            if k not in chapters or (k.split(".")[0] in prefer and k not in taken):
                if k in chapters:
                    n_new -= 1
                chapters[k] = c
                n_new += 1
                if k.split(".")[0] in prefer:
                    taken.add(k)
        if n_new:
            used.append((lid, info["title"], rd, n_new))
        log(f"  проект {lid} ({info['title']}): размечено {len(ch)} глав, взято {n_new}")
    if problems:
        log(f"  не размечены ({len(problems)}): " + "; ".join(problems))
    order = {b: i for i, b in enumerate(PROT)}
    chapters = dict(sorted(chapters.items(), key=lambda kv: (order[kv[0].split('.')[0]], int(kv[0].split('.')[1]))))
    covered = sorted({k.split(".")[0] for k in chapters}, key=order.get)
    total = sum(len(text[b]) for b in covered)
    what = "вся Библия" if len(covered) == 66 else "книги " + ", ".join(covered)
    all_readers = sorted({x for _, _, rd, _ in used for x in rd})
    reader = cfg.get("reader") or (", ".join(all_readers) if len(all_readers) <= 4 else
                                   ", ".join(all_readers[:4]) + f" и ещё {len(all_readers) - 4}")
    srcs = " ".join(f"https://librivox.org/{lid}" for lid, *_ in used)
    multi = any(c.get("start", 0) > 30 for c in chapters.values())
    mod = {
        "format": "aob-module", "formatVersion": 1, "type": "audio",
        "id": cfg["id"], "name": cfg["name"], "title": cfg["title"],
        "description": f"Живое чтение: {cfg['what']}, LibriVox (чтец: {reader}). Размечены: {what} "
                       f"({len(chapters)} глав). " + ("В одном файле записано несколько глав: у главы есть "
                                                      "start/end — секунды от начала файла. " if multi else "")
                       + f"Время стихов получено принудительным выравниванием текста ({tsrc}) с записью (MMS_FA). "
                         "Записи загружаются с archive.org.",
        "language": cfg["lang"], "version": f"1.0 (LibriVox, {time.strftime('%Y-%m')})",
        "author": f"LibriVox; читает {reader}",
        "source": "LibriVox: " + ", ".join(f"«{t}» (librivox.org, id {lid})" for lid, t, _, _ in used),
        "license": "Public Domain (LibriVox)",
        "translation": cfg["translation"], "versification": "synodal",
        "chapters": chapters,
    }
    log(f"  итого: {len(chapters)} глав из {total} в озвученных книгах")
    merge_catalog([write_module(mod)])


# --- Выборочная проверка распознаванием речи -----------------------------------------------------

def check_module(args):
    """Для случайных стихов модуля распознаёт 4 с записи с начала стиха (faster-whisper small, CPU) и
    сравнивает слова с началом текста стиха (и предыдущего — чтобы заметить сдвиг на стих)."""
    import random
    import difflib
    mod = json.loads((OUT / f"{args.module}.json").read_text(encoding="utf-8"))
    tid = args.text or mod["translation"]
    if (OUT / f"{tid}.json").exists():
        text = load_bible(tid)
    else:
        cfg = next(c for c in LVMODS.values() if c["id"] == args.module)
        text, _ = lv_text(cfg)
    sys.path.insert(0, str(PYLIB / "asr"))
    os.environ.setdefault("HF_HOME", str(DATA / "models" / "hf"))
    import numpy as np
    from faster_whisper import WhisperModel
    asr = WhisperModel(os.environ.get("ASR_MODEL", "small"), device="cpu", compute_type="int8")
    lang = {"cu": "ru", "grc": "el"}.get(mod["language"], mod["language"])
    rnd = random.Random(args.seed)
    keys = list(mod["chapters"])
    picks = []
    while len(picks) < args.n:
        ck = rnd.choice(keys)
        vv = mod["chapters"][ck]["verses"]
        if len(vv) > 1:
            picks.append((ck, rnd.choice(vv[1:])))
    ok = 0
    for ck, (v, t) in sorted(picks, key=lambda x: (PROT.index(x[0].split(".")[0]) if x[0].split(".")[0] in PROT else 99, int(x[0].split(".")[1]))):
        c = mod["chapters"][ck]
        url = urllib.parse.unquote(c["url"])
        m = re.search(r"archive\.org/download/([^/]+)/(.+)$", url)
        cands = [DATA / "lv" / m[1] / "mp3" / m[2]] + [d / "mp3" / m[2] for d in DATA.glob("wwjd-*")] + \
                [DATA / "librivox-kjv" / "mp3" / m[2]]
        path = next((p for p in cands if p.exists()), None)
        if not path:
            path = http_get(url, DATA / "lv" / m[1] / "mp3" / m[2])
        raw = subprocess.run(["ffmpeg", "-v", "error", "-nostdin", "-ss", str(t), "-t", "4", "-i", str(path),
                              "-ac", "1", "-ar", "16000", "-f", "f32le", "-"], check=True, capture_output=True).stdout
        segs, _ = asr.transcribe(np.frombuffer(raw, dtype=np.float32).copy(), language=lang, beam_size=5,
                                 vad_filter=False)
        heard = " ".join(s.text.strip() for s in segs)
        b, ch = ck.split(".")
        cur = text[b][int(ch) - 1][v - 1] if v <= len(text[b][int(ch) - 1]) else ""
        prv = text[b][int(ch) - 1][v - 2] if v >= 2 else ""

        def sim(a, ref):
            a, ref = romanize(a).split(), romanize(ref).split()
            if not a or not ref:
                return 0.0
            ref = ref[:max(4, int(len(a) * 1.3))]
            return difflib.SequenceMatcher(None, " ".join(a), " ".join(ref)).ratio()

        s_cur, s_prv = sim(heard, cur), sim(heard, prv)
        good = s_cur >= 0.45 and s_cur >= s_prv
        ok += good
        log(f"{'OK ' if good else '?? '} {ck}:{v} @{t:.1f}  {s_cur:.2f}/{s_prv:.2f}  слышно: {heard[:60]}\n"
            f"{'':16s}текст: {plain(cur)[:60]}")
    log(f"{args.module}: совпало {ok} из {len(picks)}")


def main():
    sys.stdout.reconfigure(errors="replace")  # консоль Windows (cp1251) не знает часть букв в названиях LibriVox
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("rst")
    p.add_argument("--sidecar", action="store_true", help="без выравнивания: разметка Hexapla как есть")
    p.add_argument("--books", help="книги OSIS через запятую (по умолчанию все); прочие главы сохраняются")
    p = sub.add_parser("kjv")
    p.add_argument("--books", help="книги OSIS через запятую или all (по умолчанию Matt,Mark,Luke,John); "
                                   "ранее размеченные главы других книг сохраняются")
    p = sub.add_parser("verify-rst")
    p.add_argument("refs", nargs="+")
    p.add_argument("--show", action="store_true", help="показать каждый стих")
    p = sub.add_parser("wwjd")
    p.add_argument("part", choices=list(WWJD), help="nt — Новый Завет, ot — Ветхий; прочие — другие чтецы")
    p.add_argument("--books", help="книги OSIS через запятую (по умолчанию все); прочие главы сохраняются")
    p = sub.add_parser("lv", help="модуль из записей LibriVox (см. LVMODS)")
    p.add_argument("key", choices=list(LVMODS))
    p.add_argument("--projects", help="только эти проекты LibriVox (id через запятую)")
    p = sub.add_parser("check", help="выборочная проверка модуля распознаванием речи")
    p.add_argument("module")
    p.add_argument("--n", type=int, default=24)
    p.add_argument("--seed", type=int, default=1)
    p.add_argument("--text", help="id перевода для сверки (по умолчанию translation модуля)")
    sub.add_parser("catalog")
    args = ap.parse_args()
    if args.cmd == "rst":
        merge_catalog([build_rst(args)])
    elif args.cmd == "kjv":
        merge_catalog([build_kjv(args)])
    elif args.cmd == "verify-rst":
        verify_rst(args)
    elif args.cmd == "wwjd":
        build_wwjd(args)
    elif args.cmd == "lv":
        build_lv(args)
    elif args.cmd == "check":
        check_module(args)
    else:
        rebuild_catalog()


if __name__ == "__main__":
    main()
