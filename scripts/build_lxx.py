"""Модуль «Септуагинта (Свит)» (public/modules/lxx-swete.json и .gz): греческий Ветхий Завет по изданию
Г. Б. Свита (The Old Testament in Greek according to the Septuagint, Cambridge 1909–1930) с номерами Стронга,
в синодальной нумерации стихов.

Исходники (недоверенные данные — только читаем; каталог задаётся --src, по умолчанию data-src/lxx):
  swete/00-Swete_versification.csv, swete/01-Swete_word_with_punctuations.csv
      — https://github.com/eliranwong/LXX-Swete-1930 (оцифровка P. Amicarelli, E. Wong; GPL-3.0; текст Свита — PD)
  greekres/**/LxxLemmas/*.js, greekres/**/GreekWordList.js
      — https://github.com/openscriptures/GreekResources (CC BY 4.0): лемма каждого слова LXX (по тексту CCAT —
        сам текст CCAT не используется, только порядок лемм) и список лемм с номерами Стронга (слова Нового Завета)
  tvtms/tvtms.txt
      — STEPBible TVTMS (CC BY 4.0), развёрнутая часть: нумерация греческой традиции -> стандартная английская (KJV)
Нужны также собранные модули public/modules/rst-dc.json (синодальный текст с неканоническими книгами) и
rst-symphony.json (как слова Нового Завета переданы в синодальном переводе) — для проверки нумерации по содержанию,
и data-src/extra/sword-src (таблица Synodal<->KJV SWORD, через extra_lib.kjv2syn).

Как собирается:
1. Слова Свита. Служебные знаки издания (⸂⸆⸃, подстиховые номера [1], скобки лакун) убираются; заглавные первые
   слова книг (ΕΝ ΑΡΧΗ) пишутся обычно (Ἐν ἀρχῇ) по таблице CAPS.
2. Леммы. Текст Свита почти совпадает с текстом, к которому сделаны леммы; сначала стихи с той же ссылкой и тем же
   числом слов дают таблицу «форма -> лемма», затем каждая глава Свита выравнивается с потоком лемм книги
   (difflib), промежутки одинаковой длины заполняются по порядку. Итоговая лемма слова — из выравнивания, если она
   согласуется с таблицей форм, иначе самая частая лемма этой формы во всём тексте. Номер Стронга — у леммы
   в GreekWordList (только слова Нового Завета; у остальных номера нет) и по небольшой таблице STRONG_EXTRA.
3. Нумерация. Стих Свита -> синодальный стих выбирается лучевым алгоритмом Витерби по каждой книге: оценка — доля
   слов греческого стиха, чей русский перевод (по «Симфонии RST+») или имя (по транслитерации) есть в синодальном
   стихе, с весом редкости слова; надбавки — за тот же номер стиха и за стих, указанный цепочкой
   TVTMS (LXX -> KJV) -> SWORD (KJV -> синодальная); штраф — за скачок (перестановки глав в Иеремии, Притчах,
   Исходе 36–39, 3 Царств 20–21 так и находятся). Цепочка не используется для Псалтири (у Свита и в синодальной
   нумерации она одинаковая — греческая), Притч и неканонических книг (там у SWORD своя нумерация KJVA).
   Если в один синодальный стих попало несколько стихов Свита — они идут подряд; добавления LXX с буквенными
   стихами (3 Цар 2:35a–o, Иов 42:17a–e) у Свита уже входят в основной стих и остаются в нём.
4. Даниил — по Феодотиону (Сусанна — Дан 13, Вил и дракон — Дан 14); Товит — краткая редакция (BA): с ней
   синодальный текст совпадает лучше; Сирах — без пролога (в синодальной нумерации ему нет места).
   Не входят: 4 Маккавейская, Псалмы Соломона, Оды, фрагменты Еноха — их нет в синодальной нумерации.

Слово в тексте модуля: {слово|G<номер>} (без морфологии); слова без номера — обычным текстом.
Запуск: python -I -X utf8 scripts/build_lxx.py [--src <каталог исходников>] [--report <файл>]
"""
import argparse
import collections
import difflib
import json
import math
import re
import sys
import unicodedata
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from extra_lib import kjv2syn, merge_catalog, write_module  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
MOD = ROOT / "public" / "modules"
APPROVED = ROOT / "scripts" / "approved-modules.json"
MID = "lxx-swete"

