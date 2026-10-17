"""Модуль «Подстрочник» (public/modules/rst-interlinear.json и .gz): синодальный перевод RST+, у каждого слова —
оригинальное слово (Ветхий Завет — еврейский OSHB, Новый Завет — греческий текст Робинсона — Пирпонта).

Сопоставление — по номерам Стронга внутри стиха: k-е русское слово с номером N получает k-е оригинальное слово
с тем же номером (у глаголов «быть», «говорить», «видеть», «есть» в греческом один номер на все формы, а в RST+
у форм свои — они считаются одним словом). Подряд идущие русские слова с одним номером — один перевод оригинального
слова («будет говорить»): оригинал пишется у первого. Дополнительные номера русского слова («сотворил|H1254 H853»)
тоже занимают свои оригинальные слова, чтобы следующие русские слова сопоставились верно. Русские слова без номера
(добавленные курсивом) — без оригинала; оригинальные слова без русского соответствия не показываются.

Слово в тексте модуля: {русское|номера|морфология|оригинал}. Еврейские знаки кантилляции убираются (огласовки
остаются). Запуск: python -I scripts/build_interlinear.py
"""
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from extra_lib import merge_catalog, write_module  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
MOD = ROOT / "public" / "modules"
APPROVED = ROOT / "scripts" / "approved-modules.json"

TOKEN = re.compile(r"\{([^{}]*)\}")
CANTILLATION = re.compile("[֑-ֽ֯׀]")
SAME = [
    ["G1510", "G2258", "G2071", "G2070", "G2075", "G2076", "G2468", "G5600", "G1488", "G1526", "G2277"],
    ["G3004", "G2036", "G2046", "G4483"],
    ["G3708", "G1492", "G3700"],
    ["G2068", "G5315"],
    ["G5143", "G1408"],
]
ALIASES = {n: g for g in SAME for n in g}
NT_FIRST = "Matt"


def key(s):
    m = re.match(r"^([HG])0*(\d+)", s or "")
    return f"{m.group(1).upper()}{m.group(2)}" if m else None


def orig_words(text):
    """[(номер, слово)] оригинального стиха"""
    out = []
    for m in TOKEN.finditer(text or ""):
        parts = m.group(1).split("|")
        word = CANTILLATION.sub("", parts[0])
        num = key(parts[1].split()[0]) if len(parts) > 1 and parts[1].strip() else None
        out.append((num, word))
    return out


def align(ru_text, orig_text):
    queues = {}
    for num, word in orig_words(orig_text):
        if num:
            queues.setdefault(num, []).append(word)
    last = {}

    def take(k):
        for n in ALIASES.get(k, [k]):
            if queues.get(n):
                w = queues[n].pop(0)
                last[k] = w
                return w
        return None

    prev_key, prev_end = None, -1
    out, pos = [], 0
    for m in TOKEN.finditer(ru_text):
        parts = m.group(1).split("|")
        word, nums = parts[0], (parts[1].split() if len(parts) > 1 else [])
        morph = parts[2] if len(parts) > 2 else ""
        k = key(nums[0]) if nums else None
        between = ru_text[prev_end:m.start()] if prev_end >= 0 else ""
        orig = ""
        if k:
            if k == prev_key and not re.search(r"[^\s‹›]", between):
                orig = ""  # продолжение перевода того же слова
            else:
                orig = take(k) or last.get(k, "")
            for extra in nums[1:]:
                ek = key(extra)
                if ek:
                    take(ek)
        out.append(ru_text[pos:m.start()])
        out.append("{" + "|".join([word, " ".join(nums), morph, orig]) + "}")
        pos = m.end()
        prev_key, prev_end = k, m.end()
    out.append(ru_text[pos:])
    return "".join(out)


def main():
    rst = json.loads((MOD / "rst-plus.json").read_text(encoding="utf-8"))
    oshb = {b["id"]: b for b in json.loads((MOD / "oshb.json").read_text(encoding="utf-8"))["books"]}
    byz = {b["id"]: b for b in json.loads((MOD / "byz-rp2018.json").read_text(encoding="utf-8"))["books"]}
    books, words, matched = [], 0, 0
    for b in rst["books"]:
        src = byz.get(b["id"]) or oshb.get(b["id"])
        chapters = []
        for ci, ch in enumerate(b["chapters"]):
            ochap = src["chapters"][ci] if src and ci < len(src["chapters"]) else []
            row = []
            for vi, v in enumerate(ch):
                o = ochap[vi] if vi < len(ochap) else ""
                t = align(v, o) if v else v
                row.append(t)
                for m in TOKEN.finditer(t or ""):
                    words += 1
                    matched += bool(m.group(1).split("|")[3])
            chapters.append(row)
        books.append({**b, "chapters": chapters})
    module = {k: v for k, v in rst.items() if k != "books"}
    module.update({
        "id": "rst-interlinear",
        "name": "Подстрочник",
        "title": "Синодальный перевод с подстрочником",
        "description": "Синодальный перевод (RST+), под каждым словом — слово оригинала: еврейский текст Ветхого Завета "
                       "(OSHB, Ленинградский кодекс) и греческий текст Нового Завета (Робинсон — Пирпонт), с номерами Стронга. "
                       "Соответствие слов — по номерам Стронга; слова, добавленные переводчиками, — без оригинала.",
        "author": "Синодальный перевод (1876); разметка RST+ — В. Столярский; OSHB — Open Scriptures; греческий текст — "
                  "М. Робинсон и У. Пирпонт (2018); сопоставление — AO Bible",
        "license": "Синодальный перевод и греческий текст — Public Domain; OSHB — CC BY 4.0",
        "features": {**rst.get("features", {}), "interlinear": True},
        "books": books,
    })
    entry = write_module(module)
    merge_catalog([entry])
    approved = json.loads(APPROVED.read_text(encoding="utf-8"))
    if "rst-interlinear" not in approved["ids"]:
        approved["ids"].append("rst-interlinear")
        APPROVED.write_text(json.dumps(approved, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"слов: {words}, с оригиналом: {matched} ({matched / max(1, words):.0%})")


if __name__ == "__main__":
    main()
