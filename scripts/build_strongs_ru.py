"""Русский лексикон Стронга: модули strongs-ru-hebrew и strongs-ru-greek (public/modules/*.json и .gz).

Основа — английские модули strongs-hebrew / strongs-greek (Стронг — общественное достояние, JSON — Open Scriptures,
CC BY-SA). Значение (definition) и происхождение (derivation) переведены на русский для AO Bible — перевод лежит
кусками в data-src/strongs-ru/chunks/{heb,grc}_NNNN.json: {"H1": {"def": "…", "der": "…"}}. Номера Стронга и слова
оригинала в переводе сохранены. Английское произношение (pron) и переводы KJV не берутся — вместо них в приложении
есть «Симфония RST+» (как слово передано в синодальном переводе).

Запуск: python -I scripts/build_strongs_ru.py
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from extra_lib import merge_catalog, write_module  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
MOD = ROOT / "public" / "modules"
CHUNKS = ROOT / "data-src" / "strongs-ru" / "chunks"
APPROVED = ROOT / "scripts" / "approved-modules.json"


def load_chunks(prefix):
    out = {}
    for f in sorted(CHUNKS.glob(f"{prefix}_*.json")):
        out.update(json.loads(f.read_text(encoding="utf-8")))
    return out


def build(src_id, prefix, new_id, name, title, testament):
    src = json.loads((MOD / f"{src_id}.json").read_text(encoding="utf-8"))
    ru = load_chunks(prefix)
    entries, missing = {}, 0
    for k, e in src["entries"].items():
        t = ru.get(k)
        if t is None:
            missing += 1
        item = {"lemma": e.get("lemma"), "xlit": e.get("xlit"),
                "derivation": (t or {}).get("der") or "", "definition": (t or {}).get("def") or ""}
        entries[k] = {kk: vv for kk, vv in item.items() if vv}
    assert not missing, f"{new_id}: нет перевода у {missing} статей"
    module = {
        "format": "aob-module", "formatVersion": 1, "type": "dictionary", "dictionaryKind": "strongs",
        "language": "ru", "id": new_id, "name": name, "title": title,
        "description": f"Лексикон Стронга для {testament} на русском языке: слово оригинала, транслитерация, "
                       "происхождение и значение. Как слово передано в синодальном переводе — в «Симфонии RST+».",
        "version": "1.0",
        "author": "Джеймс Стронг; JSON — Open Scriptures; перевод на русский — AO Bible",
        "source": "https://github.com/openscriptures/strongs (перевод: data-src/strongs-ru)",
        "license": "CC BY-SA (Open Scriptures, перевод AO Bible); исходный текст Стронга — Public Domain",
        "entries": entries,
    }
    return write_module(module)


def main():
    entries = [
        build("strongs-hebrew", "heb", "strongs-ru-hebrew", "Стронг: иврит (рус.)",
              "Еврейский лексикон Стронга на русском языке", "Ветхого Завета"),
        build("strongs-greek", "grc", "strongs-ru-greek", "Стронг: греческий (рус.)",
              "Греческий лексикон Стронга на русском языке", "Нового Завета"),
    ]
    merge_catalog(entries)
    approved = json.loads(APPROVED.read_text(encoding="utf-8"))
    add = [e["id"] for e in entries if e["id"] not in approved["ids"]]
    if add:
        approved["ids"] += add
        APPROVED.write_text(json.dumps(approved, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
