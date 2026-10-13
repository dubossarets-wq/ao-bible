"""Переводы Библии для build_extra.py: CrossWire SWORD (OSIS), Open Scriptures Hebrew Bible, Byzantine Textform.

Каждый перевод приводится к синодальной нумерации стихов (см. extra_lib.Synodal) и проверяется сравнением
числа стихов в главах с синодальной схемой SWORD.
"""
import csv
import re
import unicodedata
import xml.etree.ElementTree as ET
from collections import defaultdict

from extra_lib import (BOOK_BY_ID, BOOKS, BOOK_ORDER, SRC, fix_punct, iter_sword_verses, kjv2syn, log,
                       synodal)

TAG = re.compile(r"<(/?)([\w:]+)((?:\s+[\w:.\-]+\s*=\s*(?:\"[^\"]*\"|'[^']*'))*)\s*(/?)>")
ATTR = re.compile(r"([\w:.\-]+)\s*=\s*(?:\"([^\"]*)\"|'([^']*)')")


def _attrs(s):
    return {m.group(1): m.group(2) if m.group(2) is not None else m.group(3) for m in ATTR.finditer(s)}


def strong_nums(lemma):
    """«strong:H07225 lemma.BSBlex:…» -> ['H7225']; буквенные суффиксы (H1254a) отбрасываем."""
    out = []
    for m in re.finditer(r"strong:([HG])0*(\d+)", lemma or ""):
        s = m.group(1) + m.group(2)
        if s not in out and s not in ("H0", "G0"):
            out.append(s)
    return out


def osis_to_aob(raw, strongs=True):
    """Стих OSIS (как в модулях CrossWire) -> (текст с разметкой aob, [заголовки], надписание псалма)."""
    stack = [{"tag": "#", "buf": [], "mode": "text"}]
    headings, psalm_title = [], []
    pos = 0

    def emit(s):
        top = stack[-1]
        if any(f["mode"] == "skip" for f in stack):
            return
        top["buf"].append(s)

    for m in TAG.finditer(raw):
        emit(raw[pos:m.start()])
        pos = m.end()
        close, tag, attrs, selfclose = m.group(1), m.group(2), _attrs(m.group(3)), m.group(4)
        if selfclose and not close:
            if tag in ("lb", "l", "lg", "milestone", "div", "p") or tag == "chapter":
                emit(" ")
            continue
        if not close:
            mode = "text"
            if tag in ("note", "rdg"):
                mode = "skip"
            elif tag == "title":
                mode = "skip" if attrs.get("type") == "parallel" else "title"
            elif tag == "w":
                mode = "w"
            elif tag == "transChange" and attrs.get("type") == "added":
                mode = "added"
            stack.append({"tag": tag, "buf": [], "mode": mode, "attrs": attrs})
            continue
        # закрывающий тег: ищем ближайший открытый с тем же именем
        idx = next((i for i in range(len(stack) - 1, 0, -1) if stack[i]["tag"] == tag), None)
        if idx is None:
            continue
        while len(stack) > idx:
            fr = stack.pop()
            text = "".join(fr["buf"])
            if fr["mode"] == "skip":
                continue
            if fr["mode"] == "title":
                t = re.sub(r"\s+", " ", re.sub(r"\{([^|}]*)\|[^}]*\}", r"\1", text)).replace("‹", "").replace("›", "").strip()
                if fr["attrs"].get("canonical") == "true" and fr["attrs"].get("type") == "psalm":
                    psalm_title.append(text.strip())
                elif t:
                    headings.append(t)
                continue
            if fr["mode"] == "w":
                nums = strong_nums(fr["attrs"].get("lemma")) if strongs else []
                inner = any(f["mode"] == "w" for f in stack)
                clean = text.replace("{", "").replace("}", "").replace("|", "")
                if nums and clean.strip() and not inner:
                    morph = [x.split(":", 1)[1] for x in (fr["attrs"].get("morph") or "").split() if ":" in x]
                    tok = "{" + clean + "|" + " ".join(nums) + ("|" + " ".join(morph) if morph else "") + "}"
                    stack[-1]["buf"].append(tok)
                else:
                    stack[-1]["buf"].append(clean)
                continue
            if fr["mode"] == "added":
                if text.strip():
                    stack[-1]["buf"].append("‹" + text + "›")
                continue
            if fr["tag"] == "q" and fr["attrs"].get("marker"):
                text = fr["attrs"]["marker"] + text + fr["attrs"]["marker"]
            stack[-1]["buf"].append(text)
    emit(raw[pos:])
    while len(stack) > 1:  # незакрытые элементы (начались в этом стихе, закончатся в следующем)
        fr = stack.pop()
        if fr["mode"] not in ("skip", "title"):
            stack[-1]["buf"].append("".join(fr["buf"]))
    text = clean_verse("".join(stack[0]["buf"]))
    return text, headings, clean_verse(" ".join(psalm_title))


