"""Русские модули для build_extra.py: «Толковая Библия» Лопухина и «Библейская энциклопедия» архим. Никифора."""
import json
import re
import xml.etree.ElementTree as ET
from html import unescape

from extra_lib import SRC, fmt_ref, norm_space, synodal

# ---------------------------------------------------------------------------------------------
# Толковая Библия Лопухина: SWORD-модуль в OSIS XML (github.com/swmail/lopukhin_commentary),
# нумерация синодальная. annotateRef: «Gen.1.1», «Gen.1.11-13», «Gen.1.0» (к главе), «Gen.0.0» (к книге).
# ---------------------------------------------------------------------------------------------

NS = "{http://www.bibletechnologies.net/2003/OSIS/namespace}"


def _osis_text(el):
    parts = []

    def walk(e):
        tag = e.tag.replace(NS, "")
        if tag == "lb":
            parts.append("\n")
        elif tag in ("note", "figure"):
            pass
        elif tag == "div" and e.get("annotateType") == "commentary":
            return  # вложенные статьи обрабатываются отдельно
        else:
            if e.text:
                parts.append(e.text)
            for ch in e:
                walk(ch)
                if ch.tail:
                    parts.append(ch.tail)
            return
        if e.tail is not None and tag != "lb":
            pass

    if el.text:
        parts.append(el.text)
    for ch in el:
        walk(ch)
        if ch.tail:
            parts.append(ch.tail)
    s = "".join(parts)
    s = re.sub(r"^[\s.]+(?=\S)", "", s)  # лишняя «.» в начале многих статей
    return norm_space(s)


def lopukhin():
    f = SRC / "lopukhin" / "github-swmail-lopukhin_commentary" / "lopukhin_commentary.xml"
    root = ET.parse(f).getroot()
    syn = synodal()
    entries, skipped = {}, []
    for el in root.iter(NS + "div"):
        if el.get("annotateType") != "commentary":
            continue
        # «Isa.24.18b-20» — доли стиха (a/b) отбрасываем: статья ставится к целому стиху
        ref = re.sub(r"(\d)[ab]\b", r"\1", el.get("annotateRef") or "")
        text = _osis_text(el)
        if not text:
            continue
        m = re.match(r"^([1-4]?[A-Za-z]+)\.(\d+)\.(\d+)(?:-(?:(\d+)\.)?(\d+))?$", ref)
        if not m:
            skipped.append(ref)
            continue
        b, c, v = m.group(1), int(m.group(2)), int(m.group(3))
        title = None
        if c == 0:
            c, v, title = 1, 1, "Введение в книгу"
        elif v == 0:
            v, title = 1, "Введение к главе"
        if b not in syn.verses:
            skipped.append(ref)
            continue
        c2 = int(m.group(4)) if m.group(4) else c
        v2 = int(m.group(5)) if m.group(5) else v
        key = fmt_ref(b, c, v, c2, v2) if title is None else fmt_ref(b, c, v)
        val = {"title": title, "text": text} if title else text
        if key in entries:
            old = entries[key]
            ot = old["text"] if isinstance(old, dict) else old
            ttl = (old.get("title") if isinstance(old, dict) else None) or title
            joined = ot + "\n\n" + text
            entries[key] = {"title": ttl, "text": joined} if ttl else joined
        else:
            entries[key] = val
    return entries, skipped


# ---------------------------------------------------------------------------------------------
# Библейская энциклопедия архим. Никифора (1891–1892): Викитека, страницы «БЭАН/<слово>» (викитекст)
# ---------------------------------------------------------------------------------------------

