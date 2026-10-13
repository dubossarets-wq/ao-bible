"""Конвертирует исходные данные в модули формата aob-module (см. docs/MODULE_SCHEMA.md).

Исходники (data-src/):
  RSTE_verse_words.xml          — Синодальный перевод с номерами Стронга (swmail/RST, Public Domain)
  strongs-hebrew-dictionary.js  — Strong's Hebrew Dictionary (Open Scriptures, CC-BY-SA)
  strongs-greek-dictionary.js   — Strong's Greek Dictionary (Open Scriptures, CC-BY-SA)

Результат: public/modules/*.json, *.json.gz и catalog.json.
Запуск: python -I scripts/build_data.py
"""
import gzip
import json
import re
import sys
import xml.etree.ElementTree as ET
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "data-src"
OUT = ROOT / "public" / "modules"
OUT.mkdir(parents=True, exist_ok=True)

NS = "{http://www.bibletechnologies.net/2003/OSIS/namespace}"
BOOKS = json.loads((ROOT / "src" / "core" / "books.json").read_text(encoding="utf-8"))
BOOK_BY_ID = {b["id"]: b for b in BOOKS}
WORD_RE = re.compile(r"[а-яёА-ЯЁ]+(?:-[а-яёА-ЯЁ]+)*")


def compact_ref(ref):
    """Job.38.4-Job.38.7 -> Job.38.4-7 ; Gen.1.1-Gen.2.3 -> Gen.1.1-2.3"""
    if "-" not in ref:
        return ref
    a, b = ref.split("-", 1)
    pa, pb = a.split("."), b.split(".")
    if len(pa) == 3 and len(pb) == 3 and pa[0] == pb[0]:
        return f"{a}-{pb[2]}" if pa[1] == pb[1] else f"{a}-{pb[1]}.{pb[2]}"
    return ref


def parse_rst():
    tree = ET.parse(SRC / "RSTE_verse_words.xml")
    books = {}
    xrefs = defaultdict(dict)
    renderings = defaultdict(Counter)   # strong -> Counter(русская форма)
    first_refs = defaultdict(list)      # strong -> первые стихи
    word_index = defaultdict(Counter)   # словоформа -> Counter(strong)
    strong_total = Counter()

    for book_el in tree.iter(NS + "div"):
        if book_el.get("type") != "book":
            continue
        bid = book_el.get("osisID")
        chapters, headings = [], {}
        for ch_el in book_el.iter(NS + "chapter"):
            verses = []
            for v_el in ch_el.iter(NS + "verse"):
                _, c, vn = v_el.get("osisID").split(".")
                c, vn = int(c), int(vn)
                parts, refs = [], []

                def walk(el, italic=False):
                    for child in el:
                        tag = child.tag.replace(NS, "")
                        if tag == "title":
                            headings[f"{c}:{vn}"] = "".join(child.itertext()).strip()
                        elif tag == "note":
                            for r in child.iter(NS + "reference"):
                                refs.append(compact_ref(r.get("osisRef")))
                        elif tag == "w":
                            text = "".join(child.itertext())
                            lemma = [x.split(":", 1)[1] for x in (child.get("lemma") or "").split() if ":" in x]
                            lemma = [x for x in lemma if x not in ("H0", "G0")]
                            morph = [x.split(":", 1)[1] for x in (child.get("morph") or "").split() if ":" in x]
                            morph = [m for m in morph if re.search(r"\d", m)]
                            # В исходнике соседние <w> иногда идут без пробела («земле</w><w>Ханаанской»)
                            if parts and re.search(r"([а-яёА-ЯЁ]|\})›?$", parts[-1]) and re.match(r"[а-яёА-ЯЁ]", text):
                                parts.append(" ")
                            if lemma and text.strip():
                                tok = "{" + text + "|" + " ".join(lemma)
                                if morph:
                                    tok += "|" + " ".join(morph)
                                tok += "}"
                                parts.append(("‹" + tok + "›") if italic else tok)
                                key = text.strip().lower()
                                for s in lemma:
                                    renderings[s][key] += 1
                                    strong_total[s] += 1
                                    if len(first_refs[s]) < 6:
                                        ref = f"{bid}.{c}.{vn}"
                                        if ref not in first_refs[s]:
                                            first_refs[s].append(ref)
                                for wf in WORD_RE.findall(key):
                                    for s in lemma:
                                        word_index[wf][s] += 1
                            else:
                                parts.append(("‹" + text + "›") if italic else text)
                        elif tag == "hi":
                            if child.text:
                                parts.append("‹" + child.text + "›")
                            walk(child, italic=True)
                        elif tag == "lb":
                            pass
                        else:
                            walk(child, italic)
                        if child.tail:
                            parts.append(child.tail)

                if v_el.text:
                    parts.append(v_el.text)
                walk(v_el)
                text = re.sub(r"\s+", " ", "".join(parts)).strip()
                text = text.replace("››‹", "").replace("›‹", "")
                text = re.sub(r"\s+([,.;:!?)])", r"\1", text)
                # «Рувимовых</w>по», «Израилевы,когда» — в исходнике пропущены пробелы
                text = re.sub(r"(\}›?)([а-яёА-ЯЁ‹{])", r"\1 \2", text)
                text = re.sub(r"([,;:!?])([а-яёА-ЯЁ‹{])", r"\1 \2", text)
                # Остальные слитные стыки на границах разметки: «очах</w><hi>Твоих</hi>»
                text = re.sub(r"([а-яё](?:\|[^}]*\})?›?)(‹?\{?[А-ЯЁ])", r"\1 \2", text)
                while len(verses) < vn - 1:
                    verses.append("")
                verses.append(text)
                if refs:
                    xrefs[bid][f"{c}:{vn}"] = refs
            chapters.append(verses)
        books[bid] = {"chapters": chapters, "headings": headings}
    return books, xrefs, renderings, first_refs, word_index, strong_total


