"""Иллюстрации к стихам из классических собраний Wikimedia Commons: Гюстав Доре, Юлиус Шнорр фон Карольсфельд,
Джеймс Тиссо, библейские карточки Providence Lithograph Company.

Собирает только метаданные: ссылки на картинки ведут на upload.wikimedia.org, сами картинки не скачиваются.
Кроме того — «прочие» собрания с подписью «as in Genesis 5:24» (часть other.json): «Figures de la Bible» Герарда
Хута (1728), Библия Холмана (1890), «The Bible and Its Story» (1908), «Treasures of the Bible» (1894) и др.

Результат — data-src/illustrations/parts/<собрание>.json (dore, schnorr, tissot, providence, other), массив записей
{ref, img, thumb, w, h, title, author, year, license, src, collection, key}; ref — уже в СИНОДАЛЬНОЙ нумерации,
key — номер/название листа (сведение в scripts/build_illustrations.py не берёт один лист дважды).

Откуда берётся привязка к стиху:
  * Доре — описания файлов серии «Doré's English Bible» (001–152, Ветхий Завет: «The Creation of Light
    (Gen. 1:1-5)») и другие файлы Доре, где в описании есть ссылка на стих;
  * Шнорр — 240 гравюр «Die Bibel in Bildern» (1860) пронумерованы, а у каждого листа в издании напечатана
    ссылка на место Писания (по немецкой Библии Лютера). Таблица SCHNORR ниже составлена вручную по тексту
    издания (Internet Archive, diebibelinbilder00schn), сверена с категориями и описаниями файлов на Commons
    и с текстом Синодального перевода; номера уже синодальные;
  * Тиссо — в его книгах (англ. изд.: «The Life of Our Saviour Jesus Christ», 1899, и «The Old Testament:
    Three Hundred and Ninety-Six Compositions», 1904; Internet Archive) у каждой картины указано место
    Евангелия/Писания. Ветхий Завет: подпись «REBECCA MEETS ISAAC BY THE WAY. Gen. xxiv. 65.»; Новый Завет:
    заголовок «Saint Mark — Chap. 9» и текст отрывка, первый стих находим сравнением с текстом KJV.
    Картину на Commons ищем по совпадению названия; кроме того берутся файлы Тиссо со ссылкой в описании;
  * Providence Lithograph — описание карточки: «…, as in Joshua 20:1-9, illustration from a Bible card…».
Для отрывка берётся первый стих. Английские ссылки (KJV) переводятся в синодальную нумерацию (kjv2syn).

Лицензии — только Public domain, CC0, CC BY, CC BY-SA (extmetadata.LicenseShortName каждого файла).

Ответы API и тексты книг кэшируются в data-src/illustrations/cache-classic/ — повторный запуск сеть не трогает
(--refresh перезапрашивает списки категорий). Всё скачанное — недоверенные данные: только разбираем текст.

Запуск: python -I scripts/illus_classic.py [--refresh]
"""
import difflib
import hashlib
import html
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter, defaultdict
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
from extra_lib import kjv2syn, synodal  # noqa: E402
from illus_titles_ru import DORE_RU, OTHER_RU, PROVIDENCE_RU, TISSOT_RU  # noqa: E402

CACHE = ROOT / "data-src" / "illustrations" / "cache-classic"
PARTS = ROOT / "data-src" / "illustrations" / "parts"
MODULES = ROOT / "public" / "modules"
API = "https://commons.wikimedia.org/w/api.php"
UA = "AOBible-illustrations/1.0 (https://github.com/dubossarets-wq; kordeko.md@gmail.com)"
IMG_MAX = 1600        # оригинал до этой ширины берём как есть
IMG_STEP = 1280       # иначе — миниатюра Commons стандартной ширины (нестандартные ширины Commons не отдаёт)
THUMB_STEP = 500      # превью
REFRESH = "--refresh" in sys.argv
ALLOWED_LICENSE = re.compile(r"^(Public domain|PD\b.*|CC0.*|CC BY(-SA)? \d(\.\d)?.*)$", re.I)


def log(*a):
    print(*a, flush=True)


# ---------------------------------------------------------------------------------------------
# Сеть с кэшем
# ---------------------------------------------------------------------------------------------

def http_get(url, data=None, tries=6):
    for attempt in range(tries):
        try:
            req = urllib.request.Request(url, data=data, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=120) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            if (400 <= e.code < 500 and e.code != 429) or attempt == tries - 1:
                raise
            wait = e.headers.get("Retry-After", "")
            log("  повтор запроса:", e)
            time.sleep(min(int(wait), 120) if wait.isdigit() else 5 + 10 * attempt)
        except (OSError, ValueError) as e:
            if attempt == tries - 1:
                raise
            log("  повтор запроса:", e)
            time.sleep(5 + 10 * attempt)


def api(params, cache_key=None):
    """POST-запрос к API Commons; ответ кэшируется (по ключу или хэшу параметров)."""
    params = dict(params, format="json", formatversion="2", maxlag="5")
    key = cache_key or hashlib.sha1(json.dumps(params, sort_keys=True).encode()).hexdigest()
    path = CACHE / "api" / (key + ".json")
    if path.exists() and not (REFRESH and key.startswith("list-")):
        return json.loads(path.read_text(encoding="utf-8"))
    for attempt in range(6):
        data = json.loads(http_get(API, urllib.parse.urlencode(params).encode()).decode("utf-8"))
        if data.get("error", {}).get("code") == "maxlag":
            time.sleep(5 + 5 * attempt)
            continue
        if "error" in data:
            raise RuntimeError(data["error"])
        break
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    time.sleep(0.4)   # вежливая пауза между запросами
    return data


def api_all(params, key):
    cont, n = {}, 0
    while True:
        data = api(dict(params, **cont), cache_key=f"list-{key}-{n}")
        yield data
        if "continue" not in data:
            return
        cont, n = data["continue"], n + 1


def cached_text(url, name):
    """Текст книги (OCR Internet Archive) — один раз в кэш."""
    path = CACHE / "texts" / name
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(http_get(url))
        time.sleep(2)
    return path.read_text(encoding="utf-8", errors="replace")


def category_files(cat, depth=0):
    """Файлы категории (и подкатегорий до глубины depth)."""
    out, seen, todo = [], set(), [(cat, 0)]
    while todo:
        c, d = todo.pop(0)
        if c in seen:
            continue
        seen.add(c)
        key = "cat-" + hashlib.sha1(c.encode()).hexdigest()[:16]
        for data in api_all({"action": "query", "list": "categorymembers", "cmtitle": c, "cmlimit": "500",
                             "cmtype": "file|subcat"}, key):
            for p in data["query"]["categorymembers"]:
                if p["ns"] == 14 and d < depth:
                    todo.append((p["title"], d + 1))
                elif p["ns"] == 6 and p["title"] not in out:
                    out.append(p["title"])
    return out


def search_files(query):
    key = "search-" + hashlib.sha1(query.encode()).hexdigest()[:16]
    out = []
    for data in api_all({"action": "query", "list": "search", "srsearch": query, "srnamespace": "6",
                         "srlimit": "500", "srprop": ""}, key):
        out += [p["title"] for p in data["query"]["search"]]
    return out


def _strip(s):
    s = re.sub(r"<div style=\"display: ?none;?\">.*?</div>", " ", s or "", flags=re.S)
    s = re.sub(r"<[^>]+>", " ", s)
    return re.sub(r"\s+", " ", html.unescape(s)).strip()


