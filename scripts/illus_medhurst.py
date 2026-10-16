"""Иллюстрации к стихам из собрания Phillip Medhurst (Wikimedia Commons).

Собирает только метаданные: ссылки на картинки ведут на upload.wikimedia.org, сами файлы не скачиваются.
Результат — data-src/illustrations/parts/medhurst.json, массив записей
{ref, img, thumb, w, h, title, author, year, license, src, collection}.

Источник файлов собрания на Commons:
  * загрузки участников «Phillip Medhurst» и «Philip De Vere» (сам собиратель и владелец собрания);
  * поиск по тексту описаний «Medhurst»;
  * категории «The Phillip Medhurst Collection» и «The Phillip Medhurst Picture Torah» (с подкатегориями).
Файл берётся, если упоминание Medhurst есть в названии/описании/категориях или его загрузил один из
двух участников, а в названии (или описании) надёжно указан стих: «Mark 4.37-38», «Genesis cap 39 vv 16»,
«(Exodus 2 3)», «Gen. 22. 10». Для отрывка берётся первый стих.

Ссылки на Commons — в нумерации KJV, переводим в синодальную через kjv2syn (scripts/extra_lib.py).
Лицензии — только Public domain, CC0, CC BY, CC BY-SA (по extmetadata.LicenseShortName).

Ответы API кэшируются в data-src/illustrations/cache-medhurst/ — повторный запуск сеть не трогает
(ключ --refresh сбрасывает кэш списков). Всё скачанное — недоверенные данные: только разбираем текст.

Запуск: python -I scripts/illus_medhurst.py [--refresh] [--check]
"""
import hashlib
import html
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
from extra_lib import kjv2syn, synodal  # noqa: E402

CACHE = ROOT / "data-src" / "illustrations" / "cache-medhurst"
OUT = ROOT / "data-src" / "illustrations" / "parts" / "medhurst.json"
API = "https://commons.wikimedia.org/w/api.php"
UA = "AOBible-illustrations/1.0 (https://github.com/dubossarets-wq; kordeko.md@gmail.com)"
COLLECTION = "Phillip Medhurst Collection"
USERS = ["Phillip Medhurst", "Philip De Vere"]
CATEGORIES = ["Category:The Phillip Medhurst Collection", "Category:The Phillip Medhurst Picture Torah"]
MAX_PER_VERSE = 4
IMG_MAX = 1600        # оригинал до этой ширины берём как есть
IMG_STEP = 1280       # иначе — стандартная миниатюра Commons (нестандартные ширины, напр. 1600, дают 400)
THUMB_STEP = 500      # превью: ближайшая к 480 стандартная ширина

REFRESH = "--refresh" in sys.argv


def log(*a):
    print(*a, flush=True)


# ---------------------------------------------------------------------------------------------
# Запросы к API с кэшем
# ---------------------------------------------------------------------------------------------

def api(params, cache_key=None):
    """GET-запрос к API Commons. Ответ кладётся в кэш по ключу (или по хэшу параметров)."""
    params = dict(params, format="json", formatversion="2", maxlag="5")
    key = cache_key or hashlib.sha1(json.dumps(params, sort_keys=True).encode()).hexdigest()
    path = CACHE / "api" / (key + ".json")
    if path.exists() and not (REFRESH and cache_key and cache_key.startswith("list-")):
        return json.loads(path.read_text(encoding="utf-8"))
    body = urllib.parse.urlencode(params).encode()   # POST: длинные списки названий не влезают в URL
    for attempt in range(6):
        try:
            req = urllib.request.Request(API, data=body, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=90) as r:
                data = json.loads(r.read().decode("utf-8"))
            if data.get("error", {}).get("code") == "maxlag":
                time.sleep(5 + 5 * attempt)
                continue
            if "error" in data:
                raise RuntimeError(data["error"])
            break
        except urllib.error.HTTPError as e:
            if 400 <= e.code < 500 and e.code != 429:
                raise
            log("  повтор запроса:", e)
            time.sleep(3 + 5 * attempt)
        except (OSError, ValueError) as e:
            log("  повтор запроса:", e)
            time.sleep(3 + 5 * attempt)
    else:
        raise RuntimeError("API недоступен")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    time.sleep(0.4)   # вежливая пауза между запросами
    return data


