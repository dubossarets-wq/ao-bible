"""Общие функции для build_extra.py: чтение модулей SWORD, перевод нумерации стихов в синодальную,
очистка разметки, разбор ссылок, запись модулей и каталога.

Все исходники лежат в data-src/extra/<источник>/ (это недоверенные данные — только читаем их).
"""
import gzip
import json
import re
import struct
import sys
import zlib
from html import unescape
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / ".pylib"))
from pysword.bible import SwordBible  # noqa: E402

SRC = ROOT / "data-src" / "extra"
CW = SRC / "crosswire" / "x"          # распакованные пакеты CrossWire
OUT = ROOT / "public" / "modules"
BOOKS = json.loads((ROOT / "src" / "core" / "books.json").read_text(encoding="utf-8"))
BOOK_BY_ID = {b["id"]: b for b in BOOKS}
BOOK_ORDER = {b["id"]: i for i, b in enumerate(BOOKS)}
# Предел размера модуля (несжатый JSON). Объединённые многотомные комментарии (Лопухин ~26 МБ) больше прежних
# 15 МБ; приложение загружает gz-версию (в 3–4 раза меньше).
MAX_SIZE = 40_000_000


def log(*a):
    print(*a, flush=True)


# ---------------------------------------------------------------------------------------------
# Нумерация стихов: таблица соответствия Synodal <-> KJV(A) из исходников SWORD (canon_synodal.h)
# и перенос алгоритма VersificationMgr::System::translateVerse (src/mgr/versificationmgr.cpp).
# ---------------------------------------------------------------------------------------------

def _parse_c_array(text, name):
    body = re.search(r"%s\[\]\s*=\s*\{(.*?)\};" % re.escape(name), text, re.S).group(1)
    body = re.sub(r"//[^\n]*", "", body)
    return body


class Synodal:
    """Синодальная схема: список книг, число стихов в главах и правила соответствия с KJV.
    Тот же разбор подходит для других схем SWORD с таблицей соответствия (vulg, segond, calvin, darbyfr,
    nrsv — файлы sword-src/trunk/canon_<имя>.h): Synodal("vulg"). Если своего списка книг у схемы нет,
    берётся список KJV из canon.h."""

    def __init__(self, suffix="synodal"):
        if suffix == "synodal":
            h = (SRC / "sword-src" / "canon_synodal.h").read_text(encoding="utf-8", errors="replace")
        else:
            h = (SRC / "sword-src" / "trunk" / f"canon_{suffix}.h").read_text(encoding="utf-8", errors="replace")
        self.name = suffix
        kjv_h = None
        books = []
        for arr in (f"otbooks_{suffix}", f"ntbooks_{suffix}"):
            if not re.search(r"%s\[\]\s*=" % re.escape(arr), h):
                if kjv_h is None:
                    kjv_h = (SRC / "sword-src" / "trunk" / "canon.h").read_text(encoding="utf-8", errors="replace")
                body = _parse_c_array(kjv_h, arr.split("_")[0])
            else:
                body = _parse_c_array(h, arr)
            for m in re.finditer(r'\{"([^"]*)",\s*"([^"]*)",\s*"([^"]*)",\s*(\d+)\}', body):
                if int(m.group(4)):
                    books.append((m.group(2), int(m.group(4))))
        vm = [int(x) for x in re.findall(r"\d+", _parse_c_array(h, f"vm_{suffix}"))]
        self.books = [b for b, _ in books]
        self.verses = {}  # book -> [число стихов в главе]
        i = 0
        for b, n in books:
            self.verses[b] = vm[i:i + n]
            i += n
        # Байты таблицы: сначала имена «лишних» книг (C-строки), пустая строка, затем правила по 7 чисел
        raw = _parse_c_array(h, f"mappings_{suffix}")
        vals = []
        for tok in re.findall(r"'(\\?.)'|(\d+)", raw):
            vals.append(ord(tok[0][-1]) if tok[0] else int(tok[1]))
        p = 0
        extra = []
        while vals[p] != 0:
            s = []
            while vals[p] != 0:
                s.append(chr(vals[p]))
                p += 1
            extra.append("".join(s))
            p += 1
        p += 1
        nb = len(self.books)
        self.rules = [[] for _ in range(nb + len(extra))]
        while vals[p] != 0:
            m = vals[p:p + 7]
            if m[0] > nb:            # правило для «лишней» книги (PrAzar, Sus, Bel) — 8 чисел
                m = vals[p:p + 8]
                self.rules[m[0] - 1].append(m)
                self.rules[m[7] - 1].append(m)
                p += 8
            else:
                self.rules[m[0] - 1].append(m)
                p += 7
        self.index = {b: i for i, b in enumerate(self.books)}

    def from_kjv(self, book, c, v):
        """KJV -> Synodal (обратное отображение SWORD). Возвращает (book, chapter, verse, verse_end)."""
        b = self.index.get(book)
        if b is None:
            return book, c, v, v
        a = None
        for m in self.rules[b]:
            if m[0] != b + 1:
                continue
            if m[4] == c and m[5] <= v:
                if m[5] == v or (m[6] >= v and m[5] <= v):
                    return book, m[1], m[2], max(m[2], m[3])
                if a is None or max(a[5], a[6]) <= max(m[5], m[6]):
                    a = m
        if a is not None:
            d = max(a[3], a[2]) - max(a[6], a[5])
            return book, a[1], v + d, v + d
        return book, c, v, v

    def to_kjv(self, book, c, v):
        """Synodal -> KJV (прямое отображение SWORD)."""
        b = self.index.get(book)
        if b is None:
            return book, c, v, v
        for m in reversed(self.rules[b]):
            if m[0] != b + 1:
                continue
            if m[1] < c:
                return book, c, v, v
            if m[1] == c and m[2] <= v:
                if m[2] == v or (m[3] >= v and m[2] <= v):
                    return book, m[4], m[5], max(m[5], m[6])
                d = max(m[6], m[5]) - max(m[3], m[2])
                return book, m[4], v + d, v + d
        return book, c, v, v

    def exists(self, book, c, v):
        vs = self.verses.get(book)
        return bool(vs) and 1 <= c <= len(vs) and 1 <= v <= vs[c - 1]