def clean_verse(s):
    s = s.replace("¶", " ")  # знак абзаца в KJV и Byzantine — не часть текста
    s = re.sub(r"\s+", " ", s).strip()
    s = s.replace("‹ ", " ‹").replace(" ›", "› ")
    s = re.sub(r"\s+", " ", s).strip()
    s = fix_punct(s)
    s = re.sub(r"\s+([,.;:!?])", r"\1", s)
    return s


class Collector:
    """Собирает стихи в синодальной нумерации: verses[book][(c, v)] -> [части]."""

    def __init__(self):
        self.verses = defaultdict(lambda: defaultdict(list))
        self.headings = defaultdict(dict)

    def add(self, book, c, v, text):
        if text:
            self.verses[book][(c, v)].append(text)

    def heading(self, book, c, v, text):
        if text:
            key = f"{c}:{v}"
            h = self.headings[book]
            h[key] = (h[key] + " · " + text) if key in h and text not in h[key] else text

    def books(self, skip=()):
        out = []
        for meta in BOOKS:
            bid = meta["id"]
            if bid not in self.verses or bid in skip:
                continue
            vs = self.verses[bid]
            nch = max(c for c, _ in vs)
            chapters = []
            for c in range(1, nch + 1):
                mx = max([v for cc, v in vs if cc == c] or [0])
                chapters.append([" ".join(vs.get((c, v), [])) for v in range(1, mx + 1)])
            b = {"id": bid, "name": meta["name"], "short": meta["short"], "chapters": chapters}
            if self.headings.get(bid):
                b["headings"] = dict(sorted(self.headings[bid].items(), key=lambda kv: tuple(map(int, kv[0].split(":")))))
            out.append(b)
        return out


def validate(books, label):
    """Сравнение числа стихов в главах с синодальной схемой SWORD. Возвращает число расхождений."""
    syn = synodal()
    diffs = []
    for b in books:
        vm = syn.verses.get(b["id"])
        if not vm:
            continue
        for ci, ch in enumerate(b["chapters"]):
            n = len(ch)
            expect = vm[ci] if ci < len(vm) else 0
            empty = [i + 1 for i, v in enumerate(ch) if not v]
            if n != expect or empty:
                diffs.append(f"{b['id']}.{ci + 1}: {n}/{expect}" + (f" пусто {empty[:6]}" if empty else ""))
    log(f"  [{label}] расхождений с синодальной схемой: {len(diffs)}" + (": " + "; ".join(diffs[:25]) if diffs else ""))
    return diffs


# ---------------------------------------------------------------------------------------------
# CrossWire OSIS
# ---------------------------------------------------------------------------------------------

def sword_bible(name, versification, mapper=None, strongs=True, fix=None, book_filter=None):
    """mapper(book, c, v) -> (book, c, v) в синодальной нумерации; None — нумерация уже синодальная."""
    col = Collector()
    for book, c, v, raw, _ in iter_sword_verses(name, versification):
        if book_filter and not book_filter(book):
            continue
        if fix:
            raw = fix(raw)
        text, heads, ptitle = osis_to_aob(raw, strongs)
        if v == 0:
            # заголовок главы — перед первым стихом (в Псалтири KJV — перед надписанием)
            sb, sc, sv = mapper(book, c, 0 if book == "Ps" else 1) if mapper else (book, c, 1)
            for h in heads:
                col.heading(sb, sc, sv, h)
            if text and book == "Ps":       # надписание псалма, записанное в стих 0
                ptitle = text
            if not ptitle:
                continue
            sb, sc, sv = mapper(book, c, 0) if mapper else (book, c, 1)
            col.add(sb, sc, sv, ptitle)
            continue
        if ptitle:
            tb, tc, tv = mapper(book, c, 0) if (mapper and book == "Ps" and v == 1) else (book, c, v)
            col.add(tb, tc, tv, ptitle)
        sb, sc, sv = mapper(book, c, v) if mapper else (book, c, v)
        for h in heads:
            col.heading(sb, sc, sv, h)
        col.add(sb, sc, sv, text)
    return col