# Книга Свита -> файл лемм OpenScriptures
LEMMA_FILE = {
    "Gen": "Gen", "Exo": "Exod", "Lev": "Lev", "Num": "Num", "Deu": "Deut", "Jos": "JoshB", "Jdg": "JudgB",
    "Rut": "Ruth", "1Sa": "1Sam", "2Sa": "2Sam", "1Ki": "1Kgs", "2Ki": "2Kgs", "1Ch": "1Chr", "2Ch": "2Chr",
    "1Es": "1Esd", "Ezr": "2Esd", "Neh": "2Esd", "Psa": "Ps", "Pro": "Prov", "Ecc": "Eccl", "Sol": "Song",
    "Job": "Job", "Wis": "Wis", "Sip": "Sir", "Sir": "Sir", "Est": "Esth", "Jdt": "Jdt", "Tob": "TobBA", "Tbs": "TobS",
    "Hos": "Hos", "Amo": "Amos", "Mic": "Mic", "Joe": "Joel", "Oba": "Obad", "Jon": "Jonah", "Nah": "Nah",
    "Hab": "Hab", "Zep": "Zeph", "Hag": "Hag", "Zec": "Zech", "Mal": "Mal", "Isa": "Isa", "Jer": "Jer",
    "Bar": "Bar", "Lam": "Lam", "Epj": "EpJer", "Eze": "Ezek", "Dan": "DanOG", "Dat": "DanTh", "Sus": "SusOG",
    "Sut": "SusTh", "Bel": "BelOG", "Bet": "BelTh", "1Ma": "1Macc", "2Ma": "2Macc", "3Ma": "3Macc", "4Ma": "4Macc",
    "Pss": "PsSol", "Ode": "Odes",
}
# Книга Свита -> книга приложения (синодальная); остальные книги Свита в модуль не входят
APP_BOOK = {
    "Gen": "Gen", "Exo": "Exod", "Lev": "Lev", "Num": "Num", "Deu": "Deut", "Jos": "Josh", "Jdg": "Judg",
    "Rut": "Ruth", "1Sa": "1Sam", "2Sa": "2Sam", "1Ki": "1Kgs", "2Ki": "2Kgs", "1Ch": "1Chr", "2Ch": "2Chr",
    "1Es": "1Esd", "Ezr": "Ezra", "Neh": "Neh", "Psa": "Ps", "Pro": "Prov", "Ecc": "Eccl", "Sol": "Song",
    "Job": "Job", "Wis": "Wis", "Sir": "Sir", "Est": "Esth", "Jdt": "Jdt", "Tob": "Tob", "Hos": "Hos",
    "Amo": "Amos", "Mic": "Mic", "Joe": "Joel", "Oba": "Obad", "Jon": "Jonah", "Nah": "Nah", "Hab": "Hab",
    "Zep": "Zeph", "Hag": "Hag", "Zec": "Zech", "Mal": "Mal", "Isa": "Isa", "Jer": "Jer", "Bar": "Bar",
    "Lam": "Lam", "Epj": "EpJer", "Eze": "Ezek", "Dat": "Dan", "Sut": "Dan", "Bet": "Dan", "1Ma": "1Macc",
    "2Ma": "2Macc", "3Ma": "3Macc",
}
CH_OFF = {"Sut": 12, "Bet": 13}  # Сусанна (Феодотион) = Дан 13, Вил и дракон = Дан 14
# Книга Свита -> код TVTMS; код TVTMS -> книга приложения
TVTMS_CODE = {
    "Gen": "Gen", "Exo": "Exo", "Lev": "Lev", "Num": "Num", "Deu": "Deu", "Jos": "Jos", "Jdg": "Jdg", "Rut": "Rut",
    "1Sa": "1Sa", "2Sa": "2Sa", "1Ki": "1Ki", "2Ki": "2Ki", "1Ch": "1Ch", "2Ch": "2Ch", "Ezr": "Ezr", "Neh": "Neh",
    "Ecc": "Ecc", "Sol": "Sng", "Job": "Job", "Hos": "Hos", "Amo": "Amo", "Mic": "Mic", "Joe": "Jol", "Oba": "Oba",
    "Jon": "Jon", "Nah": "Nam", "Hab": "Hab", "Zep": "Zep", "Hag": "Hag", "Zec": "Zec", "Mal": "Mal", "Isa": "Isa",
    "Jer": "Jer", "Lam": "Lam", "Eze": "Ezk",
}
TVTMS_APP = {v: APP_BOOK[k] for k, v in TVTMS_CODE.items()}

