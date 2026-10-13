"""Личный модуль из издания bibles.org.uk (Т. Айвазян, В. Волович): синодальный перевод
с неканоническими книгами и апокрифами (Енох, Юбилеи, Заветы двенадцати патриархов, Сивиллины книги…).

У издания нет открытой лицензии — README просит запрашивать разрешение (aivazian.tigran@gmail.com).
Поэтому модуль не публикуется в каталоге: файл собирается в local-modules/ (в .gitignore) и
импортируется на своём устройстве через «Библиотека модулей → Импорт файлов».

Источник: https://github.com/tigran123/russian-synodal-bible (папка tex/ и russian-synodal-bible.tex
скачаны в data-src/tigran/). Запуск: python -I scripts/build_tigran.py
"""
import gzip
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "data-src" / "tigran"
OUT = ROOT / "local-modules"
OUT.mkdir(exist_ok=True)

# Коды издания → OSIS-коды приложения (книги, которых тут нет, остаются со своим кодом)
OSIS = {
    "Exo": "Exod", "Deu": "Deut", "Jdg": "Judg", "Jos": "Josh", "Rut": "Ruth", "1Sa": "1Sam", "2Sa": "2Sam", "1Ki": "1Kgs",
    "2Ki": "2Kgs", "1Ch": "1Chr", "2Ch": "2Chr", "Ezr": "Ezra", "2Ez": "1Esd", "Est": "Esth", "Psa": "Ps",
    "Pro": "Prov", "Ecc": "Eccl", "Sol": "Song", "Epj": "EpJer", "Eze": "Ezek", "Joe": "Joel", "Amo": "Amos",
    "Oba": "Obad", "Jon": "Jonah", "Zep": "Zeph", "Zec": "Zech", "1Ma": "1Macc", "2Ma": "2Macc", "3Ma": "3Macc",
    "3Ez": "2Esd", "Mat": "Matt", "Mar": "Mark", "Luk": "Luke", "Joh": "John", "Act": "Acts", "Jam": "Jas",
    "1Pe": "1Pet", "2Pe": "2Pet", "1Jo": "1John", "2Jo": "2John", "3Jo": "3John", "Jud": "Jude", "1Co": "1Cor",
    "2Co": "2Cor", "Phi": "Phil", "1Th": "1Thess", "2Th": "2Thess", "1Ti": "1Tim", "2Ti": "2Tim", "Tit": "Titus",
    "Phm": "Phlm",
}
KNOWN = {b["id"]: b for b in json.loads((ROOT / "src" / "core" / "books.json").read_text(encoding="utf-8"))}


def strip_cmd_with_arg(s, cmd):
    """Удаляет \\cmd{…} (и \\cmd{…}{…} для fnote) с учётом вложенных скобок."""
    out, i = [], 0
    tag = "\\" + cmd + "{"
    while True:
        j = s.find(tag, i)
        if j < 0:
            out.append(s[i:])
            return "".join(out)
        out.append(s[i:j])
        k, args = j + len(tag) - 1, 0
        while k < len(s) and s[k] == "{" and args < (2 if cmd == "fnote" else 1):
            depth = 0
            while k < len(s):
                depth += {"{": 1, "}": -1}.get(s[k], 0)
                k += 1
                if depth == 0:
                    break
            args += 1
        i = k


def clean(s):
    s = strip_cmd_with_arg(s, "fns")
    s = strip_cmd_with_arg(s, "fnote")
    s = re.sub(r"\\bibemph\{([^{}]*)\}", r"‹\1›", s)
    s = re.sub(r"\\acc\{([^{}]*)\}", "\\1\u0301", s)
    s = s.replace("\\ldots", "…").replace("\\dots", "…").replace("\\vsep", "")
    s = s.replace("~---", " —").replace("---", "—").replace("--", "–").replace("<<", "«").replace(">>", "»")
    s = s.replace("\\\\", " ").replace("\\ ", " ").replace("~", "\u00a0")
    s = re.sub(r"\\[a-zA-Z]+\*?", "", s)
    s = s.replace("{", "").replace("}", "")
    s = re.sub(r"\s+", " ", s).strip()
    s = re.sub(r"\s+([,.;:!?)])", r"\1", s)
    return s.replace("‹›", "")


