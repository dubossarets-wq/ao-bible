"""Модуль «Неканонические книги»: только неканонические книги, в одном модуле и в одном порядке.

1. Из синодального перевода с неканоническими книгами (public/modules/rst-dc.json, CrossWire RusSynodal, Public Domain) —
   в порядке синодального издания: Молитва Манассии, 2 Ездры, Товит, Иудифь, Псалом 151, Премудрость Соломона, Сирах,
   Послание Иеремии, Варух, Песнь трёх отроков (Дан 3:24–90), Сусанна (Дан 13), Вил и дракон (Дан 14), 1–3 Маккавейские,
   3 Ездры.
2. Затем — в переводе прот. А. В. Смирнова (1854–1934; Public Domain):
   Книга Еноха (Казань, 1888; data-src/apocrypha/azb_enoch.html — azbyka.ru, с главами и стихами),
   Книга Юбилеев (Казань, 1895; data-src/apocrypha/jub*.wiki — ru.wikisource.org; в издании нет номеров стихов —
   стихи здесь по предложениям), Заветы двенадцати патриархов (1911; data-src/apocrypha/test1..12.wiki — ru.wikisource.org).

Запуск: python -I -X utf8 scripts/build_noncanon.py  (дописывает модуль в public/modules/catalog.json)
"""
import gzip
import html
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "data-src" / "apocrypha"
OUT = ROOT / "public" / "modules"
MID = "noncanon-ru"


def tidy(s):
    s = html.unescape(s)
    s = s.replace("̀", "").replace("́", "")  # знаки ударения в «что̀»
    s = re.sub(r"\s+", " ", s).strip()
    s = re.sub(r"\s+([,.;:!?)»])", r"\1", s)
    s = re.sub(r"([(«])\s+", r"\1", s)
    return s


def wiki_plain(s):
    """Вики-разметка → текст: без сносок, шаблонов, курсива, ссылок"""
    s = re.sub(r"<ref[^>/]*/>", "", s)
    s = re.sub(r"<ref[^>]*>.*?</ref>", "", s, flags=re.S)
    s = re.sub(r"\[\[(?:Категория|Category):[^\]]*\]\]", "", s)  # категории страницы, не текст
    s = re.sub(r"<[^>]+>", "", s)
    s = re.sub(r"\{\{r\|([^}]*)\}\}", r"\1", s)
    s = re.sub(r"\{\{[^{}]*\}\}", "", s)
    s = re.sub(r"\[\[(?:[^|\]]*\|)?([^\]]*)\]\]", r"\1", s)
    s = s.replace("'''", "").replace("''", "")
    return s


# ---------- 1. синодальный перевод ----------
dc = {b["id"]: b for b in json.loads((OUT / "rst-dc.json").read_text(encoding="utf-8"))["books"]}


def book(id_, name, short, chapters, headings=None):
    return {"id": id_, "name": name, "short": short, "chapters": chapters, "headings": headings or {}}


def syn(id_):
    b = dc[id_]
    return book(id_, b["name"], b["short"], b["chapters"], b.get("headings"))


def heads_from(b, ch, first, last, shift_ch=1):
    """заголовки синодального перевода для части главы (стихи first..last → 1..)"""
    out = {}
    for k, v in (b.get("headings") or {}).items():
        c, vv = map(int, k.split(":"))
        if c == ch and first <= vv <= last:
            out[f"{shift_ch}:{vv - first + 1}"] = v
    return out


def unbracket(chs):
    """Вынесенные из Псалтири и Даниила книги в синодальном переводе целиком в квадратных скобках («нет в еврейском
    тексте»); в отдельной книге внешние скобки не нужны"""
    chs = [list(c) for c in chs]
    chs[0][0] = re.sub(r"^\[", "", chs[0][0])
    chs[-1][-1] = re.sub(r"\](?=[.!?»\"]*$)", "", chs[-1][-1]) if chs[-1][-1].count("]") > chs[-1][-1].count("[") else chs[-1][-1]
    return chs