# Заглавные первые слова книг у Свита -> обычное написание
CAPS = {
    "ΕΝ": "Ἐν", "ΑΡΧΗ": "ἀρχῇ", "ΤΑΥΤΑ": "Ταῦτα", "ΚΑΙ": "Καὶ", "ΟΥΤΟΙ": "Οὗτοι", "ἌΝΘΡΩΠΟΣ": "Ἄνθρωπος",
    "ΑΝΘΡΩΠΟΣ": "Ἄνθρωπος", "ΑΔΑΜ": "Ἀδάμ", "ΛΟΓΟΙ": "Λόγοι", "ΛΟΓΟΣ": "Λόγος", "ΜΑΚΑΡΙΟΣ": "Μακάριος",
    "ΠΑΡΟΙΜΙΑΙ": "Παροιμίαι", "ΡΗΜΑΤΑ": "Ῥήματα", "ΑΣΜΑ": "ᾎσμα", "ΑΓΑΠΗΣΑΤΕ": "Ἀγαπήσατε", "ΠΑΣΑ": "Πᾶσα",
    "ΕΤΟΥΣ": "Ἔτους", "ΒΙΒΛΟΣ": "Βίβλος", "ΟΡΑΣΙΣ": "Ὅρασις", "ΛΗΜΜΑ": "Λῆμμα", "ΤΟ": "Τὸ",
    "ΑΝΤΙΓΡΑΦΟΝ": "Ἀντίγραφον", "ΕΠΙ": "Ἐπὶ", "ΤΟΙΣ": "Τοῖς", "Ο": "Ὁ", "ΔΕ": "δὲ",
}
# Леммы без номера в списке, но с тем же словом в Новом Завете (иное написание в LXX)
STRONG_EXTRA = {
    "οιδα": "G1492", "σαλωμων": "G4672", "ηλιου": "G2243", "ελισαιε": "G1666", "βαιθλεεμ": "G965",
    "σομορων": "G4540", "ιωσειας": "G2502", "σοδομων": "G4670", "νοεμαν": "G3497", "βεωρ": "G1007", "ζαρε": "G2196",
}
APOS = "᾽’'ʼ᾿"


def log(*a):
    print(*a, flush=True)


def norm(w):
    """Форма для сравнения: строчные, без знаков препинания, тяжёлое ударение -> острое."""
    w = unicodedata.normalize("NFD", w)
    w = "".join(c for c in w if unicodedata.category(c)[0] in "LM" or c in APOS)
    w = w.replace("̀", "́")
    for a in APOS:
        w = w.replace(a, "’")
    w = unicodedata.normalize("NFC", w).lower()
    return w[:-1] + "ς" if w.endswith("σ") else w


def bare(w):
    return "".join(c for c in unicodedata.normalize("NFD", w) if unicodedata.category(c)[0] == "L").lower().replace("ς", "σ")


# ---------------------------------------------------------------------------------------------
# Текст Свита
# ---------------------------------------------------------------------------------------------

MARK = re.compile(r"^\[\d+\]$")


def clean_tokens(raw):
    out = []
    for w in raw:
        if MARK.match(w):
            continue
        w = unicodedata.normalize("NFC", re.sub(r"[⸂⸃⸆\[\]()]", "", w))
        if not any(unicodedata.category(c)[0] == "L" for c in w):
            if w and out:
                out[-1] += w  # одинокий знак препинания — к предыдущему слову
            continue
        out.append(w)
    return out


def fix_caps(w, first):
    m = re.match(r"^(\W*)(\w+)(.*)$", w)
    if not m or m.group(2) not in CAPS:
        return w
    core = CAPS[m.group(2)]
    if not first:
        core = core[0].lower() + core[1:] if core not in ("Ὁ",) else core
    return m.group(1) + core + m.group(3)


def load_swete(src):
    sw = src / "swete"
    words = [l.rstrip("\n").split("\t", 1)[1] for l in open(sw / "01-Swete_word_with_punctuations.csv", encoding="utf-8")]
    vs = [l.rstrip("\n").split("\t") for l in open(sw / "00-Swete_versification.csv", encoding="utf-8")]
    verses = []
    for i, (n, r) in enumerate(vs):
        a = int(n) - 1
        b = int(vs[i + 1][0]) - 1 if i + 1 < len(vs) else len(words)
        m = re.match(r"^(\w+)\.(\d+):(\d+)$", r)
        bk, c, v = m.group(1), int(m.group(2)), int(m.group(3))
        if bk not in LEMMA_FILE:
            continue
        ws = clean_tokens(words[a:b])
        if c == 1 and v == 1:
            ws = [fix_caps(w, i == 0 or (i == 1 and ws[0] == "Ο")) for i, w in enumerate(ws)]
        verses.append((bk, c, v, ws))
    return verses


# ---------------------------------------------------------------------------------------------
# Леммы и номера Стронга
# ---------------------------------------------------------------------------------------------

def find(src, pattern):
    hits = sorted(src.glob(pattern))
    if not hits:
        raise SystemExit(f"не найдено: {src}/{pattern}")
    return hits[0]


def load_lemmas(path):
    d = json.loads(path.read_text(encoding="utf-8-sig"))
    verses = collections.OrderedDict()
    for k, arr in d.items():
        p = k.split(".")
        m = re.match(r"\d+", p[2]) if len(p) > 2 else None
        verses.setdefault((p[1], m.group(0) if m else p[2]), []).extend(x["key"] for x in arr)
    return verses