def _langs(v):
    """Значение extmetadata (с iiextmetadatamultilang) -> {язык: текст}."""
    if isinstance(v, dict):
        return {k: _strip(x) for k, x in v.items() if k != "_type" and isinstance(x, str)}
    return {"": _strip(v if isinstance(v, str) else "")}


def file_info(titles):
    """Сведения о файлах: размеры, адреса, лицензия, описания на всех языках, категории."""
    info = {}
    titles = list(dict.fromkeys(titles))
    for i in range(0, len(titles), 50):
        chunk = titles[i:i + 50]
        key = "info-" + hashlib.sha1("|".join(chunk).encode()).hexdigest()
        params = {"action": "query", "titles": "|".join(chunk), "prop": "imageinfo|categories",
                  "iiprop": "url|size|mime|extmetadata", "iiextmetadatamultilang": "1",
                  "iiextmetadatafilter": "ObjectName|ImageDescription|Artist|LicenseShortName|DateTimeOriginal",
                  "clshow": "!hidden", "cllimit": "max"}
        pages, cont, n = {}, {}, 0
        while True:
            d = api(dict(params, **cont), cache_key=f"{key}-{n}" if n else key)
            norm = {x["to"]: x["from"] for x in d["query"].get("normalized", [])}
            for p in d["query"].get("pages", []):
                t = norm.get(p["title"], p["title"])
                cur = pages.setdefault(t, {"cats": []})
                if p.get("imageinfo"):
                    cur["ii"] = p["imageinfo"][0]
                cur["cats"] += [c["title"][9:] for c in p.get("categories", [])]
            if "continue" not in d:
                break
            cont, n = d["continue"], n + 1
        for t, p in pages.items():
            ii = p.get("ii")
            if not ii:
                continue
            em = ii.get("extmetadata", {})
            info[t] = {
                "title": t, "w": ii.get("width", 0), "h": ii.get("height", 0), "mime": ii.get("mime", ""),
                "url": ii["url"], "page": ii["descriptionurl"],
                "license": _strip(em.get("LicenseShortName", {}).get("value", "")),
                "artist": " ".join(_langs(em.get("Artist", {}).get("value", "")).values()),
                "date": " ".join(_langs(em.get("DateTimeOriginal", {}).get("value", "")).values()),
                "desc": _langs(em.get("ImageDescription", {}).get("value", "")),
                "name": _langs(em.get("ObjectName", {}).get("value", "")),
                "raw_name": json.dumps(em.get("ObjectName", {}).get("value", ""), ensure_ascii=False),
                "raw_desc": json.dumps(em.get("ImageDescription", {}).get("value", ""), ensure_ascii=False),
                "cats": p["cats"],
            }
        if i and i % 500 == 0:
            log(f"  сведения о файлах: {i}/{len(titles)}")
    return info


# ---------------------------------------------------------------------------------------------
# Адреса картинок и запись
# ---------------------------------------------------------------------------------------------

def thumb_url(url, width):
    """Миниатюра Commons стандартной ширины: …/commons/a/ab/X.jpg -> …/commons/thumb/a/ab/X.jpg/500px-X.jpg."""
    base = url.split("?")[0]
    name = base.rsplit("/", 1)[1]
    ext = name.rsplit(".", 1)[-1].lower()
    t = base.replace("/wikipedia/commons/", "/wikipedia/commons/thumb/", 1)
    if ext in ("tif", "tiff"):
        return f"{t}/lossy-page1-{width}px-{name}.jpg"
    if ext == "svg":
        return f"{t}/{width}px-{name}.png"
    return f"{t}/{width}px-{name}"


def image_fields(fi):
    """img (оригинал до 1600 px или миниатюра 1280 px), thumb (500 px), w/h — размеры img."""
    w, h, url = fi["w"], fi["h"], fi["url"].split("?")[0]
    if not w or not h or not url.startswith("https://upload.wikimedia.org/"):
        return None
    browser_ok = fi["mime"] in ("image/jpeg", "image/png", "image/gif", "image/webp")
    if w <= IMG_MAX and browser_ok:
        img, iw, ih = url, w, h
    elif w > IMG_STEP:
        img, iw, ih = thumb_url(url, IMG_STEP), IMG_STEP, round(h * IMG_STEP / w)
    else:
        return None
    thumb = thumb_url(url, THUMB_STEP) if w > THUMB_STEP else (url if browser_ok else None)
    if not thumb:
        return None
    return {"img": img, "thumb": thumb, "w": iw, "h": ih}


def license_ok(fi):
    return bool(ALLOWED_LICENSE.match(fi["license"] or ""))


def make_entry(fi, ref, title, author, year, collection, key):
    f = image_fields(fi)
    if not f or not license_ok(fi):
        return None
    return {"ref": ref, **f, "title": title, "author": author, "year": year, "license": fi["license"],
            "src": fi["page"], "collection": collection, "key": key}


def verse_ok(ref):
    b, c, v = ref.split(".")
    return synodal().exists(b, int(c), int(v))


def write_part(name, entries):
    entries = [e for e in entries if e and verse_ok(e["ref"])]
    PARTS.mkdir(parents=True, exist_ok=True)
    (PARTS / f"{name}.json").write_text(json.dumps(entries, ensure_ascii=False, indent=0), encoding="utf-8")
    log(f"  -> parts/{name}.json: {len(entries)} записей, {len({e['ref'] for e in entries})} стихов")
    return entries


# ---------------------------------------------------------------------------------------------
# Ссылки на стихи (английские названия книг, нумерация KJV)
# ---------------------------------------------------------------------------------------------

BOOK_NAMES = {
    "Gen": "Genesis|Gen|Gn", "Exod": "Exodus|Exod|Exo|Ex", "Lev": "Leviticus|Lev", "Num": "Numbers|Num|Nb",
    "Deut": "Deuteronomy|Deut|Dt|Deu", "Josh": "Joshua|Josh|Jos", "Judg": "Judges|Judg|Jdg|Jud",
    "Ruth": "Ruth", "Sam": "Samuel|Sam", "Kgs": "Kings|Kgs", "Chr": "Chronicles|Chron|Chr",
    "Ezra": "Ezra", "Neh": "Nehemiah|Neh", "Esth": "Esther|Esth|Est", "Job": "Job",
    "Ps": "Psalms|Psalm|Ps|Psa", "Prov": "Proverbs|Prov|Pro", "Eccl": "Ecclesiastes|Eccles|Eccl|Ecc",
    "Song": "Song of Solomon|Song of Songs|Song", "Isa": "Isaiah|Isa", "Jer": "Jeremiah|Jer",
    "Lam": "Lamentations|Lam", "Ezek": "Ezekiel|Ezek|Ez|Eze", "Dan": "Daniel|Dan", "Hos": "Hosea|Hos",
    "Joel": "Joel", "Amos": "Amos", "Obad": "Obadiah|Obad", "Jonah": "Jonah|Jon", "Mic": "Micah|Mic",
    "Nah": "Nahum|Nah", "Hab": "Habakkuk|Hab", "Zeph": "Zephaniah|Zeph", "Hag": "Haggai|Hag",
    "Zech": "Zechariah|Zech", "Mal": "Malachi|Mal", "Tob": "Tobit|Tobias|Tob", "Jdt": "Judith|Jdt",
    "Sir": "Ecclesiasticus|Sirach|Sir", "Macc": "Maccabees|Macc",
    "Matt": "Matthew|Matt|Mat|Mt", "Mark": "Mark|Mk", "Luke": "Luke|Lk", "John": "John|Jn",
    "Acts": "Acts", "Rom": "Romans|Rom", "Cor": "Corinthians|Cor", "Gal": "Galatians|Gal",
    "Eph": "Ephesians|Eph", "Phil": "Philippians|Phil", "Col": "Colossians|Col", "Thess": "Thessalonians|Thess",
    "Tim": "Timothy|Tim", "Titus": "Titus", "Phlm": "Philemon", "Heb": "Hebrews|Heb", "Jas": "James|Jas",
    "Pet": "Peter|Pet", "Jude": "Jude", "Rev": "Revelation|Revelations|Rev",
}
NUMBERED = {"Sam", "Kgs", "Chr", "Macc", "Cor", "Thess", "Tim", "Pet"}
NAME2BOOK = {n.lower(): b for b, names in BOOK_NAMES.items() for n in names.split("|")}
_NAMES_RE = "|".join(sorted((re.escape(n) for names in BOOK_NAMES.values() for n in names.split("|")),
                            key=len, reverse=True))
