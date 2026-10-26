"""Модули «Септуагинта (Брентон)»: греческий текст lxx-brenton и английский перевод brenton (public/modules/),
в синодальной нумерации стихов.

Исходники (недоверенные данные — только читаем; скачивает scripts/fetch_world.py ebible в data-src/extra/ebible/):
  grcbrent/     — «The Septuagint Version of the Old Testament» Л. Брентона (1844–1851), греческий текст, USFM
                  (https://ebible.org/find/details.php?id=grcbrent, Public Domain)
  eng-Brenton/  — английский перевод Брентона (1851), USFM (https://ebible.org/find/details.php?id=eng-Brenton, PD)
Нужен также собранный модуль public/modules/lxx-swete.json (Свит в синодальной нумерации, с номерами Стронга)
и rst-dc.json (сетка синодальных глав и стихов).

Как собирается:
1. Нумерация. У Брентона греческая нумерация (Иеремия в порядке LXX, 2 Ездры = Ездра + Неемия, Даниил с Сусанной
   и Вилом отдельными книгами). Греческий текст Брентона и Свита — оба по Ватиканскому кодексу и почти совпадают,
   поэтому стих Брентона -> синодальный стих выбирается лучевым Витерби (как в build_lxx.py) по общим словам со
   стихами Свита, уже переведёнными в синодальную нумерацию; надбавка — за тот же номер стиха, штраф — за скачок.
   Молитва Манассии (у Свита её нет) раскладывается по синодальным стихам пропорционально длине текста.
   Если в один синодальный стих попало несколько стихов Брентона — они идут подряд; подстихи (3 Цар 2:35a и т. п.)
   — в своём основном стихе (так их читает extra_world.read_usfm).
2. Номера Стронга в греческом тексте — от того же слова (без ударений) в сопоставленном стихе Свита, иначе от
   соседнего стиха, иначе — если во всей книге у этой формы один номер.
3. Английский перевод идёт параллельно греческому: внутри главы английские стихи выравниваются с греческими по
   длине (номера местами расходятся — например, надписание псалма бывает отдельным стихом) и получают место
   парного греческого стиха; стихи, которых в греческом нет (1 Цар 17:12–31 и 17:55–18:5 — Брентон перевёл их
   по Александрийскому кодексу), — следующий синодальный стих после предыдущего.
Не входят: 4 Маккавейская (её нет в синодальной нумерации), пролог Сираха (как и у Свита) и Неемия английского
пакета (повторяет 2 Ездры 11–23).

Запуск: python -I -X utf8 scripts/build_brenton.py [--report <файл>]
"""
import argparse
import collections
import json
import math
import re
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import extra_world as W  # noqa: E402
from build_lxx import bare, split_punct  # noqa: E402
from extra_lib import merge_catalog, write_module  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
MOD = ROOT / "public" / "modules"
SRC = ROOT / "data-src" / "extra" / "ebible"
APPROVED = ROOT / "scripts" / "approved-modules.json"
GRC, ENG = "lxx-brenton", "brenton"

# Код USFM Брентона -> книга источника (B…) или книга приложения; None — не входит
CODES = {"EZR": "B2Esd", "NEH": None, "ESG": "Esth", "DAG": "BDan", "SUS": "BSus", "BEL": "BBel", "LJE": "EpJer",
         "MAN": "PrMan", "4MA": None, "1ES": "1Esd"}
# Книга источника -> [(книга приложения, главы-цели или None — все)]
TARGETS = {"B2Esd": [("Ezra", None), ("Neh", None)], "BDan": [("Dan", range(1, 13))], "BSus": [("Dan", [13])],
           "BBel": [("Dan", [14])]}
# Номер стиха Брентона -> тот же стих в синодальной нумерации (для надбавки «тот же номер»)
SAME = {"B2Esd": lambda c, v: ("Ezra", c, v) if c <= 10 else ("Neh", c - 10, v), "BDan": lambda c, v: ("Dan", c, v),
        "BSus": lambda c, v: ("Dan", 13, v), "BBel": lambda c, v: ("Dan", 14, v)}

BEAM, TOP = 40, 12
ID_BONUS = 0.15
JUMP_NEAR, JUMP_FAR, MERGE = 0.7, 0.8, 0.3
WORD = re.compile(r"\{([^|}]*)\|([^}]*)\}|(\S+)")


