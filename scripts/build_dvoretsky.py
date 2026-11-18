"""Модуль «Дворецкий»: статьи Древнегреческо-русского словаря И. Х. Дворецкого (1958) по номерам Стронга (Новый Завет).

НЕ ПУБЛИКОВАТЬ без письменного разрешения: текст словаря под авторским правом (до 2049 г.); электронная версия —
Сергей Гурин (программа Alpha / Alpha2026, https://github.com/Gurin-SV/Alpha2026). Модуль собирается только локально:
в каталог и в approved-modules.json его добавляет флаг --publish, и то лишь после получения разрешения.

Источник: data-src/dvoretsky/greek-dvoresky.xml (выпуск Alpha2026 v0.1.0). Греческие слова Стронга — из
public/modules/strongs-ru-greek.json (поле lemma). Слово ищется сначала точно (с ударениями), затем без диакритики.

Запуск: python -I -X utf8 scripts/build_dvoretsky.py [--publish]
"""
import gzip
import json
import re
import sys
import unicodedata
import xml.etree.ElementTree as ET
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import dvoretsky_fmt as F
import dvoretsky_rich as R

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "data-src" / "dvoretsky" / "greek-dvoresky.xml"
OUT = ROOT / "public" / "modules"
MID = "dvoretsky-gr"
PUBLISH = "--publish" in sys.argv


def nfc(w):
    return unicodedata.normalize("NFC", w).strip()


def base(w):
    """без ударений, придыханий и долгот; конечная сигма — как обычная"""
    w = unicodedata.normalize("NFD", w)
    w = "".join(c for c in w if not unicodedata.combining(c))
    return re.sub(r"[^\w]", "", w.lower().replace("ς", "σ"))


root = ET.parse(SRC).getroot()
marks = {m.get("key"): m.text for m in root.find("marks")}
AUTHORS = F.build_table(root.find("authors"))
R.set_marks(marks, json.loads((ROOT / "data-src" / "dvoretsky" / "printed_marks.json").read_text(encoding="utf-8")))


def head_of(entry):
    """слово статьи для «~»: первое жирное слово без римских номеров омонимов"""
    b = entry.find("body/text/bold")
    w = "".join(b.itertext()) if b is not None else entry.get("key")
    w = re.sub(r"^[IVX]+\s+", "", w.strip())
    return re.split(r"[,\s]", w)[0] or entry.get("key")


def render(el, head):
    """элемент статьи → текст: сокращения и авторы — как в книге, «~» — словом статьи"""
    out = []

    def walk(e):
        tag = e.tag
        if tag == "tilde":
            out.append(head.replace("-", ""))
        elif tag == "br":
            out.append("\n")
        elif tag == "mark":
            out.append((e.text or "").replace("_", " "))
        elif tag == "author":
            out.append(F.MARK_A + (e.text or "") + F.MARK_B)
        else:
            if e.text:
                out.append(e.text)
            for c in e:
                walk(c)
                if c.tail:
                    out.append(c.tail)
            return
        if e.tail is not None and tag in ("tilde", "br", "mark"):
            pass

    walk(el)
    return "".join(out)


def article(entry):
    head = head_of(entry)
    # омонимы (I ἡμέρα — прил., II ἡμέρα — день) идут в одной статье отдельными <body> — берём все
    parts = []
    for body in entry.findall("body"):
        lines = []
        for part in body:
            if part.tag == "text":
                lines.append(F.fmt_line(render(part, head), AUTHORS))
            elif part.tag == "list":
                for it in part.findall("item"):
                    lvl = int(it.get("level") or 1)
                    lines.append(("   " * (lvl - 1)) + F.fmt_line(render(it, head), AUTHORS, item=True))
        parts.append("\n".join(re.sub(r"[ \t]+", " ", x).strip() for x in lines if x.strip()))
    return "\n\n".join(x for x in parts if x)


# все статьи: точный ключ и ключ без диакритики
exact, loose = {}, {}
for e in root.find("entries"):
    k = nfc(e.get("key") or "")
    if not k:
        continue
    exact.setdefault(k, []).append(e)
    loose.setdefault(base(k), []).append(e)

