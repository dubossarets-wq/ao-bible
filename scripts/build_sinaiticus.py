"""Ссылки «Синайский кодекс» (src/core/sinaiticus.json): в каких книгах и стихах сохранился кодекс и как синодальный
номер стиха переводится в номер на сайте codexsinaiticus.org (manuscript.aspx?book=<N>&chapter=<гл>&verse=<ст>).
Снимки и расшифровка — на сайте кодекса (только для личного и учебного использования, права — у Британской
библиотеки, библиотеки Лейпцигского университета, монастыря св. Екатерины и Российской национальной библиотеки);
приложение их не хранит и не показывает, а только открывает нужный стих на сайте.

1. Сохранность. Книги, сохранившиеся целиком (весь Новый Завет, Исаия, Иеремия, Псалтирь, Сирах…), — без ограничений.
   У книг-фрагментов (Бытие, Левит, Числа, Второзаконие, Навин, Судьи, 1 Паралипоменон, 2 Ездры, Плач; на сайте ещё
   4 Маккавейская — её нет в синодальной Библии, и Осии, Амоса, Михея в кодексе нет вовсе) пределы берутся
   с самого сайта: запрос стиха возвращает лист, где он есть, с подписью «Книга, гл:ст - гл:ст» (если стиха нет —
   ближайший лист книги или первый лист кодекса); листы обходятся по порядку. Ответы кэшируются в
   data-src/extra/sinaiticus/pages.json, между запросами — пауза.
2. Нумерация. Ветхий Завет на сайте — в греческой нумерации: синодальный стих -> стих Брентона по тому же
   сопоставлению, что и в модуле lxx-brenton (build_brenton.map_book). Новый Завет — в стандартной (KJV):
   синодальный -> KJV по таблице SWORD (extra_lib.synodal().to_kjv). В файл попадают только расхождения — участками
   [синод. гл, ст, сайт гл, ст, длина].

Запуск: python -I -X utf8 scripts/build_sinaiticus.py
"""
import json
import re
import sys
import time
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import build_brenton as BR  # noqa: E402
from extra_lib import synodal  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "data-src" / "extra" / "sinaiticus" / "pages.json"
OUT = ROOT / "src" / "core" / "sinaiticus.json"
SITE = "https://codexsinaiticus.org/en/manuscript.aspx?book={}&chapter={}&verse={}&lid=en&side=r&zoomSlider=0"
UA = {"User-Agent": "AOBibleBuilder/1.0 (https://aobible.app; verse links to codexsinaiticus.org)"}

# Книга приложения -> (номер книги на сайте, название в подписи листа, книга Брентона для нумерации)
OT = {
    "Gen": (1, "Genesis", "Gen"), "Lev": (2, "Leviticus", "Lev"), "Num": (3, "Numbers", "Num"),
    "Deut": (4, "Deuteronomy", "Deut"), "Josh": (5, "Joshua", "Josh"), "Judg": (6, "Judges", "Judg"),
    # 1 Пар 9:27–19:17 на сайте — «1 Chronicles (duplicate)» (7); «1 Chronicles» (70) — переписанный дважды отрывок
    "1Chr": (7, "1 Chronicles (duplicate)", "1Chr"), "Ezra": (8, "2 Esdras", "B2Esd"), "Neh": (8, "2 Esdras", "B2Esd"),
    "Esth": (9, "Esther", "Esth"), "Tob": (10, "Tobit", "Tob"), "Jdt": (11, "Judith", "Jdt"),
    "1Macc": (12, "1 Maccabees", "1Macc"), "Isa": (14, "Isaiah", "Isa"), "Jer": (15, "Jeremiah", "Jer"),
    "Lam": (16, "Lamentations", "Lam"), "Joel": (17, "Joel", "Joel"), "Obad": (18, "Obadiah", "Obad"),
    "Jonah": (19, "Jonah", "Jonah"), "Nah": (20, "Nahum", "Nah"), "Hab": (21, "Habakkuk", "Hab"),
    "Zeph": (22, "Zephaniah", "Zeph"), "Hag": (23, "Haggai", "Hag"), "Zech": (24, "Zechariah", "Zech"),
    "Mal": (25, "Malachi", "Mal"), "Ps": (26, "Psalms", "Ps"), "Prov": (27, "Proverbs", "Prov"),
    "Eccl": (28, "Ecclesiastes", "Eccl"), "Song": (29, "Song of Songs", "Song"),
    "Wis": (30, "Wisdom of Solomon", "Wis"), "Sir": (31, "Sirach", "Sir"), "Job": (32, "Job", "Job"),
}
NT = {
    "Matt": 33, "Mark": 34, "Luke": 35, "John": 36, "Rom": 37, "1Cor": 38, "2Cor": 39, "Gal": 40, "Eph": 41,
    "Phil": 42, "Col": 43, "1Thess": 44, "2Thess": 45, "Heb": 46, "1Tim": 47, "2Tim": 48, "Titus": 49, "Phlm": 50,
    "Acts": 51, "Jas": 52, "1Pet": 53, "2Pet": 54, "1John": 55, "2John": 56, "3John": 57, "Jude": 58, "Rev": 59,
}
FRAGMENTS = {1, 2, 3, 4, 5, 6, 7, 8, 16}
SEG = re.compile(r"\s*([^,/]+?),\s*(\d+):(\d+)\s*-\s*(\d+):(\d+)")