def api_all(params, key):
    """Все страницы ответа с continue. Каждая страница кэшируется отдельно."""
    cont = {}
    n = 0
    while True:
        data = api(dict(params, **cont), cache_key=f"list-{key}-{n}")
        yield data
        if "continue" not in data:
            return
        cont = data["continue"]
        n += 1


# ---------------------------------------------------------------------------------------------
# Шаг 1. Список файлов собрания
# ---------------------------------------------------------------------------------------------

def list_titles():
    titles = set()
    for u in USERS:
        for d in api_all({"action": "query", "list": "allimages", "aisort": "timestamp", "aiuser": u,
                          "ailimit": "500", "aiprop": "timestamp"}, "user-" + re.sub(r"\W", "_", u)):
            titles.update(p["title"] for p in d["query"]["allimages"])
    log("  загрузки участников:", len(titles))
    for q in ['insource:"Medhurst"', 'intitle:"Medhurst"']:
        for d in api_all({"action": "query", "list": "search", "srsearch": q, "srnamespace": "6",
                          "srlimit": "500", "srprop": ""}, "search-" + re.sub(r"\W", "_", q)):
            titles.update(p["title"] for p in d["query"]["search"])
    log("  + поиск:", len(titles))
    seen = set()
    todo = list(CATEGORIES)
    while todo:
        cat = todo.pop()
        if cat in seen:
            continue
        seen.add(cat)
        for d in api_all({"action": "query", "list": "categorymembers", "cmtitle": cat, "cmlimit": "500",
                          "cmtype": "file|subcat"}, "cat-" + hashlib.sha1(cat.encode()).hexdigest()[:12]):
            for p in d["query"]["categorymembers"]:
                if p["ns"] == 14:
                    todo.append(p["title"])
                elif p["ns"] == 6:
                    titles.add(p["title"])
    log("  + категории:", len(titles), "(категорий:", len(seen), ")")
    return sorted(titles)


# ---------------------------------------------------------------------------------------------
# Шаг 2. Сведения о файлах (размеры, ссылки, extmetadata)
# ---------------------------------------------------------------------------------------------

def file_info(titles):
    info = {}
    for i in range(0, len(titles), 50):
        chunk = titles[i:i + 50]
        key = "info-" + hashlib.sha1("|".join(chunk).encode()).hexdigest()
        d = api({"action": "query", "titles": "|".join(chunk), "prop": "imageinfo",
                 "iiprop": "url|size|mime|user|extmetadata", "iiurlwidth": str(THUMB_STEP),
                 "iiextmetadatafilter": "ObjectName|ImageDescription|Artist|LicenseShortName|"
                                        "DateTimeOriginal|Categories"}, cache_key=key)
        for p in d["query"]["pages"]:
            if p.get("imageinfo"):
                info[p["title"]] = p["imageinfo"][0]
        if i % 1000 == 0:
            log(f"  сведения: {i + len(chunk)}/{len(titles)}")
    return info


# ---------------------------------------------------------------------------------------------
# Шаг 3. Разбор ссылки на стих в названии
# ---------------------------------------------------------------------------------------------