_SYN = None


def synodal():
    global _SYN
    if _SYN is None:
        _SYN = Synodal()
    return _SYN


# Дополнения к таблице SWORD, проверенные по тексту RST: в синодальном 2 Кор 11:32 = KJV 11:32–33
# и Ис 3:18–23 (перечень украшений) сгруппирован в синодальном в 4 стиха — сопоставление приблизительное
EXTRA_KJV2SYN = {("2Cor", 11, 33): ("2Cor", 11, 32),
                 ("Isa", 3, 21): ("Isa", 3, 20), ("Isa", 3, 22): ("Isa", 3, 21), ("Isa", 3, 23): ("Isa", 3, 21),
                 ("Isa", 3, 24): ("Isa", 3, 22), ("Isa", 3, 25): ("Isa", 3, 23), ("Isa", 3, 26): ("Isa", 3, 24)}


def kjv2syn(book, c, v):
    """Стих KJV -> синодальный стих (book, c, v). Стих 0 (надписание псалма) даёт первый стих диапазона."""
    if (book, c, v) in EXTRA_KJV2SYN:
        return EXTRA_KJV2SYN[(book, c, v)]
    b, c2, v2, ve = synodal().from_kjv(book, c, v)
    if v2 == 0:
        v2 = ve if ve > 0 else 1
    return b, c2, v2


# ---------------------------------------------------------------------------------------------
# Чтение SWORD
# ---------------------------------------------------------------------------------------------

def sword_conf(name):
    conf = next((CW / name / "mods.d").glob("*.conf"))
    out = {}
    for line in conf.read_text(encoding="utf-8", errors="replace").splitlines():
        if "=" in line and not line.startswith("#"):
            k, v = line.split("=", 1)
            out.setdefault(k.strip(), v.strip())
    return out


def _module_dir(name):
    conf = sword_conf(name)
    rel = conf["DataPath"].lstrip("./").rstrip("/")
    return CW / name / rel, conf


