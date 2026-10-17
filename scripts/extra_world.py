"""Переводы Библии на других языках для build_extra.py: eBible.org (USFM), CrossWire SWORD, Викитека.

Главная трудность — нумерация. Приложение работает в синодальной нумерации, а переводы бывают в разных схемах:
«английской» (KJV), еврейской (MT: Псалтирь с надписаниями-стихами, Иоиль 4 главы, Малахия 3 главы),
Вульгаты, Segond и т. д. Поэтому для КАЖДОЙ КНИГИ перевода пробуем несколько известных переводов нумерации
(таблицы SWORD canon_*.h и VerseMap Open Scriptures для еврейской схемы) и берём тот, после которого стихи
книги ложатся в синодальную схему лучше всего (больше заполненных синодальных стихов, меньше наложений и
стихов вне схемы). Затем каждый модуль проверяется по контрольным местам (Пс 22 «Господь — Пастырь мой»,
Мал 4, Иоил 3, Рим 14:24–26, 3 Цар) и сравнением числа стихов в главах с синодальной схемой.

Исходники (скачивает scripts/fetch_world.py):
  ebible/<id>/          — USFM с eBible.org (https://ebible.org/Scriptures/<id>_usfm.zip), там же copr.htm
  crosswire/<Модуль>.zip — модули CrossWire SWORD
  wikisource/<язык>/    — страницы Викитеки (MediaWiki API, wikitext)
"""
import json
import re
from collections import Counter, defaultdict

from extra_lib import BOOK_BY_ID, BOOKS, SRC, Synodal, fix_punct, iter_sword_verses, kjv2syn, log, synodal

# ---------------------------------------------------------------------------------------------
# Переводы нумерации: (книга, глава, стих) в схеме источника -> синодальная
# ---------------------------------------------------------------------------------------------

_MAPPERS = {}


def _sword_mapper(suffix):
    """Схема SWORD с таблицей соответствия -> KJV(A) -> синодальная."""
    canon = Synodal(suffix)

    def m(book, c, v):
        b, c2, v2, _ = canon.to_kjv(book, c, v)
        return kjv2syn(b, c2, v2)
    return m


def mapper(name):
    if name not in _MAPPERS:
        if name == "syn":
            _MAPPERS[name] = lambda b, c, v: (b, c, max(v, 1))
        elif name == "kjv":
            _MAPPERS[name] = kjv2syn
        elif name.startswith("syn+"):          # синодальная со сдвигом номера стиха (правка отдельных глав)
            k = int(name[4:])
            _MAPPERS[name] = lambda b, c, v, k=k: (b, c, max(v, 1) + k)
        elif name == "mt":
            import extra_bibles as B
            oshb = B.oshb_mapper()

            def mt(b, c, v):
                b2, c2, v2 = oshb(b, c, v)
                return b2, c2, max(v2, 1)
            _MAPPERS[name] = mt
        else:
            _MAPPERS[name] = _sword_mapper(name)
    return _MAPPERS[name]


ALL_SCHEMES = ("kjv", "syn", "mt", "nrsv", "vulg", "segond", "calvin", "darbyfr")


def _fit(book, verses, m):
    """Насколько хорошо стихи книги ложатся в синодальную схему при переводе нумерации m.
    Стих вне схемы — тяжёлая ошибка; наложение двух стихов на один синодальный — лёгкая (так бывает и по
    правилам таблиц: в синодальном переводе несколько стихов KJV иногда объединены в один)."""
    syn = synodal()
    hits = Counter()
    bad = 0
    for (c, v), t in verses.items():
        if not t:
            continue
        b2, c2, v2 = m(book, c, v)
        if b2 != book or not syn.exists(b2, c2, v2):
            bad += 1
            continue
        hits[(c2, v2)] += 1
    coll = sum(n - 1 for n in hits.values())
    return len(hits) - 2 * bad - 0.25 * coll, len(hits), coll, bad