strongs = json.loads((OUT / "strongs-ru-greek.json").read_text(encoding="utf-8"))["entries"]
entries, how = {}, {"точно": 0, "без ударений": 0, "без ударений, несколько": 0, "другое написание": 0, "нет": 0}
missing = []
for num, s in strongs.items():
    lemma = nfc(s.get("lemma") or "")
    if not lemma:
        continue
    hit = exact.get(lemma)
    kind = "точно"
    if not hit:
        hit = loose.get(base(lemma))
        kind = "без ударений" if hit and len(hit) == 1 else "без ударений, несколько"
    if not hit:
        # то же слово в другом написании: οὕτω — οὕτως, ἡττάω — ἡττάομαι, γεύομαι — γεύω, ττ — σσ, λῆμψις — λῆψις
        b = base(lemma)
        for v in (b + "σ", b[:-1] if b.endswith("σ") else None, b[:-1] + "ομαι" if b.endswith("ω") else None,
                  b[:-4] + "ω" if b.endswith("ομαι") else None, b.replace("ττ", "σσ"), b.replace("σσ", "ττ"),
                  b.replace("μψ", "ψ"), b.replace("μπτ", "πτ"),
                  # γίνομαι — γίγνομαι, κυλιόω — κυλίω, ἐπανίσταμαι — ἐπανίστημι, -ώτερος — -ός
                  b.replace("γιν", "γιγν"), b.replace("γιγν", "γιν"), b.replace("ιοω", "ιω"),
                  b[:-4] + "ημι" if b.endswith("αμαι") else None, b[:-3] + "ος" if b.endswith("τερος") else None,
                  b[:-2] + "μι" if b.endswith("ω") else None, b[:-2] + "ω" if b.endswith("μι") else None,
                  b.replace("ρρ", "ρ"), b.replace("ρ", "ρρ", 1)):
            if v and v != b and loose.get(v):
                hit, kind = loose[v], "другое написание"
                break
    if not hit:
        how["нет"] += 1
        missing.append((num, lemma))
        continue
    how[kind] += 1
    text = "\n\n".join(article(e) for e in hit[:3])  # омонимы — все (до трёх) подряд
    blocks, inline = [], []
    for i, e in enumerate(hit[:3]):
        b, k = R.article_blocks(e, head_of(e), AUTHORS)
        if i:
            blocks.append({"k": "hr"})
        blocks += b
        inline += [x for x in k if x not in inline]
    legend = []
    for k in inline:
        nm, yr = AUTHORS.get(k) or AUTHORS.get(k.rstrip(".")) or (None, None)
        if nm and yr and [nm, yr] not in legend:
            legend.append([nm, yr])
    if legend:
        blocks.append({"k": "legend", "a": legend})
    entries[num] = {"lemma": lemma, "text": text, "rich": blocks}

print(f"номеров Стронга: {len(strongs)}, статей найдено: {len(entries)}")
for k, v in how.items():
    print(f"  {k}: {v}")
print("  нет, примеры:", missing[:15])

module = {
    "format": "aob-module", "formatVersion": 1, "type": "dictionary", "dictionaryKind": "strongs", "language": "ru",
    "id": MID, "name": "Словарь Дворецкого",
    "title": "Древнегреческо-русский словарь И. Х. Дворецкого — статьи к словам Нового Завета (по номерам Стронга)",
    "description": "Самый полный древнегреческо-русский словарь (1958, под ред. С. И. Соболевского): значения слова с цитатами "
                   "из античных авторов. Электронная версия — Сергей Гурин (программа Alpha).",
    "version": "Alpha2026 0.1.0", "author": "И. Х. Дворецкий; электронная версия — С. Гурин",
    "source": "https://github.com/Gurin-SV/Alpha2026",
    "license": "Только с разрешения правообладателей (ожидается)",
    "entries": entries,
}
data = json.dumps(module, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
(OUT / f"{MID}.json").write_bytes(data)
gz = gzip.compress(data, 9)
(OUT / f"{MID}.json.gz").write_bytes(gz)
print(f"{MID}: {len(data)/1e6:.1f} MB, gz {len(gz)/1e6:.2f} MB  ->  {OUT / (MID + '.json')}")

if PUBLISH:
    cat_path = OUT / "catalog.json"
    cat = json.loads(cat_path.read_text(encoding="utf-8"))
    cat["modules"] = [m for m in cat["modules"] if m["id"] != MID]
    entry = {k: module[k] for k in ("id", "type", "dictionaryKind", "name", "title", "description", "language", "version", "author", "source", "license")}
    entry.update({"url": f"{MID}.json", "urlGz": f"{MID}.json.gz", "size": len(data), "sizeGz": len(gz)})
    pos = next(i for i, m in enumerate(cat["modules"]) if m["id"] == "strongs-ru-greek") + 1
    cat["modules"].insert(pos, entry)
    cat_path.write_text(json.dumps(cat, ensure_ascii=False, indent=1), encoding="utf-8")
    ap = ROOT / "scripts" / "approved-modules.json"
    a = json.loads(ap.read_text(encoding="utf-8"))
    if MID not in a["ids"]:
        a["ids"].append(MID)
        ap.write_text(json.dumps(a, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print("добавлен в каталог и в approved-modules.json")
else:
    print("в каталог НЕ добавлен (нужен --publish после разрешения)")
