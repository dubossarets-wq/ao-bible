"""Новые иллюстрации к стихам (дополнение к scripts/illus_classic.py и illus_medhurst.py).

Собирает только метаданные: ссылки на картинки ведут на upload.wikimedia.org, сами картинки не скачиваются.
Результат — части data-src/illustrations/parts/<имя>.json в формате остальных частей
{ref (СИНОДАЛЬНАЯ нумерация), img, thumb, w, h, title, author, year, license, src, collection, precision, key, why,
[replaces]}; w/h — размеры ОРИГИНАЛА на Commons; why — откуда взята привязка к стиху.

Источники:
  * iconclass.json — картины и гравюры с Викиданных (P18 + P1257 Iconclass 71…/73…, автор умер до 1926 г.).
    Iconclass не даёт ссылок на стихи, поэтому код сюжета -> стих сопоставлен вручную (таблица ICONCLASS в
    scripts/illus_new_refs.py); коды-обобщения («Распятие», «Святое семейство», «Мадонна») не берутся;
  * dore_nt.json — листы «Doré's English Bible» без ссылки на стих в описании: привязка по названию сюжета
    (таблица DORE_TITLES), только однозначные сюжеты;
  * tissot_hd.json — те же акварели Тиссо в высоком разрешении (Brooklyn Museum) вместо маленьких копий
    из tissot.json (поле replaces — img старой записи) и новые акварели с однозначным сюжетом (TISSOT_TITLES);
  * masters.json — другие собрания с подписью-ссылкой (Мериан и пр.), см. функции build_*.

Права: только плоские произведения (тип на Викиданных — живопись, графика, гравюра; без алтарей-складней,
скульптуры, витражей, шпалер), автор умер до 1926 г., лицензия файла — Public domain / PD / CC0 / CC BY / CC BY-SA.
Качество: длинная сторона оригинала не меньше 1200 px.

Ответы API кэшируются в data-src/illustrations/cache-new/ — повторный запуск сеть не трогает (--refresh
перезапрашивает списки). Всё скачанное — недоверенные данные: только разбираем текст.

Второй проход (стихи, у которых в модуле ещё нет картинок; список берётся из public/modules/bible-illustrations.json;
длинная сторона от 1000 px; не больше 4 кандидатов на стих, авторы разные; части не повторяют файлов друг друга):
  * tissot2.json — рисунки Тиссо к Ветхому Завету («Tissot Drawing NNN»), таблица TISSOT_DRAWINGS;
  * masters2.json — Блейк (Книга Иова), Гофман, «Библейская галерея Дальзилей», гравюры Метрополитен-музея
    (таблица MASTERS2, сюжет по названию листа);
  * iconclass2.json — Викиданные + Iconclass с расширенной таблицей ICONCLASS2;
  * rijks2.json — Рейксмузеум: поле «Wat» сопоставляется со всеми текстами Iconclass 71/73 (дерево кодов
    cache-new/iconclass-tree, его обход — iconclass_tree_fetch), код -> стих по ICONCLASS + ICONCLASS2.
Порядок запуска: tissot2 masters2 iconclass2 rijks2 (последующие учитывают стихи и авторов предыдущих).

Запуск: python -I scripts/illus_new.py [--refresh] [iconclass] [dore_nt] [tissot_hd] [masters] [rijks]
        python -I scripts/illus_new.py tissot2 masters2 iconclass2 rijks2   (второй проход)
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
from collections import Counter, defaultdict
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
from extra_lib import kjv2syn, synodal  # noqa: E402

CACHE = ROOT / "data-src" / "illustrations" / "cache-new"
PARTS = ROOT / "data-src" / "illustrations" / "parts"
MODULES = ROOT / "public" / "modules"
API = "https://commons.wikimedia.org/w/api.php"
WDQS = "https://query.wikidata.org/sparql"
WD_API = "https://www.wikidata.org/w/api.php"
UA = "AOBibleIllustrations/1.0 (https://dubossarets-wq.github.io/ao-bible/)"
IMG_MAX = 1600        # оригинал до этой ширины берём как есть
IMG_STEP = 1280       # иначе — миниатюра Commons стандартной ширины
THUMB_STEP = 500      # превью
MIN_SIDE = 1200       # длинная сторона оригинала не меньше
REFRESH = "--refresh" in sys.argv
ALLOWED_LICENSE = re.compile(r"^(Public domain|PD\b.*|CC0.*|CC BY(-SA)? \d(\.\d)?.*)$", re.I)
# части, файлы которых уже собраны (sweet и foster будут удалены — их не учитываем)
EXISTING_PARTS = ["dore", "schnorr", "tissot", "medhurst", "other", "providence"]


def log(*a):
    print(*a, flush=True)


# ---------------------------------------------------------------------------------------------
# Сеть с кэшем
# ---------------------------------------------------------------------------------------------

def http_get(url, data=None, headers=None, tries=6):
    for attempt in range(tries):
        try:
            req = urllib.request.Request(url, data=data, headers={"User-Agent": UA, **(headers or {})})
            with urllib.request.urlopen(req, timeout=300) as r:
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


def cached_json(kind, key, fetch, refresh=False):
    path = CACHE / kind / (key + ".json")
    if path.exists() and not refresh:
        return json.loads(path.read_text(encoding="utf-8"))
    data = fetch()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    return data


def _h(s):
    return hashlib.sha1(s.encode("utf-8")).hexdigest()


def api(params, cache_key=None, refresh=False):
    """POST-запрос к API Commons; ответ кэшируется."""
    params = dict(params, format="json", formatversion="2", maxlag="5")
    key = cache_key or _h(json.dumps(params, sort_keys=True))

    def fetch():
        for attempt in range(8):
            data = json.loads(http_get(API, urllib.parse.urlencode(params).encode()).decode("utf-8"))
            if data.get("error", {}).get("code") == "maxlag":
                time.sleep(5 + 5 * attempt)
                continue
            if "error" in data:
                raise RuntimeError(data["error"])
            time.sleep(0.5)
            return data
        raise RuntimeError("maxlag")
    return cached_json("api", key, fetch, refresh)


def api_all(params, key):
    cont, n = {}, 0
    while True:
        data = api(dict(params, **cont), cache_key=f"list-{key}-{n}", refresh=REFRESH)
        yield data
        if "continue" not in data:
            return
        cont, n = data["continue"], n + 1


def sparql(query, key):
    def fetch():
        raw = http_get(WDQS, urllib.parse.urlencode({"query": query, "format": "json"}).encode(),
                       headers={"Accept": "application/sparql-results+json"})
        time.sleep(2)
        rows = json.loads(raw.decode("utf-8"))["results"]["bindings"]
        return [{k: v["value"] for k, v in r.items()} for r in rows]
    return cached_json("sparql", key, fetch, REFRESH)


def category_files(cat, depth=0):
    out, seen, todo = [], set(), [(cat, 0)]
    while todo:
        c, d = todo.pop(0)
        if c in seen:
            continue
        seen.add(c)
        for data in api_all({"action": "query", "list": "categorymembers", "cmtitle": c, "cmlimit": "500",
                             "cmtype": "file|subcat"}, "cat-" + _h(c)[:16]):
            for p in data["query"]["categorymembers"]:
                if p["ns"] == 14 and d < depth:
                    todo.append((p["title"], d + 1))
                elif p["ns"] == 6 and p["title"] not in out:
                    out.append(p["title"])
    return out


def search_files(query, limit=500):
    out = []
    for data in api_all({"action": "query", "list": "search", "srsearch": query, "srnamespace": "6",
                         "srlimit": str(min(limit, 500)), "srprop": ""}, "search-" + _h(query)[:16]):
        out += [p["title"] for p in data["query"]["search"]]
        if len(out) >= limit:
            break
    return out


def _strip(s):
    s = re.sub(r"<div style=\"display: ?none;?\">.*?</div>", " ", s or "", flags=re.S)
    s = re.sub(r"<[^>]+>", " ", s)
    return re.sub(r"\s+", " ", html.unescape(s)).strip()


def _langs(v):
    if isinstance(v, dict):
        return {k: _strip(x) for k, x in v.items() if k != "_type" and isinstance(x, str)}
    return {"": _strip(v if isinstance(v, str) else "")}


_RAW = None


def _raw_pages():
    """Все страницы из закэшированных ответов prop=imageinfo (кэш по файлам, а не по пакетам)."""
    global _RAW
    if _RAW is None:
        _RAW = {}
        for path in sorted((CACHE / "api").glob("info-*.json")):
            d = json.loads(path.read_text(encoding="utf-8"))
            _index_pages(d)
    return _RAW


def _index_pages(d):
    norm = {x["to"]: x["from"] for x in d.get("query", {}).get("normalized", [])}
    for p in d.get("query", {}).get("pages", []):
        for t in {p["title"], norm.get(p["title"], p["title"])}:
            cur = _RAW.setdefault(t, {"cats": [], "title": p["title"]})
            if p.get("imageinfo"):
                cur["ii"] = p["imageinfo"][0]
            cur["cats"] = list(dict.fromkeys(cur["cats"] + [c["title"][9:] for c in p.get("categories", [])]))


def file_info(titles, light=False):
    """Сведения о файлах Commons (пакетами по 50): размеры, адреса, лицензия, описания, категории.
    light — без многоязычных описаний (только лицензия и автор): такие запросы много легче."""
    titles = [t if t.startswith("File:") else "File:" + t for t in dict.fromkeys(titles)]
    raw = _raw_pages()
    todo = [t for t in titles if t not in raw]
    for i in range(0, len(todo), 50):
        chunk = todo[i:i + 50]
        key = "info-" + ("l" if light else "") + _h("|".join(chunk))
        params = {"action": "query", "titles": "|".join(chunk), "prop": "imageinfo|categories",
                  "iiprop": "url|size|mime|extmetadata", "iiextmetadatamultilang": "1",
                  "iiextmetadatafilter": "ObjectName|ImageDescription|Artist|LicenseShortName|DateTimeOriginal",
                  "clshow": "!hidden", "cllimit": "max"}
        if light:
            params.pop("iiextmetadatamultilang")
            params["iiextmetadatafilter"] = "Artist|LicenseShortName"
        cont, n = {}, 0
        while True:
            d = api(dict(params, **cont), cache_key=f"{key}-{n}" if n else key)
            _index_pages(d)
            if "continue" not in d:
                break
            cont, n = d["continue"], n + 1
        for t in chunk:
            raw.setdefault(t, {"cats": [], "title": t})
        if i and i % 1000 == 0:
            log(f"  сведения о файлах: {i}/{len(todo)}")
    info = {}
    for t in titles:
        p = raw.get(t)
        ii = p and p.get("ii")
        if not ii:
            continue
        em = ii.get("extmetadata", {})
        info[t] = {
            "title": p["title"], "w": ii.get("width", 0), "h": ii.get("height", 0), "mime": ii.get("mime", ""),
            "url": ii["url"], "page": ii["descriptionurl"],
            "license": _strip(em.get("LicenseShortName", {}).get("value", "")),
            "artist": " ".join(_langs(em.get("Artist", {}).get("value", "")).values()),
            "date": " ".join(_langs(em.get("DateTimeOriginal", {}).get("value", "")).values()),
            "desc": _langs(em.get("ImageDescription", {}).get("value", "")),
            "name": _langs(em.get("ObjectName", {}).get("value", "")),
            "cats": p["cats"],
        }
    return info


# ---------------------------------------------------------------------------------------------
# Адреса картинок, проверки, запись
# ---------------------------------------------------------------------------------------------

def thumb_url(url, width):
    base = url.split("?")[0]
    name = base.rsplit("/", 1)[1]
    ext = name.rsplit(".", 1)[-1].lower()
    t = base.replace("/wikipedia/commons/", "/wikipedia/commons/thumb/", 1)
    if ext in ("tif", "tiff"):
        return f"{t}/lossy-page1-{width}px-{name}.jpg"
    return f"{t}/{width}px-{name}"


def image_fields(fi):
    """img (оригинал до 1600 px по ширине или миниатюра 1280 px), thumb (500 px), w/h — размеры оригинала."""
    w, h, url = fi["w"], fi["h"], fi["url"].split("?")[0]
    if not w or not h or not url.startswith("https://upload.wikimedia.org/wikipedia/commons/"):
        return None
    if max(w, h) < MIN_SIDE:
        return None
    browser_ok = fi["mime"] in ("image/jpeg", "image/png", "image/webp")
    tif_ok = fi["mime"] == "image/tiff"
    if not (browser_ok or tif_ok):
        return None
    if w <= IMG_MAX and browser_ok:
        img = url
    elif w > IMG_STEP:
        img = thumb_url(url, IMG_STEP)
    else:
        return None
    thumb = thumb_url(url, THUMB_STEP) if w > THUMB_STEP else (url if browser_ok else None)
    if not thumb:
        return None
    return {"img": img, "thumb": thumb, "w": w, "h": h}


def license_ok(fi):
    lic = fi["license"] or ""
    return bool(ALLOWED_LICENSE.match(lic)) and not re.search(r"no restrictions|fair use|NC|ND", lic, re.I)


# Фото в интерьере, скульптура, витражи, детские иллюстрации — по названию файла и категориям
BAD_FILE = re.compile(r"stained|vitra|glasfenster|sculpt|relief|statue|skulptur|mosaic|mosaik|tapestry|"
                      r"tapisserie|in situ|installation view|gallery view|exhibition|ausstellung|frame[d ]|"
                      r"\bmit rahmen|rahmen\b|sweet publishing|freebibleimages|padgett|coloring|colouring|"
                      r"crop(ped)?\b|detail\b|ausschnitt", re.I)


# имена файлов прямо с фотокамеры — снимок в зале музея, а не репродукция
CAMERA_FILE = re.compile(r"^File:\s*(P\d{6,}|IMG[_ -]?\d|DSC[_FN ]?\d|DSCF|DSCN|PXL_|\d{8}[_ ]\d{6}|"
                         r"\d{4}-\d\d-\d\d \d\d)|[_ ]rwk\.|\bphotographed\b", re.I)


def file_bad(fi):
    hay = fi["title"] + " | " + " | ".join(fi["cats"])
    return bool(BAD_FILE.search(hay) or CAMERA_FILE.search(fi["title"]))


def verse_ok(ref):
    b, c, v = ref.split(".")
    return synodal().exists(b, int(c), int(v))


def kjv_ref(book, c, v):
    b, c2, v2 = kjv2syn(book, c, v)
    ref = f"{b}.{c2}.{v2}"
    return ref if verse_ok(ref) else None


def parse_ref(s):
    """«Gen 22:10» (KJV) -> синодальная «Gen.22.10»; «=Ps.22.1» — уже синодальная."""
    if s.startswith("="):
        r = s[1:]
        return r if verse_ok(r) else None
    m = re.match(r"^(\w+)\s+(\d+):(\d+)$", s)
    if not m:
        raise ValueError(s)
    return kjv_ref(m.group(1), int(m.group(2)), int(m.group(3)))


def existing_files(extra=()):
    """Имена файлов (без File:) всех уже собранных частей (и новых частей extra — без повторов между ними)."""
    out = set()
    for name in list(EXISTING_PARTS) + list(extra):
        p = PARTS / f"{name}.json"
        if p.exists():
            for e in json.loads(p.read_text(encoding="utf-8")):
                out.add(file_key(e["src"]))
    return out


def file_key(src_or_title):
    s = urllib.parse.unquote(src_or_title.rsplit("File:", 1)[-1]).replace("_", " ").strip()
    return s[:1].upper() + s[1:]


def module_refs():
    p = MODULES / "bible-illustrations.json"
    return set(json.loads(p.read_text(encoding="utf-8"))["entries"]) if p.exists() else set()


def make_entry(fi, ref, title, author, year, collection, key, why, **extra):
    f = image_fields(fi)
    if not f or not license_ok(fi) or not ref or not verse_ok(ref):
        return None
    return {"ref": ref, **f, "title": title, "author": author, "year": str(year or ""), "license": fi["license"],
            "src": fi["page"], "collection": collection, "precision": "verse", "key": key, "why": why, **extra}


def write_part(name, entries):
    seen, out = set(), []
    for e in entries:
        if not e or (e["ref"], e["src"]) in seen:
            continue
        seen.add((e["ref"], e["src"]))
        out.append(e)
    PARTS.mkdir(parents=True, exist_ok=True)
    (PARTS / f"{name}.json").write_text(json.dumps(out, ensure_ascii=False, indent=0), encoding="utf-8")
    have = module_refs()
    refs = {e["ref"] for e in out}
    log(f"  -> parts/{name}.json: {len(out)} записей, {len(refs)} стихов, новых стихов {len(refs - have)}; "
        f"лицензии {dict(Counter(e['license'] for e in out).most_common(6))}")
    return out


# ---------------------------------------------------------------------------------------------
# A. Викиданные + Iconclass
# ---------------------------------------------------------------------------------------------

WD_QUERY = """SELECT ?item ?ic ?img ?cr ?crLabel ?crRu ?d (GROUP_CONCAT(DISTINCT ?t;separator="|") AS ?types)
       (SAMPLE(?inc) AS ?inception) (SAMPLE(?lab) AS ?label) WHERE {
 ?item wdt:P1257 ?ic; wdt:P18 ?img; wdt:P170 ?cr. ?cr wdt:P570 ?d. FILTER(YEAR(?d) < 1926)
 FILTER(STRSTARTS(?ic, "71") || STRSTARTS(?ic, "73"))
 FILTER NOT EXISTS { ?item wdt:P170 ?c2. ?c2 wdt:P570 ?d2. FILTER(YEAR(?d2) >= 1926) }
 OPTIONAL { ?item wdt:P31 ?t }
 OPTIONAL { ?item wdt:P571 ?inc }
 OPTIONAL { ?item rdfs:label ?lab FILTER(LANG(?lab) = "en") }
 OPTIONAL { ?cr rdfs:label ?crRu FILTER(LANG(?crRu) = "ru") }
 ?cr rdfs:label ?crLabel FILTER(LANG(?crLabel) = "en")
} GROUP BY ?item ?ic ?img ?cr ?crLabel ?crRu ?d"""

# Плоские произведения (P31): живопись, акварель, гравюра на дереве/меди, офорт, рисунок, тондо, фреска,
# эскиз, миниатюра рукописи, пастель. Складни, алтари, шпалеры, скульптура, витражи — нет.
WD_FLAT = {"Q3305213", "Q18761202", "Q18219090", "Q11060274", "Q93184", "Q18887969", "Q848330", "Q11835431",
           "Q18218093", "Q23657281", "Q56676227", "Q5078274", "Q1964917", "Q3513449", "Q8362", "Q12043905",
           "Q106857709", "Q22669139", "Q134194", "Q2263612", "Q11086567", "Q1784021", "Q17152495", "Q1416517",
           "Q2647254", "Q282129", "Q3859830", "Q5299612", "Q16593391"}


def iconclass_texts(codes):
    out = {}
    codes = sorted(set(codes))
    for i in range(0, len(codes), 40):
        chunk = codes[i:i + 40]

        def fetch():
            url = "https://iconclass.org/json?" + urllib.parse.urlencode([("notation", c) for c in chunk])
            time.sleep(0.5)
            return json.loads(http_get(url).decode("utf-8"))
        d = cached_json("iconclass", "ic-" + _h("|".join(chunk)), fetch)
        for r in d.get("result", []):
            if r:
                out[r["n"]] = r.get("txt", {}).get("en", "")
    return out


def _ic_base(code):
    return re.match(r"[0-9A-Z]+", code).group(0)


def build_iconclass():
    from illus_new_refs import ICONCLASS
    log("Викиданные + Iconclass")
    rows = sparql(WD_QUERY, "wd-iconclass-v2")
    items = {}
    for x in rows:
        q = x["item"].rsplit("/", 1)[-1]
        it = items.setdefault(q, {"types": set(), "codes": set(), "img": set(), "cr": {}, "inc": "", "label": ""})
        it["types"] |= {t.rsplit("/", 1)[-1] for t in x.get("types", "").split("|") if t}
        it["codes"].add(_ic_base(x["ic"]))
        it["img"].add(x["img"])
        it["cr"][x["cr"]] = x.get("crRu") or x["crLabel"]
        it["inc"] = it["inc"] or x.get("inception", "")[:4].lstrip("+")
        it["label"] = it["label"] or x.get("label", "")
    log(f"  произведений с Iconclass 71/73: {len(items)}")
    items = {q: it for q, it in items.items() if it["types"] & WD_FLAT and not it["types"] - WD_FLAT}
    log(f"  из них плоских (живопись, графика): {len(items)}")
    texts = iconclass_texts({c for it in items.values() for c in it["codes"]})
    # ссылки на стихи
    chosen = {}
    skipped = Counter()
    for q, it in items.items():
        codes = {c for c in it["codes"] if not any(o != c and o.startswith(c) for o in it["codes"])}
        mapped = sorted((c for c in codes if c in ICONCLASS), key=len, reverse=True)
        if not mapped:
            skipped["код не сопоставлен со стихом"] += 1
            continue
        refs = {parse_ref(ICONCLASS[c][0]) for c in mapped}
        refs.discard(None)
        if not refs:
            skipped["нет стиха"] += 1
            continue
        chapters = {r.rsplit(".", 1)[0] for r in refs}
        if len(chapters) > 1:
            skipped["несколько сюжетов из разных глав"] += 1
            continue
        if len(it["cr"]) > 1:
            skipped["несколько авторов"] += 1
            continue
        chosen[q] = (mapped[0], parse_ref(ICONCLASS[mapped[0]][0]))
    log(f"  с однозначным стихом: {len(chosen)}; пропущено: {dict(skipped)}")
    have = existing_files(["tissot_hd", "dore_nt", "masters"])
    titles = {}
    for q in chosen:
        for u in sorted(items[q]["img"]):
            titles[q] = "File:" + file_key(urllib.parse.unquote(u.rsplit("/", 1)[-1]))
            break
    info = file_info(list(titles.values()), light=True)
    out, used, rej = [], set(), Counter()
    for q, (code, ref) in sorted(chosen.items(), key=lambda x: int(x[0][1:])):
        t = titles[q]
        fi = info.get(t)
        if not fi:
            rej["нет файла"] += 1
            continue
        fk = file_key(t)
        if fk in have or fk in used:
            rej["уже есть в частях"] += 1
            continue
        if not license_ok(fi):
            rej["лицензия"] += 1
            continue
        if max(fi["w"], fi["h"]) < MIN_SIDE:
            rej["меньше 1200 px"] += 1
            continue
        if file_bad(fi):
            rej["фото в интерьере / деталь / витраж"] += 1
            continue
        it = items[q]
        author = next(iter(it["cr"].values()))
        why = (f"Iconclass {code}: «{texts.get(code, '')[:160]}» -> {ICONCLASS[code][0].lstrip('=')}; "
               f"Викиданные {q} «{it['label'][:100]}»")
        e = make_entry(fi, ref, ICONCLASS[code][1], author, it["inc"], "Картины и гравюры старых мастеров",
                       "wd:" + q, why)
        if e:
            used.add(fk)
            out.append(e)
        else:
            rej["формат"] += 1
    log(f"  отброшено: {dict(rej)}")
    out = cap_per_verse(out, ICON_PER_VERSE)
    return write_part("iconclass", out)


ICON_PER_VERSE = 6     # на популярные сюжеты (Благовещение, Рождество) сотни картин — оставляем лучшие


def cap_per_verse(entries, limit):
    """Не больше limit записей на стих: сначала общественное достояние/CC0, крупнее, разные авторы."""
    by_ref = defaultdict(list)
    for e in entries:
        by_ref[e["ref"]].append(e)
    out, dropped = [], 0
    for ref, lst in by_ref.items():
        lst.sort(key=lambda e: (not re.match(r"Public domain|PD|CC0", e["license"]),
                                -min(e["w"] * e["h"], 8_000_000)))
        chosen, authors = [], Counter()
        for rnd in (1, 2):                      # сначала по одной картине автора, потом остальные
            for e in lst:
                if len(chosen) >= limit:
                    break
                if e not in chosen and authors[e["author"]] < rnd:
                    chosen.append(e)
                    authors[e["author"]] += 1
        dropped += len(lst) - len(chosen)
        out += chosen
    log(f"  не больше {limit} на стих: оставлено {len(out)}, отложено {dropped}")
    return out


# ---------------------------------------------------------------------------------------------
# C. Тиссо в высоком разрешении
# ---------------------------------------------------------------------------------------------

def build_tissot_hd():
    """Категории Тиссо берутся из кэша scripts/illus_classic.py (cache-classic) — те же списки файлов."""
    import illus_classic as C
    from illus_new_refs import TISSOT_FILES, TISSOT_REPLACE, TISSOT_TITLES
    C.UA = UA
    log("Тиссо в высоком разрешении")
    nt = C.category_files("Category:The Life of Jesus Christ by James Tissot", 1)
    ot = C.category_files("Category:Old Testament by James Tissot", 1)
    info = C.file_info(nt + ot)
    old = json.loads((PARTS / "tissot.json").read_text(encoding="utf-8"))
    old_by_key = {e["key"]: e for e in old}
    old_by_file = {e["src"].rsplit("File:", 1)[1]: e for e in old}
    have = existing_files()
    titles_norm = {C.norm_title(k): v for k, v in TISSOT_TITLES.items()}
    out, used = [], set()
    for t in nt + ot:
        fi = info.get(t)
        if not fi or N_bad_tissot(t, fi) or file_key(t) in have:
            continue
        if max(fi["w"], fi["h"]) < MIN_SIDE or not license_ok(fi):
            continue
        title = C.tissot_title(fi, t)
        key = "tissot:" + C.norm_title(title)
        year = "1886–1894" if t in nt else "1896–1902"
        prev = old_by_key.get(key) or old_by_file.get(TISSOT_REPLACE.get(title, "-"))
        if prev and max(prev["w"], prev["h"]) < max(fi["w"], fi["h"]):
            e = make_entry(fi, prev["ref"], prev["title"], "Джеймс Тиссо", prev.get("year") or year, "Джеймс Тиссо",
                           prev["key"], f"та же акварель, что в tissot.json ({prev['src'].rsplit('File:', 1)[1]}, "
                                        f"{prev['w']}×{prev['h']}), в разрешении {fi['w']}×{fi['h']}",
                           replaces=prev["img"])
        elif not prev and C.norm_title(title) in titles_norm:
            ref, ru = titles_norm[C.norm_title(title)]
            e = make_entry(fi, parse_ref(ref), ru, "Джеймс Тиссо", year, "Джеймс Тиссо", key,
                           f"название акварели «{title}» -> {ref} (книга Тиссо)")
        else:
            continue
        if e and key not in used:
            used.add(key)
            out.append(e)
    extra = file_info(list(TISSOT_FILES))
    for t, (ref, ru, year) in TISSOT_FILES.items():
        fi = extra.get(t)
        if fi and file_key(t) not in have:
            out.append(make_entry(fi, parse_ref(ref), ru, "Джеймс Тиссо", year, "Джеймс Тиссо",
                                  "tissot:" + C.norm_title(ru), f"картина «{t[5:].split(' - ')[1]}» -> {ref}"))
    return write_part("tissot_hd", out)


def N_bad_tissot(t, fi):
    return (not re.search("tissot", (fi["artist"] + t).lower())
            or bool(re.search(r"crop|detail|\bverso\b|sketch|Medhurst|Drawing \d", t, re.I)))


# ---------------------------------------------------------------------------------------------
# B. Гюстав Доре: листы без ссылки в описании и картины — по таблице DORE
# ---------------------------------------------------------------------------------------------

def build_dore_nt():
    from illus_new_refs import DORE
    log("Доре: листы без ссылки в описании")
    info = file_info(["File:" + d[0] for d in DORE], light=True)
    have = existing_files()
    out = []
    for name, ref, ru, year in DORE:
        fi = info.get("File:" + name)
        if not fi or file_key(name) in have:
            log("  нет файла или уже есть:", name)
            continue
        m = re.match(r"(\d{3})\.", name)
        key = "dore:" + (m.group(1) if m else _h(name)[:10])
        label = re.sub(r"^\d{3}\.", "", name.rsplit(".", 1)[0])
        e = make_entry(fi, parse_ref(ref), ru, "Гюстав Доре", year, "Гюстав Доре", key,
                       f"название листа/картины «{label}» -> {ref.lstrip('=')}")
        if e:
            out.append(e)
        else:
            log("  не подошёл (размер/лицензия):", name, fi["w"], fi["h"], fi["license"])
    return write_part("dore_nt", out)


# ---------------------------------------------------------------------------------------------
# D. Гравюры Рейксмузеума: в описании файла поле «Wat:» — текст кода Iconclass
# ---------------------------------------------------------------------------------------------

RIJKS_CATS = ["Category:Prints from the Bible in the Rijksmuseum Amsterdam",
              "Category:Old Testament prints in the Rijksmuseum Amsterdam",
              "Category:Prints of Jesus Christ in the Rijksmuseum Amsterdam"]
RIJKS_MAX_YEAR = 1850   # лист напечатан до 1850 г. — автор заведомо умер до 1926 г.
Q3 = "'" * 3            # вики-разметка жирного шрифта


def rijks_pages(titles):
    """Викитекст + размер/лицензия файлов (пакетами по 50, кэш по пакету)."""
    out = {}
    for i in range(0, len(titles), 50):
        chunk = titles[i:i + 50]
        d = api({"action": "query", "titles": "|".join(chunk), "prop": "revisions|imageinfo",
                 "rvprop": "content", "rvslots": "main", "iiprop": "url|size|mime|extmetadata",
                 "iiextmetadatafilter": "LicenseShortName"}, cache_key="rijks-" + _h("|".join(chunk)))
        for p in d["query"].get("pages", []):
            if not p.get("imageinfo") or not p.get("revisions"):
                continue
            ii = p["imageinfo"][0]
            out[p["title"]] = {
                "title": p["title"], "w": ii.get("width", 0), "h": ii.get("height", 0), "mime": ii.get("mime", ""),
                "url": ii["url"], "page": ii["descriptionurl"], "cats": [],
                "license": _strip(ii.get("extmetadata", {}).get("LicenseShortName", {}).get("value", "")),
                "text": p["revisions"][0]["slots"]["main"]["content"]}
        if i and i % 2500 == 0:
            log(f"  викитекст: {i}/{len(titles)}")
    return out


def _rijks_field(text, name):
    m = re.search(Q3 + name + r":?\s*" + Q3 + r"\s*:?\s*(.*?)(?:<br>|\n|}})", text)
    return _strip(m.group(1)) if m else ""


def build_rijks():
    from illus_new_refs import ICONCLASS, RIJKS_AUTHORS
    log("Рейксмузеум: гравюры со сюжетом Iconclass")
    files = []
    for c in RIJKS_CATS:
        files += category_files(c, 3)
    files = list(dict.fromkeys(files))
    log(f"  файлов в категориях: {len(files)}")
    pages = rijks_pages(files)
    texts = iconclass_texts(list(ICONCLASS))
    by_text = defaultdict(set)
    for code, t in texts.items():
        by_text[t.strip().lower()].add(code)
    have = existing_files(["tissot_hd", "dore_nt", "masters", "iconclass"])
    out, rej = [], Counter()
    for t, p in pages.items():
        text = p["text"]
        wat = _rijks_field(text, "Wat")
        if not wat:
            rej["нет поля Wat"] += 1
            continue
        # сюжеты в поле склеены без разделителя («…the crossthe devil…») — ищем полный текст кода
        low = wat.lower()
        codes = {c for s, cs in by_text.items() if len(s) >= 20 and s in low for c in cs}
        codes = {c for c in codes if not any(o != c and o.startswith(c) for o in codes)}
        refs = {parse_ref(ICONCLASS[c][0]) for c in codes} - {None}
        if not refs:
            rej["сюжет не сопоставлен со стихом"] += 1
            continue
        if len({r.rsplit(".", 1)[0] for r in refs}) > 1:
            rej["несколько сюжетов"] += 1
            continue
        code = max(codes, key=len)
        ref = parse_ref(ICONCLASS[code][0])
        year = re.search(r"(1[4-9]\d\d)", _rijks_field(text, "Datering"))
        if not year or int(year.group(1)) > RIJKS_MAX_YEAR:
            rej["позже 1850 г. или без даты"] += 1
            continue
        if file_key(t) in have:
            rej["уже есть"] += 1
            continue
        if not license_ok(p) or max(p["w"], p["h"]) < MIN_SIDE:
            rej["лицензия или меньше 1200 px"] += 1
            continue
        maker = _rijks_field(text, "Vervaardiger")
        m = re.search(r"(?:prentmaker|kunstenaar)[^:]*:\s*(.+?)(?=\s*\(|,|\s+[a-z]+(?:\s[a-z]+)*:|$)", maker)
        name = (m.group(1).strip() if m else "") or "anoniem"
        author = RIJKS_AUTHORS.get(name, name)
        obj = re.sub(r"\s*\(titel op object\)", "", _rijks_field(text, r"Titel\(s\)")).split(",")[0]
        why = (f"Рейксмузеум, «Wat»: «{texts.get(code, '')[:140]}» = Iconclass {code} -> "
               f"{ICONCLASS[code][0].lstrip('=')}; название: «{obj[:80]}»")
        key = "rijks:" + re.sub(r"^.*,\s*", "", t.rsplit(".", 1)[0])[:40]
        e = make_entry(p, ref, ICONCLASS[code][1], author, year.group(1), "Гравюры Рейксмузеума", key, why)
        if e:
            out.append(e)
        else:
            rej["формат"] += 1
    log(f"  отброшено: {dict(rej)}")
    out = cap_per_verse(out, ICON_PER_VERSE)
    return write_part("rijks", out)


# ---------------------------------------------------------------------------------------------
# E. Отдельные серии картин (Хоул, Блох, Бида) — по таблице MASTERS
# ---------------------------------------------------------------------------------------------

def build_masters():
    from illus_new_refs import MASTERS, MASTERS_SERIES
    log("Хоул, Блох, Бида")
    info = file_info(["File:" + m[1] for m in MASTERS], light=True)
    have = existing_files()
    out, rej = [], Counter()
    for series, name, ref, ru in MASTERS:
        fi = info.get("File:" + name)
        if not fi:
            rej["нет файла"] += 1
            continue
        if file_key(name) in have:
            rej["уже есть"] += 1
            continue
        if max(fi["w"], fi["h"]) < MIN_SIDE:
            rej["меньше 1200 px"] += 1
            continue
        author, year, coll = MASTERS_SERIES[series]
        e = make_entry(fi, parse_ref(ref), ru, author, year, coll, f"{series}:{_h(name)[:10]}",
                       f"название картины «{name.rsplit('.', 1)[0]}» -> {ref}")
        if e:
            out.append(e)
        else:
            rej["лицензия/формат"] += 1
    log(f"  отброшено: {dict(rej)}")
    return write_part("masters", out)


# ---------------------------------------------------------------------------------------------
# Второй проход: стихи, у которых в модуле ещё нет картинок (tissot2, iconclass2, rijks2)
# ---------------------------------------------------------------------------------------------

import contextlib

NEW_PARTS = ["tissot2", "masters2", "iconclass2", "rijks2"]     # порядок важен: раньше — приоритетнее при общем лимите на стих
MIN_SIDE2 = 1000          # во втором проходе достаточно длинной стороны 1000 px
PER_VERSE2 = 4            # не больше 4 кандидатов на стих (с учётом всех новых частей), авторы разные


@contextlib.contextmanager
def min_side(v):
    global MIN_SIDE
    old, MIN_SIDE = MIN_SIDE, v
    try:
        yield
    finally:
        MIN_SIDE = old


def taken_refs(before):
    """стих -> авторы уже собранных новых частей (части из списка before)."""
    out = defaultdict(list)
    for n in before:
        p = PARTS / f"{n}.json"
        if p.exists():
            for e in json.loads(p.read_text(encoding="utf-8")):
                out[e["ref"]].append(e["author"])
    return out


def cap_new(entries, taken, covered):
    """Только стихи вне модуля; на стих не больше PER_VERSE2 с учётом taken; разные авторы."""
    by_ref = defaultdict(list)
    for e in entries:
        if e["ref"] not in covered:
            by_ref[e["ref"]].append(e)
    out, dropped = [], 0
    for ref, lst in by_ref.items():
        lst.sort(key=lambda e: (not re.match(r"Public domain|PD|CC0", e["license"]),
                                -min(e["w"] * e["h"], 8_000_000)))
        authors = list(taken.get(ref, []))
        chosen = []
        for e in lst:
            if len(authors) >= PER_VERSE2:
                break
            if e["author"] in authors:
                continue
            chosen.append(e)
            authors.append(e["author"])
        dropped += len(lst) - len(chosen)
        out += chosen
    log(f"  новые стихи: оставлено {len(out)} записей, отложено {dropped}")
    return out


_ICTREE = None


def ICON_TXT():
    """код -> английский текст из закэшированного дерева Iconclass 71/73 (cache-new/iconclass-tree)."""
    global _ICTREE
    if _ICTREE is None:
        _ICTREE = {}
        for path in sorted((CACHE / "iconclass-tree").glob("*.json")):
            for r in json.loads(path.read_text(encoding="utf-8")).get("result", []):
                if r:
                    _ICTREE[r["n"]] = r.get("txt", {}).get("en", "")
    return _ICTREE


def iconclass_tree_fetch():
    """Обходит дерево Iconclass 71 и 73 (пакетами по 40 кодов, кэш cache-new/iconclass-tree) — нужно один раз."""
    seen, todo = set(), ["71", "73"]
    while todo:
        chunk = [c for c in todo[:40] if c not in seen]
        todo = todo[40:]
        if not chunk:
            continue

        def fetch():
            url = "https://iconclass.org/json?" + urllib.parse.urlencode([("notation", c) for c in chunk])
            time.sleep(0.4)
            return json.loads(http_get(url).decode("utf-8"))
        d = cached_json("iconclass-tree", "t-" + _h("|".join(chunk)), fetch)
        for r in d.get("result", []):
            if r:
                seen.add(r["n"])
                todo += [x for x in r.get("c", []) if x not in seen]
    log(f"  дерево Iconclass: {len(seen)} кодов")


def build_tissot2():
    """Рисунки Тиссо к Ветхому Завету («Tissot Drawing NNN», 1024–4608 px) по таблице TISSOT_DRAWINGS:
    привязка по названию рисунка; только стихи вне модуля; один рисунок на стих."""
    import illus_classic as C
    from illus_new_refs import TISSOT_DRAWINGS
    C.UA = UA
    log("Тиссо, рисунки к Ветхому Завету")
    covered = module_refs()
    ot = C.category_files("Category:Old Testament by James Tissot", 1)
    info = C.file_info(ot)
    have = existing_files(["tissot_hd", "dore_nt", "masters", "iconclass", "rijks"])
    out, rej = [], Counter()
    with min_side(MIN_SIDE2):
        for t in ot:
            fi = info.get(t)
            m = re.search(r"Tissot Drawing (\d{3})", t)
            if not fi or not m:
                continue
            low = t.lower()
            key = next((k for k in TISSOT_DRAWINGS if k.startswith(m.group(1) + "#") and k.split("#")[1] in low),
                       m.group(1))
            if key not in TISSOT_DRAWINGS:
                rej["нет в таблице"] += 1
                continue
            ref_s, ru = TISSOT_DRAWINGS[key]
            ref = parse_ref(ref_s)
            if not ref or ref in covered:
                rej["стих уже в модуле"] += 1
                continue
            if file_key(t) in have:
                rej["уже есть"] += 1
                continue
            if not license_ok(fi) or max(fi["w"], fi["h"]) < MIN_SIDE:
                rej["лицензия или меньше 1000 px"] += 1
                continue
            name = re.sub(r"^File:Tissot ", "", t).rsplit(".", 1)[0]
            e = make_entry(fi, ref, ru, "Джеймс Тиссо", "1896–1902", "Джеймс Тиссо", f"tissot:drawing{key.replace('#', '-')}",
                           f"название рисунка «{name[:110]}» -> {ref_s.lstrip('=')}")
            if e:
                out.append(e)
            else:
                rej["формат"] += 1
    log(f"  отброшено: {dict(rej)}")
    out = cap_new(out, {}, covered)
    return write_part("tissot2", out)


def build_masters2():
    """Блейк (Иов), Гофман, «Библейская галерея Дальзилей», гравюры Метрополитен-музея: сюжет по названию листа
    (таблица MASTERS2); только стихи вне модуля."""
    from illus_new_refs import MASTERS2, MET_AUTHORS
    log("Блейк, Гофман, Дальзили, Метрополитен-музей")
    covered = module_refs()
    have = existing_files(["tissot_hd", "dore_nt", "masters", "iconclass", "rijks", "tissot2"])
    out, rej = [], Counter()
    with min_side(MIN_SIDE2):
        for sec, cfg in MASTERS2.items():
            files = []
            for c in cfg["cats"]:
                files += category_files(c, 0)
            files = list(dict.fromkeys(files))
            info = file_info(files)
            rows = [[p.strip() for p in line.split("|")] for line in cfg["rows"].strip().splitlines() if line.strip()]
            for t in files:
                fi = info.get(t)
                if not fi:
                    continue
                low = fi["title"].lower()
                row = next((r for r in rows if r[0].lower() in low), None)
                if not row:
                    continue
                pat, ref_s, ru = row
                ref = parse_ref(ref_s)
                if not ref or ref in covered:
                    rej["стих уже в модуле"] += 1
                    continue
                if file_key(t) in have:
                    rej["уже есть"] += 1
                    continue
                author = cfg["author"]
                if author is None:
                    author = next((ru_a for k, ru_a in MET_AUTHORS.items() if k.lower() in fi["artist"].lower()), None)
                    if not author:
                        rej["автор не в списке"] += 1
                        continue
                year = cfg["year"]
                if year is None:
                    m = re.search(r"(1[4-9]\d\d)", fi["date"])
                    year = m.group(1) if m else ""
                    if year and int(year) > 1900:
                        rej["позже 1900 г."] += 1
                        continue
                if file_bad(fi) or not license_ok(fi) or max(fi["w"], fi["h"]) < MIN_SIDE:
                    rej["лицензия / размер / деталь"] += 1
                    continue
                label = re.sub(r" MET \S+$", "", t[5:].rsplit(".", 1)[0])[:100]
                e = make_entry(fi, ref, ru, author, year, cfg["collection"], f"m2:{sec}:{_h(t)[:10]}",
                               f"название листа «{label}» -> {ref_s.lstrip('=')}")
                if e:
                    out.append(e)
                else:
                    rej["формат"] += 1
    log(f"  отброшено: {dict(rej)}")
    out = cap_new(out, taken_refs(["tissot2"]), covered)
    return write_part("masters2", out)


def build_iconclass2():
    """Викиданные + Iconclass: коды из ICONCLASS2 (плюс ICONCLASS) -> только стихи, которых нет в модуле."""
    from illus_new_refs import ICONCLASS, ICONCLASS2, WD_AUTHORS_RU
    table = {**ICONCLASS, **ICONCLASS2}
    log("Викиданные + Iconclass, второй проход")
    rows = sparql(WD_QUERY, "wd-iconclass-v2")
    items = {}
    for x in rows:
        q = x["item"].rsplit("/", 1)[-1]
        it = items.setdefault(q, {"types": set(), "codes": set(), "img": set(), "cr": {}, "inc": "", "label": ""})
        it["types"] |= {t.rsplit("/", 1)[-1] for t in x.get("types", "").split("|") if t}
        it["codes"].add(_ic_base(x["ic"]))
        it["img"].add(x["img"])
        it["cr"][x["cr"]] = x.get("crRu") or x["crLabel"]
        it["inc"] = it["inc"] or x.get("inception", "")[:4].lstrip("+")
        it["label"] = it["label"] or x.get("label", "")
    items = {q: it for q, it in items.items() if it["types"] & WD_FLAT and not it["types"] - WD_FLAT}
    texts = iconclass_texts({c for it in items.values() for c in it["codes"]})
    covered = module_refs()
    chosen, skipped = {}, Counter()
    for q, it in items.items():
        codes = {c for c in it["codes"] if not any(o != c and o.startswith(c) for o in it["codes"])}
        mapped = sorted((c for c in codes if c in table), key=len, reverse=True)
        if not mapped:
            continue
        refs = {parse_ref(table[c][0]) for c in mapped}
        refs.discard(None)
        if not refs or len({r.rsplit(".", 1)[0] for r in refs}) > 1 or len(it["cr"]) > 1:
            skipped["нет стиха / несколько сюжетов / авторов"] += 1
            continue
        ref = parse_ref(table[mapped[0]][0])
        if ref in covered:
            skipped["стих уже в модуле"] += 1
            continue
        chosen[q] = (mapped[0], ref)
    log(f"  произведений на новые стихи: {len(chosen)}; пропущено {dict(skipped)}")
    have = existing_files(["tissot_hd", "dore_nt", "masters", "iconclass", "rijks", "tissot2", "masters2"])
    titles = {}
    for q in chosen:
        for u in sorted(items[q]["img"]):
            titles[q] = "File:" + file_key(urllib.parse.unquote(u.rsplit("/", 1)[-1]))
            break
    info = file_info(list(titles.values()), light=True)
    out, used, rej = [], set(), Counter()
    with min_side(MIN_SIDE2):
        for q, (code, ref) in sorted(chosen.items(), key=lambda x: int(x[0][1:])):
            fi = info.get(titles[q])
            if not fi:
                rej["нет файла"] += 1
                continue
            fk = file_key(titles[q])
            if fk in have or fk in used:
                rej["уже есть в частях"] += 1
                continue
            if not license_ok(fi):
                rej["лицензия"] += 1
                continue
            if max(fi["w"], fi["h"]) < MIN_SIDE:
                rej["меньше 1000 px"] += 1
                continue
            if file_bad(fi):
                rej["фото в интерьере / деталь / витраж"] += 1
                continue
            it = items[q]
            if re.search(r"portrait|kitchen|still life|market|allegor|triumph", it["label"], re.I):
                rej["портрет / кухня / аллегория по названию"] += 1
                continue
            why = (f"Iconclass {code}: «{(texts.get(code) or ICON_TXT().get(code, ''))[:160]}» -> "
                   f"{table[code][0].lstrip('=')}; Викиданные {q} «{it['label'][:100]}»")
            author = next(iter(it["cr"].values()))
            e = make_entry(fi, ref, table[code][1], WD_AUTHORS_RU.get(author, author), it["inc"],
                           "Картины и гравюры старых мастеров", "wd:" + q, why)
            if e:
                used.add(fk)
                out.append(e)
            else:
                rej["формат"] += 1
    log(f"  отброшено: {dict(rej)}")
    out = cap_new(out, taken_refs(["tissot2", "masters2"]), covered)
    return write_part("iconclass2", out)



_GENERIC_NAMES = {"Lord", "God", "Son", "Man", "Old", "Ark", "Kingdom", "Heaven", "Holy", "Spirit", "Passover", "Jews",
                  "Israelites", "Israel", "Egyptians", "Philistines", "Moabite", "Midianite", "Midianites", "Ghost",
                  "Testament", "Law", "Book", "Sabbath", "Hebrews", "Pharisees", "Sadducees", "Gentiles"}


def _fold(s):
    import unicodedata
    return "".join(c for c in unicodedata.normalize("NFKD", s.lower()) if not unicodedata.combining(c))


def names_match(en_text, nl_text):
    """Собственные имена из английского текста Iconclass (Cain, Uriah…) должны встречаться в названии/описании
    листа Рейксмузеума: по первым трём буквам или по сходству написания (Solomon ~ Salomo). Нет имён — проверка
    пройдена."""
    import difflib
    names = {w for w in re.findall(r"[A-Z][a-z]{2,}", en_text) if w not in _GENERIC_NAMES}
    if not names:
        return True
    words = set(re.findall(r"[a-z]{3,}", _fold(nl_text)))
    pre = {w[:3] for w in words}
    for n in map(_fold, names):
        if n[:3] in pre:
            return True
        if len(n) >= 4 and any(len(w) >= 4 and difflib.SequenceMatcher(None, n, w).ratio() >= 0.6 for w in words):
            return True
    return False


PORTRAIT_TITLE = re.compile(r"^(Apostel |Sint |Heilige |Profeet |Koning |Evangelist )?[A-Z][\w'.-]+\s*(\(.*)?$")


def clean_maker(name):
    """Имя мастера из поля «Vervaardiger»: без вики-разметки и приклеенных ролей («…Collaertuitgever: …»)."""
    name = re.sub(r"\{\{w\|[^|]*\|", "", name).replace("{{", "").replace("}}", "")
    name = re.split(r"(?<=[a-zéë.])(?=(?:prentmaker|uitgever|inspirator|verlener|ontwerper|schilder|tekenaar|"
                    r"naar))|(?:prentmaker|uitgever|inspirator|verlener|ontwerper|naar):", name)[0]
    name = re.sub(r"(uitgever|verlener|naar|ontwerper|inspirator)$", "", name.strip())
    return name.strip(" :,;")


RIJKS2_CATS = ["Category:Prints of Bible stories", "Category:Prints of Jesus Christ", "Category:New Testament engravings",
               "Category:Old Testament engravings", "Category:Prints of Adam and Eve", "Category:Prints of Cain and Abel",
               "Category:Prints of Annunciation", "Category:Prints of Holy Family", "Category:Prints of David (Biblical figure)",
               "Category:Prints of Aaron", "Category:Prints of Abraham", "Category:Prints of Hagar",
               "Category:Prints of Bathsheba at her bath", "Category:Prints of Ecce homo", "Category:Prints of Eve"]
RIJKS_NAME = re.compile(r"RP-[A-Z]-|PK-P|RP-F")


def build_rijks2():
    """Рейксмузеум, второй проход: тексты поля «Wat» сопоставляются со ВСЕМИ текстами Iconclass 71/73
    (дерево кодов в кэше), код -> стих по ICONCLASS + ICONCLASS2; только стихи вне модуля."""
    from illus_new_refs import ICONCLASS, ICONCLASS2, RIJKS_AUTHORS
    table = {**ICONCLASS, **ICONCLASS2}
    log("Рейксмузеум, второй проход")
    files = []
    for c in RIJKS_CATS:
        files += category_files(c, 3)
    files = list(dict.fromkeys(files))
    pages = rijks_pages(files)
    # листы Рейксмузеума, которых нет в трёх основных категориях, но есть в тематических (имя файла — номер RP-…)
    seen, extra = set(files), []
    for c in RIJKS2_CATS:
        extra += [f for f in category_files(c, 3) if f not in seen and RIJKS_NAME.search(f)]
    extra = list(dict.fromkeys(extra))
    log(f"  основных файлов {len(files)}, дополнительных из тематических категорий {len(extra)}")
    pages.update(rijks_pages(extra))
    tree = ICON_TXT()
    by_text = defaultdict(set)
    for code, t in tree.items():
        if code[:2] in ("71", "73") and len(t.strip()) >= 12:
            by_text[t.strip().lower()].add(code)
    keys = sorted(by_text, key=len, reverse=True)
    covered = module_refs()
    have = existing_files(["tissot_hd", "dore_nt", "masters", "iconclass", "rijks", "tissot2", "masters2", "iconclass2"])
    out, rej = [], Counter()
    with min_side(MIN_SIDE2):
        for t, p in pages.items():
            text = p["text"]
            wat = _rijks_field(text, "Wat")
            if not wat:
                continue
            year = re.search(r"(1[4-9]\d\d)", _rijks_field(text, "Datering"))
            if not year or int(year.group(1)) > RIJKS_MAX_YEAR:
                continue
            rest, found = wat.lower(), set()
            for s in keys:
                if s in rest:
                    found |= by_text[s]
                    rest = rest.replace(s, "|")
            mapped = {c for c in found if c in table}
            mapped = {c for c in mapped if not any(o != c and o.startswith(c) for o in mapped)}
            if not mapped:
                continue
            # другой отдельный сюжет (код не из таблицы, не предок/потомок выбранных) — серия сцен, пропускаем
            other = {c for c in found - set(table) if len(c) >= 5 and c.isalnum()
                     and not any(c.startswith(m) or m.startswith(c) for m in mapped)}
            if other:
                rej["в описании есть другой сюжет"] += 1
                continue
            refs = {parse_ref(table[c][0]) for c in mapped} - {None}
            if len(refs) != 1:
                rej["несколько сюжетов / нет стиха"] += 1
                continue
            code = max(mapped, key=len)
            ref = parse_ref(table[code][0])
            if ref in covered:
                rej["стих уже в модуле"] += 1
                continue
            if file_key(t) in have:
                rej["уже есть"] += 1
                continue
            if not license_ok(p) or max(p["w"], p["h"]) < MIN_SIDE:
                rej["лицензия или меньше 1000 px"] += 1
                continue
            if file_bad(p):
                rej["фото / деталь"] += 1
                continue
            title_nl = re.sub(r"\{\{w\|[^|}]*\|([^|}]*)[^}]*\}\}", r"", _rijks_field(text, r"Titel\(s\)"))
            title_nl = re.sub(r"\s*\(titel op object\)", "", title_nl)
            if PORTRAIT_TITLE.match(title_nl.split(".")[0].strip()):
                rej["лист-портрет (название — одно имя)"] += 1
                continue
            if not names_match(tree.get(code, ""), title_nl + " " + _rijks_field(text, "Omschrijving")):
                rej["имена из Iconclass не встречаются в названии/описании"] += 1
                continue
            maker = _rijks_field(text, "Vervaardiger")
            m = re.search(r"(?:prentmaker|kunstenaar)[^:]*:\s*(.+?)(?=\s*\(|,|\s+[a-z]+(?:\s[a-z]+)*:|$)", maker)
            name = clean_maker((m.group(1).strip() if m else "") or "anoniem")
            author = RIJKS_AUTHORS.get(name, name)
            obj = title_nl.split(",")[0]
            why = (f"Рейксмузеум, «Wat»: «{tree.get(code, '')[:140]}» = Iconclass {code} -> "
                   f"{table[code][0].lstrip('=')}; название: «{obj[:80]}»")
            key = "rijks:" + re.sub(r"^.*,\s*", "", t.rsplit(".", 1)[0])[:40]
            e = make_entry(p, ref, table[code][1], author, year.group(1), "Гравюры Рейксмузеума", key, why)
            if e:
                out.append(e)
            else:
                rej["формат"] += 1
    log(f"  отброшено: {dict(rej)}")
    out = cap_new(out, taken_refs(["tissot2", "masters2", "iconclass2"]), covered)
    return write_part("rijks2", out)


# ---------------------------------------------------------------------------------------------
# Проверка глазами: стих Синодального текста рядом с подписью
# ---------------------------------------------------------------------------------------------

_RST = None


def verse_text(ref):
    global _RST
    if _RST is None:
        _RST = {}
        for name in ("rst-dc.json", "rst.json"):
            p = MODULES / name
            if p.exists():
                for b in json.loads(p.read_text(encoding="utf-8"))["books"]:
                    _RST.setdefault(b["id"], b["chapters"])
    b, c, v = ref.split(".")
    try:
        return re.sub(r"<[^>]+>", "", str(_RST[b][int(c) - 1][int(v) - 1]))
    except (KeyError, IndexError):
        return "?"


def review(names):
    for name in names:
        p = PARTS / f"{name}.json"
        if not p.exists():
            continue
        seen = set()
        for e in json.loads(p.read_text(encoding="utf-8")):
            k = (e["ref"], e["title"])
            if k in seen:
                continue
            seen.add(k)
            log(f"{e['ref']:<12} {e['title'][:50]:<50} | {verse_text(e['ref'])[:110]}")


# порядок важен: частные части раньше, iconclass и rijks не повторяют их файлов
BUILDERS = {"tissot_hd": build_tissot_hd, "dore_nt": build_dore_nt, "masters": build_masters,
            "iconclass": build_iconclass, "rijks": build_rijks,
            "tissot2": build_tissot2, "masters2": build_masters2, "iconclass2": build_iconclass2, "rijks2": build_rijks2}


def main():
    names = [a for a in sys.argv[1:] if not a.startswith("--")] or [n for n in BUILDERS if not n.endswith("2")]
    if "--review" in sys.argv:
        review(names)
        return
    for n in names:
        BUILDERS[n]()


if __name__ == "__main__":
    main()