_PREFIX = {"1": 1, "i": 1, "first": 1, "2": 2, "ii": 2, "second": 2, "3": 3, "iii": 3, "third": 3}
REF_RE = re.compile(r"(?<![A-Za-z])(?:(1|2|3|I{1,3}|First|Second|Third)\s*)?(" + _NAMES_RE + r")\b\.?\s*"
                    r"(\d{1,3})(?:\s*[:.]\s*(\d{1,3}))?")


def _book(prefix, name):
    b = NAME2BOOK.get(name.lower())
    if not b:
        return None
    if b in NUMBERED:
        n = _PREFIX.get((prefix or "").lower())
        return f"{n}{b}" if n in (1, 2) else None
    if b == "John" and prefix:
        n = _PREFIX.get(prefix.lower())
        return f"{n}John" if n else None
    return b


def kjv_ref(book, c, v):
    """Ссылка KJV -> синодальная «Gen.1.3» (или None, если такого стиха нет)."""
    b, c2, v2 = kjv2syn(book, c, v)
    ref = f"{b}.{c2}.{v2}"
    return ref if verse_ok(ref) else None


def find_refs(text, allow_chapter=False):
    """Все ссылки в тексте -> [синодальная ссылка на первый стих]."""
    out = []
    for m in REF_RE.finditer(text or ""):
        b = _book(m.group(1), m.group(2))
        if not b:
            continue
        c = int(m.group(3))
        if m.group(4):
            v = int(m.group(4))
        elif allow_chapter:
            v = 1
        else:
            continue
        r = kjv_ref(b, c, v)
        if r:
            out.append(r)
    return out


def ru_label(fi):
    """Русская подпись из меток Викиданных в ObjectName/ImageDescription (label QS:Lru,"…")."""
    for raw in (fi["raw_name"], fi["raw_desc"]):
        m = re.search(r'label QS:Lru,\\"(.*?)\\"', raw)
        if m:
            return m.group(1)
    for d in (fi["name"], fi["desc"]):
        if d.get("ru"):
            return d["ru"]
    return None


def clean_title(s):
    s = re.sub(r"\s*\((?:\d\s?)?[A-Z][a-z]+\.?\s?\d.*?\)\s*$", "", s or "")       # «(Gen. 1:1-5)»
    s = re.sub(r"\s*\((?:\d\s?)?[А-ЯЁ][а-яё]+\.?\s?\d.*?\)\s*$", "", s)          # «(4 Цар. 6:18-30)»
    s = re.sub(r"\s*\(\d{6,}\)", "", s)                                         # «(89474805)»
    s = re.sub(r"\s+by Gustave Dor.*$", "", s)
    s = re.sub(r",?\s*\([^()]*\d+:\d+[^()]*\)", "", s)                           # «, (Mark 14:45)» внутри
    s = re.sub(r"\s+(?:[1-3] )?[A-Z][a-z]+\.? \d+:\d+.*$", "", s)                 # «… Judges 9:52-53»
    s = re.sub(r"^Gustave Dor[ée] - |\s*\(1[89]\d\d\)$", "", s)
    s = re.sub(r"^\d{3}[AB]?\.\s*", "", s)                                         # «001.»
    return s.strip(" .,\"'«»")


# ---------------------------------------------------------------------------------------------
# Гюстав Доре
# ---------------------------------------------------------------------------------------------

DORE_CATS = [("Category:Doré's English Bible", 1),
             ("Category:Art depicting the Old Testament by Gustave Doré", 0),
             ("Category:Art depicting the New Testament by Gustave Doré", 0),
             ("Category:Book of Revelation by Gustave Doré", 0),
             ("Category:The Holy Bible (Cassell, Petter & Galpin)", 0)]
# Исправления ошибочных ссылок в описаниях Commons (нумерация KJV): Валаам — Чис 22, а не 23;
# постройка храма — 3 Цар 5, а не 2 Цар 5
DORE_FIX = {"dore:043": ("Num", 22, 22), "dore:085": ("1Kgs", 5, 1)}


def build_dore():
    log("Доре")
    titles = []
    for cat, depth in DORE_CATS:
        titles += category_files(cat, depth)
    info = file_info(titles)
    out = []
    for t, fi in info.items():
        if not re.search(r"Dor[ée]", fi["artist"] + " " + t):
            continue
        if re.search(r"coloriz|crop|study for|retusche|\(unadjusted\)", t, re.I):
            continue
        en_name = fi["name"].get("en") or fi["name"].get("") or ""
        en_desc = fi["desc"].get("en") or fi["desc"].get("") or ""
        refs = find_refs(en_desc) or find_refs(en_name) or find_refs(t[5:].replace("-", ":") if re.search(
            r"Doré.*The Bible.*\d+-\d+", t) else "")
        if not refs:
            continue
        en = clean_title(re.sub(r"label QS.*$", "", en_desc if re.search(r"\(\D+\.? ?\d", en_desc) else en_name))
        ru = ru_label(fi)
        title = clean_title(ru) if ru else DORE_RU.get(en, en)
        m = re.match(r"File:\s*(\d{3}[AB]?)\.", t)
        key = "dore:" + (m.group(1) if m else re.sub(r"\W+", "-", en.lower()).strip("-"))
        if key in DORE_FIX:                          # ошибка в описании на Commons
            refs = [kjv_ref(*DORE_FIX[key])]
        out.append(make_entry(fi, refs[0], title, "Гюстав Доре", "1866", "Гюстав Доре", key))
    return write_part("dore", out)


# ---------------------------------------------------------------------------------------------
# Юлиус Шнорр фон Карольсфельд, «Die Bibel in Bildern» (1860)
# ---------------------------------------------------------------------------------------------