dan, ps = dc["Dan"], dc["Ps"]
assert len(ps["chapters"]) == 151 and len(dan["chapters"]) == 14 and len(dan["chapters"][2]) == 100
books = [
    syn("PrMan"),
    syn("1Esd"),
    syn("Tob"),
    syn("Jdt"),
    book("Ps151", "Псалом 151", "Пс.151", unbracket([ps["chapters"][150]]), heads_from(ps, 151, 1, 99)),
    syn("Wis"),
    syn("Sir"),
    syn("EpJer"),
    syn("Bar"),
    book("PrAzar", "Песнь трёх отроков", "Песн.отр.", unbracket([dan["chapters"][2][23:90]]), heads_from(dan, 3, 24, 90)),
    book("Sus", "Сусанна", "Сус.", unbracket([dan["chapters"][12]]), heads_from(dan, 13, 1, 999)),
    book("Bel", "Вил и дракон", "Вил.", unbracket([dan["chapters"][13]]), heads_from(dan, 14, 1, 999)),
    syn("1Macc"),
    syn("2Macc"),
    syn("3Macc"),
    syn("2Esd"),
]

# ---------- 2. Книга Еноха (Смирнов, 1888) ----------
s = (SRC / "azb_enoch.html").read_text(encoding="utf-8", errors="ignore")
parts = re.split(r"<h2[^>]*>(.*?)</h2>", s)
enoch, eheads, otdel = [], {}, None
for h, t in zip(parts[1::2], parts[2::2]):
    hh = tidy(re.sub("<[^>]+>", "", h))
    if re.fullmatch(r"\S+ отдел", hh):
        otdel = hh
        continue
    m = re.fullmatch(r"Глава (\d+)", hh)
    if not m:
        continue
    c = int(m.group(1))
    assert c == len(enoch) + 1, ("Енох: глава", c)
    verses = []
    for p in re.findall(r'<p class="txt">(.*?)</p>', t, re.S):
        x = re.sub(r'<a [^>]*><sup>\d+</sup></a>', "", p)
        x = tidy(re.sub("<[^>]+>", "", x))
        mm = re.match(r"(\d+)\.\s*(.*)", x)
        if not mm:
            if c == 108 and verses:
                break  # после последнего стиха — объяснения и сноски издателя
            raise SystemExit(f"Енох {c}: абзац без номера: {x[:80]}")
        n = int(mm.group(1))
        if n != len(verses) + 1:
            raise SystemExit(f"Енох {c}: ждали стих {len(verses) + 1}, а {n}")
        # иногда в одном абзаце два стиха: «10. … 11. …» — делим по следующему номеру по порядку
        rest, nxt = mm.group(2), n + 1
        while True:
            m2 = re.search(rf"(?:(?<=\s)|^){nxt}\.\s", rest)
            if not m2:
                break
            verses.append(rest[:m2.start()].strip())
            rest, nxt = rest[m2.end():], nxt + 1
        verses.append(rest.strip())
    if otdel:
        eheads[f"{c}:1"] = otdel
        otdel = None
    enoch.append(verses)
assert len(enoch) == 108, len(enoch)
books.append(book("1En", "Книга Еноха", "Енох", enoch, eheads))

# ---------- 3. Книга Юбилеев (Смирнов, 1895): главы — «== I. ==»; стихи — по предложениям ----------


# конец предложения (точка, «!», «?», «…», можно с закрывающей кавычкой или скобкой) перед заглавной буквой
SENT = re.compile(r"(?:(?<=[.!?…])|(?<=[.!?…][»\")]))\s+(?=[«\"(]?[А-ЯЁ])")


def sentences(text):
    out = [x.strip() for x in SENT.split(text) if x.strip()]
    # слишком короткие куски («Аминь.») приклеиваем к предыдущему
    merged = []
    for x in out:
        if merged and len(x) < 12:
            merged[-1] += " " + x
        else:
            merged.append(x)
    return merged