def log(*a):
    print(*a, flush=True)


def read(folder):
    """USFM -> {книга: [((c, v), текст)]} в порядке файла, со своими кодами книг Брентона. Надписание псалма,
    которое у Брентона стоит под одним номером с первой строкой (\\d, \\v 1 надписание, \\p текст), отделяется
    в стих 0 — так оно встаёт в синодальный стих 1, если там надписание отдельно."""
    saved = dict(W.USFM_BOOKS)
    with tempfile.TemporaryDirectory() as tmp:
        for f in folder.glob("*.usfm"):
            t = f.read_text(encoding="utf-8-sig")
            if "-PSA" in f.name:
                t = re.sub(r"^\\d\s*\n\\v (\d+) ([^\n]*)\n\\p (?=\S)", r"\\d \2\n\\v \1 ", t, flags=re.M)
            if "-SIR" in f.name:  # пролог переводчика (1:1–1:1g) — в синодальной нумерации ему нет места
                t = re.sub(r"(\\c 1\s*\n).*?\\v 1h ", r"\1\\v 1 ", t, count=1, flags=re.S)
            (Path(tmp) / f.name).write_text(t, encoding="utf-8")
        try:
            W.USFM_BOOKS.update(CODES)
            for k in [k for k, v in W.USFM_BOOKS.items() if v is None]:
                del W.USFM_BOOKS[k]
            src, _ = W.read_usfm(Path(tmp), strongs=False)
        finally:
            W.USFM_BOOKS.clear()
            W.USFM_BOOKS.update(saved)
    return {b: list(vs.items()) for b, vs in src.items()}


def pair_chapter(g, e, ratio):
    """Стихи главы: греческие g и английские e ([(ключ, текст)]) -> {индекс в e: индекс в g или None}.
    Выравнивание по длине (перевод дословный): шаги 1-1, 1-2, 2-1, 1-0, 0-1; надбавка за тот же номер."""
    lg = [len(t) for _, t in g]
    le = [len(t) for _, t in e]

    def cost(a, b):
        return abs(math.log((b + 15) / (ratio * a + 15)))

    INF = float("inf")
    n, m = len(g), len(e)
    d = [[INF] * (m + 1) for _ in range(n + 1)]
    back = [[None] * (m + 1) for _ in range(n + 1)]
    d[0][0] = 0.0
    for i in range(n + 1):
        for j in range(m + 1):
            if d[i][j] == INF:
                continue
            steps = []
            if i < n and j < m:
                steps.append((1, 1, cost(lg[i], le[j]) - (0.3 if g[i][0] == e[j][0] else 0.0)))
            if i < n and j + 1 < m:
                steps.append((1, 2, 0.6 + cost(lg[i], le[j] + le[j + 1])))
            if i + 1 < n and j < m:
                steps.append((2, 1, 0.6 + cost(lg[i] + lg[i + 1], le[j])))
            if i < n:
                steps.append((1, 0, 2.5))
            if j < m:
                steps.append((0, 1, 2.5))
            for di, dj, c in steps:
                if d[i][j] + c < d[i + di][j + dj]:
                    d[i + di][j + dj] = d[i][j] + c
                    back[i + di][j + dj] = (di, dj)
    out, i, j = {}, n, m
    while i or j:
        di, dj = back[i][j]
        for k in range(dj):
            out[j - dj + k] = i - di if di else None
        i, j = i - di, j - dj
    return out


def swete_words(text):
    """Текст стиха Свита -> [(форма без ударений, номер Стронга или '', слово как написано)]."""
    out = []
    for m in WORD.finditer(text or ""):
        w, s = (m.group(1), m.group(2)) if m.group(1) is not None else (m.group(3), "")
        b = bare(w)
        if b:
            out.append((b, s, split_punct(w)[1]))
    return out