# номер листа: (синодальная ссылка, название по-русски). Пропущены 81 («Падение Самсона») и 234 («Павел в
# Ефесе») — у листов в издании не удалось прочитать ссылку.
SCHNORR = {
    1: ("Gen.1.1", "Первый день творения"), 2: ("Gen.1.6", "Второй день творения"),
    3: ("Gen.1.9", "Третий день творения"), 4: ("Gen.1.14", "Четвёртый день творения"),
    5: ("Gen.1.20", "Пятый день творения"), 6: ("Gen.1.26", "Шестой день творения"),
    7: ("Gen.2.2", "День седьмой"), 8: ("Gen.3.6", "Грехопадение"),
    9: ("Gen.3.8", "Адам и Ева скрываются от лица Господа"), 10: ("Gen.3.23", "Изгнание из рая"),
    11: ("Gen.3.19", "Адам и Ева после изгнания"), 12: ("Gen.4.4", "Жертвы Каина и Авеля"),
    13: ("Gen.4.8", "Братоубийство"), 14: ("Gen.4.16", "Каин уходит от лица Господня"),
    15: ("Gen.6.2", "Сыны Божии и дочери человеческие"), 16: ("Gen.6.13", "Возвещение потопа и постройка ковчега"),
    17: ("Gen.7.23", "Всемирный потоп"), 18: ("Gen.8.18", "Выход из ковчега"),
    19: ("Gen.8.20", "Жертва Ноя"), 20: ("Gen.9.24", "Ной проклинает Хама"),
    21: ("Gen.11.7", "Вавилонская башня и смешение языков"), 22: ("Gen.12.7", "Аврам видит обетованную землю"),
    23: ("Gen.14.18", "Мелхиседек благословляет Аврама"), 24: ("Gen.15.5", "Обетование Авраму: потомство как звёзды"),
    25: ("Gen.18.10", "Обетование о рождении сына"), 26: ("Gen.19.24", "Лот бежит из Содома"),
    27: ("Gen.21.14", "Изгнание Агари и Измаила"), 28: ("Gen.22.11", "Жертвоприношение Исаака"),
    29: ("Gen.24.17", "Слуга Авраама и Ревекка у колодца"), 30: ("Gen.24.64", "Ревекка видит Исаака"),
    31: ("Gen.27.28", "Исаак благословляет Иакова"), 32: ("Gen.28.12", "Лестница Иакова"),
    33: ("Gen.29.10", "Иаков и Рахиль у колодца"), 34: ("Gen.29.18", "Иаков сватается к Рахили"),
    35: ("Gen.31.17", "Бегство Иакова"), 36: ("Gen.32.24", "Иаков борется с Ангелом"),
    37: ("Gen.33.4", "Примирение Исава с Иаковом"), 38: ("Gen.37.28", "Братья продают Иосифа"),
    39: ("Gen.39.9", "Целомудрие Иосифа"), 40: ("Gen.41.29", "Иосиф толкует сны фараона"),
    41: ("Gen.41.41", "Возвышение Иосифа"), 42: ("Gen.45.2", "Иосиф открывается братьям"),
    43: ("Gen.46.29", "Иаков встречается с Иосифом в Египте"), 44: ("Exod.1.13", "Рабство израильтян в Египте"),
    45: ("Exod.2.5", "Находка Моисея"), 46: ("Exod.2.11", "Моисей заступается за соплеменника"),
    47: ("Exod.3.9", "Призвание Моисея"), 48: ("Exod.7.10", "Моисей и Аарон перед фараоном"),
    49: ("Exod.12.11", "Установление Пасхи"), 50: ("Exod.12.31", "Смерть первенцев и исход"),
    51: ("Exod.14.30", "Спасение Израиля и гибель египтян в море"), 52: ("Exod.16.4", "Манна и вода в пустыне"),
    53: ("Exod.17.11", "Моисей молится во время битвы с амаликитянами"), 54: ("Exod.31.18", "Моисей получает скрижали"),
    55: ("Exod.32.19", "Моисей разбивает скрижали"), 56: ("Exod.32.26", "Наказание за золотого тельца"),
    57: ("Exod.34.29", "Моисей приносит новые скрижали"), 58: ("Num.13.24", "Соглядатаи из земли Ханаанской"),
    59: ("Num.16.31", "Наказание Корея и его сообщников"), 60: ("Num.17.8", "Расцветший жезл Аарона"),
    61: ("Num.21.9", "Медный змей"), 62: ("Num.22.31", "Ангел Господень на пути Валаама"),
    63: ("Num.27.22", "Иисус Навин поставлен преемником Моисея"), 64: ("Deut.34.1", "Господь показывает Моисею обетованную землю"),
    65: ("Deut.34.5", "Смерть Моисея"), 66: ("Josh.2.15", "Раав спасает соглядатаев"),
    67: ("Josh.3.17", "Переход через Иордан"), 68: ("Josh.5.13", "Иисус Навин и Вождь воинства Господня"),
    69: ("Josh.6.20", "Падение Иерихона"), 70: ("Josh.8.18", "Взятие Гая"),
    71: ("Josh.10.12", "Чудесная победа над аморреями"), 72: ("Josh.10.23", "Пять царей в пещере Македской"),
    73: ("Josh.13.6", "Раздел обетованной земли"), 74: ("Judg.4.22", "Сисара гибнет от руки Иаили"),
    75: ("Judg.6.21", "Призвание Гедеона"), 76: ("Judg.7.19", "Победа Гедеона над мадианитянами"),
    77: ("Judg.9.52", "Гибель Авимелеха"), 78: ("Judg.11.35", "Иеффай и его дочь"),
    79: ("Judg.14.5", "Самсон убивает льва"), 80: ("Judg.15.16", "Самсон побивает филистимлян ослиной челюстью"),
    82: ("Judg.16.29", "Месть и смерть Самсона"), 83: ("Judg.21.23", "Колено Вениаминово восстанавливается"),
    84: ("Ruth.1.16", "Руфь идёт с Ноеминью в Вифлеем"), 85: ("Ruth.2.8", "Руфь на поле Вооза"),
    86: ("1Sam.1.11", "Молитва Анны"), 87: ("1Sam.3.11", "Господь говорит отроку Самуилу"),
    88: ("1Sam.4.17", "Смерть Илия"), 89: ("1Sam.10.1", "Самуил помазывает Саула"),
    90: ("1Sam.15.27", "Господь отвергает Саула"), 91: ("1Sam.16.11", "Помазание Давида"),
    92: ("1Sam.17.50", "Давид побеждает Голиафа"), 93: ("1Sam.19.9", "Саул хочет убить Давида"),
    94: ("1Sam.20.42", "Дружба Ионафана и Давида"), 95: ("1Sam.24.5", "Давид щадит Саула в пещере"),
    96: ("1Sam.25.32", "Давид и Авигея"), 97: ("1Sam.28.16", "Саул у волшебницы в Аэндоре"),
    98: ("1Sam.31.4", "Смерть Саула"), 99: ("2Sam.2.4", "Давид — царь над Иудой"),
    100: ("2Sam.6.16", "Мелхола презирает Давида"), 101: ("2Sam.11.2", "Давид видит Вирсавию"),
    102: ("2Sam.12.7", "Обличение Нафана"), 103: ("2Sam.12.18", "Смерть младенца Давида и Вирсавии"),
    104: ("2Sam.16.5", "Семей злословит Давида"), 105: ("2Sam.18.9", "Гибель Авессалома"),
    106: ("2Sam.23.16", "Давид и его храбрецы"), 107: ("2Sam.24.17", "Наказание за перепись народа"),
    108: ("1Kgs.1.39", "Помазание Соломона на царство"), 109: ("1Kgs.3.26", "Суд Соломона"),
    110: ("1Kgs.6.11", "Соломон строит храм"), 111: ("1Kgs.10.6", "Царица Савская у Соломона"),
    112: ("1Kgs.11.4", "Идолопоклонство Соломона"), 113: ("1Kgs.12.16", "Разделение царства"),
    114: ("1Kgs.17.6", "Вороны питают Илию"), 115: ("1Kgs.17.21", "Илия воскрешает сына вдовы"),
    116: ("1Kgs.18.39", "Илия и пророки Ваала"), 117: ("1Kgs.19.11", "Господь является Илии на Хориве"),
    118: ("1Kgs.22.34", "Гибель Ахава"), 119: ("2Kgs.2.11", "Вознесение Илии"),
    120: ("2Kgs.4.36", "Елисей воскрешает сына сонамитянки"), 121: ("2Kgs.9.33", "Гибель Иезавели"),
    122: ("2Kgs.19.32", "Сокрушение силы Сеннахирима"), 123: ("2Kgs.22.11", "Иосия слушает слова книги закона"),
    124: ("2Kgs.25.10", "Разрушение Иерусалима и вавилонский плен"), 125: ("Ezra.1.5", "Возвращение из плена"),
    126: ("Ezra.3.10", "Основание нового храма"), 127: ("Neh.4.16", "Восстановление стен Иерусалима"),
    128: ("Neh.9.1", "Покаяние народа"), 129: ("Esth.2.17", "Есфирь избрана царицей"),
    130: ("Esth.6.11", "Возвеличение Мардохея"), 131: ("Job.1.20", "Терпение Иова"),
    132: ("Job.2.11", "Иов и его друзья"), 133: ("Job.42.12", "Новое благополучие Иова"),
    134: ("Ps.42.3", "Давид-псалмопевец: поклонение"), 135: ("Ps.50.3", "Давид-псалмопевец: покаяние"),
    136: ("Ps.50.12", "Давид-псалмопевец: молитва"), 137: ("Ps.102.1", "Давид-псалмопевец: хвала и благодарение"),
    138: ("Song.2.3", "Невеста под сенью возлюбленного"), 139: ("Isa.9.6", "Пророк Исаия"),
    140: ("Jer.1.17", "Пророк Иеремия"), 141: ("Lam.1.1", "Плач Иеремии"),
    142: ("Ezek.1.28", "Пророк Иезекииль"), 143: ("Dan.5.25", "Пророк Даниил"),
    144: ("Jdt.13.8", "Иудифь обезглавливает Олоферна"), 145: ("Jdt.13.11", "Иудифь возвращается к своему народу"),
    146: ("Tob.8.4", "Молитва Товии и Сарры"), 147: ("Tob.8.13", "Товию и Сарру находят невредимыми"),
    148: ("Sir.1.1", "Хвала премудрости и страху Божию"), 149: ("Sir.30.1", "О добром воспитании детей"),
    150: ("1Macc.1.62", "Антиох преследует верных израильтян"), 151: ("1Macc.2.28", "Маттафия бежит с сыновьями в горы"),
    152: ("1Macc.4.36", "Иуда Маккавей очищает храм"), 153: ("1Macc.14.35", "Симон избран правителем и первосвященником"),
    154: ("2Macc.3.25", "Сокровища храма спасены от Илиодора"), 155: ("2Macc.7.22", "Мученичество семи братьев и их матери"),
    156: ("2Macc.11.8", "Ангел ведёт Израиль против врага"), 157: ("2Macc.15.15", "Видение Иуды Маккавея"),
    158: ("Dan.13.19", "Сусанна и старцы"), 159: ("Dan.13.62", "Даниил спасает Сусанну"),
    160: ("Dan.14.35", "Даниил во рву со львами и Аввакум"),
    161: ("Luke.1.12", "Ангел Гавриил возвещает Захарии"), 162: ("Luke.1.35", "Благовещение"),
    163: ("Luke.1.41", "Мария у Елисаветы"), 164: ("Luke.1.62", "Рождение Иоанна"),
    165: ("Luke.2.10", "Ангел возвещает пастухам"), 166: ("Luke.2.11", "Рождество Христово"),
    167: ("Luke.2.17", "Пастухи — первые благовестники"), 168: ("Luke.2.27", "Сретение"),
    169: ("Matt.2.10", "Поклонение волхвов"), 170: ("Matt.2.13", "Повеление бежать в Египет"),
    171: ("Matt.2.14", "Бегство в Египет"), 172: ("Matt.2.16", "Избиение младенцев"),
    173: ("Luke.2.46", "Двенадцатилетний Иисус в храме"), 174: ("Matt.3.2", "Иоанн проповедует в пустыне"),
    175: ("Mark.1.9", "Крещение Господне"), 176: ("Matt.4.10", "Искушение Христа"),
    177: ("John.1.29", "Свидетельство Иоанна о Христе"), 178: ("John.1.51", "Первые ученики"),
    179: ("John.2.7", "Брак в Кане Галилейской"), 180: ("John.2.15", "Изгнание торгующих из храма"),
    181: ("John.3.2", "Беседа с Никодимом"), 182: ("John.4.25", "Иисус и самарянка"),
    183: ("Luke.5.19", "Исцеление расслабленного"), 184: ("Mark.5.41", "Воскрешение дочери Иаира"),
    185: ("Matt.9.27", "Двое слепых просят о помощи"), 186: ("Matt.5.1", "Нагорная проповедь"),
    187: ("Mark.6.27", "Усекновение главы Иоанна Крестителя"), 188: ("Luke.7.14", "Воскрешение сына вдовы в Наине"),
    189: ("Luke.7.47", "Иисус и грешница"), 190: ("Matt.8.24", "Иисус спит во время бури"),
    191: ("Matt.12.22", "Иисус изгоняет беса"), 192: ("Matt.10.5", "Послание двенадцати апостолов"),
    193: ("John.6.10", "Чудесное насыщение народа"), 194: ("Matt.14.30", "Иисус спасает тонущего Петра"),
    195: ("Luke.9.29", "Преображение"), 196: ("Luke.10.41", "Иисус в доме Марфы"),
    197: ("Luke.10.33", "Притча о милосердном самарянине"), 198: ("Luke.15.20", "Притча о блудном сыне"),
    199: ("Luke.16.19", "Притча о богаче и Лазаре"), 200: ("Luke.18.11", "Притча о мытаре и фарисее"),
    201: ("John.8.4", "Грешница перед Христом"), 202: ("John.11.43", "Воскрешение Лазаря"),
    203: ("Mark.10.14", "Иисус благословляет детей"), 204: ("Matt.26.10", "Помазание в Вифании"),
    205: ("Matt.21.8", "Вход Господень в Иерусалим"), 206: ("John.13.5", "Омовение ног"),
    207: ("Matt.26.26", "Тайная вечеря"), 208: ("Matt.26.38", "Моление о чаше"),
    209: ("Matt.26.48", "Взятие Христа под стражу"), 210: ("Matt.26.65", "Иисус перед Каиафой"),
    211: ("Luke.22.60", "Отречение Петра"), 212: ("Mark.15.16", "Поругание Христа"),
    213: ("John.19.14", "Народ требует распять Иисуса"), 214: ("Matt.27.3", "Конец Иуды"),
    215: ("Luke.23.27", "Несение креста"), 216: ("John.19.30", "Смерть Иисуса на кресте"),
    217: ("John.19.41", "Положение во гроб"), 218: ("Matt.28.2", "Воскресение Христово"),
    219: ("Mark.16.5", "Жёны-мироносицы у гроба"), 220: ("John.20.11", "Мария Магдалина ищет Господа"),
    221: ("John.20.16", "Воскресший является Марии Магдалине"), 222: ("Luke.24.28", "Путь в Эммаус"),
    223: ("John.20.26", "Явление ученикам и Фоме"), 224: ("John.21.7", "Явление у моря Тивериадского"),
    225: ("Luke.24.50", "Вознесение"), 226: ("Acts.2.2", "Сошествие Святого Духа"),
    227: ("Acts.3.6", "Исцеление хромого"), 228: ("Acts.7.57", "Побиение Стефана камнями"),
    229: ("Acts.8.35", "Крещение евнуха"), 230: ("Acts.9.3", "Обращение Савла"),
    231: ("Acts.10.19", "Что Бог очистил, того не почитай нечистым"), 232: ("Acts.14.14", "Павел и Варнава в Листре"),
    233: ("Acts.17.22", "Павел в Афинах"), 235: ("Acts.28.14", "Павел прибывает в Рим"),
    236: ("Rev.1.12", "Видение Иоанна на Патмосе"), 237: ("Rev.6.1", "Агнец снимает печати"),
    238: ("Rev.8.1", "Снятие седьмой печати"), 239: ("Rev.12.9", "Победа Михаила над драконом"),
    240: ("Rev.21.1", "Новый Иерусалим"),
}
# Другие копии тех же листов на Commons (лучшего разрешения): файл -> номер листа
SCHNORR_ALIASES = {
    "File:Jesu Seelenkampf in Gethsemane.jpg": 208,
    "File:Jesus entry into Jerusalem.jpg": 205,
    "File:Opening of the first seal by the Lamb, Revelation.png": 237,
    "File:Eroffnung-des-durch-das-lamm-das-buch-mit-sieben-siegeln.jpg": 238,
}