def iter_sword_verses(name, versification, with_zero=True):
    """Все записи модуля-текста или комментария: (book, chapter, verse, raw, ident).
    ident — (testament, buf, start, len): одинаковый у стихов, ссылающихся на одну запись (ссылки SWORD)."""
    path, conf = _module_dir(name)
    drv = conf.get("ModDrv", "zText").lower()
    # RawText/RawCom — несжатые модули (индекс .vss), zText/zCom — сжатые (.bzv);
    # варианты «4» хранят длину записи в 4 байтах
    raw_mod = drv.startswith("raw")
    typ = ("rawtext" if raw_mod else "ztext") + ("4" if drv.endswith("4") else "")
    enc = "utf-8" if conf.get("Encoding", "").upper() == "UTF-8" else "cp1252"
    block = conf.get("BlockType", "BOOK").upper()
    try:
        bible = SwordBible(str(path), typ, versification, enc, "OSIS", block)
    except Exception:
        alt = typ[:-1] if typ.endswith("4") else typ + "4"
        bible = SwordBible(str(path), alt, versification, enc, "OSIS", block)
    # pysword распаковывает блок (часто целую книгу) заново для каждого стиха — кэшируем последний блок
    if hasattr(bible, "_decompressed_text"):
        orig = bible._decompressed_text
        cache = {}

        def cached(testament, buf_num):
            key = (testament, buf_num)
            if key not in cache:
                cache.clear()
                cache[key] = orig(testament, buf_num)
            return cache[key]

        bible._decompressed_text = cached

    # В некоторых модулях (Barnes) при Encoding=UTF-8 встречаются записи в cp1252 (°, £, †) — декодируем
    # каждую запись отдельно: UTF-8, иначе cp1252, иначе latin-1 (без символов-заменителей U+FFFD)
    def decode(data):
        for e in ("utf-8", "cp1252", "latin-1"):
            try:
                return data.decode(e)
            except UnicodeDecodeError:
                continue

    bible._decode_bytes = decode
    st = bible.get_structure()
    rec_fmt, rec_size = bible._verse_record_format, bible._verse_record_size
    for t in ("ot", "nt"):
        if t not in bible._testaments:
            continue
        tes = bible._testaments[t]
        idx_file = tes.v2l_name if raw_mod else tes.v2b_name
        idx_size = tes.v2l_size if raw_mod else tes.v2b_size
        for book in st.get_books().get(t, []):
            off = st._book_offset(book.name)
            for c in range(1, book.num_chapters + 1):
                for v in range(0 if with_zero else 1, book.chapter_lengths[c - 1] + 1):
                    idx = off + book.chapter_offset(c - 1) + v - 1
                    if rec_size * (idx + 1) > idx_size:
                        continue
                    idx_file.seek(rec_size * idx)
                    rec = struct.unpack(rec_fmt, idx_file.read(rec_size))
                    if rec[-1] == 0:
                        continue
                    raw = bible._text_for_index(t, idx)
                    if raw and raw.strip():
                        yield book.osis_name, c, v, raw, (t,) + rec


def iter_ld(name):
    """Статьи словаря SWORD (RawLD, RawLD4, zLD): (ключ, текст)."""
    path, conf = _module_dir(name)
    drv = conf.get("ModDrv", "").lower()
    base = str(path)
    if path.is_dir():
        base = str(next(path.glob("*.idx")))[:-4]
    idx = Path(base + ".idx").read_bytes()
    dat = Path(base + ".dat").read_bytes()
    enc = "utf-8" if conf.get("Encoding", "").upper() == "UTF-8" else "cp1252"
    dec = lambda b: b.decode(enc, errors="replace")
    if drv in ("rawld", "rawld4"):
        size_fmt, rs = ("<IH", 6) if drv == "rawld" else ("<II", 8)
        for i in range(0, len(idx) - rs + 1, rs):
            off, size = struct.unpack(size_fmt, idx[i:i + rs])
            rec = dat[off:off + size]
            nl = rec.find(b"\n")
            key, body = rec[:nl].rstrip(b"\r"), rec[nl + 1:]
            yield dec(key), dec(body)
        return
    # zLD
    zdx = Path(base + ".zdx").read_bytes()
    zdt = Path(base + ".zdt").read_bytes()
    cache = {}

    def block(n):
        if n not in cache:
            boff, bsize = struct.unpack("<II", zdx[n * 8:n * 8 + 8])
            cache.clear()
            cache[n] = zlib.decompress(zdt[boff:boff + bsize])
        return cache[n]

    for i in range(0, len(idx) - 7, 8):
        off, size = struct.unpack("<II", idx[i:i + 8])
        rec = dat[off:off + size]
        nl = rec.find(b"\n")
        key = rec[:nl].rstrip(b"\r")
        rest = rec[nl + 1:]
        if len(rest) < 8:
            continue
        bn, en = struct.unpack("<II", rest[:8])
        blk = block(bn)
        cnt = struct.unpack("<I", blk[:4])[0]
        if en >= cnt:
            continue
        eoff, esize = struct.unpack("<II", blk[4 + en * 8:12 + en * 8])
        body = blk[eoff:eoff + esize].rstrip(b"\x00")
        yield dec(key), dec(body)