def parse_book(path):
    text = path.read_text(encoding="utf-8")
    descr = {}
    m = re.search(r"\\bibbookdescr\{[^}]*\}\{(.*?)\n\}", text, re.S)
    if m:
        for key, val in re.findall(r"^\s*(\w+)=\{(.*)\},?\s*$", m.group(1), re.M):
            descr[key] = val
    chapters, headings, pending, cur = {}, {}, None, None
    for line in (text[m.end():] if m else text).splitlines():
        if line.lstrip().startswith("%"):
            continue
        line = line.replace("\\rsbpar", "").strip()
        h = re.match(r"\\chhdr\{(.*)\}\s*$", line)
        if h:
            pending = clean(h.group(1))
            continue
        v = re.match(r"\\vs\s+\S+\s+(\d+):(\d+)\S*\s*(.*)$", line)
        if not v:
            # Продолжение стиха на следующих строках (в апокрифах текст идёт после строки с номером)
            if cur and line and not line.startswith("\\"):
                vs = chapters[cur[0]]
                vs[cur[1]] = (vs[cur[1]] + " " + clean(line)).strip()
            continue
        c, n, body = int(v.group(1)), int(v.group(2)), clean(v.group(3))
        verses = chapters.setdefault(c, {})
        verses[n] = (verses[n] + " " + body).strip() if n in verses else body
        cur = (c, n)
        if pending:
            headings[f"{c}:{n}"] = pending
            pending = None
    if not chapters:
        return None, descr
    out = []
    for c in range(1, max(chapters) + 1):
        vs = chapters.get(c, {})
        out.append([vs.get(n, "") for n in range(1, (max(vs) if vs else 0) + 1)])
    return {"chapters": out, "headings": headings}, descr


def main():
    main_tex = (SRC / "main.tex").read_text(encoding="utf-8")
    part, order, seen = "OT", [], set()
    for line in main_tex.splitlines():
        if line.lstrip().startswith("%"):
            continue
        if "\\bibpart" in line:
            part = "NT" if "{NT}" in line else "AP" if "{Apo}" in line else "OT"
        for code in re.findall(r"\\include\{tex/([^}]+)\}", line):
            if code in seen or not (SRC / f"{code}.tex").exists() or code in ("title", "intro", "canon", "nt-money", "calend", "nt-events"):
                continue
            seen.add(code)
            order.append((code, part))

    books, skipped = [], []
    for code, part in order:
        data, descr = parse_book(SRC / f"{code}.tex")
        if not data:
            skipped.append(code)
            continue
        bid = OSIS.get(code, code)
        known = KNOWN.get(bid)
        name = known["name"] if known else clean(descr.get("header") or descr.get("bookmark") or code)
        short = known["short"] if known else clean(descr.get("abbr") or code) + "."
        books.append({"id": bid, "name": name, "short": short, "t": known["t"] if known else "AP", **data})

    module = {
        "format": "aob-module", "formatVersion": 1, "type": "bible", "id": "rst-bibles-org-uk", "name": "RST А",
        "title": "Синодальный перевод с апокрифами (bibles.org.uk)",
        "description": "Издание Т. Айвазяна и В. Воловича: синодальный перевод с неканоническими книгами и апокрифами "
                       "(Енох, Юбилеи, Заветы двенадцати патриархов, Сивиллины книги, Дидахе, 1 Климента и др.). "
                       "Только для личного использования.",
        "language": "ru", "version": "github.com/tigran123/russian-synodal-bible (2022)",
        "author": "Издание bibles.org.uk: Tigran Aivazian, Vladimir Volovich",
        "source": "https://github.com/tigran123/russian-synodal-bible",
        "license": "Лицензия не указана; автор просит запрашивать разрешение: aivazian.tigran@gmail.com",
        "versification": "synodal", "features": {"strongs": False, "headings": True, "deuterocanonical": True, "apocrypha": True},
        "books": books,
    }
    data = json.dumps(module, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    (OUT / "rst-bibles-org-uk.json").write_bytes(data)
    (OUT / "rst-bibles-org-uk.json.gz").write_bytes(gzip.compress(data, 9))
    ap = [b["name"] for b in books if b["t"] == "AP"]
    report = (f"книг: {len(books)} (апокрифов {len(ap)}), стихов: {sum(len(c) for b in books for c in b['chapters'])}, "
              f"{len(data)/1e6:.1f} MB; пропущено (нет стихов): {skipped}\nапокрифы: {', '.join(ap)}\n")
    (OUT / "report.txt").write_text(report, encoding="utf-8")


if __name__ == "__main__":
    main()
