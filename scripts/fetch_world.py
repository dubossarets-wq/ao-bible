"""Загрузка исходников дополнительных модулей в data-src/extra/ (для build_extra.py).

  python -I scripts/fetch_world.py            # всё, чего ещё нет
  python -I scripts/fetch_world.py ebible     # только eBible.org / crosswire / wikisource / step

Скачанное — недоверенные данные: только распаковываем (zip) и читаем; ничего из них не исполняем.
Источники:
  eBible.org   https://ebible.org/Scriptures/<id>_usfm.zip       -> ebible/<id>/ (USFM + copr.htm)
  CrossWire    https://crosswire.org/ftpmirror/pub/sword/packages/rawzip/<Модуль>.zip -> crosswire/<Модуль>.zip
  Викитека     MediaWiki API (wikitext страниц)                   -> wikisource/<язык>/<страница>.json
  STEPBible    https://github.com/STEPBible/STEPBible-Data (CC BY 4.0) -> stepbible/
"""
import hashlib
import json
import sys
import time
import urllib.parse
import urllib.request
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from extra_world_list import BIBLES, DOUBTFUL  # noqa: E402

ALL_BIBLES = BIBLES + DOUBTFUL

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "data-src" / "extra"
UA = {"User-Agent": "AOBibleBuilder/1.0 (https://dubossarets-wq.github.io/ao-bible/; module builder)"}

# Модули CrossWire, кроме переводов из BIBLES (комментарии и словари; лицензии — в conf-файлах)
CROSSWIRE_EXTRA = ["Clarke", "Wesley", "Scofield", "Geneva", "PNT", "Burkitt", "Catena", "TDavid", "KD", "Lightfoot",
                   "TFG", "Abbott", "Family", "DTN", "ISBE", "Torrey", "AmTract", "CBC", "MLStrong", "Dodson",
                   "Barnes", "VulgGlossa", "FreChry", "FreAug", "FreJer", "Luther", "Rieger", "MAK", "DutKant",
                   "FreCrampon"]


def log(*a):
    print(*a, flush=True)


def get(url, dest, retries=3):
    dest.parent.mkdir(parents=True, exist_ok=True)
    for i in range(retries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120) as r:
                data = r.read()
            tmp = dest.with_suffix(dest.suffix + ".part")
            tmp.write_bytes(data)
            tmp.replace(dest)
            return True
        except Exception as e:  # сеть: повторяем
            log(f"  ошибка {url}: {e}")
            time.sleep(2 + 3 * i)
    return False


def ebible(ids):
    for eid in ids:
        folder = SRC / "ebible" / eid
        if folder.exists() and any(folder.glob("*.usfm")):
            continue
        z = SRC / "ebible" / f"{eid}_usfm.zip"
        log(f"eBible {eid}")
        if not z.exists() and not get(f"https://ebible.org/Scriptures/{eid}_usfm.zip", z):
            continue
        folder.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(z) as zf:
            for n in zf.namelist():
                # только плоские имена файлов (без путей) — защита от ../ в архиве
                if "/" in n or "\\" in n or n.startswith("."):
                    continue
                (folder / n).write_bytes(zf.read(n))


def crosswire(names):
    for n in names:
        z = SRC / "crosswire" / f"{n}.zip"
        if z.exists():
            continue
        log(f"CrossWire {n}")
        get(f"https://crosswire.org/ftpmirror/pub/sword/packages/rawzip/{n}.zip", z)


# ---------------------------------------------------------------------------------------------
# Викитека
# ---------------------------------------------------------------------------------------------

def wiki_api(lang, **params):
    params.setdefault("format", "json")
    url = f"https://{lang}.wikisource.org/w/api.php?" + urllib.parse.urlencode(params)
    for i in range(4):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120) as r:
                return json.load(r)
        except Exception as e:
            log(f"  ошибка API {lang}: {e}")
            time.sleep(3 + 5 * i)
    raise RuntimeError(url)


def wiki_page_path(lang, title):
    h = hashlib.sha1(title.encode("utf-8")).hexdigest()[:16]
    return SRC / "wikisource" / lang / f"{h}.json"


def wiki_pages(lang, titles):
    """wikitext страниц (по 50 за запрос) -> wikisource/<lang>/<sha1>.json {"title", "wikitext"}."""
    need = [t for t in titles if not wiki_page_path(lang, t).exists()]
    for i in range(0, len(need), 50):
        batch = need[i:i + 50]
        r = wiki_api(lang, action="query", prop="revisions", rvprop="content", rvslots="main",
                     titles="|".join(batch), formatversion="2")
        for p in r.get("query", {}).get("pages", []):
            if p.get("missing") or not p.get("revisions"):
                continue
            text = p["revisions"][0]["slots"]["main"]["content"]
            dest = wiki_page_path(lang, p["title"])
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_text(json.dumps({"title": p["title"], "wikitext": text}, ensure_ascii=False), encoding="utf-8")
        log(f"  {lang}: {min(i + 50, len(need))}/{len(need)}")
        time.sleep(0.5)


def wiki_prefix(lang, prefix, ns=0):
    out, cont = [], {}
    while True:
        r = wiki_api(lang, action="query", list="allpages", apprefix=prefix, apnamespace=ns, aplimit="500", **cont)
        out += [x["title"] for x in r["query"]["allpages"]]
        if "continue" not in r:
            return out
        cont = {"apcontinue": r["continue"]["apcontinue"]}


def wikisource():
    import extra_wiki as WK
    for lang, prefix in WK.PREFIXES:
        titles = wiki_prefix(lang, prefix)
        (SRC / "wikisource" / lang).mkdir(parents=True, exist_ok=True)
        (SRC / "wikisource" / lang / f"index-{hashlib.sha1(prefix.encode()).hexdigest()[:10]}.json").write_text(
            json.dumps({"prefix": prefix, "titles": titles}, ensure_ascii=False), encoding="utf-8")
        log(f"Викитека {lang}: {prefix} — {len(titles)} страниц")
        wiki_pages(lang, titles)
    for lang, titles in WK.PAGES.items():   # переводы со списком страниц (книг)
        log(f"Викитека {lang}: {len(titles)} страниц")
        wiki_pages(lang, titles)


# ---------------------------------------------------------------------------------------------
# STEPBible (лексиконы Tyndale House, CC BY 4.0)
# ---------------------------------------------------------------------------------------------

STEP_FILES = [
    "Lexicons/TBESH - Translators Brief lexicon of Extended Strongs for Hebrew - STEPBible.org CC BY.txt",
    "Lexicons/TBESG - Translators Brief lexicon of Extended Strongs for Greek - STEPBible.org CC BY.txt",
]


def stepbible():
    for f in STEP_FILES:
        dest = SRC / "stepbible" / Path(f).name
        if dest.exists():
            continue
        log(f"STEPBible {Path(f).name}")
        get("https://raw.githubusercontent.com/STEPBible/STEPBible-Data/master/" + urllib.parse.quote(f), dest)


def main(argv):
    want = set(argv) or {"ebible", "crosswire", "wikisource", "step"}
    if "ebible" in want:
        ebible([b["src"].split(":", 1)[1] for b in ALL_BIBLES if b["src"].startswith("ebible:")])
    if "crosswire" in want:
        crosswire([b["src"].split(":", 1)[1] for b in ALL_BIBLES if b["src"].startswith("sword:")] + CROSSWIRE_EXTRA)
    if "step" in want:
        stepbible()
    if "wikisource" in want:
        wikisource()


if __name__ == "__main__":
    sys.stdout.reconfigure(errors="replace")
    main(sys.argv[1:])
