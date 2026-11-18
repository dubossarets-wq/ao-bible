"""Оформление статей Дворецкого для приложения: авторы — по-русски, без сокращений, с годами и после точки;
нумерация «1.», первая буква значения — заглавная.

Имена и годы основных авторов берутся из таблицы <authors> электронной версии (Гурин). Для редких авторов,
которых в таблице нет, имена и годы вписаны здесь вручную (EXTRA): годы — только если уверен, иначе только имя.
"""
import re

MARK_A, MARK_B = "\x01", "\x02"

# ключ в <author> → (имя, годы|None). Только для тех, кого нет в таблице словаря или чья запись там неполна.
EXTRA = {
    "Anth.": ("Палатинская антология", None),
    "NT": ("Новый Завет", "I–II вв. н. э."),
    "HH": ("Гомеровские гимны", "X–IX вв. до н. э."),
    "Batr.": ("«Война мышей и лягушек»", "предположительно X в. до н. э."),
    "Trag.": ("трагики", None),
    "Lin": ("Линней", None),
    "ap.": ("у", None),
    "Timon": ("Тимон Флиунтский", "ок. 320–230 до н. э."),
    "Solon": ("Солон", "ок. 640–560 до н. э."),
    "Simonides": ("Симонид Кеосский", "ок. 556–468 до н. э."),
    "Parmenides": ("Парменид", "ок. 515–450 до н. э."),
    "Chrysippus": ("Хрисипп", "ок. 280–206 до н. э."),
    "Pythagoras": ("Пифагор", "ок. 570–495 до н. э."),
    "Archilochus": ("Архилох", "VII в. до н. э."),
    "Alcaeus": ("Алкей", "ок. 625–575 до н. э."),
    "Zenon": ("Зенон", None),
    "Cratinus": ("Кратин", "ок. 519–422 до н. э."),
    "Eupolis": ("Евполид", "ок. 446–411 до н. э."),
    "Tyrtaeus": ("Тиртей", "VII в. до н. э."),
    "Verg.": ("Вергилий", "70–19 до н. э."),
    "Thales": ("Фалес", "ок. 625–547 до н. э."),
    "Gorgias": ("Горгий", "ок. 483–375 до н. э."),
    "Alcidamus": ("Алкидамант", "IV в. до н. э."),
    "Chilon": ("Хилон", "VI в. до н. э."),
    "Bacchylides": ("Вакхилид", "ок. 518–451 до н. э."),
    "Orpheus": ("Орфей", None),
    "Stesichorus": ("Стесихор", "ок. 630–555 до н. э."),
    "Pherecrates": ("Ферекрат", "V в. до н. э."),
    "Anaxarchus": ("Анаксарх", "IV в. до н. э."),
    "Leucippus": ("Левкипп", "V в. до н. э."),
    "Xenophanes": ("Ксенофан", "ок. 570–475 до н. э."),
    "Epicharmus": ("Эпихарм", "ок. 540–450 до н. э."),
    "Theophrastus": ("Феофраст", "ок. 371–287 до н. э."),
    "Crates": ("Кратет", None),
    "Agesianax": ("Агесианакт", None),
    "Diog._Sinopeus": ("Диоген Синопский", "ок. 412–323 до н. э."),
    "Diog._Sinopensis": ("Диоген Синопский", "ок. 412–323 до н. э."),
    "Liv.": ("Ливий", "59 до н. э. – 17 н. э."),
    "Timocreon": ("Тимокреонт", "V в. до н. э."),
    "Herillus": ("Герилл", None),
    "Bion": ("Бион", None),
    "Apollodorus": ("Аполлодор", None),
    "Pyrrhus": ("Пирр", None),
    "Epictetus": ("Эпиктет", "ок. 50–138 н. э."),
    "Theb.": ("«Фиваида»", None),
    "Theogn.": ("Феогнид", "VI в. до н. э."),
    "Archytas": ("Архит", "ок. 428–347 до н. э."),
    "Phoen.": ("Феникс", None),
    "Diopithes": ("Диопит", None),
    "Pittacus": ("Питтак", "ок. 650–570 до н. э."),
    "Antagoras": ("Антагор", None),
    "Timotheus": ("Тимофей Милетский", "ок. 446–357 до н. э."),
    "Epimenides": ("Эпименид", "VI в. до н. э."),
    "Anaxandrides": ("Анаксандрид", "IV в. до н. э."),
    "Dictys": ("Диктис Критский", None),
    "Petron.": ("Петроний", "ок. 27–66 н. э."),
    "Pers.": ("Персий", "34–62 н. э."),
    "Teleclides": ("Телеклид", "V в. до н. э."),
    "Amipsias": ("Амипсий", "V–IV вв. до н. э."),
    "Anaximenes": ("Анаксимен", "ок. 585–525 до н. э."),
    "Carneades": ("Карнеад", "214–129 до н. э."),
    "Licymnius": ("Ликимний", "V–IV вв. до н. э."),
    "Lycurgus": ("Ликург", None),
    "Alcman": ("Алкман", "VII в. до н. э."),
    "Eratosthenes": ("Эратосфен", "ок. 276–194 до н. э."),
    "Terpandrus": ("Терпандр", "VII в. до н. э."),
    "Timocrates": ("Тимократ", None),
    "Dicearhus": ("Дикеарх", "IV в. до н. э."),
    "Metrodorus": ("Метродор", None),
    "Pherecydes": ("Ферекид", "VI в. до н. э."),
    "Cleanthes": ("Клеанф", "331–232 до н. э."),
    "Euphorion": ("Евфорион", "III в. до н. э."),
    "Cydias": ("Кидий", None),
    "Sotades": ("Сотад", "III в. до н. э."),
    "Xenocrates": ("Ксенократ", "396–314 до н. э."),
    "Dionysodorus": ("Дионисодор", None),
    "Lycophron": ("Ликофрон", "III в. до н. э."),
    "Ion": ("Ион Хиосский", "ок. 490–422 до н. э."),
    "Diodotus": ("Диодот", None),
    "Diphilus": ("Дифил", "ок. 350–290 до н. э."),
    "Iphicrates": ("Ификрат", None),
    "Aristippus": ("Аристипп", "ок. 435–355 до н. э."),
    "Aristocreon": ("Аристокреонт", None),
    "Socrates": ("Сократ", "469–399 до н. э."),
    "Porphyrius": ("Порфирий", "234–305 н. э."),
    "Hellanicus": ("Гелланик", "V в. до н. э."),
    "Mamercus": ("Мамерк", None),
    "Phaedr.": ("Федр", "ок. 15 до н. э. – 50 н. э."),
    "Varro": ("Варрон", "116–27 до н. э."),
}