def strip_markup(s):
    s = re.sub(r"\{([^|}]*)\|[^}]*\}", r"\1", s)
    return s.replace("‹", "").replace("›", "")


def book_list(books, plain=False):
    out = []
    for i, meta in enumerate(BOOKS):
        b = books.get(meta["id"])
        if not b:
            continue
        chapters = [[strip_markup(v) for v in ch] for ch in b["chapters"]] if plain else b["chapters"]
        out.append({"id": meta["id"], "number": i + 1, "name": meta["name"], "short": meta["short"],
                    "chapters": chapters, "headings": b["headings"]})
    return out


def write(name, obj):
    data = json.dumps(obj, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    (OUT / f"{name}.json").write_bytes(data)
    gz = gzip.compress(data, 9)
    (OUT / f"{name}.json.gz").write_bytes(gz)
    print(f"{name}: {len(data)/1e6:.2f} MB, gz {len(gz)/1e6:.2f} MB")
    return len(data), len(gz)


def load_js_dict(path):
    s = path.read_text(encoding="utf-8")
    start = s.index("{", s.index("= {") )
    end = s.rindex("};") + 1
    return json.loads(s[start:end])


RST_SOURCE = "https://github.com/swmail/RST (SWORD-модуль RSThcs, подготовил В. Столярский на основе «Библии» ИББ, BibleQuote и Slavic Bible for Windows)"


def main():
    books, xrefs, renderings, first_refs, word_index, strong_total = parse_rst()
    catalog = []

    def add(meta, name):
        size, gz = write(name, meta)
        entry = {k: meta[k] for k in ("id", "type", "name", "title", "description", "language", "version",
                                       "author", "source", "license") if k in meta}
        for k in ("dictionaryKind", "features", "versification"):
            if k in meta:
                entry[k] = meta[k]
        entry.update({"url": f"{name}.json", "urlGz": f"{name}.json.gz",
                      "size": size, "sizeGz": gz})
        catalog.append(entry)

    common = {"format": "aob-module", "formatVersion": 1, "language": "ru", "versification": "synodal"}
    add({**common, "type": "bible", "id": "rst-plus", "name": "RST+",
         "title": "Синодальный перевод с номерами Стронга",
         "description": "Русский синодальный перевод (1876) с номерами Стронга, морфологическими кодами, "
                        "заголовками разделов и курсивом добавленных слов.",
         "version": "1.0", "author": "Святейший Синод (перевод, 1876); разметка — В. Столярский",
         "source": RST_SOURCE, "license": "Public Domain",
         "features": {"strongs": True, "morphology": True, "headings": True, "italics": True},
         "books": book_list(books)}, "rst-plus")

    add({**common, "type": "bible", "id": "rst", "name": "RST",
         "title": "Синодальный перевод (облегчённый)",
         "description": "Тот же синодальный текст без разметки Стронга. Загружается быстрее, подходит "
                        "для слабых устройств и второй панели.",
         "version": "1.0", "author": "Святейший Синод (перевод, 1876)",
         "source": RST_SOURCE, "license": "Public Domain",
         "features": {"strongs": False, "headings": True},
         "books": book_list(books, plain=True)}, "rst")

    add({**common, "type": "crossrefs", "id": "xrefs-rst", "name": "Параллельные места RST",
         "title": "Параллельные места синодального издания",
         "description": f"{sum(len(v) for b in xrefs.values() for v in b.values())} ссылок для "
                        f"{sum(len(b) for b in xrefs.values())} стихов. Нумерация синодальная.",
         "version": "1.0", "author": "Синодальное издание с параллельными местами",
         "source": RST_SOURCE, "license": "Public Domain",
         "refs": {f"{b}.{k.replace(':', '.')}": v for b, m in xrefs.items() for k, v in m.items()}},
        "xrefs-rst")

    # Симфония: как номер Стронга передан в синодальном тексте + обратный индекс словоформ
    entries = {}
    for s, cnt in renderings.items():
        entries[s] = {"renderings": [[w, n] for w, n in cnt.most_common(20)],
                      "count": strong_total[s], "refs": first_refs[s]}
    index = {}
    for wf, cnt in word_index.items():
        total = sum(cnt.values())
        top = [[s, n] for s, n in cnt.most_common(8) if n >= max(1, total * 0.04)]
        if top:
            index[wf] = top
    add({**common, "type": "dictionary", "dictionaryKind": "strongs", "id": "rst-symphony",
         "name": "Симфония RST+", "title": "Симфония синодального перевода по номерам Стронга",
         "description": "Как каждое слово оригинала передано в синодальном переводе: варианты перевода, "
                        "частота, первые места употребления. Служит и для приблизительного сопоставления "
                        "русских слов с номерами Стронга в переводах без разметки.",
         "version": "1.0", "author": "Автоматически собрано из RST+",
         "source": RST_SOURCE, "license": "Public Domain",
         "entries": entries, "wordIndex": index}, "rst-symphony")

    heb = load_js_dict(SRC / "strongs-hebrew-dictionary.js")
    grk = load_js_dict(SRC / "strongs-greek-dictionary.js")

    def norm(d):
        out = {}
        for k, e in d.items():
            item = {"lemma": e.get("lemma"), "xlit": e.get("xlit") or e.get("translit"),
                    "pron": e.get("pron"), "derivation": (e.get("derivation") or "").strip(),
                    "definition": (e.get("strongs_def") or "").strip(),
                    "kjv": (e.get("kjv_def") or "").strip()}
            # В исходнике встречается мусорный символ U+FFFD (например, в H7578)
            out[k] = {kk: vv.replace("�", "").strip() for kk, vv in item.items() if vv}
        return out

    os_common = {"format": "aob-module", "formatVersion": 1, "type": "dictionary", "dictionaryKind": "strongs",
                 "language": "en", "license": "CC-BY-SA (Open Scriptures); исходный текст Стронга — Public Domain"}
    add({**os_common, "id": "strongs-hebrew", "name": "Стронг: иврит",
         "title": "A Concise Dictionary of the Words in the Hebrew Bible (J. Strong, 1894)",
         "description": "Лексикон Стронга для Ветхого Завета: еврейское написание, транслитерация, "
                        "произношение, происхождение и значение. Статьи на английском языке.",
         "version": "openscriptures/strongs", "author": "James Strong; JSON — Open Scriptures; XML — D. Instone-Brewer, D. Troidl",
         "source": "https://github.com/openscriptures/strongs",
         "entries": norm(heb)}, "strongs-hebrew")
    add({**os_common, "id": "strongs-greek", "name": "Стронг: греческий",
         "title": "Dictionary of Greek Words (J. Strong, 1890)",
         "description": "Лексикон Стронга для Нового Завета: греческое написание, транслитерация, "
                        "происхождение и значение. Статьи на английском языке.",
         "version": "openscriptures/strongs", "author": "James Strong; JSON — Open Scriptures; XML — Ulrik Petersen",
         "source": "https://github.com/openscriptures/strongs",
         "entries": norm(grk)}, "strongs-greek")

    catalog.append({"id": "goetze", "type": "bible", "name": "Библия Гёце",
                    "title": "Библия с параллельными местами и примечаниями пастора Б. Гёце",
                    "description": "Синодальный текст с протестантскими примечаниями и подзаголовками. "
                                   "Свободно распространяемой электронной версии не найдено, поэтому модуль "
                                   "в каталоге не публикуется. Если у вас есть законная копия в JSON, "
                                   "импортируйте её во вкладке «Импорт файлов».",
                    "language": "ru", "unavailable": True})

    (OUT / "catalog.json").write_text(json.dumps({"format": "aob-catalog", "formatVersion": 1,
                                                  "modules": catalog}, ensure_ascii=False, indent=1),
                                      encoding="utf-8")
    print("catalog:", len(catalog), "entries")


if __name__ == "__main__":
    sys.exit(main())