# Английские названия книг (и сокращения) -> OSIS. Номер книги («1 », «I », «First ») разбирается отдельно.
BOOK_NAMES = {
    "Gen": "Genesis|Gen|Gn", "Exod": "Exodus|Exod|Exo|Ex", "Lev": "Leviticus|Lev|Lv",
    "Num": "Numbers|Num|Nb", "Deut": "Deuteronomy|Deut|Dt", "Josh": "Joshua|Josh|Jos",
    "Judg": "Judges|Judg|Jdg", "Ruth": "Ruth", "Sam": "Samuel|Sam|Sm", "Kgs": "Kings|Kgs|Kin",
    "Chr": "Chronicles|Chron|Chr", "Ezra": "Ezra", "Neh": "Nehemiah|Neh", "Esth": "Esther|Esth|Est",
    "Job": "Job", "Ps": "Psalms|Psalm|Pss|Ps", "Prov": "Proverbs|Prov|Prv", "Eccl": "Ecclesiastes|Eccles|Eccl|Qoh",
    "Song": "Song of Solomon|Song of Songs|Canticles|Song", "Isa": "Isaiah|Isa|Is",
    "Jer": "Jeremiah|Jer", "Lam": "Lamentations|Lam", "Ezek": "Ezekiel|Ezek|Ezk", "Dan": "Daniel|Dan|Dn",
    "Hos": "Hosea|Hos", "Joel": "Joel", "Amos": "Amos", "Obad": "Obadiah|Obad", "Jonah": "Jonah|Jon",
    "Mic": "Micah|Mic", "Nah": "Nahum|Nah", "Hab": "Habakkuk|Hab", "Zeph": "Zephaniah|Zeph",
    "Hag": "Haggai|Hag", "Zech": "Zechariah|Zech", "Mal": "Malachi|Mal",
    "Tob": "Tobit|Tobias|Tob", "Jdt": "Judith|Jdt", "Wis": "Wisdom of Solomon|Wisdom|Wis",
    "Sir": "Ecclesiasticus|Sirach|Sir", "Bar": "Baruch|Bar", "Macc": "Maccabees|Macc",
    "Sus": "Susanna|Susannah", "Bel": "Bel and the Dragon",
    "Matt": "Matthew|Matth|Matt|Mat|Mt", "Mark": "Mark|Mk", "Luke": "Luke|Lk",
    "John": "John|Jn", "Acts": "Acts", "Rom": "Romans|Rom", "Cor": "Corinthians|Cor",
    "Gal": "Galatians|Gal", "Eph": "Ephesians|Eph", "Phil": "Philippians|Phil", "Col": "Colossians|Col",
    "Thess": "Thessalonians|Thess", "Tim": "Timothy|Tim", "Titus": "Titus", "Phlm": "Philemon|Phlm",
    "Heb": "Hebrews|Heb", "Jas": "James|Jas", "Pet": "Peter|Pet", "Jude": "Jude",
    "Rev": "Revelation|Revelations|Apocalypse|Rev|Apoc",
}
NUMBERED = {"Sam": 2, "Kgs": 2, "Chr": 2, "Macc": 2, "Cor": 2, "Thess": 2, "Tim": 2, "Pet": 2, "John": 3}
NAME2BOOK = {}
for _b, _names in BOOK_NAMES.items():
    for _n in _names.split("|"):
        NAME2BOOK[_n.lower()] = _b
_names_re = "|".join(sorted((re.escape(n) for n in NAME2BOOK), key=len, reverse=True))
PREFIX = {"1": 1, "i": 1, "1st": 1, "first": 1, "2": 2, "ii": 2, "2nd": 2, "second": 2,
          "3": 3, "iii": 3, "3rd": 3, "third": 3}
# [номер книги] Книга[.] [cap[.]] глава  (. : , пробел | v[v][.])  стих
REF_RE = re.compile(
    r"(?<![A-Za-z])(?:(?P<pre>1st|2nd|3rd|first|second|third|iii|ii|i|1|2|3)\.?\s*)?"
    r"(?P<book>" + _names_re + r")\.?\s*(?:cap(?:ut|\.)?\s*)?"
    r"(?P<c>\d{1,3})\s*(?:[.:,]\s*(?:vv?\.?\s*)?|\s+vv?\.?\s*|\s+)(?P<v>\d{1,3})(?![\d])"
    r"(?!\s*(?:of|st|nd|rd|th)\b)",
    re.I)


