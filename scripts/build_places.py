"""Модуль «Библейские места» (тип maps, поле places) из данных проекта BibleMap владельца.

Источник (копия в data-src/biblemap/, из E:\\BibleMap\\database\\data):
  places_base.json  — OpenBible.info Bible Geocoding Data (CC BY 4.0): координаты, отождествление,
                      степень уверенности, стихи (нумерация KJV)
  places_ru.json    — русские названия и описания мест (BibleMap)
  osis_synodal.json — поправки KJV → синодальная нумерация для стихов мест (по таблице SWORD)
Запуск (после build_data.py — нужен public/modules/rst.json для проверки):
  python -I scripts/build_places.py
"""
import gzip
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "data-src" / "biblemap"
OUT = ROOT / "public" / "modules"

USFM = {
    "GEN": "Gen", "EXO": "Exod", "LEV": "Lev", "NUM": "Num", "DEU": "Deut", "JOS": "Josh", "JDG": "Judg", "RUT": "Ruth",
    "1SA": "1Sam", "2SA": "2Sam", "1KI": "1Kgs", "2KI": "2Kgs", "1CH": "1Chr", "2CH": "2Chr", "EZR": "Ezra", "NEH": "Neh",
    "EST": "Esth", "JOB": "Job", "PSA": "Ps", "PRO": "Prov", "ECC": "Eccl", "SNG": "Song", "ISA": "Isa", "JER": "Jer",
    "LAM": "Lam", "EZK": "Ezek", "DAN": "Dan", "HOS": "Hos", "JOL": "Joel", "AMO": "Amos", "OBA": "Obad", "JON": "Jonah",
    "MIC": "Mic", "NAM": "Nah", "HAB": "Hab", "ZEP": "Zeph", "HAG": "Hag", "ZEC": "Zech", "MAL": "Mal", "MAT": "Matt",
    "MRK": "Mark", "LUK": "Luke", "JHN": "John", "ACT": "Acts", "ROM": "Rom", "1CO": "1Cor", "2CO": "2Cor", "GAL": "Gal",
    "EPH": "Eph", "PHP": "Phil", "COL": "Col", "1TH": "1Thess", "2TH": "2Thess", "1TI": "1Tim", "2TI": "2Tim",
    "TIT": "Titus", "PHM": "Phlm", "HEB": "Heb", "JAS": "Jas", "1PE": "1Pet", "2PE": "2Pet", "1JN": "1John",
    "2JN": "2John", "3JN": "3John", "JUD": "Jude", "REV": "Rev",
}
TYPES = {
    "settlement": "населённый пункт", "region": "область", "special": "особое место", "mountain": "гора",
    "river": "река", "valley": "долина", "campsite": "стоянка", "gate": "ворота", "mountain range": "горный хребет",
    "body of water": "водоём", "spring": "источник", "island": "остров", "road": "дорога", "well": "колодец",
    "field": "поле", "hill": "холм", "tower": "башня", "wadi": "вади", "pool": "пруд", "garden": "сад",
    "altar": "жертвенник", "rock": "скала", "fortification": "крепость", "district": "район", "forest": "лес",
    "landmark": "ориентир", "people group": "народ", "tree": "дерево", "cave": "пещера", "building": "здание",
    "stone": "камень", "pass": "перевал", "harbor": "гавань", "cape": "мыс", "ford": "брод", "canal": "канал",
}
MIN_CONFIDENCE = 10  # %
SKIP_WORDS = ("гора", "река", "море", "поток", "долина", "пустыня", "земля", "город", "страна")


def stems(name):
    """Основы названия для поиска слова в стихе (как в BibleMap): «Вифлеем» → «вифл»."""
    words = [w for w in re.split(r"[\s\-–(),]+", name.lower().replace("ё", "е")) if len(w) >= 3]
    words = [w for w in words if w not in SKIP_WORDS] or words
    return sorted({w[:max(3, min(len(w) - 2, 5))] for w in words})


