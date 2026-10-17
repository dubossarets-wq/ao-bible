"""Модуль «Иллюстрации к Библии» (public/modules/bible-illustrations.json и .gz) из частей
data-src/illustrations/parts/*.json.

Части собирают отдельные скрипты (только метаданные Wikimedia Commons, картинки не скачиваются):
  scripts/illus_classic.py  — Доре, Шнорр фон Карольсфельд, Тиссо, Providence Lithograph, «Figures de la Bible»,
                              Библия Холмана и др. (dore/schnorr/tissot/providence/other.json);
  scripts/illus_medhurst.py — Phillip Medhurst Collection (medhurst.json);
  scripts/illus_sweet.py    — Sweet Publishing / FreeBibleimages и Charles Foster (sweet.json, foster.json).
Запись части: {ref (синодальная нумерация), img, thumb, w, h, title, author, year, license, src, collection,
[precision: "verse" | "chapter"], [key — номер листа внутри собрания]}.

Правила сведения:
  * не больше двух картинок на стих;
  * сначала картинки, привязанные к стиху (из любых собраний): первая — лучшая по собранию и разрешению,
    вторая — по возможности из другого собрания и другого рода (гравюра Доре/Шнорра/Medhurst + цветная
    Тиссо/Sweet/Providence/Foster), без повторов одного файла или листа;
  * картинка «к главе» (precision "chapter", привязана к первому стиху главы) ставится, только если у этого стиха
    осталось свободное место, и не больше одной на главу; её подпись начинается с «К главе: »;
  * только лицензии Public domain, CC0, CC BY, CC BY-SA и только ссылки на upload.wikimedia.org.
Проверка глазами (scripts/illus_review.json): каждую картинку сверили с текстом стиха —
  {id: {"v": "ok" | "move" | "drop", "ref": новый стих при "move", "why": причина}}, id = sha1(img + "|" + ref)[:10].
  Если файл проверки есть, в модуль идут только проверенные картинки ("ok" и "move").
  Части из EXCLUDE_PARTS не берутся (sweet — рисунки в детском стиле). Запись с полем "replaces" (тот же лист
  в лучшем разрешении) вытесняет запись с этим img.
Модуль записывается через extra_lib.write_module, запись в catalog.json — merge_catalog (по id),
id добавляется в scripts/approved-modules.json.

Запуск:
  python -I scripts/build_illustrations.py              # свести части и записать модуль
  python -I scripts/build_illustrations.py --check 100  # плюс HEAD-проверка случайных 100 картинок (img и thumb)
"""
import hashlib
import json
import random
import re
import sys
import time
import urllib.error
import urllib.request
from collections import Counter, defaultdict
from datetime import date
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
from extra_lib import BOOK_BY_ID, BOOK_ORDER, merge_catalog, synodal, write_module  # noqa: E402

PARTS = ROOT / "data-src" / "illustrations" / "parts"
APPROVED = ROOT / "scripts" / "approved-modules.json"
MODULE_ID = "bible-illustrations"
MAX_PER_VERSE = 2
UA = "AOBible-illustrations/1.0 (https://github.com/dubossarets-wq; kordeko.md@gmail.com)"
LICENSE_RE = re.compile(r"^(Public domain|PD\b.*|CC0.*|CC BY(-SA)? \d(\.\d)?.*)$", re.I)

# Собрание: (вес при выборе, род: «g» — гравюра/чёрно-белая, «c» — цветная, название по-русски для описания)
COLLECTIONS = {
    "Гюстав Доре": (3.0, "g", "гравюры Гюстава Доре (1866)"),
    "Джеймс Тиссо": (3.0, "c", "акварели Джеймса Тиссо «Жизнь Иисуса Христа» и «Ветхий Завет» (1886–1902)"),
    "Юлиус Шнорр фон Карольсфельд": (2.6, "g", "гравюры Юлиуса Шнорра фон Карольсфельда «Библия в картинах» (1860)"),
    "Providence Lithograph Company": (2.2, "c", "библейские карточки Providence Lithograph Company (1896–1913)"),
    "Charles Foster": (2.0, "c", "«Bible Pictures and What They Teach Us» Чарльза Фостера (1897)"),
    "Figures de la Bible (1728)": (2.4, "g", "гравюры «Figures de la Bible» Герарда Хута и др. (1728)"),
    "Библия Холмана (1890)": (2.0, "g", "иллюстрации Библии Холмана (1890)"),
    "Phillip Medhurst Collection": (1.8, "g", "гравюры и иллюстрации XVI–XX вв. из собрания Филлипа Медхерста"),
    "The Bible and Its Story (1908)": (1.8, "g", "иллюстрации «The Bible and Its Story» (1908)"),
    "Treasures of the Bible (1894)": (1.6, "g", "иллюстрации «Treasures of the Bible» (1894)"),
    "Sunrays": (1.6, "c", "иллюстрации журнала «Sunrays»"),
    "Иллюстрированные Библии": (1.6, "g", "отдельные гравюры и картины старых мастеров (Вейгель, Мериан, Блейк и др.)"),
    "Sweet Publishing": (1.6, "c", "современные иллюстрации Sweet Publishing / FreeBibleimages (Джим Паджетт и др.)"),
}