def osis(name, pre):
    """Английское название (+ номер) -> OSIS-код книги books.json или None."""
    b = NAME2BOOK.get(name.lower())
    if not b:
        return None
    n = PREFIX.get((pre or "").lower())
    if b in NUMBERED:
        if b == "John":
            return {None: "John", 1: "1John", 2: "2John", 3: "3John"}[n]
        if not n or n > NUMBERED[b]:
            return None
        return {"Sam": "%dSam", "Kgs": "%dKgs", "Chr": "%dChr", "Macc": "%dMacc", "Cor": "%dCor",
                "Thess": "%dThess", "Tim": "%dTim", "Pet": "%dPet"}[b] % n
    if n:      # номер у книги без номера — это не ссылка (например, «2 Mark»)
        return None
    return b


def kjv_to_syn(book, c, v):
    """Стих KJV (и греческие дополнения Даниила) -> синодальный (book, c, v) или None, если такого нет."""
    if book == "Sus":      # Сусанна — в синодальном Дан 13
        book, c, v = "Dan", 13, v if c == 1 else None
    elif book == "Bel":    # Вил и дракон — Дан 14
        book, c, v = "Dan", 14, v if c == 1 else None
    if v is None:
        return None
    if book in ("Dan",) and c in (13, 14):
        b2, c2, v2 = book, c, v
    else:
        b2, c2, v2 = kjv2syn(book, c, v)
    if not synodal().exists(b2, c2, v2):
        return None
    return b2, c2, v2


def find_refs(text):
    """Все надёжные ссылки в тексте: список (osis_kjv, глава, стих, начало, конец совпадения)."""
    out = []
    for m in REF_RE.finditer(text):
        name = m.group("book")
        # короткие сокращения и слова-омонимы принимаем только с заглавной буквы
        if not name[0].isupper():
            continue
        b = osis(name, m.group("pre"))
        if not b:
            continue
        c, v = int(m.group("c")), int(m.group("v"))
        if c == 0 or v == 0:
            continue
        out.append((b, c, v, m.start(), m.end()))
    return out


# ---------------------------------------------------------------------------------------------
# Шаг 4. Отбор файлов, название сцены, автор, ссылки на картинки
# ---------------------------------------------------------------------------------------------

LICENSE_OK = re.compile(r"^(Public domain|PD\b.*|CC0.*|CC BY(-SA)? \d\.\d.*)$", re.I)
SHOWABLE = {"image/jpeg", "image/png", "image/gif", "image/webp"}   # оригинал можно показать браузером
THUMBABLE = SHOWABLE | {"image/tiff"}                                 # TIFF — только через миниатюру
STEPS = [IMG_STEP, 960, THUMB_STEP]                                   # стандартные ширины Commons

# Служебные начала названий серий, которые отрезаем от названия сцены
SERIES_RE = re.compile(
    r"^(?:File:)?(?:"
    r"The Phillip Medhurst Picture Torah\s*\d+\.?"
    r"|\d+\s+Life of Christ Phillip Medhurst Collection\s*\d*\.?"
    r"|Tissot Drawing\s*\d+(?:\s*\(not in Brunoff\))?"
    r"|Bowyer Bible (?:Volume \d+ )?(?:print|Print)(?: Print)?\s*\d*\.?"
    r"|Apocalypse\s*\d+\."
    r"|Jan Luyken.s (?:Gospel|Jesus)\s*\d+\."
    r"|[\d.]+\s+\d+\s+"
    r"|.*?\bin the (?:Bowyer|Phillip Medhurst) Bible"
    r"|Bowyer Bible (?:Matthew|Mark|Luke|John|Acts)"
    r")\s*")
