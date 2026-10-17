"""Иллюстрации к стихам из двух собраний Wikimedia Commons:

  * Sweet Publishing (Jim Padgett и др., 1984; FreeBibleimages / Distant Shores Media) —
    Category:Bible illustrations by Sweet Media, лицензия CC BY-SA 3.0;
  * Charles Foster, «Bible Pictures and What They Teach Us» (1897) —
    Category:Bible Pictures with brief descriptions by Charles Foster, общественное достояние.

Собираем только метаданные и ссылки на upload.wikimedia.org — сами картинки к себе не скачиваем.
Результат: data-src/illustrations/parts/sweet.json и parts/foster.json — массивы
  {ref, img, thumb, w, h, title, author, year, license, src, collection}.

Привязка к стиху — только по явной ссылке в описании файла («Gen. 11:4», «Genesis 22:1-19»…).
Для отрывка берём первый стих. У файлов Sweet Publishing на Commons обычно указаны лишь книга и глава
(шаблон «Bible Illustrations-description/multilingual|Book of Genesis|22»): тогда привязываем к первому
стиху главы — так глава служит отрывком «гл. 22». Если глав несколько или книга не распознана — пропускаем.
Ссылки Commons — в нумерации KJV, переводим в синодальную через extra_lib.kjv2syn.

Ответы API кэшируются в data-src/illustrations/cache-sweet/ (повторный запуск не ходит в сеть).
Скачанное — недоверенные данные: только разбираем текст, ничего не исполняем.

Запуск:  python -I scripts/illus_sweet.py            — собрать (из кэша, недостающее докачать)
         python -I scripts/illus_sweet.py --check    — плюс HEAD-проверка ~50 случайных img
"""
import hashlib
import json
import random
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter, defaultdict
from html import unescape
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from extra_lib import BOOK_BY_ID, BOOK_ORDER, book_from_abbr, kjv2syn, log, synodal  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
BASE = ROOT / "data-src" / "illustrations"
CACHE = BASE / "cache-sweet"
PARTS = BASE / "parts"
API = "https://commons.wikimedia.org/w/api.php"
UA = "AOBibleIllustrations/1.0 (https://dubossarets-wq.github.io/ao-bible/; illustration metadata)"
PAUSE = 1.0          # пауза между настоящими запросами к API, с
MAX_PER_VERSE = 4
ALLOWED_LIC = re.compile(r"^(public domain|pd\b.*|cc0.*|cc[ -]by(-sa)?[ -]\d.*|cc[ -]by(-sa)?)$", re.I)

SWEET_ROOT = "Category:Bible illustrations by Sweet Media"
# признаки настоящего файла собрания на его странице (в дерево категорий попадают и чужие файлы)
SWEET_MARKS = ("Bible Illustrations (Sweet Publishing)", "Bible Illustrations-information",
               "Bible Illustrations-license")
FOSTER_CAT = "Category:Bible Pictures with brief descriptions by Charles Foster"

_last = [0.0]


# ---------------------------------------------------------------------------------------------
# Запросы к API с кэшем
# ---------------------------------------------------------------------------------------------

def api(**params):
    params.update(format="json", formatversion=2, maxlag=5)
    key = urllib.parse.urlencode(sorted(params.items()))
    path = CACHE / (hashlib.sha1(key.encode()).hexdigest() + ".json")
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    url = API + "?" + key
    for attempt in range(6):
        wait = PAUSE - (time.time() - _last[0])
        if wait > 0:
            time.sleep(wait)
        _last[0] = time.time()
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=60) as r:
                data = json.loads(r.read().decode("utf-8"))
            if "error" in data:
                if data["error"].get("code") == "maxlag":
                    time.sleep(5 * (attempt + 1))
                    continue
                raise RuntimeError(data["error"])
            CACHE.mkdir(parents=True, exist_ok=True)
            path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
            return data
        except (OSError, ValueError) as e:
            log("  повтор:", e)
            time.sleep(5 * (attempt + 1))
    raise RuntimeError("API не отвечает: " + url)


def category_files(root, depth=3):
    """Все файлы категории и её подкатегорий (до depth уровней)."""
    seen_cats, files = set(), []
    todo = [(root, 0)]
    while todo:
        cat, d = todo.pop()
        if cat in seen_cats:
            continue
        seen_cats.add(cat)
        cont = {}
        while True:
            r = api(action="query", list="categorymembers", cmtitle=cat, cmlimit=500,
                    cmtype="file|subcat", cmprop="title|type", **cont)
            for m in r["query"]["categorymembers"]:
                if m["type"] == "file":
                    files.append(m["title"])
                elif m["type"] == "subcat" and d < depth:
                    todo.append((m["title"], d + 1))
            if "continue" not in r:
                break
            cont = {k: v for k, v in r["continue"].items()}
    return list(dict.fromkeys(files)), seen_cats