def build_schnorr():
    log("Шнорр фон Карольсфельд")
    titles = category_files("Category:Die Bibel in Bildern by Julius Schnorr von Carolsfeld", 1)
    info = file_info(titles + list(SCHNORR_ALIASES))
    best = {}
    for t, fi in info.items():
        m = re.match(r"File:Schnorr von Carolsfeld Bibel in Bildern 1860 (\d{3})\.png$", t)
        n = int(m.group(1)) if m else SCHNORR_ALIASES.get(t)
        if n not in SCHNORR or not license_ok(fi):
            continue
        if n not in best or fi["w"] > best[n]["w"]:
            best[n] = fi
    out = []
    for n, fi in sorted(best.items()):
        ref, title = SCHNORR[n]
        out.append(make_entry(fi, ref, title, "Юлиус Шнорр фон Карольсфельд", "1860",
                              "Юлиус Шнорр фон Карольсфельд", f"schnorr:{n:03d}"))
    return write_part("schnorr", out)


# ---------------------------------------------------------------------------------------------
# Providence Lithograph Company — библейские карточки
# ---------------------------------------------------------------------------------------------

def build_providence():
    log("Providence Lithograph")
    titles = category_files("Category:Bible cards", 1) + search_files('"Providence Lithograph"')
    info = file_info([t for t in titles if re.search(r"\.(jpe?g|png|tiff?)$", t, re.I)])
    out = []
    for t, fi in info.items():
        if "providence" not in (fi["artist"] + " ".join(fi["desc"].values())).lower():
            continue
        desc = fi["desc"].get("en") or fi["desc"].get("") or ""
        m = re.search(r"\bas in (.+?)(?:[;,] illustration|$)", desc)
        refs = find_refs(m.group(1)) if m else find_refs(desc)
        precision = "verse"
        if not refs and m:                      # «as in Psalm 32» — вся глава
            refs, precision = find_refs(m.group(1), allow_chapter=True), "chapter"
        if not refs:
            continue
        en = (fi["name"].get("en") or fi["name"].get("") or t[5:].rsplit(".", 1)[0])
        if re.search(r"\b(crop|cropped|detail)\b", en + t, re.I):     # обрезанные копии тех же карточек
            continue
        en = re.sub(r"\s*\((Bible [Cc]ard|Sunrays)\)\s*$", "", en).strip(" .")
        year = (re.search(r"1[89]\d\d", fi["date"] or desc) or [None])[0]
        e = make_entry(fi, refs[0], PROVIDENCE_RU.get(en, en), "Providence Lithograph Company", year,
                       "Providence Lithograph Company", "providence:" + re.sub(r"\W+", "-", en.lower()))
        if e:
            e["precision"] = precision
            out.append(e)
    return write_part("providence", out)


