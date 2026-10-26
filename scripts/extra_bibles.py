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


# ---------------------------------------------------------------------------------------------
# Весткотт — Хорт (1881): состав и порядок слов, Стронг и морфология — текст Робинсона (byztxt, латинская
# транслитерация без ударений); ударения, придыхания, заглавные и пунктуация — из STEPBible TAGNT (слова с
# пометкой WH, с написанием WH из «Spelling variants»). Слова сопоставляются по главе целиком (нумерация стихов
# у TAGNT — NRSV, у Робинсона — своя); слово без пары в TAGNT остаётся без ударений.
# ---------------------------------------------------------------------------------------------

WH_FILES = {"Matt": "MT", "Mark": "MR", "Luke": "LU", "John": "JOH", "Acts": "AC", "Jas": "JAS", "1Pet": "1PE",
            "2Pet": "2PE", "1John": "1JO", "2John": "2JO", "3John": "3JO", "Jude": "JUDE", "Rom": "RO",
            "1Cor": "1CO", "2Cor": "2CO", "Gal": "GA", "Eph": "EPH", "Phil": "PHP", "Col": "COL",
            "1Thess": "1TH", "2Thess": "2TH", "1Tim": "1TI", "2Tim": "2TI", "Titus": "TIT", "Phlm": "PHM",
            "Heb": "HEB", "Rev": "RE"}
TAGNT_BOOKS = {"Mat": "Matt", "Mrk": "Mark", "Luk": "Luke", "Jhn": "John", "Act": "Acts", "Rom": "Rom",
               "1Co": "1Cor", "2Co": "2Cor", "Gal": "Gal", "Eph": "Eph", "Php": "Phil", "Col": "Col",
               "1Th": "1Thess", "2Th": "2Thess", "1Ti": "1Tim", "2Ti": "2Tim", "Tit": "Titus", "Phm": "Phlm",
               "Heb": "Heb", "Jas": "Jas", "1Pe": "1Pet", "2Pe": "2Pet", "1Jn": "1John", "2Jn": "2John",
               "3Jn": "3John", "Jud": "Jude", "Rev": "Rev"}
_GR2ROB = str.maketrans("αβγδεζηθικλμνξοπρστυφχψω", "abgdezhqiklmnxoprstufcyw")
_ROB2GR = str.maketrans("abgdezhqiklmnxoprstufcyw", "αβγδεζηθικλμνξοπρστυφχψω")


def _rob_key(w):
    """Слово Робинсона (paulov, [kai]) -> ключ сравнения: латиница, конечная сигма как s."""
    return re.sub(r"[^a-z]", "", w.lower()).replace("v", "s")


def _rob_greek(w):
    """Слово Робинсона без пары в TAGNT -> греческие буквы без ударений (конечная сигма — ς)."""
    g = re.sub(r"[^a-z]", "", w.lower()).replace("v", "s").translate(_ROB2GR)
    return re.sub(r"σ$", "ς", g)


def _split_punct(w):
    """«[[Ἀναστὰς» -> ("[[", "Ἀναστὰς", ""): буквы и диакритика (в т. ч. йота подписная U+0345) — слово."""
    is_core = [unicodedata.category(ch)[0] in "LM" for ch in w]
    if not any(is_core):
        return w, "", ""
    s = is_core.index(True)
    e = len(w) - is_core[::-1].index(True)
    return w[:s], w[s:e], w[e:]


def _wh_robinson(path):
    """parsed/*.UWH -> [((глава, стих), слово, стронг, морфология)]; из «| текст WH | вариант |» — первый."""
    out, cv, alt, toks = [], None, -1, []
    for t in open(path, encoding="utf-8").read().split():
        if t == "|":
            alt = 0 if alt < 0 else (1 if alt == 0 else -1)
        elif alt != 1:
            toks.append(t)  # номер и морфология после «| acav | acaz |» относятся к слову основного текста
    i = 0
    while i < len(toks):
        t = toks[i]
        i += 1
        m = re.fullmatch(r"(\d+):(\d+)", t)
        if m:
            cv = (int(m.group(1)), int(m.group(2)))
            continue
        if t.isdigit() or t.startswith("{"):
            continue
        nums, morph = [], ""
        while i < len(toks) and toks[i].isdigit():
            nums.append(int(toks[i]))
            i += 1
        if i < len(toks) and toks[i].startswith("{"):
            morph = toks[i].strip("{}")
            i += 1
        if cv and _rob_key(t):
            out.append((cv, t, nums[0] if nums else None, morph))
    return out