def search_files(text):
    """Поиск файлов по названию (для Foster: часть листов лежит вне основной категории)."""
    out, cont = [], {}
    while True:
        r = api(action="query", list="search", srsearch=text, srnamespace=6, srlimit=500, srwhat="text", **cont)
        out += [x["title"] for x in r["query"]["search"]]
        if "continue" not in r:
            break
        cont = dict(r["continue"])
    return out


def file_info(titles):
    """Текст страницы + imageinfo (url, размеры, extmetadata) пачками по 50."""
    out = {}
    titles = sorted(set(titles))
    for i in range(0, len(titles), 50):
        chunk = titles[i:i + 50]
        r = api(action="query", prop="revisions|imageinfo", rvprop="content", rvslots="main",
                iiprop="url|size|extmetadata|mime", iiextmetadatafilter=
                "ImageDescription|Artist|DateTimeOriginal|LicenseShortName|ObjectName|Categories",
                titles="|".join(chunk))
        for p in r["query"]["pages"]:
            if p.get("missing") or not p.get("imageinfo"):
                continue
            text = p.get("revisions", [{}])[0].get("slots", {}).get("main", {}).get("content", "")
            out[p["title"]] = {"text": text, "ii": p["imageinfo"][0]}
        if (i // 50) % 10 == 0:
            log(f"  сведения о файлах: {min(i + 50, len(titles))}/{len(titles)}")
    return out


# ---------------------------------------------------------------------------------------------
# Разбор ссылок
# ---------------------------------------------------------------------------------------------

_ORD = {"first": "1", "second": "2", "third": "3"}


def book_from_title(name):
    """«Book of Genesis», «First Book of Samuel», «Second Epistle to Timothy», «Gospel of Luke»,
    «Acts of the Apostles», «Psalms» -> OSIS-код или None."""
    s = name.strip().lower()
    num = ""
    w = s.split(" ", 1)
    if w[0] in _ORD and len(w) > 1:
        num, s = _ORD[w[0]], w[1]
    s = re.sub(r"^(book|gospel|epistle|letter|song)\s+(of|to)\s+(the\s+)?", "", s)
    if s == "acts of the apostles":
        s = "acts"
    return book_from_abbr(num + s) or book_from_abbr((num + " " + s).strip())


def roman(s):
    vals = {"i": 1, "v": 5, "x": 10, "l": 50, "c": 100}
    s = s.lower()
    if not s or any(ch not in vals for ch in s):
        return None
    total = 0
    for i, ch in enumerate(s):
        v = vals[ch]
        total += -v if i + 1 < len(s) and vals[s[i + 1]] > v else v
    return total


def _book_any(s):
    s = s.strip().rstrip(".")
    b = book_from_abbr(s)
    if not b and re.match(r"^[1-3]\s?[A-Za-z]+$", s):     # «2King» -> 2Kings
        b = book_from_abbr(s + "s")
    return b


# «Gen. 11:4», «Genesis xxiv. 22», «1 Samuel xvi. 23», «2King 5:14», «{{bible|Rev 1:1|KJV}}», «Numbers 35:11-28»
REF_RE = re.compile(r"(?<![A-Za-z])((?:[1-3]|I{1,3})?\s?[A-Z][a-z]+\.?)\s+(\d{1,3}|[ivxlc]{1,7})\s*[:.]\s*(\d{1,3})"
                    r"(?:\s*[-–]\s*(\d{1,3}))?")


def find_verse_refs(text):
    """Явные ссылки «книга глава:стих» в тексте (KJV) -> [(book, c, v)]."""
    out = []
    for m in REF_RE.finditer(text):
        b = _book_any(m.group(1))
        if not b:
            continue
        ch = int(m.group(2)) if m.group(2).isdigit() else roman(m.group(2))
        if not ch:
            continue
        out.append((b, ch, int(m.group(3))))
    return out


def strip_comments(t):
    return re.sub(r"<!--.*?-->", "", t, flags=re.S)


def clean_html(s):
    s = re.sub(r'<span style="display: none;">.*?</span>', "", str(s), flags=re.S)
    s = re.sub(r'<div style="display: none;">.*?</div>', "", s, flags=re.S)
    s = re.sub(r"<[^>]+>", "", s)
    return re.sub(r"\s+", " ", unescape(s)).strip()


def syn_ok(b, c, v):
    return synodal().exists(b, c, v)


# ---------------------------------------------------------------------------------------------
# Ссылки на картинки
# ---------------------------------------------------------------------------------------------

# Commons отдаёт миниатюры только стандартных ширин (500, 960, 1280, 1920…), прочие — ошибка 400
IMG_MAX, IMG_STEP, THUMB_W = 1600, 1280, 500


def image_urls(ii):
    url = ii["url"].split("?")[0]
    w, h = ii["width"], ii["height"]
    m = re.match(r"^https://upload\.wikimedia\.org/wikipedia/commons/([0-9a-f])/([0-9a-f]{2})/(.+)$", url)
    if not m:
        return None

    def thumb(tw):
        name = m.group(3)
        return f"https://upload.wikimedia.org/wikipedia/commons/thumb/{m.group(1)}/{m.group(2)}/{name}/{tw}px-{name}"
    if w <= IMG_MAX:
        img, iw, ih = url, w, h
    else:
        img, iw, ih = thumb(IMG_STEP), IMG_STEP, round(h * IMG_STEP / w)
    th = thumb(THUMB_W) if w > THUMB_W else url
    return img, th, iw, ih


def base_entry(ii, collection):
    em = ii.get("extmetadata", {})
    lic = clean_html(em.get("LicenseShortName", {}).get("value", ""))
    if not ALLOWED_LIC.match(lic):
        return None, "лицензия: " + (lic or "нет")
    if ii.get("mime") not in ("image/jpeg", "image/png", "image/gif"):
        return None, "не картинка: " + str(ii.get("mime"))
    urls = image_urls(ii)
    if not urls:
        return None, "непонятный адрес"
    author = clean_html(em.get("Artist", {}).get("value", ""))
    if not author or re.match(r"^unknown", author, re.I):
        author = "Неизвестный художник"
    date = clean_html(em.get("DateTimeOriginal", {}).get("value", ""))
    years = [int(y) for y in re.findall(r"\b(1[5-9]\d\d|20\d\d)\b", date)]
    img, th, w, h = urls
    return {"img": img, "thumb": th, "w": w, "h": h, "author": author, "year": max(years) if years else None,
            "license": lic, "src": ii["descriptionurl"], "collection": collection}, None


def ru_ref(b, c, v=None):
    return f"{BOOK_BY_ID[b]['short']} {c}:{v}" if v else f"{BOOK_BY_ID[b]['name']}, гл. {c}"


# ---------------------------------------------------------------------------------------------
# Sweet Publishing
# ---------------------------------------------------------------------------------------------

def sweet_entries(info, stats):
    out = []
    for title, rec in sorted(info.items()):
        t = strip_comments(rec["text"])
        em = rec["ii"].get("extmetadata", {})
        cats = clean_html(em.get("Categories", {}).get("value", ""))
        if not any(m in t for m in SWEET_MARKS):
            if "Sweet Media" in cats and not title.endswith(".webm"):
                stats["sweet_skip:чужой файл в категории"] += 1
            continue                                     # чужой файл, попавший в дерево категорий
        stats["sweet_seen"] += 1
        e, why = base_entry(rec["ii"], "Sweet Publishing")
        if not e:
            stats["sweet_skip:" + why.split(":")[0]] += 1
            continue
        # Шаблон источника Sweet Publishing указывает «Copyright 1984»; поле Date на страницах бывает
        # испорчено (у одного файла «1640»), поэтому год берём из шаблона
        if "Bible Illustrations (Sweet Publishing)-source" in t or "Bible Illustrations-information" in t:
            e["year"] = 1984
        if e["author"].startswith("Sweet Publishing"):
            e["author"] = "Sweet Publishing"
        seq = re.search(r"Chapter \d+-(\d+)", title)
        seq = int(seq.group(1)) if seq else 999
        # 1) явная ссылка на стих в описании (вне шаблонов и комментариев)
        desc = re.search(r"\|\s*[Dd]escription\s*=(.*?)\n\s*\|\s*[A-Za-z_]+\s*=", t, re.S)
        desc = desc.group(1) if desc else ""
        desc = re.sub(r"\{\{Bible Illustrations-description/multilingual[^}]*\}\}", "", desc)
        refs = find_verse_refs(re.sub(r"[{}|]", " ", desc))
        if refs:
            b, c, v = kjv2syn(*refs[0])
            if syn_ok(b, c, v):
                e.update(ref=f"{b}.{c}.{v}", title=ru_ref(b, c, v), precision="verse", _seq=seq)
                out.append(e)
                stats["sweet_verse"] += 1
                continue
        # 2) книга и глава из шаблонов описания / категорий
        chs = set()
        for m in re.finditer(r"description/multilingual\|([^|}]+)\|\s*(\d+)", t):
            chs.add((m.group(1).strip(), int(m.group(2))))
        for m in re.finditer(r"\|\s*book\s*=\s*([^|}\n]+?)\s*\|\s*chapter\s*=\s*(\d+)", t):
            chs.add((m.group(1).strip(), int(m.group(2))))
        for m in re.finditer(r"(?:^|\|)([^|]+?) - Chapter (\d+) \(Bible illustrations by Sweet Media\)", cats, re.I):
            chs.add((m.group(1).strip(), int(m.group(2))))
        named = {(book_from_title(n), c) for n, c in chs}
        if any(b is None for b, _ in named):
            stats["sweet_note:книга не распознана"] += 1
            log("  книга?", sorted(chs))
        named = {x for x in named if x[0]}
        fm = re.match(r"File:(.+?) Chapter (\d+)-\d+ \(Bible Illustrations by Sweet Media\)", title)
        fname = (book_from_title(fm.group(1)), int(fm.group(2))) if fm else None
        if fname and fname[0] and named and fname not in named:
            # имя файла и шаблон называют разные главы (напр. «Psalms Chapter 119-1» с шаблоном «Psalms|11») —
            # какая верна, не знаем, поэтому пропускаем
            stats["sweet_skip:глава в имени и в описании различаются"] += 1
            continue
        if len(named) == 1:
            pick = next(iter(named))
        elif fname in named:
            pick = fname              # главная глава — та, по которой назван файл; прочие — параллельные места
        else:
            stats["sweet_skip:нет главы" if not named else "sweet_skip:несколько глав"] += 1
            continue
        b, c, v = kjv2syn(pick[0], pick[1], 1)
        if v <= 3 and c != pick[1] and b == "Ps":
            v = 1             # Псалтирь: в синодальном надписание — отдельный стих 1, глава начинается с него
        if not syn_ok(b, c, v):
            stats["sweet_skip:стих вне схемы"] += 1
            continue
        # если граница главы в синодальном другая (KJV Нав 6:1 = син. 5:16), подпись — со стихом
        e.update(ref=f"{b}.{c}.{v}", title=ru_ref(b, c) if v == 1 else ru_ref(b, c, v), precision="chapter",
                 _seq=seq)
        out.append(e)
        stats["sweet_chapter"] += 1
    return out


# ---------------------------------------------------------------------------------------------
# Charles Foster, Bible Pictures and What They Teach Us (1897)
# ---------------------------------------------------------------------------------------------

# опечатки в русских подписях на Commons
TITLE_FIX = {"младца": "младенца"}


def foster_entries(info, stats):
    out = []
    for title, rec in sorted(info.items()):
        t = strip_comments(rec["text"])
        if "Sweet" in t or "Bible Pictures with brief descriptions by Charles Foster" not in t \
                or "Story of the Bible" in t:
            continue          # другие книги Фостера («The Story of the Bible», 1884) и чужие файлы — не берём
        stats["foster_seen"] += 1
        e, why = base_entry(rec["ii"], "Charles Foster")
        if not e:
            stats["foster_skip:" + why.split(":")[0]] += 1
            continue
        en = re.search(r"\{\{en\|(?:1=)?(.*?)\}\}", t, re.S)
        ru = re.search(r"\{\{ru\|(?:1=)?(.*?)\}\}", t, re.S)
        en = en.group(1) if en else ""
        ru = ru.group(1) if ru else ""
        # ссылку ищем только в подписи-заголовке, а не в длинном пересказе («caption: …»)
        head = re.split(r"[Cc]aption|Illustration from|Woodcut by", en)[0]
        refs = find_verse_refs(head)
        if not refs:
            stats["foster_skip:нет ссылки"] += 1
            continue
        b, c, v = kjv2syn(*refs[0])
        if not syn_ok(b, c, v):
            stats["foster_skip:стих вне схемы"] += 1
            continue
        name = re.sub(r"\s*\([^)]*\d+:\d+[^)]*\)\s*$", "", clean_html(ru)).strip()
        if not name:
            name = re.split(r"\s*\(|\.?\s*—", clean_html(head.replace("''", "")))[0].strip().rstrip(".;")
            name = name.capitalize() if name.isupper() else name
        for wrong, right in TITLE_FIX.items():
            name = name.replace(wrong, right)
        name = name[:1].upper() + name[1:]
        e.update(ref=f"{b}.{c}.{v}", title=name, precision="verse", _seq=0)
        out.append(e)
        stats["foster_verse"] += 1
    return out


# ---------------------------------------------------------------------------------------------
# Отбор не больше 4 на стих и запись
# ---------------------------------------------------------------------------------------------

def limit_per_verse(entries):
    by = defaultdict(list)
    for e in entries:
        by[e["ref"]].append(e)
    out = []
    for lst in by.values():
        pick = [e for e in lst if e["precision"] == "verse"][:MAX_PER_VERSE]
        chap = sorted((e for e in lst if e["precision"] != "verse"), key=lambda e: (e["_seq"], e["src"]))
        n = MAX_PER_VERSE - len(pick)
        if n > 0 and chap:
            # к первому стиху главы: первая картинка сюжета и равномерно по остальным
            if len(chap) <= n:
                pick += chap
            else:
                idx = sorted({round(i * (len(chap) - 1) / (n - 1)) for i in range(n)}) if n > 1 else [0]
                pick += [chap[i] for i in idx]
        out += pick
    return out


def order_key(e):
    b, c, v = e["ref"].split(".")
    return BOOK_ORDER[b], int(c), int(v), e["_seq"], e["src"]


KEYS = ("ref", "img", "thumb", "w", "h", "title", "author", "year", "license", "src", "collection", "precision")


def write(name, entries):
    PARTS.mkdir(parents=True, exist_ok=True)
    data = [{k: e[k] for k in KEYS} for e in sorted(entries, key=order_key)]
    (PARTS / name).write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    return data


def head_check(data, n=50):
    """HEAD-запросы к случайным img: адрес отвечает 200 и это изображение."""
    random.seed(7)
    sample = random.sample(data, min(n, len(data)))
    bad = 0
    for e in sample:
        ok = False
        for attempt in range(4):
            time.sleep(3)          # upload.wikimedia.org строго ограничивает частоту (429)
            try:
                req = urllib.request.Request(e["img"], method="HEAD", headers={"User-Agent": UA})
                with urllib.request.urlopen(req, timeout=30) as r:
                    ok = r.status == 200 and r.headers.get("Content-Type", "").startswith("image/")
                break
            except urllib.error.HTTPError as ex:
                if ex.code == 429 and attempt < 3:
                    time.sleep(int(ex.headers.get("Retry-After") or 0) or 30 * (attempt + 1))
                    continue
                log("  ошибка:", e["img"], ex)
                break
            except OSError as ex:
                log("  ошибка:", e["img"], ex)
                break
        bad += not ok
    return len(sample), bad


def main():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    stats = Counter()
    log("Sweet Publishing: обход категорий…")
    sweet_titles, cats = category_files(SWEET_ROOT)
    log(f"  категорий {len(cats)}, файлов {len(sweet_titles)}")
    log("Charles Foster…")
    foster_titles, _ = category_files(FOSTER_CAT, depth=1)
    foster_titles = list(dict.fromkeys(foster_titles + search_files('"Foster Bible Pictures"')))
    log(f"  файлов {len(foster_titles)}")
    info = file_info(sweet_titles + foster_titles)
    st, ft = set(sweet_titles), set(foster_titles)
    sw = sweet_entries({k: v for k, v in info.items() if k in st}, stats)
    fo = foster_entries({k: v for k, v in info.items() if k in ft}, stats)
    a = write("sweet.json", limit_per_verse(sw))
    b = write("foster.json", limit_per_verse(fo))
    stats["sweet_kept"], stats["foster_kept"] = len(a), len(b)
    stats["sweet_verses"] = len({e["ref"] for e in a})
    stats["foster_verses"] = len({e["ref"] for e in b})
    for k in sorted(stats):
        log(f"  {k}: {stats[k]}")
    if "--check" in sys.argv:
        n, bad = head_check(a + b)
        log(f"HEAD-проверка img: {n} шт., ошибок {bad}")


if __name__ == "__main__":
    main()