def align(src, tgt, words, same):
    """Лучевой Витерби: стихи источника (по порядку) -> индексы стихов-целей."""
    n = len(tgt)
    tix = {t: i for i, t in enumerate(tgt)}
    inv = collections.defaultdict(set)
    for i, t in enumerate(tgt):
        for b, *_ in words.get(t, ()):
            inv[b].add(i)
    beam, hist = {}, []
    for (c, v), text in src:
        forms = {bare(w) for w in text.split()} - {""}
        sc, wsum = collections.Counter(), 0.0
        for f in forms:
            hit = inv.get(f, ())
            w = max(math.log((n + 1) / (len(hit) + 1)), 0.1)
            wsum += w
            if len(hit) < 0.2 * n + 30:
                for i in hit:
                    sc[i] += w
        denom = max(wsum, 5 * wsum / len(forms)) if forms else 1.0
        em = {i: x / denom for i, x in sc.items()}
        idt = tix.get(same(c, v))
        cands = {i for i, _ in sc.most_common(TOP)} | ({idt} if idt is not None else set())
        for t in beam:
            cands.update(x for x in (t, t + 1, t + 2) if x < n)
        if not cands:
            cands = {0}
        new = {}
        for t in cands:
            e = em.get(t, 0.0) + (ID_BONUS if t == idt else 0.0)
            if not beam:
                new[t] = (e, None, em.get(t, 0.0))
                continue
            best = None
            for p, (ps, _, _) in beam.items():
                dl = t - p
                if dl == 1:
                    tr = 0.0
                elif dl == 0:
                    tr = -MERGE
                elif 2 <= dl <= 4:
                    tr = -0.15 * (dl - 1)
                else:
                    tr = -JUMP_NEAR if abs(dl) <= 60 else -JUMP_FAR
                if best is None or ps + tr + e > best[0]:
                    best = (ps + tr + e, p, em.get(t, 0.0))
            new[t] = best
        beam = dict(sorted(new.items(), key=lambda x: -x[1][0])[:BEAM])
        hist.append(beam)
    out = [None] * len(src)
    if not src:
        return out
    t = max(beam, key=lambda x: beam[x][0])
    for i in range(len(src) - 1, -1, -1):
        out[i] = (t, hist[i][t][2])
        t = hist[i][t][1]
    return out


def proportional(src, tgt, syn_text):
    """Раскладка по доле длины текста (для книг без греческого образца)."""
    a = [len(t) for _, t in src]
    b = [len(syn_text(t)) or 1 for t in tgt]
    sa, sb = sum(a), sum(b)
    cum_b, acc = [], 0
    for x in b:
        acc += x
        cum_b.append(acc / sb)
    out, acc = [], 0
    for x in a:
        mid = (acc + x / 2) / sa
        acc += x
        out.append((next(i for i, cb in enumerate(cum_b) if cb >= mid or i == len(cum_b) - 1), 0.0))
    return out