# Фотографии витражей, памятников и зданий — не гравюры собрания
NOT_PRINT = re.compile(r"Church|Cathedral|[Mm]emorial|Hotel|Hall\b|Photo \d")
# Одно и то же издание пишется по-разному
AUTHOR_FIX = {"Mortier's Bible": "Mortier’s Bible", "Mortiers Bible": "Mortier’s Bible",
              "Bible de Mortier": "Mortier’s Bible"}
JUNK_AUTHOR = re.compile(r"^(?:artist unknown|unknown|anonymous|anon\.?|)$", re.I)


def plain(s):
    """HTML из extmetadata -> обычный текст в одну строку."""
    s = re.sub(r"<[^>]+>", " ", s or "")
    return re.sub(r"\s+", " ", html.unescape(s)).strip()


def is_collection(t, ii):
    em = ii.get("extmetadata", {})
    text = " ".join([t, plain(em.get("ImageDescription", {}).get("value")),
                     em.get("Categories", {}).get("value", "")])
    return "Medhurst" in text or ii.get("user") in USERS


def scene_title(name, start, end):
    """Название сцены: текст перед ссылкой без служебного начала серии."""
    s = name[:start]
    s = SERIES_RE.sub("", s)
    s = re.sub(r"\s*\($", "", s).strip(" .,;:-–—(")
    if len(s) < 3:   # перед ссылкой ничего нет — берём текст после неё
        s = re.split(r"\s+(?:for Brunoff|•)", name[end:])[0].strip(" .,;:)")
    return s


def tail_author(name, end):
    """Художник/гравёр в хвосте названия после ссылки («… Mark 4.37-38 Rembrandt»)."""
    tail = name[end:]
    tail = re.sub(r"^[\s\d,&\-–.)v]*", "", tail)          # остаток ссылки: «-38», «&20.», «, 26.»
    tail = re.split(r"\.?\s*(?:Phillip Medhurst|for Brunoff|for Brynoff|•|\.\s)", tail)[0].strip(" .,;")
    tail = re.sub(r"\s*\(\d+\)$|\s+\d+$|(?<=[a-z])\d$", "", tail)   # «Mortier (43754)», «Le Potre 2», «Pass Rom1»
    tail = re.sub(r"\s*\(cropped\)$", "", tail)
    if len(tail) < 3 or JUNK_AUTHOR.match(tail) or len(tail.split()) > 6 or re.search(r"\d", tail):
        return None
    return AUTHOR_FIX.get(tail, tail)


def find_author(name, end):
    inv = re.search(r"invenit (?:et (?:pinxit|faciebat) )?([^•]+?)\s*•", name)
    if inv:
        a = inv.group(1).strip()
        p = re.search(r"(?:pinxit|faciebat) ([^•]+?)\s*•", name)
        p = p.group(1).strip() if p else a
        if p.startswith(a):           # «pinxit James Tissot et alia»
            return p
        return a + ", " + p
    if "Tissot" in name:
        return "James Tissot"
    if "Loutherbourg" in name:
        return "Philip James de Loutherbourg"
    m = re.search(r"((?:Jan|Caspar|Jan and Caspar) Luyken) etching", name)
    if m:
        return m.group(1)
    if end is not None:
        return tail_author(name, end)
    # ссылка взята из описания: художник — последний смысловой кусок названия («… Hagar and Ishmael. Artaud»)
    parts = [p.strip() for p in name.split(". ") if p.strip()]
    if len(parts) >= 2:
        last = parts[-1]
        if not re.search(r"\d|Bible|Medhurst|Collection|of \d", last) and len(last.split()) <= 4 \
                and not JUNK_AUTHOR.match(last) and last[0].isupper():
            return last
    return None


def desc_title(name):
    """Название сцены для файлов, где стих указан только в описании."""
    m = re.search(r"((?:Head|Tail)piece to [^.]+)", name)
    if m:
        return m.group(1)
    m = re.search(r"diptych \d+ For ([^.]+)", name)
    if m:
        return "Vignettes for " + m.group(1)
    parts = [p.strip() for p in re.split(r"\.\s+", name) if p.strip()]
    keep = [p for p in parts if not re.search(
        r"\d+ of \d+|Bowyer Bible|Medhurst|Macklin|etching|^Plate \d|^Vignette|Drawing detail", p)]
    return keep[0] if keep else name