# ---------------------------------------------------------------------------------------------
# Джеймс Тиссо
# ---------------------------------------------------------------------------------------------

IA = "https://archive.org/download/{0}/{0}_djvu.txt"
TISSOT_NT_BOOKS = ["lifeofoursaviour01tiss", "lifeofoursaviour02tiss", "lifeofoursaviour03tiss",
                   "lifeofoursaviour04tiss"]
TISSOT_OT_BOOKS = ["oldtestamentthre0001unse", "oldtestamentthre0002unse"]
ROMAN = {"i": 1, "v": 5, "x": 10, "l": 50, "c": 100}


def roman(s):
    s = s.lower()
    if not re.fullmatch(r"c?x{0,4}(ix|iv|v?i{0,3})|c?x?l?x{0,3}(ix|iv|v?i{0,3})", s):
        return None
    total, prev = 0, 0
    for ch in reversed(s):
        v = ROMAN[ch]
        total = total - v if v < prev else total + v
        prev = max(prev, v)
    return total or None


def norm_title(s):
    s = html.unescape(s or "").lower().replace("’", "'")
    s = re.sub(r"\(.*?\)", " ", s)                       # французское название в скобках
    s = re.sub(r"\b(the|a|an|of|and|his|her|their|to|in|by|at|is|are|our|lord)\b", " ", s)
    s = re.sub(r"(eth|est)\b", "", s)                    # «leadeth» ~ «lead»
    s = re.sub(r"s\b", "", s)
    return re.sub(r"[^a-z]+", "", s)


_KJV = None


def kjv_text():
    """KJV из модуля приложения (уже в синодальной нумерации): {(книга, глава): [текст стихов]}."""
    global _KJV
    if _KJV is None:
        m = json.loads((MODULES / "kjv.json").read_text(encoding="utf-8"))
        _KJV = {}
        for b in m["books"]:
            for ci, ch in enumerate(b["chapters"]):
                _KJV[(b["id"], ci + 1)] = [re.sub(r"\{([^|}]*)\|[^}]*\}", r"\1", x or "") for x in ch]
    return _KJV


def _words(s):
    return re.sub(r"[^a-z ]+", " ", s.lower().replace("-\n", "").replace("\n", " ")).split()


STOP = set("jesus christ lord saint with from unto them they there which that this said first second third "
           "into upon over before after their when where what were have shall will your about again".split())


def first_verse_by_text(book, chapter, text, title=""):
    """Стих, к которому относится картина: отрывок книги Тиссо сравнивается с текстом KJV главы (4-граммы слов).
    Из найденных стихов берётся первый, где есть слово из названия картины (отрывок у Тиссо бывает длиннее
    сюжета), иначе — первый стих отрывка. -> «Matt.14.25» или None."""
    verses = kjv_text().get((book, chapter))
    if not verses:
        return None
    w = _words(text)
    grams = {" ".join(w[i:i + 4]) for i in range(len(w) - 3)}
    found = []
    for vi, vt in enumerate(verses):
        vw = _words(vt)
        vg = [" ".join(vw[i:i + 4]) for i in range(len(vw) - 3)]
        if len(vg) >= 2 and sum(g in grams for g in vg) >= max(2, len(vg) * 0.4):
            found.append(vi)
    if not found:
        return None
    stems = {x[:5] for x in _words(title) if len(x) >= 4 and x not in STOP}
    for vi in found:
        if stems & {x[:5] for x in _words(verses[vi])}:
            return f"{book}.{chapter}.{vi + 1}"
    return f"{book}.{chapter}.{found[0] + 1}"