def lemma_stream(L, bk):
    items = list(L.items())
    if bk == "Ezr":
        items = [x for x in items if x[0][0].isdigit() and int(x[0][0]) <= 10]
    elif bk == "Neh":
        items = [x for x in items if x[0][0].isdigit() and int(x[0][0]) > 10]
    elif bk == "Sip":
        items = [x for x in items if x[0][0] == "Prolog"]
    elif bk == "Sir":
        items = [x for x in items if x[0][0] != "Prolog"]
    return items


def compatible(form, key):
    """Правдоподобно ли, что форма — от этой леммы (первые буквы, с учётом приращения глагола)."""
    f, k = bare(form), bare(key.split(".")[0])
    if not f or not k:
        return False
    return f[:2] == k[:2] or f[1:3] == k[:2] or f[2:4] == k[:2] or f[:1] == k[:1]


def lemmatize(verses, src):
    lem_dir = find(src, "greekres/**/LxxLemmas").resolve()
    files = {name: load_lemmas(lem_dir / f"{name}.js") for name in set(LEMMA_FILE.values())}
    gwl_text = find(src, "greekres/**/GreekWordList.js").read_text(encoding="utf-8-sig")
    gwl = json.loads(gwl_text[gwl_text.index("{"):gwl_text.rindex("}") + 1])
    by_book = collections.OrderedDict()
    for bk, c, v, ws in verses:
        by_book.setdefault(bk, []).append((c, v, ws))
    # Проход 1: стихи с той же ссылкой и тем же числом слов
    table = collections.defaultdict(collections.Counter)
    for bk, vv in by_book.items():
        L = files[LEMMA_FILE[bk]]
        off = 10 if bk == "Neh" else 0  # 2 Ездры: Неемия — главы 11–23
        for c, v, ws in vv:
            ks = L.get(("Prolog", str(v))) if bk == "Sip" else L.get((str(c + off), str(v)))
            if not ks or len(ks) != len(ws):
                continue
            if sum(1 for w, k in zip(ws, ks) if bare(w)[:1] == bare(k)[:1]) < 0.5 * len(ws):
                continue
            for w, k in zip(ws, ks):
                table[norm(w)][k] += 1

    def predict(w):
        n = norm(w)
        if n in table:
            return table[n].most_common(1)[0][0]
        b = bare(w)
        return b if b in gwl else None

    assigned = {}
    for _ in range(2):
        assigned = {}
        for bk, vv in by_book.items():
            lk = [k for _, ks in lemma_stream(files[LEMMA_FILE[bk]], bk) for k in ks]
            chaps = collections.OrderedDict()
            for idx, (c, v, ws) in enumerate(vv):
                chaps.setdefault(c, []).append((idx, ws))
            p = 0
            for c, lst in chaps.items():
                flat = [(idx, wi, w) for idx, ws in lst for wi, w in enumerate(ws)]
                pk = [predict(w) or ("?" + norm(w)) for _, _, w in flat]
                w0 = max(0, p - 50)
                arr = lk[w0:min(len(lk), p + int(len(flat) * 1.6) + 300)]
                blocks = difflib.SequenceMatcher(None, pk, arr, autojunk=False).get_matching_blocks()
                if sum(bl.size for bl in blocks) < 0.3 * len(flat):  # глава не нашлась рядом — ищем по всей книге
                    w0, arr = 0, lk
                    blocks = difflib.SequenceMatcher(None, pk, arr, autojunk=False).get_matching_blocks()
                li = lj = 0
                last = None
                for bl in blocks:
                    gi, gj = bl.a - li, bl.b - lj
                    if gi == gj and 0 < gi <= 8:
                        for q in range(gi):
                            idx, wi, w = flat[li + q]
                            assigned[(bk, idx, wi)] = arr[lj + q]
                    for q in range(bl.size):
                        idx, wi, w = flat[bl.a + q]
                        assigned[(bk, idx, wi)] = arr[bl.b + q]
                    li, lj = bl.a + bl.size, bl.b + bl.size
                    if bl.size:
                        last = bl.b + bl.size
                if last is not None:
                    p = w0 + last
        new = collections.defaultdict(collections.Counter)
        for (bk, idx, wi), k in assigned.items():
            new[norm(by_book[bk][idx][2][wi])][k] += 1
        for f, cn in table.items():
            new.setdefault(f, cn)
        table = new

    def strong(k):
        if k in STRONG_EXTRA:
            return STRONG_EXTRA[k]
        seen = set()
        while k and k not in seen:
            seen.add(k)
            e = gwl.get(k)
            if not e:
                return None
            s = e.get("strong")
            if s:
                return f"G{int(s)}" if s.isdigit() else None  # «32a» и т. п. — не номера Стронга
            k = e.get("v")
        return None

    out = {}
    for bk, vv in by_book.items():
        for idx, (c, v, ws) in enumerate(vv):
            row = []
            for wi, w in enumerate(ws):
                cn = table.get(norm(w))
                k = assigned.get((bk, idx, wi))
                maj = cn.most_common(1)[0][0] if cn else None
                tot = sum(cn.values()) if cn else 0
                if k and k != maj and cn and cn[k] < max(2, 0.2 * tot):
                    k = maj  # выравнивание дало лемму разночтения — берём обычную лемму этой формы
                if k and not compatible(w, k) and tot < 3:
                    k = None
                if not k:
                    k = maj if maj and compatible(w, maj) else (bare(w) if bare(w) in gwl else None)
                row.append((w, k, strong(k) if k else None))
            out[(bk, c, v)] = row
    return out