# ---------------------------------------------------------------------------------------------
# Open Scriptures Hebrew Bible (morphhb, OSIS XML, нумерация масоретская)
# ---------------------------------------------------------------------------------------------

def _ps_heb_to_syn(c, v):
    """Псалтирь: еврейская нумерация -> синодальная. Номера стихов (с надписаниями) в синодальном
    переводе совпадают с еврейскими, меняется только нумерация псалмов (по LXX)."""
    if c <= 8 or c >= 148:
        return c, v
    if c == 9:
        return 9, v
    if c == 10:
        return 9, v + 21
    if c == 90:   # синодальный 89:1 — надписание, 89:2–5 = евр. 90:1б–4, 89:6 = евр. 90:5–6
        return 89, 1 if v == 1 else v + 1 if v <= 4 else 6 if v <= 6 else v
    if c <= 113:
        return c - 1, v
    if c == 114:
        return 113, v
    if c == 115:
        return 113, v + 8
    if c == 116:
        return (114, v) if v <= 9 else (115, v - 9)
    if c == 142:  # синодальный 141:1 = еврейские 142:1–2 (надписание + первый стих)
        return 141, max(1, v - 1)
    if c <= 146:
        return c - 1, v
    if c == 147:
        return (146, v) if v <= 11 else (147, v - 11)
    return c, v


def oshb_mapper():
    vm = ET.parse(SRC / "morphhb" / "repo" / "wlc" / "VerseMap.xml").getroot()
    ns = "{http://www.APTBibleTools.com/namespace}"
    wlc2kjv = {}
    for el in vm.iter(ns + "verse"):
        wlc2kjv[el.get("wlc")] = el.get("kjv")

    def mapper(book, c, v):
        if book == "Ps":
            sc, sv = _ps_heb_to_syn(c, v)
            return book, sc, sv
        k = wlc2kjv.get(f"{book}.{c}.{v}")
        if k:
            kb, kc, kv = k.split(".")
            # «Num.25.18!b» — частичное соответствие (стих начинается в середине); берём сам стих
            book, c, v = kb, int(kc), int(re.match(r"\d+", kv).group())
        return kjv2syn(book, c, v)

    return mapper


def oshb():
    ns = "{http://www.bibletechnologies.net/2003/OSIS/namespace}"
    mapper = oshb_mapper()
    col = Collector()
    for meta in BOOKS:
        f = SRC / "morphhb" / "repo" / "wlc" / f"{meta['id']}.xml"
        if not f.exists():
            continue
        root = ET.parse(f).getroot()
        for vel in root.iter(ns + "verse"):
            _, c, v = vel.get("osisID").split(".")
            parts = []
            for el in vel:
                tag = el.tag.replace(ns, "")
                if tag == "w":
                    word = "".join(el.itertext()).replace("/", "")
                    nums = []
                    for x in re.findall(r"\d+", el.get("lemma") or ""):
                        if "H" + x not in nums:
                            nums.append("H" + str(int(x)))
                    morph = el.get("morph") or ""
                    parts.append(("w", "{" + word + "|" + " ".join(nums) + ("|" + morph if morph else "") + "}" if nums else word))
                elif tag == "seg":
                    t = el.get("type")
                    if t == "x-maqqef":
                        parts.append(("join", "־"))
                    elif t == "x-sof-pasuq":
                        parts.append(("join", "׃"))
                    elif t == "x-paseq":
                        parts.append(("w", "׀"))
                    # x-pe / x-samekh — знаки открытого/закрытого раздела; пропускаем
            out = ""
            for kind, s in parts:
                if kind == "join":
                    out += s
                elif out and not out.endswith("־"):
                    out += " " + s
                else:
                    out += s
            sb, sc, sv = mapper(meta["id"], int(c), int(v))
            col.add(sb, sc, sv, out.strip())
    return col