def year_of(em):
    """Год создания — только явный и правдоподобный для гравюры (не дата фотосъёмки)."""
    d = plain(em.get("DateTimeOriginal", {}).get("value"))
    m = re.match(r"^(?:c\.\s*|circa\s*)?(1[4-8]\d\d|19[01]\d)\b", d)
    if m and "Exif" not in d:
        return int(m.group(1))
    return None


def thumb_url(ii, width):
    """Миниатюра заданной стандартной ширины на upload.wikimedia.org (из thumburl API)."""
    t = ii.get("thumburl", "").split("?")[0]
    t = t.replace("https://thumb.wikimedia.org/", "https://upload.wikimedia.org/")
    if "/thumb/" not in t:
        return None
    return re.sub(r"/((?:lossy-|lossless-)?(?:page\d+-)?)%dpx-" % THUMB_STEP, r"/\g<1>%dpx-" % width, t)


def pictures(ii):
    """(img, w, h, thumb) по правилам: оригинал до 1600 px, иначе миниатюра 1280; превью 500."""
    w, h, mime = ii["width"], ii["height"], ii.get("mime")
    orig = ii["url"].split("?")[0]
    if mime in SHOWABLE and w <= IMG_MAX:
        img, iw, ih = orig, w, h
    else:
        step = next((s for s in STEPS if s <= w), None)
        if step is None or thumb_url(ii, step) is None:
            return None
        img, iw, ih = thumb_url(ii, step), step, round(h * step / w)
    if w <= THUMB_STEP and mime in SHOWABLE:
        th = orig
    else:
        th = thumb_url(ii, THUMB_STEP)
        if th is None:
            return None
    return img, iw, ih, th


def build(info):
    stat = {"files": len(info), "collection": 0, "image": 0, "license": 0, "ref_title": 0, "ref_desc": 0,
            "no_ref": 0, "bad_verse": 0, "tissot_ps": 0}
    recs = []
    for t, ii in sorted(info.items()):
        if not is_collection(t, ii):
            continue
        stat["collection"] += 1
        if ii.get("mime") not in THUMBABLE:
            continue
        stat["image"] += 1
        em = ii.get("extmetadata", {})
        lic = plain(em.get("LicenseShortName", {}).get("value"))
        if not LICENSE_OK.match(lic):
            continue
        stat["license"] += 1
        name = t[5:].rsplit(".", 1)[0]
        if NOT_PRINT.search(name):
            continue
        refs = find_refs(name)
        end = None
        if refs:
            b, c, v, s, end = refs[0]
            title = scene_title(name, s, end)
            stat["ref_title"] += 1
        else:
            desc = plain(em.get("ImageDescription", {}).get("value"))
            # в описании ссылка должна быть единственной: перечни разделов («Mark 1:21-45, 2:1-12…»)
            # и диптихи с двумя стихами ненадёжны
            drefs = find_refs(desc)
            if len({r[:3] for r in drefs}) != 1 or re.search(r"\d\s*[-–]\s*\d+\s*,\s*\d", desc) \
                    or "Section " in desc or "DIPTYCH" in desc:
                stat["no_ref"] += 1
                continue
            b, c, v = drefs[0][:3]
            stat["ref_desc"] += 1
            if len(desc) < 120 and re.match(r"^\d+ Life of Christ", name):
                # описание повторяет недостающую часть названия: «Christ in the wilderness Mark 1.13 Pass Rom»
                name = desc
                end = drefs[0][4]
                title = scene_title(desc, drefs[0][3], end)
            else:
                title = desc_title(name)
        if "Tissot" in name and b == "Ps":
            # у рисунков Тиссо номера псалмов даны вперемешку по разным нумерациям — не доверяем
            stat["tissot_ps"] += 1
            continue
        syn = kjv_to_syn(b, c, v)
        if syn is None:
            stat["bad_verse"] += 1
            continue
        pic = pictures(ii)
        if pic is None:
            continue
        img, iw, ih, th = pic
        recs.append({
            "ref": "%s.%d.%d" % syn,
            "img": img, "thumb": th, "w": iw, "h": ih,
            "title": title,
            "author": find_author(name, end) or COLLECTION,
            "year": year_of(em),
            "license": lic,
            "src": ii["descriptionurl"],
            "collection": COLLECTION,
            "_area": ii["width"] * ii["height"],
            "_kjv": "%s.%d.%d" % (b, c, v),
            "_file": t,
        })
    return recs, stat


