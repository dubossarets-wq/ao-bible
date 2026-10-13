"""Модуль «Синодальный перевод с неканоническими книгами» из CrossWire RusSynodal (Public Domain).

Источник: data-src/RusSynodal.zip — https://crosswire.org/ftpmirror/pub/sword/packages/rawzip/RusSynodal.zip
Нужен pysword: python -m pip install --target .pylib pysword==0.2.8
Запуск (после build_data.py — дописывает модуль в public/modules/catalog.json):
  python -I scripts/build_dc.py
"""
import gzip
import json
import re
import sys
import tempfile
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / ".pylib"))
from pysword.bible import SwordBible  # noqa: E402

OUT = ROOT / "public" / "modules"
BOOKS = json.loads((ROOT / "src" / "core" / "books.json").read_text(encoding="utf-8"))


def clean(text):
    text = re.sub(r"\s+", " ", text).strip()
    return re.sub(r"\s+([,.;:!?)])", r"\1", text)


def main():
    tmp = Path(tempfile.mkdtemp())
    zipfile.ZipFile(ROOT / "data-src" / "RusSynodal.zip").extractall(tmp)
    bible = SwordBible(str(tmp / "modules" / "texts" / "ztext" / "russynodal"), "ztext", "synodal", "utf-8", "OSIS")
    structure = bible.get_structure()
    sword_books = {b.osis_name: b for t in ("ot", "nt") for b in structure.get_books()[t]}

    books, missing = [], []
    for i, meta in enumerate(BOOKS):
        sb = sword_books.get(meta["id"])
        if not sb:
            missing.append(meta["id"])
            continue
        chapters = []
        for c in range(1, sb.num_chapters + 1):
            verses = [clean(v) for v in bible.get_iter(books=[sb.name], chapters=[c], clean=True)]
            while verses and not verses[-1]:
                verses.pop()
            chapters.append(verses)
        books.append({"id": meta["id"], "number": i + 1, "name": meta["name"], "short": meta["short"],
                      "chapters": chapters, "headings": {}})
    if missing:
        print("нет в модуле:", missing)

    dc_ids = [b["id"] for b in BOOKS if b.get("dc")]
    module = {
        "format": "aob-module", "formatVersion": 1, "type": "bible", "id": "rst-dc", "name": "RST НК",
        "title": "Синодальный перевод с неканоническими книгами",
        "description": "Полный синодальный перевод (1876) в порядке синодального издания, вместе с неканоническими "
                       "книгами: Товит, Иудифь, Премудрость Соломона, Сирах, Послание Иеремии, Варух, 1–3 Маккавейские, "
                       "2 и 3 Ездры, Молитва Манассии, а также Даниил 13–14 и Псалом 151. Без номеров Стронга.",
        "language": "ru", "version": "CrossWire RusSynodal 1.9.1", "author": "Святейший Синод (перевод, 1876)",
        "source": "CrossWire Bible Society, модуль RusSynodal (https://crosswire.org/sword/modules/)",
        "license": "Public Domain", "versification": "synodal",
        "features": {"strongs": False, "deuterocanonical": True},
        "books": books,
    }
    data = json.dumps(module, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    assert "�" not in data.decode("utf-8"), "в тексте есть U+FFFD"
    (OUT / "rst-dc.json").write_bytes(data)
    gz = gzip.compress(data, 9)
    (OUT / "rst-dc.json.gz").write_bytes(gz)
    print(f"rst-dc: {len(books)} книг ({sum(1 for b in books if b['id'] in dc_ids)} неканонических), "
          f"{len(data)/1e6:.2f} MB, gz {len(gz)/1e6:.2f} MB")

    cat_path = OUT / "catalog.json"
    cat = json.loads(cat_path.read_text(encoding="utf-8"))
    cat["modules"] = [m for m in cat["modules"] if m["id"] != "rst-dc"]
    entry = {k: module[k] for k in ("id", "type", "name", "title", "description", "language", "version", "author",
                                    "source", "license", "features", "versification")}
    entry.update({"url": "rst-dc.json", "urlGz": "rst-dc.json.gz", "size": len(data), "sizeGz": len(gz)})
    pos = next(i for i, m in enumerate(cat["modules"]) if m["id"] == "rst") + 1
    cat["modules"].insert(pos, entry)
    cat_path.write_text(json.dumps(cat, ensure_ascii=False, indent=1), encoding="utf-8")


if __name__ == "__main__":
    main()