# ---------------------------------------------------------------------------------------------
# Byzantine Textform (Robinson–Pierpont 2018): текст с ударениями из ccat + номера Стронга и
# морфология Робинсона из strongs/with-parsing; слова сопоставляются по порядку без диакритики.
# ---------------------------------------------------------------------------------------------

BYZ_FILES = {"Matt": "MAT", "Mark": "MAR", "Luke": "LUK", "John": "JOH", "Acts": "ACT", "Jas": "JAM", "1Pet": "1PE",
             "2Pet": "2PE", "1John": "1JO", "2John": "2JO", "3John": "3JO", "Jude": "JUD", "Rom": "ROM",
             "1Cor": "1CO", "2Cor": "2CO", "Gal": "GAL", "Eph": "EPH", "Phil": "PHP", "Col": "COL",
             "1Thess": "1TH", "2Thess": "2TH", "1Tim": "1TI", "2Tim": "2TI", "Titus": "TIT", "Phlm": "PHM",
             "Heb": "HEB", "Rev": "REV"}


def _bare(w):
    w = unicodedata.normalize("NFD", w.lower())
    w = "".join(ch for ch in w if unicodedata.category(ch)[0] == "L")
    return w.replace("ς", "σ")


def _read_csv(path):
    with open(path, encoding="utf-8", newline="") as fh:
        r = csv.reader(fh)
        next(r)
        return {(int(c), int(v)): t for c, v, t in r}


def byz(mapper):
    base = SRC / "byztxt" / "repo" / "csv-unicode"
    col = Collector()
    stats = {"verses": 0, "aligned": 0}
    for bid, fn in BYZ_FILES.items():
        acc = _read_csv(base / "ccat" / "no-variants" / f"{fn}.csv")
        par = _read_csv(base / "strongs" / "with-parsing" / f"{fn}.csv")
        for (c, v), text in acc.items():
            stats["verses"] += 1
            toks = re.findall(r"(\S+) (\d+) \{([^}]*)\}", par.get((c, v), ""))
            words = re.findall(r"[^\s]+", text)
            # слово с ударением + прилегающая пунктуация
            lex = [w for w in words if _bare(w)]
            out = []
            if len(lex) == len(toks) and all(_bare(a) == _bare(b[0]) for a, b in zip(lex, toks)):
                stats["aligned"] += 1
                it = iter(toks)
                for w in words:
                    if not _bare(w):
                        out.append(w)
                        continue
                    _, num, morph = next(it)
                    m = re.match(r"^([^\w]*)(.*?)([^\w]*)$", w)
                    pre, core, post = m.groups()
                    out.append(f"{pre}{{{core}|G{int(num)}|{morph}}}{post}")
            else:
                # редкое расхождение текстов: сопоставляем по совпадению слов без диакритики
                ti = 0
                for w in words:
                    b = _bare(w)
                    j = next((k for k in range(ti, min(ti + 3, len(toks))) if _bare(toks[k][0]) == b), None) if b else None
                    if j is None:
                        out.append(w)
                        continue
                    ti = j + 1
                    m = re.match(r"^([^\w]*)(.*?)([^\w]*)$", w)
                    pre, core, post = m.groups()
                    out.append(f"{pre}{{{core}|G{int(toks[j][1])}|{toks[j][2]}}}{post}")
            sb, sc, sv = mapper(bid, c, v)
            col.add(sb, sc, sv, clean_verse(" ".join(out)))
    log(f"  byz: стихов {stats['verses']}, полностью сопоставлено со Стронгом {stats['aligned']}")
    return col


def ident(book, c, v):
    return book, c, v


# ---------------------------------------------------------------------------------------------
# USFM (eBible.org): \w слово|strong="H0430"\w*, \add …\add*, \d — надписание псалма, \s1 — заголовок
# ---------------------------------------------------------------------------------------------

