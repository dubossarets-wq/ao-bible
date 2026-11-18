"""Проверка модуля Дворецкого.

1. Сохранность: для КАЖДОЙ статьи электронной версии слова оформленной статьи (rich) сравниваются со словами
   исходной разметки (те же пометы раскрыты, авторы — по имени). Ищутся потерянные слова.
2. Сверка с независимой оцифровкой (azbyka.ru): у статей модуля (номера Стронга) сравниваются греческие слова и
   русские слова с текстом той же статьи на azbyka.ru.
Запуск: python -I -X utf8 scripts/verify_dvoretsky.py <папка с ref1_clean.jsonl/ref2_clean.jsonl>
"""
import collections
import json
import re
import sys
import unicodedata
import xml.etree.ElementTree as ET
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(Path(__file__).resolve().parent))
import dvoretsky_fmt as F
import dvoretsky_rich as R

root = ET.parse(ROOT / "data-src" / "dvoretsky" / "greek-dvoresky.xml").getroot()
AUTH = F.build_table(root.find("authors"))
R.set_marks({m.get("key"): m.text for m in root.find("marks")},
            json.loads((ROOT / "data-src" / "dvoretsky" / "printed_marks.json").read_text(encoding="utf-8")))
WORD = re.compile(r"[A-Za-zА-Яа-яЁёͰ-Ͽἀ-῿̀-ͯ᾽]+")


def words(s):
    return [unicodedata.normalize("NFC", w).lower() for w in WORD.findall(s or "")]


def head_of(entry):
    b = entry.find("body/text/bold")
    w = "".join(b.itertext()) if b is not None else entry.get("key")
    w = re.sub(r"^[IVX]+\s+", "", w.strip())
    return re.split(r"[,\s]", w)[0] or entry.get("key")


def ref_words(entry, head):
    out = []
    for body in entry.findall("body"):
        for part in body:
            els = [part] if part.tag == "text" else part.findall("item")
            for el in els:
                for t in R._tokens(el, head):
                    if t[0] == "t":
                        out += words(t[1])
                    elif t[0] == "m":
                        out += words(t[1])
                    elif t[0] == "k":
                        out += words(t[1])
                    elif t[0] == "a":
                        nm = "у" if t[1] == "ap." else F.fmt_one(t[1], AUTH).split(" (")[0]
                        out += words(nm)
    return out


def spans_text(sp):
    return "".join(x[0] for x in (sp or []))


def rich_words(blocks):
    out = []
    for b in blocks:
        k = b["k"]
        if k in ("h", "p"):
            out += words(spans_text(b["s"]))
        elif k == "f":
            for r in b["rows"]:
                out += words(r["label"]) + words(spans_text(r["s"]))
        elif k == "s":
            out += words(spans_text(b["m"]))
            for x in b["x"]:
                out += words(spans_text(x["q"])) + words(spans_text(x["t"]))
            if b.get("au"):
                out += words(re.sub(r"\([^)]*\)", "", b["au"]))
    return out


# ---- 1. сохранность по всем статьям ----
lost_entries, lost_total, n = [], collections.Counter(), 0
for e in root.find("entries"):
    head = head_of(e)
    blocks, _ = R.article_blocks(e, head, AUTH)
    ref = collections.Counter(ref_words(e, head))
    got = collections.Counter(rich_words(blocks))
    miss = ref - got
    n += 1
    if miss:
        lost_entries.append((e.get("key"), dict(miss)))
        lost_total.update(miss)
print(f"1. Сохранность: статей {n}, с потерянными словами {len(lost_entries)}")
print("   чаще всего теряются:", lost_total.most_common(15))
for k, m in lost_entries[:12]:
    print("   ", k, m)

# ---- 2. сверка с azbyka.ru ----
if len(sys.argv) > 1:
    d = Path(sys.argv[1])
    ref = []
    for v in ("1", "2"):
        p = d / f"ref{v}_clean.jsonl"
        if p.exists():
            ref += [json.loads(l) for l in p.open(encoding="utf-8")]

    def key(s):
        s = unicodedata.normalize("NFD", s)
        return "".join(c for c in s if not unicodedata.combining(c)).lower().replace("ς", "σ")

    def gkey(s):
        return "".join(c for c in key(s) if "α" <= c <= "ω")

    byk = collections.defaultdict(list)
    for r in ref:
        h = re.sub(r"^\s*(?:[IΙ]{1,3}|IV|V)\s+", "", r["head"])
        byk[gkey(re.split(r"[,\s]", h)[0])].append(r)
    mod = json.loads((ROOT / "public" / "modules" / "dvoretsky-gr.json").read_text(encoding="utf-8"))["entries"]
    gr = re.compile(r"[Ͱ-Ͽἀ-῿]")
    sims, rows = [], []
    for num, e in mod.items():
        cands = byk.get(gkey(e["lemma"]))
        if not cands:
            continue
        ours = collections.Counter(w for w in rich_words(e["rich"]) if gr.search(w))
        best = 0.0
        for c in cands:
            theirs = collections.Counter(w for w in words(c["text"]) if gr.search(w))
            inter = sum((ours & theirs).values())
            tot = max(1, max(sum(ours.values()), sum(theirs.values())))
            best = max(best, inter / tot)
        sims.append(best)
        rows.append((best, num, e["lemma"]))
    sims.sort()
    import statistics
    print(f"2. Сверка с azbyka.ru: статей сопоставлено {len(sims)} из {len(mod)}; совпадение греческих слов: "
          f"медиана {statistics.median(sims):.3f}; ≥0.95: {sum(s >= .95 for s in sims)}; 0.8–0.95: {sum(.8 <= s < .95 for s in sims)}; "
          f"<0.8: {sum(s < .8 for s in sims)}")
    rows.sort()
    print("   наименьшее совпадение:", [(round(a, 2), b, c) for a, b, c in rows[:15]])
    json.dump([{"sim": round(a, 3), "num": b, "lemma": c} for a, b, c in rows], open(d / "azbyka_vs_module.json", "w", encoding="utf-8"), ensure_ascii=False, indent=0)