GOSPEL = {"matthew": "Matt", "mark": "Mark", "luke": "Luke", "john": "John"}


def tissot_nt_captions():
    """[(место в книге, название картины, синодальная ссылка)] из книги «The Life of Our Saviour Jesus Christ»."""
    out = []
    for vol, ident in enumerate(TISSOT_NT_BOOKS):
        lines = cached_text(IA.format(ident), ident + ".txt").splitlines()
        heads = []
        for i, l in enumerate(lines):
            m = re.match(r"^\s*Saint\s+(Matthew|Mark|Luke|John)\s*[—\-–]+\s*Chap\.?\s*([0-9iIlO]{1,3})\b", l)
            if not m:
                continue
            ch = int(m.group(2).replace("i", "1").replace("I", "1").replace("l", "1").replace("O", "0"))
            title = ""
            for j in range(i - 1, max(i - 6, 0), -1):       # название — ближайшая непустая строка выше
                if lines[j].strip():
                    title = lines[j].strip()
                    break
            heads.append((i, title, GOSPEL[m.group(1).lower()], ch))
        for k, (i, title, book, ch) in enumerate(heads):
            end = heads[k + 1][0] if k + 1 < len(heads) else min(len(lines), i + 400)
            ref = first_verse_by_text(book, ch, "\n".join(lines[i + 1:end]), title)
            if ref and title and not re.search(r"\d", title):
                out.append((vol * 1_000_000 + i, re.sub(r"\s+", " ", title).strip(" ."), ref))
    return out


def tissot_ot_captions():
    """[(название, синодальная ссылка)] из подписей «REBECCA MEETS ISAAC BY THE WAY. Gen. xxiv. 65.»."""
    pat = re.compile(r"^([A-Z][A-Z'’,;:!?\-. ]{3,}?)\.\s*((?:[1-4I]{1,3}\.?\s*)?[A-Z][a-z]+)\.?\s+([ivxlcIVXL]+)\.?"
                     r"\s*,?\s*(\d+)")
    out = []
    for ident in TISSOT_OT_BOOKS:
        for l in cached_text(IA.format(ident), ident + ".txt").splitlines():
            m = pat.match(l.strip())
            if not m:
                continue
            bm = re.match(r"^(?:([1-4]|I{1,3})\.?\s*)?([A-Za-z]+)$", m.group(2))
            b = _book(bm.group(1), bm.group(2)) if bm else None
            c = roman(m.group(3))
            if not b or not c:
                continue
            ref = kjv_ref(b, c, int(m.group(4)))
            if ref:
                out.append((m.group(1).strip().title(), ref))
    return out


def tissot_accessions(titles):
    """Инвентарный номер Бруклинского музея (00.159.N) из викитекста файла -> {файл: N}.
    Серия «Жизнь Христа» куплена целиком и пронумерована по порядку книги Тиссо."""
    out = {}
    for i in range(0, len(titles), 50):
        d = api({"action": "query", "titles": "|".join(titles[i:i + 50]), "prop": "revisions",
                 "rvprop": "content", "rvslots": "main"})
        for p in d["query"].get("pages", []):
            c = (p.get("revisions") or [{}])[0].get("slots", {}).get("main", {}).get("content", "")
            m = re.search(r"\|\s*ID\s*=\s*00\.159\.(\d+)\s*$", c, re.M)
            if m:
                out[p["title"]] = int(m.group(1))
    return out


STEM_STOP = STOP | set("the and his him her for was who are thee thy our".split())


def stems(s):
    return {w[:4] for w in _words(s) if len(w) >= 3 and w not in STEM_STOP}


def similar(a, b):
    sa, sb = stems(a), stems(b)
    return 2 * len(sa & sb) / (len(sa) + len(sb)) if sa and sb else 0


def tissot_title(fi, t):
    en = fi["name"].get("en") or fi["name"].get("") or ""
    if not en or re.search(r"File:|\.jpe?g", en):
        en = re.sub(r"^(Brooklyn Museum - |James Jacques Joseph Tissot - |Tissot |James Tissot - )", "",
                    t[5:].rsplit(".", 1)[0])
        en = re.sub(r" - (James Tissot|Google Art Project).*$", "", en)
    en = re.sub(r"^(Tissot|James Tissot)\s+", "", en)
    return re.sub(r"\s+", " ", re.sub(r"\s*\(.*?\)\s*", " ", en)).strip(" .")


def spaced_refs(text):
    """«(Joshua 8 19)», «(1 Kings 3 27)» — ссылка без двоеточия в скобках."""
    out = []
    for m in re.finditer(r"\((?:(1|2|3|I{1,3})\s)?([A-Z][a-z]+(?: of Solomon)?) (\d{1,3}) (\d{1,3})", text or ""):
        b = _book(m.group(1), m.group(2))
        r = kjv_ref(b, int(m.group(3)), int(m.group(4))) if b else None
        if r:
            out.append(r)
    return out


def build_tissot():
    log("Тиссо")
    nt_titles = category_files("Category:The Life of Jesus Christ by James Tissot", 1)
    ot_titles = category_files("Category:Old Testament by James Tissot", 1)
    info = file_info(nt_titles + ot_titles)
    nt_caps = tissot_nt_captions()
    ot_caps = tissot_ot_captions()
    log(f"  подписи из книг: НЗ {len(nt_caps)}, ВЗ {len(ot_caps)}")
    found = {}     # файл -> (ссылка, название, как найдено)

    def usable(t):
        fi = info.get(t)
        return (fi and "tissot" in (fi["artist"] + t).lower() and license_ok(fi)
                and not re.search(r"crop|detail|\bverso\b|sketch|Medhurst", t, re.I))   # Medhurst — своя часть

    # 1) ссылка прямо в описании файла
    for t in nt_titles + ot_titles:
        if usable(t):
            d = " ".join(info[t]["desc"].values())
            refs = find_refs(d) or spaced_refs(d)
            if refs:
                found[t] = (refs[0], tissot_title(info[t], t), "описание")

    # 2) Новый Завет: название из книги + порядок книги (инвентарные номера Бруклина идут по книге)
    acc = tissot_accessions([t for t in nt_titles if usable(t)])
    by_norm = defaultdict(list)
    for pos, title, ref in nt_caps:
        by_norm[norm_title(title)].append((pos, title, ref))
    anchors = []
    for t, n in acc.items():
        k = norm_title(tissot_title(info[t], t))
        if len(by_norm.get(k, [])) == 1:
            anchors.append((n, by_norm[k][0][0], t))
    anchors.sort()
    # оставляем согласованные якоря: самая длинная возрастающая по месту в книге цепочка
    best = []
    for a in anchors:
        chains = [c for c in best if c[-1][1] < a[1]]
        best.append(max(chains, key=len) + [a] if chains else [a])
    chain = max(best, key=len) if best else []
    log(f"  Тиссо НЗ: якорей по названию {len(anchors)}, согласованных {len(chain)}")
    cap_by_pos = {pos: (title, ref) for pos, title, ref in nt_caps}
    used_pos = set()
    for n, pos, t in chain:
        title, ref = cap_by_pos[pos]
        found.setdefault(t, (ref, tissot_title(info[t], t), "название"))
        used_pos.add(pos)
    for t, n in sorted(acc.items(), key=lambda x: x[1]):
        if t in found:
            continue
        lo = max([c for c in chain if c[0] < n], default=None)
        hi = min([c for c in chain if c[0] > n], default=None)
        if not lo or not hi or hi[0] - lo[0] > 12:
            continue
        cands = [(similar(tissot_title(info[t], t), title), pos, title, ref) for pos, title, ref in nt_caps
                 if lo[1] < pos < hi[1] and pos not in used_pos]
        cands.sort(reverse=True)
        if cands and cands[0][0] >= 0.5 and (len(cands) == 1 or cands[0][0] - cands[1][0] >= 0.15):
            sim, pos, title, ref = cands[0]
            found[t] = (ref, tissot_title(info[t], t), "порядок")
            used_pos.add(pos)
            if "--debug" in sys.argv:
                log(f"    порядок: {tissot_title(info[t], t)!r} ~ {title!r} -> {ref}")

    # 3) Ветхий Завет: подписи книги 1904 г. по точному/близкому названию
    index = defaultdict(list)
    for title, ref in ot_caps:
        index[norm_title(title)].append(ref)
    keys = list(index)
    for t in ot_titles:
        if t in found or not usable(t):
            continue
        k = norm_title(tissot_title(info[t], t))
        refs = index.get(k) or []
        if not refs and len(k) >= 12:
            close = difflib.get_close_matches(k, keys, n=1, cutoff=0.92)
            refs = index[close[0]] if close else []
        if refs and len(set(refs)) == 1:
            found[t] = (refs[0], tissot_title(info[t], t), "название")

    log("  Тиссо: как найдена привязка:", dict(Counter(v[2] for v in found.values())))
    out, used = [], set()
    for t, (ref, title, how) in found.items():
        key = "tissot:" + norm_title(title)
        if key in used:
            continue
        used.add(key)
        year = "1886–1894" if t in nt_titles else "1896–1902"
        out.append(make_entry(info[t], ref, TISSOT_RU.get(title, title), "Джеймс Тиссо", year, "Джеймс Тиссо",
                              key))
    return write_part("tissot", out)