RU_BOOKS = {
    "Быт": "Gen", "Исх": "Exod", "Лев": "Lev", "Чис": "Num", "Втор": "Deut", "Нав": "Josh", "Суд": "Judg",
    "Руф": "Ruth", "1Цар": "1Sam", "2Цар": "2Sam", "3Цар": "1Kgs", "4Цар": "2Kgs", "1Пар": "1Chr", "2Пар": "2Chr",
    "1Ездр": "Ezra", "1Езд": "Ezra", "Неем": "Neh", "2Ездр": "1Esd", "2Езд": "1Esd", "3Ездр": "2Esd",
    "Тов": "Tob", "Иудиф": "Jdt", "Иудф": "Jdt", "Иудифь": "Jdt", "Эсф": "Esth", "Есф": "Esth", "Иов": "Job",
    "Пс": "Ps", "Притч": "Prov", "Еккл": "Eccl", "Песн": "Song", "Прем": "Wis", "Сир": "Sir", "Ис": "Isa",
    "Иер": "Jer", "Иерем": "Jer", "Плч": "Lam", "Посл.Иер": "EpJer", "Вар": "Bar", "Иез": "Ezek", "Иезек": "Ezek",
    "Дан": "Dan", "Ос": "Hos", "Иоил": "Joel", "Ам": "Amos", "Амос": "Amos", "Авд": "Obad", "Ион": "Jonah",
    "Мих": "Mic", "Наум": "Nah", "Авв": "Hab", "Соф": "Zeph", "Агг": "Hag", "Зах": "Zech", "Мал": "Mal",
    "1Мак": "1Macc", "2Мак": "2Macc", "3Мак": "3Macc", "Мф": "Matt", "Мк": "Mark", "Мр": "Mark", "Мрк": "Mark",
    "Лк": "Luke", "Лук": "Luke", "Ин": "John", "Иоан": "John", "Деян": "Acts", "Иак": "Jas", "1Пет": "1Pet",
    "1Петр": "1Pet", "2Пет": "2Pet", "1Ин": "1John", "2Ин": "2John", "3Ин": "3John", "Иуд": "Jude", "Рим": "Rom",
    "1Кор": "1Cor", "2Кор": "2Cor", "Гал": "Gal", "Еф": "Eph", "Флп": "Phil", "Кол": "Col", "1Фес": "1Thess",
    "1Сол": "1Thess", "2Фес": "2Thess", "1Тим": "1Tim", "2Тим": "2Tim", "Тит": "Titus", "Флм": "Phlm", "Евр": "Heb",
    "Откр": "Rev",
}


def _split_params(body):
    """Параметры шаблона с учётом вложенных {{…}} и [[…]]."""
    out, depth, cur = [], 0, []
    i = 0
    while i < len(body):
        two = body[i:i + 2]
        if two in ("{{", "[["):
            depth += 1
            cur.append(two)
            i += 2
            continue
        if two in ("}}", "]]"):
            depth -= 1
            cur.append(two)
            i += 2
            continue
        if body[i] == "|" and depth == 0:
            out.append("".join(cur))
            cur = []
        else:
            cur.append(body[i])
        i += 1
    out.append("".join(cur))
    return out


def _expand_templates(s, refs, hook=None):
    """Раскрывает {{…}} изнутри наружу: Библия -> текст ссылки (и запоминает ссылку), остальное — по смыслу.
    hook(name, pos, named) -> str | None — своя обработка шаблонов (словари Викитеки, extra_dicts_ru.py)."""
    pat = re.compile(r"\{\{((?:(?!\{\{|\}\}).)*)\}\}", re.S)
    syn = synodal()
    for _ in range(10):
        m = pat.search(s)
        if not m:
            break

        def repl(mm):
            params = _split_params(mm.group(1))
            name = params[0].strip()
            pos = [p for p in params[1:] if not re.match(r"^\s*[\w ]+\s*=", p)]
            named = dict(p.split("=", 1) for p in params[1:] if re.match(r"^\s*[\w ]+\s*=", p))
            named = {k.strip(): v for k, v in named.items()}
            low = name.lower()
            if hook:
                res = hook(name, pos, named)
                if res is not None:
                    return res
            if name == "Библия":
                bk = pos[0].strip() if pos else ""
                cv = pos[1].strip() if len(pos) > 1 else ""
                tail = pos[2].strip() if len(pos) > 2 else ""
                disp = named.get("т") or named.get("текст") or named.get("t") or (cv + tail)
                osis = RU_BOOKS.get(bk.replace(" ", ""))
                cm = re.match(r"^(\d+):(\d+)$", cv)
                if osis == "Jude" and cm and int(cm.group(1)) > 1:
                    osis = "Jdt"
                if osis and cm:
                    c, v = int(cm.group(1)), int(cm.group(2))
                    v2 = v
                    tm = re.match(r"^[-–](\d+)$", tail)
                    if tm:
                        v2 = int(tm.group(1))
                    # ссылки, набранные с ошибкой (нет такой главы/стиха в синодальном тексте), не берём
                    if syn.exists(osis, c, v) and (v2 == v or syn.exists(osis, c, v2)):
                        r = fmt_ref(osis, c, v, c, v2)
                        if r not in refs:
                            refs.append(r)
                return disp
            if low in ("бэан", "якорь", "ifloat", "rfloat", "lfloat", "inline float", "примечание вт",
                       "примечания вт", "навигация", "неоднозначность", "нет ошибки", "---", "doc"):
                return ""
            if low in ("razr2", "razr", "центр", "lang", "tr"):
                return pos[-1] if pos else ""
            if low == "опечатка":
                return pos[1] if len(pos) > 1 else (pos[0] if pos else "")
            if low == "ditto":
                return "〃"
            if low == "дробь":
                return "/".join(p.strip() for p in pos)
            return pos[-1] if pos else ""

        s = pat.sub(repl, s)
    return s