def log(*a):
    print(*a, flush=True)


def ref_key(ref):
    b, c, v = ref.split(".")
    return BOOK_ORDER.get(b, 999), int(c), int(v)


def valid(e):
    try:
        b, c, v = e["ref"].split(".")
        ok_ref = b in BOOK_BY_ID and synodal().exists(b, int(c), int(v))
    except (ValueError, AttributeError, KeyError):
        return False
    return (ok_ref and LICENSE_RE.match(str(e.get("license") or ""))
            and str(e.get("img", "")).startswith("https://upload.wikimedia.org/")
            and str(e.get("thumb", "")).startswith("https://upload.wikimedia.org/")
            and int(e.get("w") or 0) > 0 and int(e.get("h") or 0) > 0
            and str(e.get("src", "")).startswith("https://commons.wikimedia.org/"))


def score(e):
    base = COLLECTIONS.get(e.get("collection"), (1.0, "c", ""))[0]
    return base + min(int(e["w"]) * int(e["h"]), 1600 * 1200) / (1600 * 1200) * 0.5


def kind(e):
    return COLLECTIONS.get(e.get("collection"), (1.0, "c", ""))[1]


FAMILY = [("tissot", re.compile(r"tissot", re.I)), ("dore", re.compile(r"dor[eé]\b|доре", re.I)),
          ("schnorr", re.compile(r"schnorr|шнорр", re.I)), ("hoet", re.compile(r"hoet|figures de la bible|хут", re.I))]


def family(e):
    """Один художник — одна картина к сюжету: два листа Тиссо (или Доре…) к одному стиху — почти всегда
    копии одного изображения из разных собраний (например, Тиссо есть и у Medhurst)."""
    hay = " ".join(str(e.get(k) or "") for k in ("author", "collection", "src"))
    return next((name for name, rx in FAMILY if rx.search(hay)), None)


def same_image(a, b):
    return (a["src"] == b["src"] or a["img"] == b["img"] or (a.get("key") and a.get("key") == b.get("key"))
            or (family(a) is not None and family(a) == family(b)))


def pick(cands, already=()):
    """Лучшие картинки к стиху (не больше MAX_PER_VERSE вместе с already)."""
    chosen = list(already)
    pool = sorted(cands, key=score, reverse=True)
    while len(chosen) < MAX_PER_VERSE and pool:
        def bonus(e):
            b = score(e)
            if chosen:
                b += 1.0 if all(kind(e) != kind(c) for c in chosen) else 0
                b += 0.6 if all(e.get("collection") != c.get("collection") for c in chosen) else 0
            return b
        pool = [e for e in pool if not any(same_image(e, c) for c in chosen)]
        if not pool:
            break
        best = max(pool, key=bonus)
        chosen.append(best)
        pool.remove(best)
    return chosen[len(already):]


# Русские подписи к картинкам, у которых на Commons название не по-русски (переведены вручную)
_RU_PATH = Path(__file__).with_name("illus_titles_medhurst_ru.json")
TITLES_RU = json.loads(_RU_PATH.read_text(encoding="utf-8")) if _RU_PATH.exists() else {}


def out_entry(e, chapter=False):
    title = str(e.get("title") or "").strip()
    title = TITLES_RU.get(title, title)
    if chapter and not title.startswith("К главе: "):
        title = "К главе: " + title
    o = {"img": e["img"], "thumb": e["thumb"], "w": int(e["w"]), "h": int(e["h"]), "title": title,
         "author": str(e.get("author") or "").strip()}
    if e.get("year"):
        o["year"] = str(e["year"])
    o.update({"license": e["license"], "src": e["src"]})
    return o


def head_ok(url):
    for attempt in range(4):
        try:
            req = urllib.request.Request(url, method="HEAD", headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=60) as r:
                return r.status == 200 and r.headers.get("Content-Type", "").startswith("image/")
        except urllib.error.HTTPError as e:
            if e.code == 429:
                time.sleep(30 * (attempt + 1))
                continue
            return False
        except OSError:
            time.sleep(10)
    return False


EXCLUDE_PARTS = {"sweet"}
REVIEW_PATH = Path(__file__).with_name("illus_review.json")


def review_id(img, ref):
    return hashlib.sha1(f"{img}|{ref}".encode()).hexdigest()[:10]


def apply_review(e, review):
    """Решение проверки для записи: None — не брать; иначе запись (возможно, с другим стихом)."""
    if review is None:
        return e
    r = review.get(review_id(e["img"], e["ref"]))
    if not r or r.get("v") not in ("ok", "move"):
        return None
    e = dict(e, precision="verse")
    if r["v"] == "move":
        e["ref"] = r["ref"]
    return e