USFM_BOOKS = {
    "GEN": "Gen", "EXO": "Exod", "LEV": "Lev", "NUM": "Num", "DEU": "Deut", "JOS": "Josh", "JDG": "Judg",
    "RUT": "Ruth", "1SA": "1Sam", "2SA": "2Sam", "1KI": "1Kgs", "2KI": "2Kgs", "1CH": "1Chr", "2CH": "2Chr",
    "EZR": "Ezra", "NEH": "Neh", "EST": "Esth", "JOB": "Job", "PSA": "Ps", "PRO": "Prov", "ECC": "Eccl",
    "SNG": "Song", "ISA": "Isa", "JER": "Jer", "LAM": "Lam", "EZK": "Ezek", "DAN": "Dan", "HOS": "Hos",
    "JOL": "Joel", "AMO": "Amos", "OBA": "Obad", "JON": "Jonah", "MIC": "Mic", "NAM": "Nah", "HAB": "Hab",
    "ZEP": "Zeph", "HAG": "Hag", "ZEC": "Zech", "MAL": "Mal", "MAT": "Matt", "MRK": "Mark", "LUK": "Luke",
    "JHN": "John", "ACT": "Acts", "ROM": "Rom", "1CO": "1Cor", "2CO": "2Cor", "GAL": "Gal", "EPH": "Eph",
    "PHP": "Phil", "COL": "Col", "1TH": "1Thess", "2TH": "2Thess", "1TI": "1Tim", "2TI": "2Tim", "TIT": "Titus",
    "PHM": "Phlm", "HEB": "Heb", "JAS": "Jas", "1PE": "1Pet", "2PE": "2Pet", "1JN": "1John", "2JN": "2John",
    "3JN": "3John", "JUD": "Jude", "REV": "Rev",
}


def usfm_inline(s):
    s = re.sub(r"\\f .*?\\f\*", "", s)
    s = re.sub(r"\\x .*?\\x\*", "", s)
    s = re.sub(r'\\\+?w ([^|\\]*)\|strong="([HG])0*(\d+)[a-z]?"\\\+?w\*',
               lambda m: "{" + m.group(1).replace("{", "").replace("}", "") + "|" + m.group(2) + m.group(3) + "}", s)
    s = re.sub(r'\\\+?w ([^|\\]*)\|[^\\]*\\\+?w\*', r"\1", s)
    s = re.sub(r"\\\+?add\*", "›", s)
    s = re.sub(r"\\\+?add ", "‹", s)
    s = re.sub(r"\\\+?[a-z0-9]+\*", "", s)      # закрывающий маркер — пробел после него сохраняем
    s = re.sub(r"\\\+?[a-z0-9]+ ?", "", s)       # открывающий маркер вместе с пробелом-разделителем
    return clean_verse(s)


def usfm_bible(folder, mapper):
    col = Collector()
    for f in sorted(folder.glob("*.usfm")):
        text = f.read_text(encoding="utf-8-sig")
        m = re.search(r"^\\id (\w+)", text, re.M)
        book = USFM_BOOKS.get(m.group(1)) if m else None
        if not book:
            continue
        c, v, pending = 0, 0, []
        cur = None  # (c, v) текущего стиха
        buf = defaultdict(list)
        for line in text.splitlines():
            line = line.strip()
            mm = re.match(r"^\\(\w+)\s*(.*)$", line)
            tag, rest = (mm.group(1), mm.group(2)) if mm else (None, line)
            if tag == "c":
                c, v, cur = int(rest.split()[0]), 0, None
            elif tag == "v":
                vm = re.match(r"(\d+)\S*\s*(.*)$", rest)
                v = int(vm.group(1))
                cur = (c, v)
                for h in pending:
                    sb, sc, sv = mapper(book, c, 0 if (book == "Ps" and v == 1) else v)
                    col.heading(sb, sc, sv, h)
                pending = []
                buf[cur].append(vm.group(2))
            elif tag == "d":                       # надписание псалма — синодальный стих 1 (или его начало)
                buf[(c, 0)].append(rest)
            elif tag in ("s", "s1", "s2", "ms", "ms1"):
                t = re.sub(r"\{([^|}]*)\|[^}]*\}", r"\1", usfm_inline(rest)).replace("‹", "").replace("›", "")
                if t:
                    pending.append(t)
            elif tag in ("p", "q", "q1", "q2", "q3", "m", "pi", "pi1", "li", "li1", "b", "nb", "pc", "qc"):
                if rest and cur:
                    buf[cur].append(rest)
            elif tag is None and cur and rest:
                buf[cur].append(rest)
        for (cc, vv), parts in sorted(buf.items()):
            sb, sc, sv = mapper(book, cc, vv)
            col.add(sb, sc, sv, usfm_inline(" ".join(parts)))
    return col


def sword_version(name):
    from extra_lib import sword_conf
    return sword_conf(name).get("Version", "")