def pick(recs):
    """Не больше MAX_PER_VERSE на стих: лучшие по разрешению, по одному от каждого автора."""
    by = {}
    for r in recs:
        by.setdefault(r["ref"], []).append(r)
    out = []
    for lst in by.values():
        lst.sort(key=lambda r: -r["_area"])
        chosen, authors = [], set()
        for r in lst:
            a = r["author"].split(",")[0]       # Тиссо и его соавторы — один автор
            if a not in authors and len(chosen) < MAX_PER_VERSE:
                chosen.append(r)
                authors.add(a)
        # второй лист того же автора на стих не берём: у Тиссо это обычно тот же рисунок и его репродукция
        out.extend(chosen)
    order = {b["id"]: i for i, b in enumerate(json.loads((ROOT / "src" / "core" / "books.json")
                                                         .read_text(encoding="utf-8")))}

    def key(r):
        b, c, v = r["ref"].split(".")
        return order[b], int(c), int(v), -r["_area"]
    out.sort(key=key)
    return out


def check(n=50):
    """HEAD-запросы к случайным img и thumb из готового файла: картинки должны открываться."""
    import random
    out = json.loads(OUT.read_text(encoding="utf-8"))
    random.seed(7)
    bad = 0
    sample = random.sample(out, min(n, len(out)))
    for i, r in enumerate(sample):
        for k in ("img", "thumb") if i < 15 else ("img",):
            ok = False
            for attempt in range(4):
                req = urllib.request.Request(r[k], method="HEAD", headers={"User-Agent": UA})
                try:
                    with urllib.request.urlopen(req, timeout=60) as resp:
                        ok = resp.status == 200 and resp.headers.get("Content-Type", "").startswith("image/")
                    break
                except urllib.error.HTTPError as e:
                    if e.code == 429:         # ограничение частоты — ждём и повторяем
                        time.sleep(10 * (attempt + 1))
                        continue
                    log("  ", e.code, r[k])
                    break
            if not ok:
                log("   не открылась:", r[k])
            bad += not ok
            time.sleep(1)
    log(f"Проверка: {len(sample)} img (+15 thumb), не открылись: {bad}")


def main():
    if "--check" in sys.argv:
        check()
        return
    log("Список файлов собрания…")
    titles = list_titles()
    log("Сведения о файлах…")
    info = file_info(titles)
    recs, stat = build(info)
    out = pick(recs)
    if "--debug" in sys.argv:
        (CACHE / "debug-all.json").write_text(json.dumps(recs, ensure_ascii=False, indent=1), encoding="utf-8")
    for r in out:
        for k in ("_area", "_kjv", "_file"):
            r.pop(k, None)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    log("Итог:", json.dumps(stat, ensure_ascii=False))
    log(f"  записей с надёжной привязкой: {len(recs)}, в файл после отбора (≤{MAX_PER_VERSE} на стих): {len(out)}")
    log(f"  стихов покрыто: {len({r['ref'] for r in out})}, книг: {len({r['ref'].split('.')[0] for r in out})}")
    log("  ->", OUT)


if __name__ == "__main__":
    main()