class Scheme:
    """Перевод нумерации для одной книги: основная схема и (для Псалтири) отдельные схемы по главам."""

    def __init__(self, default, per_chapter=None):
        self.default, self.per_chapter = default, per_chapter or {}

    def __call__(self, book, c, v):
        return mapper(self.per_chapter.get(c, self.default))(book, c, v)

    def __repr__(self):
        return self.default + (f"+{self.per_chapter}" if self.per_chapter else "")


def choose_schemes(src, prefer=None, schemes=ALL_SCHEMES, margin=2):
    """src: {book: {(c, v): text}} -> {book: Scheme}. Сначала общий победитель по всем книгам, затем для
    отдельной книги — другая схема, только если она заметно лучше (на margin очков). По главам схему не
    уточняем: подсчёт стихов не видит смысла, и смешение схем внутри книги (особенно Псалтири, где схемы
    по-разному нумеруют сами псалмы) даёт ошибки хуже, чем один пустой стих-надписание."""
    scores = {s: {} for s in schemes}
    for s in schemes:
        m = mapper(s)
        for book, verses in src.items():
            scores[s][book] = _fit(book, verses, m)
    order = list(schemes)
    if prefer in order:
        order.remove(prefer)
        order.insert(0, prefer)
    total = {s: sum(x[0] for x in scores[s].values()) for s in order}
    best = max(order, key=lambda s: (total[s], -order.index(s)))
    out = {}
    for book in src:
        top = max(order, key=lambda s: (scores[s][book][0], s == best, -order.index(s)))
        chosen = top if scores[top][book][0] >= scores[best][book][0] + margin else best
        per = {}
        out[book] = Scheme(chosen, per)
    return out, best, scores


# ---------------------------------------------------------------------------------------------
# Сборка книг в синодальной нумерации
# ---------------------------------------------------------------------------------------------

DC_BOOKS = {"Tob", "Jdt", "Wis", "Sir", "Bar", "EpJer", "1Macc", "2Macc", "3Macc", "1Esd", "2Esd", "PrMan"}
_TOKEN = re.compile(r"\{[^{}|]*\|[^{}]*\}")
_PLACEHOLDER = re.compile(r"\[(なし|欠)\]")


def fix_braces(s):
    """Фигурные скобки в самом тексте (бывают в исходниках) ломали бы разметку {слово|H123}: убираем их,
    сохраняя настоящие метки Стронга."""
    if "{" not in s and "}" not in s:
        return s
    keep = []
    s = _TOKEN.sub(lambda m: keep.append(m.group()) or f"\x00{len(keep) - 1}\x00", s)
    s = s.replace("{", "").replace("}", "")
    return re.sub(r"\x00(\d+)\x00", lambda m: keep[int(m.group(1))], s)


def collect(src, headings, schemes, label, keep_dc=True):
    """src {book: {(c, v): text}} в нумерации источника -> Collector (extra_bibles) в синодальной.
    Стих за пределами синодальной главы дописывается к её последнему стиху (текст не теряется);
    второстепенные книги берутся, только если ложатся в синодальную схему почти без пропусков."""
    import extra_bibles as B
    syn = synodal()
    col = B.Collector()
    dropped = Counter()
    for meta in BOOKS:
        book = meta["id"]
        if book not in src:
            continue
        m = schemes[book]
        if book in DC_BOOKS:
            if not keep_dc:
                continue
            score, filled, coll, bad = _fit(book, src[book], m)
            need = sum(syn.verses.get(book, [])) or 1
            if filled < 0.97 * need or coll > max(2, 0.01 * need):
                log(f"  [{label}] {book}: не ложится в синодальную схему ({filled}/{need}, наложений {coll}) — пропуск")
                continue
        for (c, v), text in sorted(src[book].items()):
            if _PLACEHOLDER.fullmatch(text.strip()):   # «[なし]» (JapBungo) — стиха нет в издании
                continue
            b2, c2, v2 = m(book, c, v)
            if b2 != book:
                dropped[book] += 1
                continue
            if not syn.exists(b2, c2, v2):
                vs = syn.verses.get(b2) or []
                if 1 <= c2 <= len(vs) and v2 > vs[c2 - 1]:
                    v2 = vs[c2 - 1]
                else:
                    dropped[book] += 1
                    continue
            col.add(b2, c2, v2, fix_braces(text))
        for (c, v), hs in sorted(headings.get(book, {}).items()):
            b2, c2, v2 = m(book, c, v)
            if b2 == book and syn.exists(b2, c2, v2):
                for h in hs:
                    col.heading(b2, c2, v2, h)
    if dropped:
        log(f"  [{label}] стихов вне синодальной схемы (пропущены): " + ", ".join(f"{b} {n}" for b, n in dropped.items()))
    return col