def _tagnt_morph(g):
    """Разбор TAGNT -> код Робинсона: без пометок STEPBible (-P имя, -L место, -T титул, -PG/-LG…, -HEB/-ARAM/-LI —
    происхождение слова), «второй презенс» V-2P… как V-P…; у слитных слов (κἀγώ: «CONJ + G1473=P-1NS») —
    первая часть."""
    g = g.split(" + ")[0].strip()
    g = re.sub(r"-(HEB|ARAM|LI)$", "", g)
    g = re.sub(r"^V-2P", "V-P", g)
    return re.sub(r"-(P|L|T|PG|LG|TG|G)$", "", g)


def _tagnt_edition(edition):
    """TAGNT -> {книга: {глава: [(слово с пунктуацией, стронг, морфология)]}} — слова издания edition в его
    порядке (с написанием и перестановками этого издания)."""
    base = SRC / "tagnt"
    rows = defaultdict(lambda: defaultdict(list))
    for fn in ("mat-jhn.txt", "act-rev.txt"):
        with open(base / fn, encoding="utf-8-sig") as fh:
            for line in fh:
                m = re.match(r"^([1-3][A-Z][a-z]|[A-Z][a-z]{2})\.(\d+)\.\d+\S*#(\d+)=\S+\t", line)
                if not m or m.group(1) not in TAGNT_BOOKS:
                    continue
                c = line.rstrip("\n").split("\t")
                eds = {}
                for e in c[5].split("+"):
                    em = re.fullmatch(r"([A-Za-z0-9]+)([»«]\d+)?", e.strip())
                    if em:
                        eds[em.group(1)] = em.group(2) or ""
                if edition not in eds:
                    continue
                word = re.sub(r"\s*\([^)]*\)\s*$", "", c[1]).strip()
                for part in (c[7] if len(c) > 7 else "").split(";"):
                    if ":" not in part:
                        continue
                    who, form = part.split(":", 1)
                    if edition in who.strip().lstrip("+").split("+") and form.strip():
                        pre, _, post = _split_punct(word)
                        word = pre + form.strip() + post
                        break
                sm = re.match(r"G(\d+)", c[3])
                strong = int(sm.group(1)) if sm else None
                morph = _tagnt_morph(c[3].split("=", 1)[1]) if "=" in c[3] else ""
                shift = eds[edition]
                k = int(shift[1:]) if shift else 0
                pos = len(rows[TAGNT_BOOKS[m.group(1)]][int(m.group(2))])
                key = pos + (k + 0.5 if shift.startswith("»") else -k - 0.5 if shift else 0)
                rows[TAGNT_BOOKS[m.group(1)]][int(m.group(2))].append((key, (word, strong, morph)))
    return {b: {ch: [w for _, w in sorted(ws, key=lambda x: x[0])] for ch, ws in chs.items()}
            for b, chs in rows.items()}


def _greek_key(w):
    """Греческое слово -> ключ сравнения в латинице Робинсона (без ударений, апострофов и знаков)."""
    return re.sub(r"[^a-z]", "", _bare(w).translate(_GR2ROB))


def _align(a, b):
    """Пары индексов a -> b по совпадению ключей; в заменах одинаковой длины — и похожие слова (другое
    написание того же слова)."""
    import difflib
    pair = {}
    for op, a1, a2, b1, b2 in difflib.SequenceMatcher(None, a, b, autojunk=False).get_opcodes():
        if op == "equal":
            pair.update({a1 + j: b1 + j for j in range(a2 - a1)})
        elif op == "replace" and a2 - a1 == b2 - b1:
            pair.update({a1 + j: b1 + j for j in range(a2 - a1)
                         if difflib.SequenceMatcher(None, a[a1 + j], b[b1 + j]).ratio() >= 0.6})
    return pair