jub, jheads = [], {}
for i in range(5):
    w = (SRC / f"jub{i}.wiki").read_text(encoding="utf-8")
    # заголовки глав — римскими цифрами, то с точкой, то без, есть опечатки распознавания («XXVTII») — считаем по порядку
    for m in re.finditer(r"\n==\s*([IVXLTH]+)\.?\s*==\s*\n(.*?)(?=\n==|\Z)", w, re.S):
        body = tidy(wiki_plain(m.group(2)))
        jub.append(sentences(body))
assert len(jub) == 50, len(jub)
w0 = (SRC / "jub0.wiki").read_text(encoding="utf-8")
pro = re.search(r"== Книга Юбилеев или Малое Бытие ==\s*\n(.*?)(?=\n==)", w0, re.S)
if pro:
    jub[0].insert(0, tidy(wiki_plain(pro.group(1))))  # «Вот слова деления дней…» — надписание книги
jheads["1:1"] = "Книга Юбилеев, или Малое Бытие"
books.append(book("Jub", "Книга Юбилеев", "Юбил.", jub, jheads))

# ---------- 4. Заветы двенадцати патриархов (Смирнов, 1911) ----------
TEST = [
    ("TReu", "Завет Рувима", "Зав.Рув.", 7), ("TSim", "Завет Симеона", "Зав.Сим.", 9), ("TLevi", "Завет Левия", "Зав.Лев.", 19),
    ("TJud", "Завет Иуды", "Зав.Иуд.", 26), ("TIss", "Завет Иссахара", "Зав.Исс.", 7), ("TZeb", "Завет Завулона", "Зав.Зав.", 10),
    ("TDan", "Завет Дана", "Зав.Дан.", 7), ("TNaph", "Завет Неффалима", "Зав.Неф.", 9), ("TGad", "Завет Гада", "Зав.Гад.", 8),
    ("TAsh", "Завет Асира", "Зав.Ас.", 8), ("TJos", "Завет Иосифа", "Зав.Иос.", 20), ("TBenj", "Завет Вениамина", "Зав.Вен.", 12),
]


# Опечатка в номере стиха у источника: после стиха 4 стоит «7.», затем «6.» — это стих 5 (Завет Иосифа 13)
FIX = {"„Так пусть будет введен юноша“. 7. И будучи введен": "„Так пусть будет введен юноша“. 5. И будучи введен"}


def split_verses(text, label):
    """«…своей1. 2. Через два года…» → стихи: номера по порядку (1 — с начала главы); цифры сносок у слов убираем"""
    text = re.sub(r"(?<=[А-Яа-яЁё»)\]])\d{1,3}(?=[\s.,;:!?»)])", "", text)  # сноски: «жизни своей1.»
    for a, b in FIX.items():
        text = text.replace(a, b)
    out, at, nxt = [], 0, 2
    # номер стиха — «2. »; у источника изредка «5, » (запятая вместо точки) — принимаем, если номер по порядку
    for m in re.finditer(r"(?:(?<=\s)|^)(\d{1,3})[.,]\s", text):
        if int(m.group(1)) == nxt:
            out.append(text[at:m.start()].strip())
            at = m.end()
            nxt += 1
    out.append(text[at:].strip())
    if out and re.match(r"1\.\s", out[0]):
        out[0] = out[0][2:].strip()
    return [x for x in out]


# подзаголовки («О мыслях») — из оглавления: «Завет Рувима, первородного сына Иакова и Лии. О мыслях»
subs = re.findall(r"\[\[/([^|\]]+)\|", (SRC / "test0.wiki").read_text(encoding="utf-8"))
for i, (id_, name, short, want) in enumerate(TEST, 1):
    w = (SRC / f"test{i}.wiki").read_text(encoding="utf-8")
    chs = []
    for m in re.finditer(r"\n==\s*Глава\s+(\d+)\s*==\s*\n(.*?)(?=\n==|\Z)", w, re.S):
        c = int(m.group(1))
        assert c == len(chs) + 1, (name, c)
        body = tidy(wiki_plain(m.group(2)))
        chs.append(split_verses(body, f"{name} {c}"))
    if len(chs) != want:
        print(f"!! {name}: глав {len(chs)}, ждали {want}")
    sub = re.search(r"\.\s*(О [^\]|]+)$", subs[i - 1])
    books.append(book(id_, name, short, chs, {"1:1": sub.group(1)} if sub else {}))