def log(*a):
    print(*a, flush=True)


def load_cache():
    return json.loads(CACHE.read_text(encoding="utf-8")) if CACHE.exists() else {}


def page(cache, no, c, v):
    """Подпись листа, который сайт показывает на запрос стиха: [(книга, гл1, ст1, гл2, ст2)]."""
    key = f"{no}.{c}.{v}"
    if key not in cache:
        time.sleep(1.0)
        with urllib.request.urlopen(urllib.request.Request(SITE.format(no, c, v), headers=UA), timeout=60) as r:
            html = r.read().decode("utf-8", "replace")
        m = re.search(r'id="manuscriptVerseInfo">([^<]*)', html)
        cache[key] = (m.group(1) if m else "").replace("&nbsp;", " ")
        CACHE.parent.mkdir(parents=True, exist_ok=True)
        CACHE.write_text(json.dumps(cache, ensure_ascii=False, indent=0), encoding="utf-8")
    return [(s.group(1).strip(), *map(int, s.groups()[1:])) for s in SEG.finditer(cache[key])]


def coverage(cache, no, name):
    """Сохранившиеся участки книги-фрагмента в нумерации сайта: [[гл1, ст1, гл2, ст2]]."""
    seen, out = set(), []
    nxt = [(1, 1)]
    for _ in range(400):
        got = None
        for c, v in nxt:
            for seg in page(cache, no, c, v):
                # лист может начинаться тем же стихом, которым кончился предыдущий (стих переходит на новый лист)
                if seg[0] == name and (seg[1], seg[2]) not in seen and (not out or (seg[1], seg[2]) >= tuple(out[-1][2:])) \
                        and (not out or (seg[3], seg[4]) > tuple(out[-1][2:])):
                    got = seg
                    break
            if got:
                break
        if not got:
            break
        seen.add((got[1], got[2]))
        a, b = list(got[1:3]), list(got[3:5])
        if out and a in ([out[-1][2], out[-1][3]], [out[-1][2], out[-1][3] + 1], [out[-1][2] + 1, 1]):
            out[-1][2:] = b
        else:
            out.append(a + b)
        nxt = [(b[0], b[1] + 1), (b[0] + 1, 1)]
    return out


def runs(pairs):
    """[(синод. гл, ст, сайт гл, ст)] -> участки [гл, ст, гл, ст, длина] (подряд идущие в одной главе)."""
    out = []
    for sc, sv, tc, tv in sorted(pairs):
        if out:
            r = out[-1]
            if r[0] == sc and r[2] == tc and sv == r[1] + r[4] and tv == r[3] + r[4]:
                r[4] += 1
                continue
        out.append([sc, sv, tc, tv, 1])
    return out


def main():
    cache = load_cache()
    rst = json.loads((BR.MOD / "rst-dc.json").read_text(encoding="utf-8"))
    syn = {b["id"]: b for b in rst["books"]}
    words = BR.load_swete_words()
    grc = BR.read(BR.SRC / "grcbrent")

    # Синодальный стих -> стих Брентона (первый, попавший в этот синодальный стих)
    syn2br = {}
    for bk in {x[2] for x in OT.values()}:
        tgt, res, _ = BR.map_book(bk, grc[bk], syn, words)
        for (key, _), (ti, _) in zip(grc[bk], res):
            if key[1] == 0:
                key = (key[0], 1)  # надписание псалма (стих 0 у Брентона) на сайте — часть стиха 1
            syn2br.setdefault(tgt[ti], key)

    books = {}
    for app, (no, name, _) in OT.items():
        pairs, prev = [], None
        for c, ch in enumerate(syn[app]["chapters"], 1):
            for v in range(1, len(ch) + 1):
                k = syn2br.get((app, c, v)) or prev  # стиха нет у Брентона — как у предыдущего
                if k is None:
                    continue
                prev = k
                if tuple(k) != (c, v):
                    pairs.append((c, v, *k))
        entry = {"no": no}
        if runs(pairs):
            entry["map"] = runs(pairs)
        if no in FRAGMENTS:
            entry["have"] = coverage(cache, no, name)
            log(f"  {app}: сохранилось {entry['have']}")
        books[app] = entry

    S = synodal()
    for app, no in NT.items():
        pairs = []
        for c, ch in enumerate(syn[app]["chapters"], 1):
            for v in range(1, len(ch) + 1):
                _, kc, kv, _ = S.to_kjv(app, c, v)
                if (kc, kv) != (c, v):
                    pairs.append((c, v, kc, kv))
        books[app] = {"no": no, **({"map": runs(pairs)} if pairs else {})}

    OUT.write_text(json.dumps({"books": books}, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    n = sum(len(b.get("map", ())) for b in books.values())
    log(f"{OUT.name}: книг {len(books)}, участков нумерации {n}, {OUT.stat().st_size / 1e3:.1f} КБ")


if __name__ == "__main__":
    main()