def read_sblgnt():
    """Официальный текст SBLGNT (LogosBible/SBLGNT, data/sblgnt/text) с номерами Стронга и морфологией из
    TAGNT (слова с пометкой SBL) -> ({книга: {(глава, стих): текст aob}}, {}) — как W.read_usfm.
    Знаки ⸀ ⸂ ⸃ (отсылки к аппарату) убираются; ⟦ ⟧ остаются."""
    tag = _tagnt_edition("SBL")
    src = {}
    stats = {"words": 0, "tagged": 0}
    for path in sorted((SRC / "sblgnt" / "repo" / "data" / "sblgnt" / "text").glob("*.txt")):
        bid = path.stem
        by_ch = defaultdict(list)  # глава -> [(стих, слово)]
        for line in open(path, encoding="utf-8-sig"):
            m = re.match(r"^\S+ (\d+):(\d+)\t(.*)$", line.rstrip("\n"))
            if not m:
                continue
            c, v = int(m.group(1)), int(m.group(2))
            for w in re.sub("[⸀-⸅]", "", m.group(3)).split():
                by_ch[c].append((v, w))
        verses = defaultdict(list)
        for ch, words in by_ch.items():
            tw = tag.get(bid, {}).get(ch, [])
            pair = _align([_greek_key(w) for _, w in words], [_greek_key(t[0]) for t in tw])
            for i, (v, w) in enumerate(words):
                pre, core, post = _split_punct(w)
                if not core:
                    verses[(ch, v)].append(w)
                    continue
                stats["words"] += 1
                t = tw[pair[i]] if i in pair else None
                if t and t[1]:
                    stats["tagged"] += 1
                    verses[(ch, v)].append(f"{pre}{{{core}|G{t[1]}|{t[2]}}}{post}" if t[2] else f"{pre}{{{core}|G{t[1]}}}{post}")
                else:
                    verses[(ch, v)].append(w)
        src[bid] = {cv: clean_verse(" ".join(ws)) for cv, ws in verses.items()}
    log(f"  sblgnt: слов {stats['words']}, со Стронгом и морфологией из TAGNT {stats['tagged']}")
    return src, {}


def wh(mapper):
    tag = _tagnt_edition("WH")
    col = Collector()
    stats = {"words": 0, "accented": 0}
    for bid, fn in WH_FILES.items():
        rob = _wh_robinson(SRC / "whtxt" / "repo" / "parsed" / f"{fn}.UWH")
        by_ch = defaultdict(list)
        for r in rob:
            by_ch[r[0][0]].append(r)
        verses = defaultdict(list)
        for ch, words in by_ch.items():
            tw = [t[0] for t in tag.get(bid, {}).get(ch, [])]
            # то же слово в другом написании (Ὀζίας / Ὀζείας) тоже в паре — берём написание WH из TAGNT
            pair = _align([_rob_key(w[1]) for w in words], [_greek_key(w) for w in tw])
            for i, (cv, rw, num, morph) in enumerate(words):
                stats["words"] += 1
                if i in pair:
                    stats["accented"] += 1
                    pre, core, post = _split_punct(tw[pair[i]])
                else:
                    pre, core, post = "", _rob_greek(rw), ""
                pre, post = pre.replace("[", ""), post.replace("]", "")
                if rw.startswith("["):
                    pre = "[" * (len(rw) - len(rw.lstrip("["))) + pre
                if rw.endswith("]"):
                    post += "]" * (len(rw) - len(rw.rstrip("]")))
                verses[cv].append(f"{pre}{{{core}|G{num}|{morph}}}{post}" if num else f"{pre}{core}{post}")
        for (c, v), ws in verses.items():
            sb, sc, sv = mapper(bid, c, v)
            col.add(sb, sc, sv, clean_verse(" ".join(ws)))
    log(f"  wh: слов {stats['words']}, с ударениями из TAGNT {stats['accented']}")
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