# ---------- проверки и запись ----------
for b in books:
    for ci, ch in enumerate(b["chapters"], 1):
        assert ch and all(isinstance(v, str) for v in ch), (b["id"], ci)
        empty = [vi for vi, v in enumerate(ch, 1) if not v.strip()]
        if empty:
            print(f"!! пустые стихи {b['id']} {ci}: {empty[:5]}")
for i, b in enumerate(books, 1):
    b["number"] = i

module = {
    "format": "aob-module", "formatVersion": 1, "type": "bible", "id": MID, "name": "Неканонические",
    "title": "Неканонические книги: синодальный перевод, Книга Еноха, Книга Юбилеев, Заветы двенадцати патриархов",
    "description": "Только неканонические книги, одним модулем. В синодальном переводе (1876) и в его порядке: Молитва Манассии, "
                   "2 Ездры, Товит, Иудифь, Псалом 151, Премудрость Соломона, Сирах, Послание Иеремии, Варух, Песнь трёх отроков "
                   "(Дан 3:24–90), Сусанна (Дан 13), Вил и дракон (Дан 14), 1–3 Маккавейские, 3 Ездры. Затем в переводе "
                   "прот. А. В. Смирнова: Книга Еноха (1888), Книга Юбилеев (1895; в издании нет номеров стихов — стихи здесь "
                   "по предложениям) и Заветы двенадцати патриархов (1911).",
    "language": "ru", "version": "1.0", "author": "Святейший Синод (перевод, 1876); прот. А. В. Смирнов (1888–1911)",
    "source": "CrossWire RusSynodal; Книга Еноха — azbyka.ru; Книга Юбилеев и Заветы двенадцати патриархов — ru.wikisource.org",
    "license": "Public Domain (синодальный перевод — 1876; переводчик А. В. Смирнов умер в 1934 г.)",
    "versification": "synodal",
    "features": {"strongs": False, "deuterocanonical": True},
    "books": books,
}
data = json.dumps(module, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
assert "�" not in data.decode("utf-8")
(OUT / f"{MID}.json").write_bytes(data)
gz = gzip.compress(data, 9)
(OUT / f"{MID}.json.gz").write_bytes(gz)
print(f"{MID}: {len(books)} книг, {sum(len(c) for b in books for c in b['chapters'])} стихов, {len(data)/1e6:.2f} MB, gz {len(gz)/1e6:.2f} MB")
for b in books:
    print(f"  {b['id']:7} {b['name']:28} глав {len(b['chapters']):3}  стихов {sum(len(c) for c in b['chapters'])}")

cat_path = OUT / "catalog.json"
cat = json.loads(cat_path.read_text(encoding="utf-8"))
cat["modules"] = [m for m in cat["modules"] if m["id"] != MID]
entry = {k: module[k] for k in ("id", "type", "name", "title", "description", "language", "version", "author",
                                "source", "license", "features", "versification")}
entry.update({"url": f"{MID}.json", "urlGz": f"{MID}.json.gz", "size": len(data), "sizeGz": len(gz)})
pos = next(i for i, m in enumerate(cat["modules"]) if m["id"] == "rst-dc") + 1
cat["modules"].insert(pos, entry)
cat_path.write_text(json.dumps(cat, ensure_ascii=False, indent=1), encoding="utf-8")

ap = ROOT / "scripts" / "approved-modules.json"
a = json.loads(ap.read_text(encoding="utf-8"))
if MID not in a["ids"]:
    a["ids"].append(MID)
    ap.write_text(json.dumps(a, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