# ---------------------------------------------------------------------------------------------
# Сходство греческого и синодального стиха
# ---------------------------------------------------------------------------------------------

SAME = [["G1510", "G2258", "G2071", "G2070", "G2075", "G2076", "G2468", "G5600", "G1488", "G1526", "G2277"],
        ["G3004", "G2036", "G2046", "G4483"], ["G3708", "G1492", "G3700"], ["G2068", "G5315"], ["G5143", "G1408"]]
ALIASES = {n: g for g in SAME for n in g}
TR = {"α": "а", "β": "в", "γ": "г", "δ": "д", "ε": "е", "ζ": "з", "η": "и", "θ": "ф", "ι": "и", "κ": "к", "λ": "л",
      "μ": "м", "ν": "н", "ξ": "кс", "ο": "о", "π": "п", "ρ": "р", "σ": "с", "τ": "т", "υ": "и", "φ": "ф",
      "χ": "х", "ψ": "пс", "ω": "о"}
RU_WORD = re.compile(r"[а-яёА-ЯЁ]+")


def translit(w):
    b = bare(w)
    for a, r in (("ου", "у"), ("ευ", "ев"), ("αυ", "ав"), ("αι", "е"), ("ει", "и"), ("οι", "и"), ("γγ", "нг"),
                 ("γκ", "нк"), ("γχ", "нх")):
        b = b.replace(a, r)
    return "".join(TR.get(c, c if c in "уевнгкх" else "") for c in b)


def stem(w):
    w = w.lower().replace("ё", "е")
    return w[:5] if len(w) > 3 else w


class Similarity:
    def __init__(self, sym, stop):
        self.sym = sym
        self.stop = stop
        self.cache = {}

    def renderings(self, s):
        if s not in self.cache:
            out = set()
            for n in ALIASES.get(s, [s]):
                for r, _ in (self.sym.get(n) or {}).get("renderings", [])[:10]:
                    out.add(stem(r.strip(",.;:")))
            self.cache[s] = out
        return self.cache[s]

    def greek(self, row):
        feats = []
        for w, _, s in row:
            if s in self.stop:
                continue
            r = self.renderings(s) if s else None
            if r:
                feats.append(r)
            elif w[:1].isupper() or s is None:
                t = translit(w)
                if len(t) >= 3:
                    feats.append({"@" + t[:3]})
        return feats

    @staticmethod
    def russian(text):
        ws = RU_WORD.findall(text or "")
        return {stem(w) for w in ws} | {"@" + w[:3].lower().replace("ё", "е") for w in ws if w[:1].isupper() and len(w) >= 3}

    def score(self, row, text):
        f = self.greek(row)
        st = self.russian(text)
        return sum(1 for alt in f if alt & st) / len(f) if f else 0.0


# ---------------------------------------------------------------------------------------------
# Нумерация: TVTMS + SWORD
# ---------------------------------------------------------------------------------------------

def load_tvtms(path):
    L = path.read_text(encoding="utf-8").split("\n")
    s = next(i for i, l in enumerate(L) if l.startswith("#DataStart(Expanded)"))
    e = next(i for i, l in enumerate(L) if l.startswith("#DataEnd(Expanded)"))
    rows = collections.defaultdict(list)
    for l in L[s + 1:e]:
        r = l.split("\t")
        if len(r) >= 4 and re.match(r"^[0-9A-Za-z]{3}\.\d+:\d+$", r[1].strip()):
            rows[r[1].strip()].append((r[2].strip(), r[8].strip() if len(r) > 8 else ""))
    return rows