def markup(text, own, near, book_table, forms):
    out = []
    ws = text.split()
    caps = [len(L := [ch for ch in w if ch.isalpha()]) > 1 and all(ch.isupper() for ch in L[1:]) for w in ws]
    for i, w in enumerate(ws):
        if not any(ch.isalpha() for ch in w):
            out.append(w)
            continue
        lead, core, trail = split_punct(w)
        b = bare(core)
        if caps[i]:
            # слово заглавными (начало книги, надписание: ΠΑΣΑ, ΣΕΔΕΚΙΑΣ) -> написание Свита (Πᾶσα; имена у него
            # с заглавной; подвижное ν — как у Брентона), иначе строчными с заглавной первой; заглавная первая —
            # и у первого слова стиха (title: ᾎ, а не ἎΙ)
            f = forms.get(b)
            if not f and forms.get(b + "ν"):
                f = forms[b + "ν"][:-1]
            if not f and b.endswith("ν") and forms.get(b[:-1]):
                f = forms[b[:-1]] + "ν"
            core = f if f else core[0] + core[1:].lower()
            if i == 0 or not f:
                core = core[0].title() + core[1:]
            if core.endswith("σ"):
                core = core[:-1] + "ς"
        elif i and len(core) == 1 and core.isupper() and (caps[i - 1] or (i + 1 < len(ws) and caps[i + 1])):
            core = core.lower()  # одиночный артикль внутри надписания заглавными (Ὁ ΛΟΓΟΣ Ὁ ΓΕΝΟΜΕΝΟΣ)
        s = own.get(b) or near.get(b) or book_table.get(b)
        out.append(f"{lead}{{{core}|{s}}}{trail}" if s else f"{lead}{core}{trail}")
    return " ".join(out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--report", default=None)
    args = ap.parse_args()
    report = []

    def rep(*a):
        line = " ".join(str(x) for x in a)
        report.append(line)
        log(line)

    rst = json.loads((MOD / "rst-dc.json").read_text(encoding="utf-8"))
    syn = {b["id"]: b for b in rst["books"]}
    swete = {b["id"]: b for b in json.loads((MOD / "lxx-swete.json").read_text(encoding="utf-8"))["books"]}
    words = {}
    for bid, b in swete.items():
        for c, ch in enumerate(b["chapters"], 1):
            for v, t in enumerate(ch, 1):
                if t:
                    words[(bid, c, v)] = swete_words(t)

    grc, eng = read(SRC / "grcbrent"), read(SRC / "eng-Brenton")
    log(f"Брентон: греческих книг {len(grc)}, английских {len(eng)}")

    cells_g = collections.defaultdict(list)   # (книга, гл, ст) -> [текст]
    cells_e = collections.defaultdict(list)
    rep("Нумерация (стихи Брентона → синодальные; показаны только нетождественные участки) и сходство со Свитом:")
    tot_low = tot = 0
    for bk, src in grc.items():
        targets = TARGETS.get(bk, [(bk, None)])
        if any(app not in syn for app, _ in targets):
            log(f"  {bk}: нет в синодальной сетке — пропуск")
            continue
        tgt = [(app, c, v) for app, chs in targets for c, ch in enumerate(syn[app]["chapters"], 1)
               if chs is None or c in chs for v in range(1, len(ch) + 1)]
        same = SAME.get(bk, lambda c, v, _b=bk: (_b, c, v))
        if bk == "PrMan":
            res = proportional(src, tgt, lambda t: syn[t[0]]["chapters"][t[1] - 1][t[2] - 1])
        else:
            res = align(src, tgt, words, same)
        gmap = {}
        moved, low = [], 0
        book_table = collections.defaultdict(set)
        for t in tgt:
            for b, s, _ in words.get(t, ()):
                if s:
                    book_table[b].add(s)
        book_table = {b: next(iter(s)) for b, s in book_table.items() if len(s) == 1}
        for ((c, v), text), (ti, score) in zip(src, res):
            t = tgt[ti]
            gmap[(c, v)] = ti
            own = {b: s for b, s, _ in words.get(t, ()) if s}
            forms = {b: f for b, _, f in words.get(t, ())}
            near = {}
            for dt in (-1, 1):
                if 0 <= ti + dt < len(tgt):
                    near.update({b: s for b, s, _ in words.get(tgt[ti + dt], ()) if s})
            cells_g[t].append(markup(text, own, near, book_table, forms))
            if t != same(c, v):
                moved.append(f"{c}:{v}→{t[0]} {t[1]}:{t[2]}")
            if bk != "PrMan" and score < 0.2 and len(text.split()) >= 4:
                low += 1
        tot += len(src)
        tot_low += low
        rep(f"  {bk}: стихов {len(src)}, перенесено {len(moved)}, слабое сходство {low}"
            + (": " + "; ".join(moved[:12]) + (" …" if len(moved) > 12 else "") if moved else ""))
        # Английский — по месту парного греческого стиха (выравнивание глав по длине)
        esrc = eng.get(bk, [])
        ratio = sum(len(t) for _, t in esrc) / max(1, sum(len(t) for _, t in src))
        by_ch_g, by_ch_e = collections.defaultdict(list), collections.defaultdict(list)
        for k, t in src:
            by_ch_g[k[0]].append((k, t))
        for k, t in esrc:
            by_ch_e[k[0]].append((k, t))
        ekey = {}
        for c, ev in by_ch_e.items():
            gv = by_ch_g.get(c, [])
            gk, ek = {k for k, _ in gv}, {k for k, _ in ev}
            if gk <= ek:  # те же номера или лишние стихи в английском — по номеру
                ekey.update({k: (k if k in gk else None) for k in ek})
                continue
            for j, i in pair_chapter(gv, ev, ratio).items():  # номера сдвинуты — по длине
                ekey[ev[j][0]] = gv[i][0] if i is not None else None
        prev = None
        for (c, v), text in esrc:
            ti = gmap.get(ekey.get((c, v)))
            if ti is None:
                if prev is not None:
                    a, pc, pv = tgt[prev]
                    nxt = (a, pc, pv + 1)
                    ti = tgt.index(nxt) if nxt in set(tgt) else prev
                else:
                    ti = tgt.index(same(c, v)) if same(c, v) in set(tgt) else 0
            cells_e[tgt[ti]].append(text)
            prev = ti
    rep(f"Всего греческих стихов {tot}, со слабым сходством со Свитом {tot_low}")

    def books_of(cells):
        out = []
        for b in rst["books"]:
            if not any(k[0] == b["id"] for k in cells):
                continue
            chapters = [[" ".join(cells.get((b["id"], c, v), [])) for v in range(1, len(ch) + 1)]
                        for c, ch in enumerate(b["chapters"], 1)]
            out.append({"id": b["id"], "name": b["name"], "short": b["short"], "chapters": chapters})
        return out

    common = {"format": "aob-module", "formatVersion": 1, "type": "bible", "versification": "synodal",
              "version": "Brenton 1844–1851; eBible.org grcbrent / eng-Brenton (2026-04-08)",
              "license": "Public Domain"}
    numbering = ("Нумерация переведена в синодальную (сверка с текстом Свита по общим словам): Иеремия — в "
                 "синодальном порядке глав, 2 Ездры — в книгах Ездры и Неемии, Сусанна — Дан 13, Вил и дракон — "
                 "Дан 14; добавления Септуагинты с буквенными стихами — в своём основном стихе. 4 Маккавейской "
                 "нет (её нет в синодальной нумерации).")
    mod_g = {**common, "id": GRC, "name": "LXX Brenton", "language": "grc",
             "title": "Септуагинта (греческий Ветхий Завет), издание Брентона",
             "description": ("Греческий Ветхий Завет (перевод семидесяти толковников) по изданию Л. Брентона "
                             "«The Septuagint Version of the Old Testament» (Лондон, 1844–1851): текст Ватиканского "
                             "кодекса по Сикстинскому изданию 1587 г., со второканоническими книгами и Молитвой "
                             "Манассии. Номера Стронга — по тем же словам издания Свита; у слов, которых нет в "
                             "Новом Завете, номера нет. " + numbering),
             "author": "Sir Lancelot C. L. Brenton (1807–1862); электронный текст — eBible.org",
             "source": "https://ebible.org/find/details.php?id=grcbrent",
             "features": {"strongs": True, "morphology": False, "headings": False},
             "books": books_of(cells_g)}
    mod_e = {**common, "id": ENG, "name": "Brenton", "language": "en",
             "title": "The Septuagint in English (Brenton, 1851)",
             "description": ("Английский перевод Септуагинты Л. Брентона (1851) — первый полный перевод греческого "
                             "Ветхого Завета на английский, со второканоническими книгами и Молитвой Манассии. "
                             "Перевод сделан с Ватиканского кодекса; места, которых в нём нет, — по "
                             "Александрийскому. " + numbering),
             "author": "Sir Lancelot C. L. Brenton (1807–1862); электронный текст — eBible.org",
             "source": "https://ebible.org/find/details.php?id=eng-Brenton",
             "features": {"strongs": False, "headings": False},
             "books": books_of(cells_e)}
    entries = [write_module(mod_g), write_module(mod_e)]
    merge_catalog(entries, in_place=True)
    approved = json.loads(APPROVED.read_text(encoding="utf-8"))
    for mid in (GRC, ENG):
        if mid not in approved["ids"]:
            approved["ids"].append(mid)
    APPROVED.write_text(json.dumps(approved, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")

    n = s = 0
    for cell in cells_g.values():
        for t in cell:
            for m in WORD.finditer(t):
                if m.group(1) is not None:
                    s += 1
                    n += 1
                elif any(ch.isalpha() for ch in m.group(3)):
                    n += 1
    rep(f"Слова с номером Стронга: {s}/{n} = {s / max(1, n):.1%}")
    if args.report:
        Path(args.report).write_text("\n".join(report) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