# ---------------------------------------------------------------------------------------------
# USFM (eBible.org)
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
    # второканонические (в синодальной Библии есть): 1ES = 2 Ездры, 2ES = 3 Ездры, LJE = Послание Иеремии
    "TOB": "Tob", "JDT": "Jdt", "WIS": "Wis", "SIR": "Sir", "BAR": "Bar", "LJE": "EpJer", "1MA": "1Macc",
    "2MA": "2Macc", "3MA": "3Macc", "1ES": "1Esd", "2ES": "2Esd", "MAN": "PrMan", "PS2": "Ps151",
}

# Строки с этими маркерами — не текст Писания (введения, оглавления, примечания, служебные поля)
_SKIP_LINE = re.compile(r"^(id|ide|h|h\d|toc\d?|toca\d?|mt\d?|mte\d?|imt\d?|is\d?|ip|ipi|ipr|ipq|ipc|im|imi|iq\d?|"
                        r"ili\d?|iot|io\d?|ior|iex|ie|imq|ib|rem|sts|usfm|cl|cp|cd|restore|periph|lit|fig|esb|esbe|"
                        r"r|mr|sr|rq|cat)$")
_HEADING = re.compile(r"^(s\d?|ms\d?|qa|sp)$")
# Полный или частичный перенос строки; маркеры абзацев и поэзии (текст после них — часть стиха)
_PARA = re.compile(r"^(p|m|po|pr|cls|pmo|pm|pmc|pmr|pi\d?|mi|nb|pc|ph\d?|q\d?|qr|qc|qm\d?|qd|lh|li\d?|lf|lim\d?|"
                   r"b|tr|tc\d?|th\d?|tcr\d?|thr\d?)$")


def _w_repl(m):
    word, attrs = m.group(1), m.group(2)
    word = word.replace("{", "").replace("}", "")
    nums = []
    sm = re.search(r'strong="([^"]*)"', attrs)
    if sm:
        for x in re.findall(r"([HG])0*(\d+)", sm.group(1)):
            s = x[0] + x[1]
            if s not in nums and s not in ("H0", "G0"):
                nums.append(s)
    if nums and word.strip():
        return "{" + word + "|" + " ".join(nums) + "}"
    return word


def usfm_text(s, strongs=True):
    """Строка USFM -> текст стиха в разметке aob (Стронг, ‹добавленные слова›)."""
    for tag in ("f", "fe", "ef", "x", "ex", "fig", "rq", "va", "ca", "vp", "cat", "jmp"):
        s = re.sub(r"\\%s\s.*?\\%s\*" % (tag, tag), " ", s, flags=re.S)
    s = re.sub(r"\\(f|fe|x)\s.*$", " ", s)  # незакрытая сноска в конце
    if strongs:
        s = re.sub(r"\\\+?w ([^|\\]*)\|([^\\]*?)\\\+?w\*", _w_repl, s)
    s = re.sub(r"\\\+?w ([^|\\]*)(?:\|[^\\]*?)?\\\+?w\*", r"\1", s)
    s = re.sub(r"\\\+?add\*", "›", s)
    s = re.sub(r"\\\+?add ", "‹", s)
    s = re.sub(r"\\\+?[a-z0-9]+\*", "", s)
    s = re.sub(r"\\\+?[a-z0-9]+ ?", "", s)
    s = s.replace("¶", " ").replace("//", " ")
    s = re.sub(r"\s+", " ", s).strip()
    s = s.replace("‹ ", " ‹").replace(" ›", "› ").replace("‹›", "")
    s = re.sub(r"\s+", " ", s).strip()
    s = fix_punct(s)
    return re.sub(r"\s+([,.;:!?])", r"\1", s)