class TvtmsTests:
    """Тесты TVTMS (=Exist, =NotExist, =Last, сравнение числа слов) на тексте Свита. Подстихов у Свита нет."""
    REF = re.compile(r"^([0-9A-Za-z]{3})\.(\d+):(\d+)(?:\.(\d+))?$")

    def __init__(self, counts):
        self.w = counts
        self.last = {}
        for (b, c, v), n in counts.items():
            if n:
                self.last[(b, c)] = max(self.last.get((b, c), 0), v)

    def words(self, ref):
        m = self.REF.match(ref)
        if not m:
            return None
        return 0 if m.group(4) and m.group(4) != "0" else self.w.get((m.group(1), int(m.group(2)), int(m.group(3))), 0)

    def ok(self, t):
        t = t.strip()
        if not t:
            return True
        m = re.match(r"^(\S+?)=(Exist|NotExist|Last)$", t)
        if m:
            ref, op = m.groups()
            if "TextBeforeV1" in ref or re.match(r"^\w{3}\.[A-Z]:", ref):
                return op == "NotExist"
            mm = self.REF.match(ref)
            if not mm:
                return False
            b, c, v, sub = mm.group(1), int(mm.group(2)), int(mm.group(3)), mm.group(4)
            if sub and sub != "0":
                return op == "NotExist"
            ex = self.w.get((b, c, v), 0) > 0
            return ex if op == "Exist" else (not ex) if op == "NotExist" else ex and self.last.get((b, c)) == v
        m = re.match(r"^(\S+?)(\*2)?([<>])(\S+?)(\*2)?$", t)
        if m:
            a, ma, op, b, mb = m.groups()
            x, y = self.words(a), self.words(b)
            if x is None or y is None:
                return False
            x, y = x * (2 if ma else 1), y * (2 if mb else 1)
            return x < y if op == "<" else x > y
        return False


def parse_std(std, src):
    """«Gen.5:32; 6:1», «Gen.2:25-3:1», «Psa.3:Title» -> (код, глава, стих): исходный стих, если он в диапазоне, иначе первый."""
    std = std.split("[")[0].strip()
    m = re.match(r"^([0-9A-Za-z]{3})\.(\d+):(\d+|Title)", std)
    if not m:
        return None
    b, cur = m.group(1), int(m.group(2))
    refs = []
    for part in re.split(r";\s*", std[len(b) + 1:]):
        mm = re.match(r"^(?:(\d+):)?(\d+|Title)(?:!\w)?(?:\s*-\s*(?:(\d+):)?(\d+))?", part.strip())
        if not mm:
            continue
        if mm.group(1):
            cur = int(mm.group(1))
        refs.append((cur, 0 if mm.group(2) == "Title" else int(mm.group(2))))
        if mm.group(4):
            refs.append((int(mm.group(3)) if mm.group(3) else cur, int(mm.group(4))))
    if not refs:
        return None
    if b == src[0] and len(refs) >= 2 and refs[0] <= (src[1], src[2]) <= refs[-1]:
        return src
    return (b,) + refs[0]


def chain_map(rows, words):
    """Стих Свита -> синодальный стих по TVTMS и SWORD — только там, где строка TVTMS нашлась."""
    tests = TvtmsTests({(TVTMS_CODE[b], c, v): n for (b, c, v), n in words.items() if b in TVTMS_CODE})
    out = {}
    for (b, c, v), n in words.items():
        code = TVTMS_CODE.get(b)
        if not code or not n:
            continue
        for std, tst in rows.get(f"{code}.{c}:{v}", []):
            if all(tests.ok(x) for x in tst.split("&")):
                r = parse_std(std, (code, c, v))
                if r and r[0] in TVTMS_APP:
                    out[(b, c, v)] = kjv2syn(TVTMS_APP[r[0]], r[1], r[2])
                break
    return out


# ---------------------------------------------------------------------------------------------
# Выравнивание стихов книги (лучевой Витерби)
# ---------------------------------------------------------------------------------------------

NO_CHAIN = {"Psa", "Pro"}
BEAM, TOP = 40, 12
ID_BONUS, CHAIN_BONUS = 0.15, 0.25
JUMP_NEAR, JUMP_FAR, MERGE = 0.7, 0.8, 0.3