def main():
    parts = [p for p in sorted(PARTS.glob("*.json")) if p.stem not in EXCLUDE_PARTS]
    review = json.loads(REVIEW_PATH.read_text(encoding="utf-8")) if REVIEW_PATH.exists() else None
    if not parts:
        raise SystemExit("Нет частей в data-src/illustrations/parts/")
    raw = [(p, e) for p in parts for e in json.loads(p.read_text(encoding="utf-8"))]
    replaced = {e["replaces"] for _, e in raw if e.get("replaces")}
    precise, chapter = defaultdict(list), defaultdict(list)
    loaded, rejected = Counter(), Counter()
    for p, e in raw:
        if e["img"] in replaced and not e.get("replaces"):
            continue
        e = apply_review(e, review)
        if e is None:
            rejected[p.stem + ":проверка"] += 1
            continue
        if not valid(e):
            rejected[p.stem] += 1
            continue
        loaded[p.stem] += 1
        if e.get("precision") == "chapter":
            b, c, _ = e["ref"].split(".")
            chapter[(b, int(c))].append(e)
        else:
            precise[e["ref"]].append(e)
    log("Части:", dict(loaded), "отброшено:", dict(rejected) or 0)

    entries = {}
    for ref, cands in precise.items():
        entries[ref] = [(e, False) for e in pick(cands)]
    n_chapter = 0
    for (b, c), cands in chapter.items():
        ref = f"{b}.{c}.1"
        have = [e for e, _ in entries.get(ref, [])]
        if len(have) >= MAX_PER_VERSE:
            continue
        add = pick(cands, have)[:1]
        if add:
            entries.setdefault(ref, []).append((add[0], True))
            n_chapter += 1

    ordered = {ref: [out_entry(e, ch) for e, ch in entries[ref]] for ref in sorted(entries, key=ref_key)}
    by_coll = Counter(e.get("collection") for lst in entries.values() for e, _ in lst)
    nt0 = BOOK_ORDER["Matt"]
    ot = sum(1 for r in ordered if ref_key(r)[0] < nt0)
    total_imgs = sum(len(v) for v in ordered.values())
    log(f"Стихов с картинками: {len(ordered)} (ВЗ {ot}, НЗ {len(ordered) - ot}); картинок: {total_imgs}; "
        f"из них «к главе»: {n_chapter}")
    log("По собраниям:", dict(by_coll.most_common()))

    colls = [c for c, _ in by_coll.most_common()]
    descr = ("Иллюстрации к стихам Библии из Wikimedia Commons: "
             + "; ".join(COLLECTIONS[c][2] + f" — {by_coll[c]}" for c in colls if c in COLLECTIONS)
             + f". Всего {total_imgs} картинок к {len(ordered)} стихам, не больше двух на стих. Привязка к стиху — "
               "по ссылке на место Писания в описании картинки или в издании; подпись «К главе» — картинка к главе "
               "целиком. Картинки показываются прямо с upload.wikimedia.org; у каждой указаны автор, лицензия и "
               "ссылка на страницу файла на Commons.")
    module = {
        "format": "aob-module", "formatVersion": 1, "type": "illustrations", "id": MODULE_ID,
        "name": "Иллюстрации", "title": "Иллюстрации к Библии", "language": "ru",
        "description": descr,
        "version": date.today().isoformat(),
        "author": "Авторы указаны у каждой картинки",
        "source": "https://commons.wikimedia.org (метаданные — API Commons; сборка: scripts/build_illustrations.py)",
        "license": "У каждой картинки своя: Public domain, CC0, CC BY, CC BY-SA 3.0/4.0 (см. подпись к картинке)",
        "versification": "synodal",
        "entries": ordered,
    }
    entry = write_module(module)
    merge_catalog([entry], in_place=True)

    approved = json.loads(APPROVED.read_text(encoding="utf-8"))
    if MODULE_ID not in approved["ids"]:
        approved["ids"].append(MODULE_ID)
        APPROVED.write_text(json.dumps(approved, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        log("approved-modules.json: добавлен", MODULE_ID)

    if "--check" in sys.argv:
        n = int(sys.argv[sys.argv.index("--check") + 1]) if len(sys.argv) > sys.argv.index("--check") + 1 else 100
        sample = random.Random(1).sample([e for lst in ordered.values() for e in lst], min(n, total_imgs))
        bad = []
        for i, e in enumerate(sample):
            for url in (e["img"], e["thumb"]):
                if not head_ok(url):
                    bad.append(url)
                time.sleep(3)   # upload.wikimedia.org отвечает 429 на частые запросы
            if (i + 1) % 20 == 0:
                log(f"  проверено {i + 1}/{len(sample)}, ошибок {len(bad)}")
        log(f"HEAD-проверка: {len(sample)} картинок, ошибок {len(bad)}")
        for u in bad:
            log("  !", u)


if __name__ == "__main__":
    main()