# ---------------------------------------------------------------------------------------------
# Прочие собрания со ссылкой «as in Genesis 5:24» в описании: «Figures de la Bible» (Герард Хут, 1728,
# Bizzell Bible Collection), Библия Холмана (1890), «The Bible and Its Story» (1908), «Treasures of the Bible»
# (Нортроп, 1894) и другие файлы участника Commons Dauster, который иллюстрировал статьи о недельных
# главах Торы и подписывал у каждой картинки место Писания
# ---------------------------------------------------------------------------------------------

OTHER_CATS = ["Category:Figures de la Bible (1728, A.147/G.XVIII/IV-1)", "Category:Figures de la Bible. (1728)",
              "Category:Holman Bible (1890 ed.)", "Category:The Bible and Its Story Taught by One Thousand Picture Lessons"]
OTHER_USERS = ["Dauster"]
# (признак в авторе/описании/названии файла, собрание, автор по-русски, год)
OTHER_SOURCES = [
    (r"Figures de la Bible|Gerard Hoet", "Figures de la Bible (1728)", "Герард Хут и др.", "1728"),
    (r"Holman Bible", "Библия Холмана (1890)", "Иллюстраторы Библии Холмана", "1890"),
    (r"Bible and Its Story|Picture Lessons", "The Bible and Its Story (1908)", None, "1908"),
    (r"Treasures of the Bible|Northrop", "Treasures of the Bible (1894)", "Иллюстраторы «Treasures of the Bible» Нортропа",
     "1894"),
    (r"Providence Lithograph|Bible card", "Providence Lithograph Company", "Providence Lithograph Company", None),
    (r"Sunrays", "Sunrays", "Издатели журнала «Sunrays»", None),
    (r"Tissot", "Джеймс Тиссо", "Джеймс Тиссо", None),
    (r"Foster", "Charles Foster", None, "1897"),
    (r"Dor[ée]", "Гюстав Доре", "Гюстав Доре", "1866"),
]


def chapter_ref(text):
    """«as in Leviticus 16» (вся глава) -> синодальная ссылка на её первый стих."""
    m = re.search(r"\bas in ((?:1|2|3|I{1,3}) )?([A-Z][a-z]+(?: of Solomon)?) (\d{1,3})(?![:\d])", text or "")
    if not m:
        return None
    b = _book(m.group(1) and m.group(1).strip(), m.group(2))
    return kjv_ref(b, int(m.group(3)), 1) if b else None


def build_other():
    log("Прочие собрания (Figures de la Bible, Холман и др.)")
    titles = []
    for u in OTHER_USERS:
        for d in api_all({"action": "query", "list": "allimages", "aiuser": u, "aisort": "timestamp",
                          "ailimit": "500", "aiprop": "timestamp"}, "user-" + u):
            titles += [p["title"] for p in d["query"]["allimages"]]
    for c in OTHER_CATS:
        titles += category_files(c, 1)
    info = file_info([t for t in titles if re.search(r"\.(jpe?g|png|gif|tiff?)$", t, re.I)])
    out = []
    for t, fi in info.items():
        if re.search(r"\b(crop|cropped|detail)\b|Medhurst", t, re.I):
            continue
        desc = fi["desc"].get("en") or fi["desc"].get("") or ""
        refs = find_refs(desc)
        precision = "verse"
        if not refs:
            r = chapter_ref(desc)
            refs, precision = ([r], "chapter") if r else ([], None)
        if not refs:
            continue
        hay = " ".join([fi["artist"], desc, t])
        coll, author, year = "Иллюстрированные Библии", None, None
        for pat, c, a, y in OTHER_SOURCES:
            if re.search(pat, hay, re.I):
                coll, author, year = c, a, y
                break
        if coll == "Providence Lithograph Company":      # карточки — в своей части (providence.json)
            continue
        if not author:
            author = re.sub(r"^(the )?(publishers|illustrators?) of ", "", fi["artist"], flags=re.I).strip() or "?"
        year = year or (re.search(r"\b1[4-9]\d\d\b", desc) or [None])[0]
        title = re.split(r"[;,]\s*(?:as in|illustration|Bible card|from|by)\b|;\s*(?:[1-3] )?[A-Z][a-z]+ \d", desc)[0]
        title = clean_title(re.sub(r"\s+", " ", title)).strip(" .:;")
        title = re.sub(r"[,;]?\s*\b(as (described )?in|described in|watercolor by)\b.*$", "", title).strip(" .:;,")
        title = re.sub(r"\s*\((left|right) (plate|page)\)$", "", title).strip("“”\" ")
        if not title or len(title) > 120 or title in ("Depiction of",):
            title = clean_title(fi["name"].get("en") or t[5:].rsplit(".", 1)[0])
        title = re.sub(r"^(Figures|Holman|Barnards|Northrop|Kitto)\s+(\d{3}\s+)?", "", title)
        e = make_entry(fi, refs[0], OTHER_RU.get(title, title), author, year, coll,
                       "other:" + re.sub(r"\W+", "-", title.lower())[:60])
        if e:
            e["precision"] = precision
            out.append(e)
    return write_part("other", out)


def main():
    stats = {}
    for name, fn in (("schnorr", build_schnorr), ("dore", build_dore), ("providence", build_providence),
                     ("tissot", build_tissot), ("other", build_other)):
        stats[name] = len(fn())
    log("Итого:", stats)


if __name__ == "__main__":
    main()