# ---------------------------------------------------------------------------------------------
# Разметка
# ---------------------------------------------------------------------------------------------

def norm_space(s):
    s = re.sub(r"[ \t\r\f\v ]+", " ", s)
    s = re.sub(r" *\n *", "\n", s)
    s = re.sub(r"\n{3,}", "\n\n", s)
    return s.strip()


def fix_punct(s):
    s = re.sub(r"\s+([,.;:!?)\]»])", r"\1", s)
    s = re.sub(r"([(\[«])\s+", r"\1", s)
    return s


def html_to_text(s):
    """ThML/OSIS/TEI статьи -> обычный текст с абзацами (комментарии и словари показываются как prewrap)."""
    s = re.sub(r"<note\b[^>]*/>", "", s)
    s = re.sub(r"<(br|lb)\b[^>]*/?>", "\n", s, flags=re.I)
    s = re.sub(r"</?(p|div|lg|table|row|list|item|h\d)\b[^>]*>", "\n", s, flags=re.I)
    s = re.sub(r"<(l|cell)\b[^>]*/?>", " ", s, flags=re.I)
    s = re.sub(r"<title\b[^>]*>", "\n", s, flags=re.I)
    s = re.sub(r"</title>", "\n", s, flags=re.I)
    s = re.sub(r"<[^>]+>", "", s)
    s = unescape(s)
    return norm_space(fix_punct(s))


# ---------------------------------------------------------------------------------------------
# Ссылки
# ---------------------------------------------------------------------------------------------

# Сокращения книг в ThML-модулях (TSK, Barnes, Smith…) и английские названия -> OSIS
_ABBR = {}
for osis, names in {
    "Gen": "ge gen genesis gn", "Exod": "ex exo exod exodus", "Lev": "le lev leviticus lv",
    "Num": "nu num numbers nm", "Deut": "de deu deut deuteronomy dt", "Josh": "jos josh joshua",
    "Judg": "jud jdg judg judges jg", "Ruth": "ru rut ruth", "1Sam": "1sa 1sam 1samuel 1sm",
    "2Sam": "2sa 2sam 2samuel 2sm", "1Kgs": "1ki 1kgs 1kings 1kin 1kg", "2Kgs": "2ki 2kgs 2kings 2kin 2kg",
    "1Chr": "1ch 1chr 1chron 1chronicles", "2Chr": "2ch 2chr 2chron 2chronicles", "Ezra": "ezr ezra",
    "Neh": "ne neh nehemiah", "Esth": "es est esth esther", "Job": "job jb", "Ps": "ps psa psalm psalms pss",
    "Prov": "pr pro prov proverbs prv", "Eccl": "ec ecc eccl eccles ecclesiastes qoh",
    "Song": "so song sos songofsolomon songofsongs ca cant", "Isa": "isa is isaiah", "Jer": "jer jeremiah je",
    "Lam": "la lam lamentations", "Ezek": "eze ezek ezekiel ezk", "Dan": "da dan daniel dn",
    "Hos": "ho hos hosea", "Joel": "joe joel jl", "Amos": "am amo amos", "Obad": "ob oba obad obadiah",
    "Jonah": "jon jonah jnh", "Mic": "mic mi micah", "Nah": "na nah nahum", "Hab": "hab habakkuk",
    "Zeph": "zep zeph zephaniah", "Hag": "hag haggai hg", "Zech": "zec zech zechariah",
    "Mal": "mal malachi ml", "Matt": "mt mat matt matthew", "Mark": "mr mk mar mark",
    "Luke": "lu lk luk luke", "John": "joh jn john jhn", "Acts": "ac act acts", "Rom": "ro rom romans",
    "1Cor": "1co 1cor 1corinthians", "2Cor": "2co 2cor 2corinthians", "Gal": "ga gal galatians",
    "Eph": "eph ephesians", "Phil": "php phil philippians phi", "Col": "col colossians",
    "1Thess": "1th 1thess 1thes 1thessalonians", "2Thess": "2th 2thess 2thes 2thessalonians",
    "1Tim": "1ti 1tim 1timothy", "2Tim": "2ti 2tim 2timothy", "Titus": "tit titus", "Phlm": "phm phlm philemon phile",
    "Heb": "heb hebrews", "Jas": "jas jam james jms", "1Pet": "1pe 1pet 1peter", "2Pet": "2pe 2pet 2peter",
    "1John": "1jo 1jn 1john", "2John": "2jo 2jn 2john", "3John": "3jo 3jn 3john", "Jude": "jude jud",
    "Rev": "re rev revelation rv apoc",
    "Tob": "tob tobit", "Jdt": "jdt judith", "Wis": "wis wisdom", "Sir": "sir sirach ecclus",
    "Bar": "bar baruch", "1Macc": "1ma 1mac 1macc", "2Macc": "2ma 2mac 2macc",
}.items():
    for n in names.split():
        _ABBR.setdefault(n, osis)