def read_usfm(folder, strongs=True):
    """Папка USFM -> (src {book: {(c, v): text}}, headings {book: {(c, v): [..]}}) в нумерации источника.
    Надписание псалма (\\d) — стих 0. Пс 151 (PS2) — глава 151 Псалтири, Варух 6 — Послание Иеремии."""
    src = defaultdict(lambda: defaultdict(list))
    heads = defaultdict(lambda: defaultdict(list))
    for f in sorted(folder.glob("*.usfm")) + sorted(folder.glob("*.SFM")) + sorted(folder.glob("*.sfm")):
        text = f.read_text(encoding="utf-8-sig", errors="replace")
        m = re.search(r"^\\id (\w+)", text, re.M)
        code = m.group(1).upper() if m else None
        book = USFM_BOOKS.get(code)
        if not book:
            continue
        c, cur, pending = 0, None, []

        def target(cc, vv):
            if book == "Ps151":
                return "Ps", 151, vv
            if book == "Bar" and cc == 6:
                return "EpJer", 1, vv
            return book, cc, vv

        for line in text.splitlines():
            line = line.strip()
            if not line:
                continue
            mm = re.match(r"^\\(\w+)\s*(.*)$", line)
            tag, rest = (mm.group(1), mm.group(2)) if mm else (None, line)
            if tag == "c":
                c, cur = int(re.match(r"\d+", rest).group()), None
                continue
            if tag and _SKIP_LINE.match(tag):
                continue
            if tag and _HEADING.match(tag):
                t = re.sub(r"\{([^|}]*)\|[^}]*\}", r"\1", usfm_text(rest, False)).replace("‹", "").replace("›", "")
                if t:
                    pending.append(t)
                continue
            if tag == "d":                     # надписание псалма
                b, cc, vv = target(c, 0)
                src[b][(cc, vv)].append(rest)
                continue
            if tag == "v":
                body = "\\v " + rest
            elif tag is None or _PARA.match(tag) or tag in ("qs", "wj", "nd", "add", "w", "bk", "k", "pn", "tl"):
                body = rest if (tag is None or _PARA.match(tag)) else line
            else:
                continue
            # Разбиваем строку по номерам стихов (\v может стоять и в середине строки)
            parts = re.split(r"\\v\s+(\d+)[a-z]?(?:[-–,]\d+[a-z]?)?\s*", body)
            if parts[0].strip() and cur and c:
                b, cc, vv = target(*cur)
                src[b][(cc, vv)].append(parts[0])
            for i in range(1, len(parts), 2):
                cur = (c, int(parts[i]))
                b, cc, vv = target(*cur)
                for h in pending:
                    heads[b][(cc, 0 if (b == "Ps" and vv == 1) else vv)].append(h)
                pending = []
                src[b][(cc, vv)].append(parts[i + 1])
    out = {}
    for b, vs in src.items():
        # «[3:23]», «(3-23)», «(03-23)» в начале стиха — номер по другой схеме, вписанный издателем в текст;
        # «(H24-1)» (Riveduta) — номер по еврейской схеме, бывает и посреди стиха
        out[b] = {k: re.sub(r"\s*\(H\d{1,3}[:\-]\d{1,3}\)\s*", " ",
                            re.sub(r"^\s*[\[(]\d{1,3}[:\-]\d{1,3}[\])]\s*", "", usfm_text(" ".join(p), strongs))).strip()
                  for k, p in vs.items()}
        out[b] = {k: t for k, t in out[b].items() if t}
    return out, {b: dict(h) for b, h in heads.items()}


# ---------------------------------------------------------------------------------------------
# SWORD (CrossWire)
# ---------------------------------------------------------------------------------------------