def _wikitext_to_text(w, refs, hook=None):
    w = re.sub(r"<!--.*?-->", "", w, flags=re.S)
    w = re.sub(r"<ref[^>/]*/>", "", w)
    w = re.sub(r"<ref[^>]*>(.*?)</ref>", lambda m: " [" + m.group(1).strip() + "]", w, flags=re.S)
    w = _expand_templates(w, refs, hook)
    w = re.sub(r"\[\[(?:Категория|Category|Файл|File|Изображение|Image):[^\]]*\]\]", "", w)
    w = re.sub(r"\[\[[^\]|]*\|([^\]]*)\]\]", r"\1", w)
    w = re.sub(r"\[\[([^\]]*)\]\]", r"\1", w)
    w = re.sub(r"\[https?://\S+\s+([^\]]*)\]", r"\1", w)
    w = w.replace("'''", "").replace("''", "")
    w = re.sub(r"<br\s*/?>", "\n", w, flags=re.I)
    w = re.sub(r"<[^>]+>", "", w)
    w = re.sub(r"^[*#:;]+\s*", "", w, flags=re.M)
    w = re.sub(r"^=+\s*(.*?)\s*=+\s*$", r"\1", w, flags=re.M)
    w = unescape(w).replace(" ", " ")
    return norm_space(w)


def nikifor():
    rows = [json.loads(line) for line in
            (SRC / "nikifor" / "ru-wikisource" / "pages.jsonl").read_text(encoding="utf-8").splitlines() if line.strip()]
    pages = {r["title"]: r for r in rows}
    entries = {}
    for r in rows:
        t = r["title"]
        if not t.startswith("БЭАН/") or "/" in t[5:] or r.get("redirect") or r.get("missing"):
            continue
        refs = []
        text = _wikitext_to_text(r["wikitext"] or "", refs)
        if len(text) < 3:
            continue
        word = re.sub(r"\s*\(.*\)\s*$", "", t[5:]).strip()
        key = word.lower().replace("ё", "е")
        if key in entries:
            e = entries[key]
            e["text"] += "\n\n* * *\n\n" + text
            e["refs"] = e["refs"] + [x for x in refs if x not in e["refs"]]
        else:
            entries[key] = {"word": word, "text": text, "refs": refs}
    # Перенаправления (варианты написания) — та же статья под другим ключом
    for r in rows:
        t = r["title"]
        if not (t.startswith("БЭАН/") and r.get("redirect")):
            continue
        m = re.search(r"\[\[БЭАН/([^\]|#]+)", r["wikitext"] or "")
        if not m:
            continue
        target = re.sub(r"\s*\(.*\)\s*$", "", m.group(1)).strip().lower().replace("ё", "е")
        key = re.sub(r"\s*\(.*\)\s*$", "", t[5:]).strip().lower().replace("ё", "е")
        if target in entries and key not in entries:
            entries[key] = dict(entries[target])
    for e in entries.values():
        e["refs"] = e["refs"][:40]
        if not e["refs"]:
            del e["refs"]
    return dict(sorted(entries.items()))