# «Jud» в TSK — Judges; Jude пишется полностью
_ABBR["jud"] = "Judg"
for b in BOOKS:
    _ABBR.setdefault(b["id"].lower(), b["id"])


def book_from_abbr(s):
    k = re.sub(r"[\s.]", "", s).lower()
    if k in _ABBR:
        return _ABBR[k]
    # «I Kings», «II Sam.» — римская цифра только отдельным словом
    m = re.match(r"^(i{1,3})\s+(\w+)", s.strip().lower())
    if m:
        return _ABBR.get(str(len(m.group(1))) + m.group(2))
    return None


_SINGLE_CH = {"Obad", "Phlm", "2John", "3John", "Jude", "PrMan", "EpJer"}


def parse_ref_list(text, book=None, chapter=None):
    """«Pr 8:22-24; 16:4; Mr 13:19; Joh 1:1-3» -> [(book, c1, v1, c2, v2)].
    Без названия книги ссылка относится к предыдущей книге (или к book). Только «глава:стих»."""
    out = []
    cur_book, cur_ch = book, chapter
    for part in re.split(r"[;]", text):
        part = part.strip().strip(".")
        if not part:
            continue
        m = re.match(r"^((?:[1-3]|i{1,3})\s?[A-Za-z]+|[A-Za-z]+)\.?\s*(.*)$", part)
        if m and book_from_abbr(m.group(1)):
            cur_book = book_from_abbr(m.group(1))
            part = m.group(2)
        elif m and re.match(r"^[A-Za-z]", part):
            cur_book = None
            continue
        if not cur_book:
            continue
        for item in part.split(","):
            item = item.strip()
            mm = re.match(r"^(\d+):(\d+)(?:\s*[-–]\s*(?:(\d+):)?(\d+))?", item)
            if mm:
                c1, v1 = int(mm.group(1)), int(mm.group(2))
                c2 = int(mm.group(3)) if mm.group(3) else c1
                v2 = int(mm.group(4)) if mm.group(4) else v1
                cur_ch = c1 if not mm.group(3) else c2
                out.append((cur_book, c1, v1, c2, v2))
                continue
            mm = re.match(r"^(\d+)(?:\s*[-–]\s*(\d+))?$", item)
            if mm and cur_ch is not None:
                v1 = int(mm.group(1))
                v2 = int(mm.group(2)) if mm.group(2) else v1
                out.append((cur_book, cur_ch, v1, cur_ch, v2))
            elif mm and cur_book in _SINGLE_CH:
                v1 = int(mm.group(1))
                out.append((cur_book, 1, v1, 1, int(mm.group(2) or v1)))
    return out