def _years(y):
    """«427-347 гг. до н.э.» → «427–347 до н. э.»; «серед. V в.» → «середина V в.»"""
    y = re.sub(r"\s*гг\.", "", y)
    y = re.sub(r"н\.\s*э\.?", "н. э.", y).replace("1-я пол.", "первая половина").replace("серед.", "середина")
    y = y.strip(" ,;")
    y = re.sub(r"(?<=[\dIVX])\s*-\s*(?=[\dIVX])", "–", y)
    y = re.sub(r"\s+-\s+", " – ", y)
    return re.sub(r"\s+", " ", y).strip()


def split_author(text):
    """Строка таблицы <authors> → (имя, годы|None)."""
    s = re.sub(r"\s*\([^)]*[A-Za-z][^)]*\)", "", text or "")        # латинские пояснения в скобках
    s = re.sub(r"\s+", " ", s).strip()
    m = re.search(r"(?:,\s+|\s+)(?=(?:ок\.|серед\.|1-я|\d|[IVX]+(?:\s*[-–]\s*[IVX]+)?\s*вв?\.))", s)
    if m:
        return s[:m.start()].strip(" ,"), _years(s[m.end():])
    return s.strip(" ,"), None


def build_table(authors_el):
    """key → (имя, годы) из <authors>; EXTRA имеет приоритет там, где запись таблицы не годится (не автор)."""
    tab = {}
    for a in authors_el:
        k, t = a.get("key"), a.text or ""
        if not k:
            continue
        for kk in {k, k + "."} if not k.endswith(".") else {k}:
            tab[kk] = split_author(t)
    tab.update(EXTRA)
    return tab


def fmt_one(key, tab, nested=False):
    """Автор → «Платон (427–347 до н. э.)»; внутри скобок — «Платон [427–347 до н. э.]»"""
    name, years = tab.get(key) or tab.get(key.rstrip(".")) or (key.replace("_", " "), None)
    if not years:
        return name
    return f"{name} [{years}]" if nested else f"{name} ({years})"


_CLUSTER = re.compile(rf"((?:{MARK_A}[^{MARK_B}]*{MARK_B})(?:\s*[,;]?\s*{MARK_A}[^{MARK_B}]*{MARK_B})*)\s*([;.]?)\s*$")
_KEYS = re.compile(rf"{MARK_A}([^{MARK_B}]*){MARK_B}")
_GREEK = re.compile("[Ͱ-Ͽἀ-῿]")


def _depth(s):
    return s.count("(") + s.count("[") - s.count(")") - s.count("]")


def _join(keys, tab):
    parts, pre = [], ""
    for k in keys:
        if k == "ap.":
            pre = "у "
            continue
        parts.append(pre + fmt_one(k, tab))
        pre = ""
    return ", ".join(parts)


def _expand(s, tab):
    """Оставшиеся авторы — на месте; внутри скобок годы в квадратных скобках."""
    out, i = [], 0
    for m in _KEYS.finditer(s):
        out.append(s[i:m.start()])
        out.append("у" if m.group(1) == "ap." else fmt_one(m.group(1), tab, nested=_depth("".join(out)) > 0))
        i = m.end()
    out.append(s[i:])
    return "".join(out)


def fmt_line(s, tab, item=False):
    """Одна строка статьи (с метками авторов) → готовый текст."""
    lead = re.match(r"^(\s*)(\d+)\)\s+(.*)$", s, re.S)
    indent, num, body = ("", "", s)
    if lead:
        indent, num, body = lead.group(1), lead.group(2) + ". ", lead.group(3)
    else:
        sp = re.match(r"^(\s*)(.*)$", s, re.S)
        indent, body = sp.group(1), sp.group(2)
    m = _CLUSTER.search(body)
    if m:
        before = body[:m.start()].rstrip()
        last = before[-1:] if before else ""
        if before and last not in ":(" and not _GREEK.match(last) and _depth(before) == 0:
            keys = _KEYS.findall(m.group(1))
            before = before.rstrip(",;")
            if before[-1:] not in ".!?":
                before += "."
            body = before + " " + _join(keys, tab)
    body = _expand(body, tab)
    if item or num:
        mm = re.search(r"[A-Za-zА-Яа-яЁё]", body)
        if mm and "а" <= mm.group(0).lower() <= "я" or (mm and mm.group(0) in "ёЁ"):
            body = body[:mm.start()] + mm.group(0).upper() + body[mm.start() + 1:]
    return indent + num + body