def _balance_titles(raw):
    """В некоторых модулях (GerMenge) надписание псалма открыто в одном стихе, а закрыто в следующем — тогда
    весь текст стиха пропал бы как «заголовок». Непарные <title> и </title> убираем, текст оставляем."""
    opens = [m for m in re.finditer(r"<title(?:\s[^>]*)?(?<!/)>", raw)]
    closes = [m for m in re.finditer(r"</title>", raw)]
    if len(opens) == len(closes) and all(o.start() < c.start() for o, c in zip(opens, closes)):
        return raw
    out, depth, pos = [], 0, 0
    for m in sorted(opens + closes, key=lambda x: x.start()):
        out.append(raw[pos:m.start()])
        pos = m.end()
        if m.group().startswith("</"):
            if depth:
                depth -= 1
                out.append(m.group())
        else:
            rest = raw[m.end():]
            if "</title>" in rest:
                depth += 1
                out.append(m.group())
    out.append(raw[pos:])
    return "".join(out)


def read_sword(name, versification, strongs=True, fix=None):
    """Модуль-текст SWORD -> (src, headings) в нумерации источника; надписание псалма — стих 0."""
    import extra_bibles as B
    src = defaultdict(dict)
    heads = defaultdict(lambda: defaultdict(list))
    for book, c, v, raw, _ in iter_sword_verses(name, versification):
        if fix:
            raw = fix(raw)
        raw = _balance_titles(raw)
        text, hs, ptitle = B.osis_to_aob(raw, strongs)
        if v == 0:
            for h in hs:
                heads[book][(c, 0 if book == "Ps" else 1)].append(h)
            if text and book == "Ps":
                ptitle = text
            if ptitle and book == "Ps":
                src[book][(c, 0)] = ptitle
            continue
        if ptitle and book == "Ps" and v == 1:
            src[book][(c, 0)] = (src[book].get((c, 0), "") + " " + ptitle).strip()
        for h in hs:
            heads[book][(c, v)].append(h)
        if text:
            src[book][(c, v)] = (src[book].get((c, v), "") + " " + text).strip()
    return dict(src), {b: dict(h) for b, h in heads.items()}


# ---------------------------------------------------------------------------------------------
# Контрольные места
# ---------------------------------------------------------------------------------------------

def spot_check(books, label):
    """Печатает контрольные стихи: по ним видно, что нумерация синодальная."""
    by = {b["id"]: b for b in books}

    def verse(b, c, v):
        bk = by.get(b)
        if not bk or c > len(bk["chapters"]) or v > len(bk["chapters"][c - 1]):
            return "—"
        t = re.sub(r"\{([^|}]*)\|[^}]*\}", r"\1", bk["chapters"][c - 1][v - 1])
        return t[:70]

    out = []
    for b, c, v in (("Ps", 22, 1), ("Ps", 22, 2), ("Mal", 4, 5), ("Joel", 3, 1), ("Rom", 14, 24), ("Rom", 16, 24),
                    ("1Kgs", 4, 21), ("Ps", 9, 22)):
        out.append(f"{b} {c}:{v} {verse(b, c, v)}")
    log(f"  [{label}] " + " | ".join(out))


def quality(books, label):
    """Главы, где стихов заметно меньше, чем в синодальной схеме, — признак обрезанного или сбитого текста.
    Возвращает (доля заполненных синодальных стихов, список «коротких» глав)."""
    syn = synodal()
    filled = total = 0
    short = []
    for b in books:
        vm = syn.verses.get(b["id"]) or []
        for ci, ch in enumerate(b["chapters"]):
            expect = vm[ci] if ci < len(vm) else len(ch)
            n = sum(1 for v in ch if v)
            filled += n
            total += expect
            # Дан 3 (песнь трёх отроков) и Пс 53 (надписание в 2 стиха) короче в протестантских изданиях
            if expect >= 8 and n < 0.8 * expect and (b["id"], ci + 1) not in (("Dan", 3), ("Ps", 53)):
                short.append(f"{b['id']}.{ci + 1}: {n}/{expect}")
        # Нет Пс 151 и Дан 13–14 — обычное дело для изданий без второканонических текстов
        if len(b["chapters"]) < len(vm) and b["id"] not in ("Ps", "Dan"):
            short.append(f"{b['id']}: глав {len(b['chapters'])}/{len(vm)}")
    cov = filled / total if total else 0
    log(f"  [{label}] заполнено {cov:.1%} синодальных стихов; коротких глав: {len(short)}" +
        (": " + "; ".join(short[:12]) if short else ""))
    return cov, short