def parse_osis_ref(ref):
    """«Gen.1.1», «Gen.1.1-Gen.1.3», «Gen.1.1-3» -> (book, c1, v1, c2, v2) или None."""
    ref = ref.strip().split(" ")[0]
    ref = re.sub(r"^[A-Za-z]+:", "", ref)  # Bible:Gen.1.1
    a, _, b = ref.partition("-")
    pa = a.split(".")
    if len(pa) < 2 or not pa[1].isdigit():
        return None
    bk = pa[0] if pa[0] in BOOK_BY_ID else book_from_abbr(pa[0])
    if not bk:
        return None
    c1 = int(pa[1])
    v1 = int(pa[2]) if len(pa) > 2 and pa[2].isdigit() else 1
    c2, v2 = c1, v1
    if b:
        pb = b.split(".")
        nums = [x for x in pb if x.isdigit()]
        if len(nums) >= 2:
            c2, v2 = int(nums[-2]), int(nums[-1])
        elif len(nums) == 1:
            v2 = int(nums[0])
    return bk, c1, v1, c2, v2


def fmt_ref(book, c1, v1, c2=None, v2=None):
    c2 = c1 if c2 is None else c2
    v2 = v1 if v2 is None else v2
    if (c2, v2) == (c1, v1) or (c2, v2) < (c1, v1):
        return f"{book}.{c1}.{v1}"
    if c2 == c1:
        return f"{book}.{c1}.{v1}-{v2}"
    return f"{book}.{c1}.{v1}-{c2}.{v2}"


def kjv_range_to_syn(book, c1, v1, c2, v2):
    """Диапазон KJV -> строка OSIS в синодальной нумерации."""
    b, sc1, sv1 = kjv2syn(book, c1, v1)
    _, sc2, sv2 = kjv2syn(book, c2, v2)
    if (sc2, sv2) < (sc1, sv1):
        sc2, sv2 = sc1, sv1
    return fmt_ref(b, sc1, sv1, sc2, sv2)


# ---------------------------------------------------------------------------------------------
# Запись модулей и каталога
# ---------------------------------------------------------------------------------------------

CATALOG_KEYS = ("id", "type", "name", "title", "description", "language", "version", "author", "source", "license",
                "dictionaryKind", "features", "versification", "replaces")


def write_module(module):
    mid = module["id"]
    data = json.dumps(module, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    text = data.decode("utf-8")
    assert "�" not in text, f"{mid}: в тексте есть U+FFFD"
    assert len(data) <= MAX_SIZE, f"{mid}: {len(data)/1e6:.1f} МБ > {MAX_SIZE/1e6:.0f} МБ"
    (OUT / f"{mid}.json").write_bytes(data)
    gz = gzip.compress(data, 9)
    (OUT / f"{mid}.json.gz").write_bytes(gz)
    entry = {k: module[k] for k in CATALOG_KEYS if k in module}
    entry.update({"url": f"{mid}.json", "urlGz": f"{mid}.json.gz", "size": len(data), "sizeGz": len(gz)})
    log(f"  {mid}: {len(data)/1e6:.2f} МБ, gz {len(gz)/1e6:.2f} МБ")
    return entry


def merge_catalog(entries, in_place=False):
    """Дописывает записи в catalog.json (слияние по id, идемпотентно). Новые — в конец своего раздела;
    in_place=True (частичная сборка) — уже имеющиеся записи заменяются на своём месте."""
    cat_path = OUT / "catalog.json"
    cat = json.loads(cat_path.read_text(encoding="utf-8"))
    if in_place:
        pos = {m["id"]: i for i, m in enumerate(cat["modules"])}
        for e in [e for e in entries if e["id"] in pos]:
            cat["modules"][pos[e["id"]]] = e
        entries = [e for e in entries if e["id"] not in pos]
    ids = {e["id"] for e in entries}
    # Модуль, объединивший прежние части («replaces»), вытесняет их записи из каталога
    ids |= {old for e in entries for old in e.get("replaces", [])}
    mods = [m for m in cat["modules"] if m["id"] not in ids]
    order = ["bible", "commentary", "dictionary", "maps", "crossrefs"]
    for e in entries:
        pos = len(mods)
        # после последнего модуля того же типа (недоступные «заглушки» остаются в конце)
        same = [i for i, m in enumerate(mods) if m.get("type") == e["type"] and not m.get("unavailable")]
        if same:
            pos = same[-1] + 1
        else:
            later = [i for i, m in enumerate(mods) if m.get("type") in order[order.index(e["type"]) + 1:]]
            if later:
                pos = later[0]
        mods.insert(pos, e)
    cat["modules"] = mods
    cat_path.write_text(json.dumps(cat, ensure_ascii=False, indent=1), encoding="utf-8")
    log(f"catalog: {len(mods)} записей")