def main():
    base = json.loads((SRC / "places_base.json").read_text(encoding="utf-8"))
    ru = json.loads((SRC / "places_ru.json").read_text(encoding="utf-8"))
    fixes = json.loads((SRC / "osis_synodal.json").read_text(encoding="utf-8"))
    rst = json.loads((OUT / "rst.json").read_text(encoding="utf-8"))
    text = {b["id"]: b["chapters"] for b in rst["books"]}

    def synodal(osis):
        if osis in fixes:
            u, c, v = fixes[osis].split(".")
            return f"{USFM[u]}.{c}.{v}"
        return osis

    def verse_text(ref):
        b, c, v = ref.split(".")
        try:
            return text[b][int(c) - 1][int(v) - 1].lower().replace("ё", "е")
        except (KeyError, IndexError, ValueError):
            return ""

    # Места с вероятностью отождествления ниже 10% не показываем (и ссылки на них как на основное место)
    weak = {p["slug"] for p in base if p["confidence"] < MIN_CONFIDENCE}
    places, total, found = [], 0, 0
    for p in base:
        if p["slug"] in weak or p.get("alias_of") in weak:
            continue
        r = ru.get(p["key"], {})
        name = (r.get("name") or p["name_en"]).strip()
        st = stems(name)
        refs = []
        for o in p["verses"]:
            if len(o.split(".")) != 3:
                continue
            s = synodal(o)
            if s not in refs:
                refs.append(s)
            total += 1
            found += any(k in verse_text(s) for k in st)
        item = {
            "id": p["slug"], "name": name, "lat": round(p["lat"], 6), "lng": round(p["lng"], 6),
            "type": ", ".join(TYPES.get(t, t) for t in p["types"]), "confidence": p["confidence"],
            "modern": r.get("modern") or p.get("identification_en") or "", "description": r.get("desc", ""),
            "hint": r.get("hint", ""), "nameEn": p["name_en"], "stems": st, "refs": refs,
        }
        if p.get("alias_of"):
            item["aliasOf"] = p["alias_of"]
        places.append({k: v for k, v in item.items() if v not in ("", None, [])})

    module = {
        "format": "aob-module", "formatVersion": 1, "type": "maps", "id": "bible-places", "name": "Места",
        "title": "Библейские места на карте",
        "description": f"{len(places)} мест Библии с координатами, современным отождествлением, степенью уверенности, "
                       "описанием и всеми стихами, где место упомянуто. Нажмите на название города в стихе — "
                       "в выборке появится «Карта», и место откроется на карте во второй половине экрана.",
        "language": "ru", "version": "BibleMap 2026-10-23", "versification": "synodal",
        "author": "OpenBible.info (координаты и стихи); русские названия и описания — проект BibleMap",
        "source": "OpenBible.info Bible Geocoding Data (https://github.com/openbibleinfo/Bible-Geocoding-Data) "
                  "через проект BibleMap",
        "license": "CC BY 4.0 (OpenBible.info); русские тексты — BibleMap",
        "places": places,
    }
    data = json.dumps(module, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    assert "\ufffd" not in data.decode("utf-8")
    (OUT / "bible-places.json").write_bytes(data)
    gz = gzip.compress(data, 9)
    (OUT / "bible-places.json.gz").write_bytes(gz)

    cat_path = OUT / "catalog.json"
    cat = json.loads(cat_path.read_text(encoding="utf-8"))
    cat["modules"] = [m for m in cat["modules"] if m["id"] != "bible-places"]
    entry = {k: module[k] for k in ("id", "type", "name", "title", "description", "language", "version", "author",
                                    "source", "license", "versification")}
    entry.update({"url": "bible-places.json", "urlGz": "bible-places.json.gz", "size": len(data), "sizeGz": len(gz)})
    cat["modules"].append(entry)
    cat_path.write_text(json.dumps(cat, ensure_ascii=False, indent=1), encoding="utf-8")
    report = (f"мест: {len(places)}, ссылок: {total}, название найдено в синодальном стихе: {found} "
              f"({found * 100 // max(1, total)}%), {len(data) / 1e6:.2f} MB, gz {len(gz) / 1e6:.2f} MB\n")
    (ROOT / "data-src" / "biblemap" / "report.txt").write_text(report, encoding="utf-8")


if __name__ == "__main__":
    main()