def align_book(bk, order, lem, syn_chapters, simf, chain):
    sb, off = APP_BOOK[bk], CH_OFF.get(bk, 0)
    tgt = [(c + 1, v + 1) for c, ch in enumerate(syn_chapters) for v in range(len(ch))]
    if bk in CH_OFF:
        tgt = [t for t in tgt if t[0] == off + 1]
    elif bk == "Dat":
        tgt = [t for t in tgt if t[0] <= 12]  # Дан 13–14 — Сусанна и Вил (отдельные книги у Свита)
    tix = {t: i for i, t in enumerate(tgt)}
    inv = collections.defaultdict(list)
    for i, (c, v) in enumerate(tgt):
        for a in simf.russian(syn_chapters[c - 1][v - 1]):
            inv[a].append(i)
    src = [k for k in order if k[0] == bk and lem.get(k)]
    beam, hist, cts = {}, [], []
    for _, c, v in src:
        f = simf.greek(lem[(bk, c, v)])
        sc = collections.Counter()
        wsum = 0.0
        for alt in f:
            hit = set()
            for a in alt:
                hit.update(inv.get(a, ()))
            w = max(math.log((len(tgt) + 1) / (len(hit) + 1)), 0.1)  # вес редкости
            wsum += w
            if len(hit) < 0.2 * len(tgt) + 30:
                for i in hit:
                    sc[i] += w
        denom = max(wsum, 5 * wsum / len(f)) if f else 1.0  # короткий стих — меньше уверенности
        em = {i: x / denom for i, x in sc.items()}
        idt = tix.get((c + off, v))
        ct = None
        if bk not in NO_CHAIN:
            x = chain.get((bk, c, v))
            if x and x[0] == sb:
                ct = tix.get((x[1], x[2]))
        pct = cts[-1] if cts else None
        cts.append(ct)
        cands = {i for i, _ in sc.most_common(TOP)} | {t for t in (idt, ct) if t is not None}
        for t in beam:
            cands.update(x for x in (t, t + 1, t + 2) if x < len(tgt))
        new = {}
        for t in cands:
            e = em.get(t, 0.0) + (ID_BONUS if t == idt else 0.0) + (CHAIN_BONUS if t == ct else 0.0)
            if not beam:
                new[t] = (e, None)
                continue
            best = None
            for p, (ps, _) in beam.items():
                dl = t - p
                if ct is not None and t == ct and p == pct:
                    tr = 0.0
                elif dl == 1:
                    tr = 0.0
                elif dl == 0:
                    tr = -MERGE
                elif 2 <= dl <= 4:
                    tr = -0.15 * (dl - 1)
                else:
                    tr = -JUMP_NEAR if abs(dl) <= 60 else -JUMP_FAR
                if best is None or ps + tr + e > best[0]:
                    best = (ps + tr + e, p)
            new[t] = best
        beam = dict(sorted(new.items(), key=lambda x: -x[1][0])[:BEAM])
        hist.append(beam)
    mapping = {}
    if not src:
        return mapping
    t = max(beam, key=lambda x: beam[x][0])
    for i in range(len(src) - 1, -1, -1):
        mapping[(src[i][1], src[i][2])] = tgt[t]
        t = hist[i][t][1]
    return mapping


# ---------------------------------------------------------------------------------------------
# Сборка
# ---------------------------------------------------------------------------------------------

def split_punct(w):
    """«(γῆν.» -> «(», «γῆν», «.»; знак элизии (μετ᾽) остаётся в слове."""
    is_l = [unicodedata.category(ch)[0] in "LM" for ch in w]
    a = is_l.index(True)
    b = len(w) - is_l[::-1].index(True)
    while b < len(w) and w[b] in APOS:
        b += 1
    return w[:a], w[a:b], w[b:]


def markup(row):
    out = []
    for w, _, s in row:
        lead, core, trail = split_punct(w)
        out.append(f"{lead}{{{core}|{s}}}{trail}" if s else w)
    return " ".join(out)


def runs(mapping, off=0):
    """Отображение стихов -> сжатые участки «гл:ст-ст→гл:ст-ст» (только нетождественные)."""
    out, cur = [], None
    for k in sorted(mapping):
        t = mapping[k]
        if cur and k[0] == cur[1][0] and t[0] == cur[3][0] and t[1] - cur[3][1] == k[1] - cur[1][1] and k[1] - cur[1][1] <= 2:
            cur[1], cur[3] = k, t
        else:
            if cur:
                out.append(cur)
            cur = [k, k, t, t]
    if cur:
        out.append(cur)
    return [f"{s[0]}:{s[1]}-{e[1]}→{ts[0]}:{ts[1]}-{te[1]}" for s, e, ts, te in out if not ((s[0] + off, s[1]) == ts and (e[0] + off, e[1]) == te)]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", default=str(ROOT / "data-src" / "lxx"))
    ap.add_argument("--report", default=None)
    args = ap.parse_args()
    src = Path(args.src)
    report = []

    def rep(*a):
        line = " ".join(str(x) for x in a)
        report.append(line)
        log(line)

    verses = load_swete(src)
    order = [(b, c, v) for b, c, v, _ in verses]
    log(f"Свит: {len(verses)} стихов, {sum(len(w) for *_, w in verses)} слов")
    lem = lemmatize(verses, src)
    log("леммы готовы")

    rst = json.loads((MOD / "rst-dc.json").read_text(encoding="utf-8"))
    syn = {b["id"]: b for b in rst["books"]}
    sym = json.loads((MOD / "rst-symphony.json").read_text(encoding="utf-8"))["entries"]
    freq = collections.Counter(s for row in lem.values() for _, _, s in row if s)
    simf = Similarity(sym, {s for s, _ in freq.most_common(25)})
    chain = chain_map(load_tvtms(find(src, "tvtms/*.txt")), {k: len(v) for k, v in lem.items()})
    log(f"TVTMS: {len(chain)} стихов с найденной строкой")

    per_book = collections.OrderedDict()
    for bk in APP_BOOK:
        per_book.setdefault(APP_BOOK[bk], []).append(bk)
    books = []
    rep("Нумерация (стихи Свита → синодальные; показаны только нетождественные участки):")
    for app_id in [b["id"] for b in rst["books"]]:
        if app_id not in per_book:
            continue
        sb = syn[app_id]
        chs = [[[] for _ in ch] for ch in sb["chapters"]]
        for bk in per_book[app_id]:
            mp = align_book(bk, order, lem, sb["chapters"], simf, chain)
            for key in [k for k in order if k[0] == bk and lem.get(k)]:
                tc, tv = mp[(key[1], key[2])]
                chs[tc - 1][tv - 1].append(key)
            r = runs(mp, CH_OFF.get(bk, 0))
            if r:
                rep(f"  {bk}→{app_id}: " + "; ".join(r))
        chapters = [[" ".join(markup(lem[k]) for k in cell) for cell in ch] for ch in chs]
        books.append({"id": app_id, "name": sb["name"], "short": sb["short"], "chapters": chapters})

    module = {
        "format": "aob-module", "formatVersion": 1, "type": "bible", "versification": "synodal", "id": MID,
        "name": "LXX",
        "title": "Септуагинта (греческий Ветхий Завет), издание Свита",
        "language": "grc",
        "description": (
            "Греческий Ветхий Завет (перевод семидесяти толковников) по изданию Г. Б. Свита «The Old Testament in Greek "
            "according to the Septuagint» (Кембридж, 1909–1930) с номерами Стронга. Свит печатает Ватиканский кодекс (B), "
            "а где его нет — Александрийский (A) или Синайский: так, начало Бытия (до 46:28) у Свита — по Александрийскому "
            "кодексу. Даниил — в переводе Феодотиона (Сусанна — Дан 13, Вил и дракон — Дан 14), Товит — краткая редакция; "
            "4 Маккавейской, Псалмов Соломона и Од нет. Нумерация переведена в синодальную (таблица STEPBible TVTMS и SWORD, "
            "сверка по содержанию стихов); добавления Септуагинты с буквенными стихами (3 Цар 2:35a и т. п.) — в своём "
            "основном стихе. Номера Стронга — по леммам Open Scriptures; у слов, которых нет в Новом Завете, номера нет."),
        "version": "Swete 1909–1930; eliranwong/LXX-Swete-1930 (git)",
        "author": ("Henry Barclay Swete (издание); оцифровка — Pasquale Amicarelli, Eliran Wong; леммы — Open Scriptures "
                   "Septuagint Project; таблица нумерации — STEPBible (Tyndale House)"),
        "source": ("https://github.com/eliranwong/LXX-Swete-1930; https://github.com/openscriptures/GreekResources; "
                   "https://github.com/STEPBible/STEPBible-Data"),
        "license": ("Оцифровка текста — GPL-3.0 (P. Amicarelli, E. Wong); текст издания Свита — Public Domain; леммы — "
                    "CC BY 4.0 (Open Scriptures); таблица нумерации TVTMS — CC BY 4.0 (STEPBible.org)"),
        "features": {"strongs": True, "morphology": False, "headings": False},
        "books": books,
    }
    entry = write_module(module)
    merge_catalog([entry], in_place=True)
    approved = json.loads(APPROVED.read_text(encoding="utf-8"))
    if MID not in approved["ids"]:
        approved["ids"].append(MID)
        APPROVED.write_text(json.dumps(approved, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")

    # Отчёт: доля слов с номером Стронга по книгам
    rep("Слова с номером Стронга (по книгам модуля):")
    tot = [0, 0]
    for app_id in [b["id"] for b in books]:
        n = s = 0
        for bk in per_book[app_id]:
            for k in order:
                if k[0] == bk:
                    n += len(lem.get(k) or [])
                    s += sum(1 for _, _, x in lem.get(k) or [] if x)
        tot[0] += n
        tot[1] += s
        rep(f"  {app_id}: {s}/{n} = {s / max(1, n):.1%}")
    rep(f"  всего: {tot[1]}/{tot[0]} = {tot[1] / max(1, tot[0]):.1%}")
    empty = sum(1 for b in books for ch in b["chapters"] for v in ch if not v)
    rep(f"Синодальных стихов без греческого текста: {empty}")
    if args.report:
        Path(args.report).write_text("\n".join(report) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
