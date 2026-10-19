"""Старые русские переводы Библии (общественное достояние) -> модули-Библии aob-module.

Запуск:  python -I -X utf8 scripts/build_ru_old.py [fetch] [build]      (без аргументов: build из кэша)
  fetch — докачать страницы в data-src/ru-old/cache/ (пауза >= 1 с, User-Agent AOBible/1.0);
  build — собрать модули в public/modules/, дописать каталог (merge_catalog), проверить против rst.json.

Источники:
  * azbyka.ru/biblia (&ru-p) — Новый Завет К. П. Победоносцева (1906), текст уже в современной орфографии;
  * biblia.russportal.ru («Русская Библия», дореформенная орфография, windows-1251) — Новый Завет Российского
    Библейского общества (1821–1824), Ветхий Завет Юнгерова/Макария/Павского, апокрифы Сергиевского.
Дореформенная орфография переводится в современную (ru_old_orth.py).
"""
import json
import re
import sys
from html import unescape
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import ru_old_fetch as F  # noqa: E402
from extra_lib import merge_catalog, write_module  # noqa: E402
from ru_old_orth import ACCENTS, modernize  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
MODS = ROOT / "public" / "modules"
RST = json.loads((MODS / "rst.json").read_text(encoding="utf-8"))
RSTDC = json.loads((MODS / "rst-dc.json").read_text(encoding="utf-8"))
BOOKINFO = {b["id"]: b for b in RSTDC["books"]}  # name/short/number для всех книг, включая неканонические
SYN_COUNTS = {b["id"]: [len(c) for c in b["chapters"]] for b in RSTDC["books"]}
SYN_COUNTS.update({b["id"]: [len(c) for c in b["chapters"]] for b in RST["books"]})

# ---------------------------------------------------------------------------------------------
# Карты книг: идентификатор синодального списка -> код у источника
# ---------------------------------------------------------------------------------------------
NT_ORDER = ["Matt", "Mark", "Luke", "John", "Acts", "Jas", "1Pet", "2Pet", "1John", "2John", "3John", "Jude", "Rom",
            "1Cor", "2Cor", "Gal", "Eph", "Phil", "Col", "1Thess", "2Thess", "1Tim", "2Tim", "Titus", "Phlm", "Heb",
            "Rev"]
AZ = {"Matt": "Mt", "Mark": "Mk", "Luke": "Lk", "John": "Jn", "Acts": "Act", "Jas": "Jac", "1Pet": "1Pet",
      "2Pet": "2Pet", "1John": "1Jn", "2John": "2Jn", "3John": "3Jn", "Jude": "Juda", "Rom": "Rom", "1Cor": "1Cor",
      "2Cor": "2Cor", "Gal": "Gal", "Eph": "Eph", "Phil": "Phil", "Col": "Col", "1Thess": "1Thes",
      "2Thess": "2Thes", "1Tim": "1Tim", "2Tim": "2Tim", "Titus": "Tit", "Phlm": "Phlm", "Heb": "Hebr",
      "Rev": "Apok"}
# Российское Библейское общество, НЗ: префикс страниц newt.rbo.<код>_rb<NN>
RBO_NT = {"Matt": "mat", "Mark": "mark", "Luke": "luk", "John": "ioan", "Jas": "iak", "1Pet": "1petr",
          "2Pet": "2petr", "1John": "1ioan", "2John": "2ioan", "3John": "3ioan", "Jude": "iud", "Rom": "rim",
          "Gal": "gal", "Eph": "eph", "Phil": "phlp", "Col": "kol", "1Thess": "1thes", "2Thess": "2thes",
          "1Tim": "1tim", "2Tim": "2tim", "Titus": "tit", "Phlm": "phlm"}

# ---------------------------------------------------------------------------------------------
# Разбор страниц
# ---------------------------------------------------------------------------------------------
REF_ITALIC = re.compile(r"\s*\(\s*<i>[^<]*\d[^<]*</i>\s*\.?\s*\)")
REF_PLAIN = re.compile(r"\s*\((?:[1-3]\s?)?[А-ЯЁA-Z][а-яёa-z]{1,9}\.\s?\d+\s*[,:.]?\s*\d*[^()]*\)")
NOTE_MARK = re.compile(r"<a name=\"?\d+_\"?>\s*<a href=\"?#\d+\"?>\[\d+\]</a>\s*</a>|\[\d+\]")


LAT2CYR = str.maketrans({"a": "а", "c": "с", "e": "е", "o": "о", "p": "р", "x": "х", "y": "у", "i": "и", "A": "А", "B": "В",
                         "C": "С", "E": "Е", "H": "Н", "K": "К", "M": "М", "O": "О", "P": "Р", "T": "Т", "X": "Х",
                         "I": "И"})


def _near_cyr(s, m):
    return (m.start() > 0 and re.match(r"[А-Яа-яЁёІіѢѣѲѳѴѵ]", s[m.start() - 1])) or (m.end() < len(s) and re.match(r"[А-Яа-яЁёІіѢѣѲѳѴѵ]", s[m.end()]))


def _fix_latin(w):
    return w.translate(LAT2CYR)


LAT_ACC = str.maketrans({"á": "а", "à": "а", "é": "е", "è": "е", "í": "и", "ó": "о", "ú": "у", "ý": "ы"})


def clean(s, reform=True):
    """HTML-фрагмент стиха -> простой текст."""
    s = REF_ITALIC.sub("", s)
    s = NOTE_MARK.sub("", s)
    s = re.sub(r"<[^>]+>", "", s)
    s = unescape(s)
    s = ACCENTS.sub("", s)
    s = s.translate(LAT_ACC).replace("\xa0", " ")
    s = re.sub(r"\s+", " ", s).strip()
    s = re.sub(r"[A-Za-z]+", lambda m: _fix_latin(m.group(0)) if _near_cyr(s, m) else m.group(0), s)  # латиница-двойники внутри слов
    s = re.sub(r"(?<=[а-яё])(?=[А-ЯЁ])", " ", s)  # слипшиеся слова в источнике: «наТебя»
    if reform:
        s = modernize(s)
    s = REF_PLAIN.sub("", s)
    s = re.sub(r"\s+([,.;:!?])", r"\1", s)
    return s.strip()


VERSE_SPLIT = re.compile(r"<b>\s*(?:<font[^>]*>)?\s*(\d+)\s*\.?\s*(?:</font>)?\s*</b>")
CUT = re.compile(r"<br>\s*<br>|<br></br>|<font class=Navy>|<p><b>Прим|<!--EndOf|<p><center>|<p>\s*<b>Примечан", re.I)


def parse_portal(html):
    """{номер стиха: сырой фрагмент} из главы на russportal."""
    a = html.find("<!--Main Content")
    if a < 0:
        a = html.find("Main Content")
    b = html.find("<!--EndOf Main Content")
    body = html[a:b if b > 0 else None]
    # начало текста — после заголовка «Глава N-я»
    m = re.search(r"Глава\s+\d+-?я?\.?\s*(?:</b>)?\s*</font>", body)
    if m:
        body = body[m.end():]
    parts = VERSE_SPLIT.split(body)
    seq = [(int(parts[i]), CUT.split(parts[i + 1])[0]) for i in range(1, len(parts) - 1, 2)]
    nums = [n for n, _ in seq]
    out = {}
    for k, (n, frag) in enumerate(seq):
        if n in out:  # повторная нумерация (например, в примечаниях) — игнорируем
            continue
        # опечатка источника: номер продублирован («…31, 33, 33, 34…») — первый из двойников это пропущенный n-1
        if nums.count(n) > 1 and k + 1 < len(nums) and nums[k + 1] == n and (n - 1) not in nums:
            out[n - 1] = frag
            continue
        out[n] = frag
    return out


def fix_gaps(frags, nsyn=None):
    """Типичные опечатки разметки у источника: номер стиха без <b> внутри соседнего («… 12. Прежде же…») и
    сдвинутая нумерация в конце главы (71 -> 72). Правит словарь {номер: сырой фрагмент}."""
    if not frags:
        return frags
    mx = max(frags)
    for n in range(2, mx):
        if n not in frags and (n - 1) in frags:
            m = re.search(r"\s%d\.\s" % n, frags[n - 1])
            if m and (n + 1 in frags or n == mx - 1):
                frags[n] = frags[n - 1][m.end():]
                frags[n - 1] = frags[n - 1][:m.start()]
    miss = [n for n in range(1, max(frags)) if n not in frags]
    if len(miss) == 1 and nsyn and max(frags) == nsyn + 1:
        k = miss[0]
        frags = {(n - 1 if n > k else n): t for n, t in frags.items()}
    return frags


def parse_azbyka(html, lang):
    vs = re.findall(r'data-lang="%s"\s+data-chapter="(\d+)"\s+data-line="(\d+)"\s+data-verse="([^"]+)"\s+class="verse[^"]*">(.*?)<span class="icon-check' % lang, html, re.S)
    return {int(v[1]): v[3] for v in vs}


# ---------------------------------------------------------------------------------------------
# Сборка книги/модуля
# ---------------------------------------------------------------------------------------------
def book_obj(bid, chapters):
    info = BOOKINFO[bid]
    return {"id": bid, "number": info["number"], "name": info["name"], "short": info["short"], "chapters": chapters}


def chapters_from(chmap, nchap, bid):
    """chmap: {глава: {стих: текст}} -> [[текст,...],...]. Дыры в нумерации стихов заполняются пустой строкой."""
    out, issues = [], []
    for c in range(1, nchap + 1):
        vm = chmap.get(c)
        if not vm:
            issues.append(f"{bid} {c}: глава отсутствует")
            out.append([])
            continue
        mx = max(vm)
        row = [vm.get(v, "") for v in range(1, mx + 1)]
        miss = [v for v in range(1, mx + 1) if v not in vm]
        if miss:
            issues.append(f"{bid} {c}: нет стихов {miss}")
        out.append(row)
    return out, issues


def compare(bid, chapters):
    """Сверка числа стихов с синодальным (rst/rst-dc). Возвращает список расхождений 'гл: наш/синод'."""
    syn = SYN_COUNTS.get(bid)
    if not syn:
        return ["нет в синодальном списке"]
    d = []
    for c, row in enumerate(chapters, 1):
        s = syn[c - 1] if c - 1 < len(syn) else None
        n = len(row)
        if s != n:
            d.append(f"{c}:{n}/{s}")
    if len(chapters) != len(syn):
        d.append(f"глав {len(chapters)}/{len(syn)}")
    return d


def make_module(mid, name, title, description, author, source, license_, books, version=None):
    m = {"format": "aob-module", "formatVersion": 1, "type": "bible", "id": mid, "name": name, "title": title,
         "language": "ru", "versification": "synodal", "features": {"strongs": False, "headings": False},
         "description": description, "author": author, "source": source, "license": license_, "books": books}
    if version:
        m["version"] = version
    return m


def report(mid, books, label=""):
    tv = sum(len(c) for b in books for c in b["chapters"])
    print(f"== {mid}: {len(books)} книг, {tv} стихов {label}")
    for b in books:
        d = compare(b["id"], b["chapters"])
        print(f"   {b['id']:7} гл {len(b['chapters']):3} ст {sum(len(c) for c in b['chapters']):5}  расхождения: {', '.join(d[:12]) + (' …' if len(d) > 12 else '') if d else 'нет'}")


# ---------------------------------------------------------------------------------------------
# Победоносцев (azbyka.ru)
# ---------------------------------------------------------------------------------------------
def fetch_pobed():
    for bid in NT_ORDER:
        for c in range(1, len(SYN_COUNTS[bid]) + 1):
            F.url_page(f"https://azbyka.ru/biblia/?{AZ[bid]}.{c}&ru-p", f"az_{AZ[bid]}.{c}")


def build_pobed():
    books = []
    for bid in NT_ORDER:
        chmap = {}
        for c in range(1, len(SYN_COUNTS[bid]) + 1):
            html = F.url_page(f"https://azbyka.ru/biblia/?{AZ[bid]}.{c}&ru-p", f"az_{AZ[bid]}.{c}")
            chmap[c] = {n: clean(t, reform=False) for n, t in parse_azbyka(html, "ru-p").items()}
        if bid == "2John":  # у Победоносцева перед текстом послания три строки предисловия — не стихи
            chmap[1] = {n - 3: t for n, t in chmap[1].items() if n > 3}
        chs, issues = chapters_from(chmap, len(SYN_COUNTS[bid]), bid)
        if issues:
            print("  !", issues[:5])
        books.append(book_obj(bid, chs))
    return books


# ---------------------------------------------------------------------------------------------
# Российское Библейское общество, Новый Завет (russportal)
# ---------------------------------------------------------------------------------------------
def portal_book(prefix, bid, tag, nchap=None):
    """Книга из глав prefix_<tag>NN на russportal. Возвращает (главы, замечания)."""
    nchap = nchap or len(SYN_COUNTS[bid])
    chmap = {}
    for c in range(1, nchap + 1):
        pid = f"{prefix}_{tag}{c:02d}"
        html = F.page(pid)
        fr = fix_gaps(parse_portal(html), SYN_COUNTS[bid][c - 1] if bid in SYN_COUNTS and c <= len(SYN_COUNTS[bid]) else None)
        chmap[c] = {n: clean(t) for n, t in fr.items()}
    return chapters_from(chmap, nchap, bid)


def build_rbo_nt():
    books = []
    for bid in NT_ORDER:
        if bid not in RBO_NT:
            continue
        chs, issues = portal_book(f"newt.rbo.{RBO_NT[bid]}", bid, "rb")
        if issues:
            print("  !", issues[:6])
        books.append(book_obj(bid, chs))
    return books


# ---------------------------------------------------------------------------------------------
# Общий разбор оглавления russportal: книга -> номера глав (подряд с 1)
# ---------------------------------------------------------------------------------------------
def portal_groups(idx):
    t = F.page(idx)
    ids = list(dict.fromkeys(re.findall(r'<a class=keph href="(?:/)?index\.php\?id=([^"]+)"', t)))
    g = {}
    for i in ids:
        m = re.match(r"(.*?)(\d+)$", i)
        if m:
            g.setdefault(m.group(1), []).append(int(m.group(2)))
    return g


def portal_prefix_book(idx, key, bid, maxch=None):
    """Книга по ключу вида 'lxx.jung.par_j': берутся главы 1..N подряд (N — сколько есть на сайте)."""
    have = sorted(set(portal_groups(idx).get(key, [])))
    n = 0
    while (n + 1) in have:
        n += 1
    if maxch:
        n = min(n, maxch)
    chmap = {}
    for c in range(1, n + 1):
        fr = fix_gaps(parse_portal(F.page(f"{key}{c:02d}")), SYN_COUNTS[bid][c - 1] if c <= len(SYN_COUNTS[bid]) else None)
        chmap[c] = {k: clean(t) for k, t in fr.items()}
    return chapters_from(chmap, n, bid)


YUNGEROV = {"Gen": "gen_j", "Prov": "par_j", "Song": "asm_j", "Isa": "is_j", "Lam": "thr_ju", "Hos": "os_ju",
            "Joel": "il_ju", "Amos": "am_ju", "Obad": "abd_j", "Jonah": "ion_j", "Mic": "mi_ju", "Nah": "na_j",
            "Hab": "ab_ju", "Zeph": "sopho_ju", "Hag": "ag_j", "Mal": "mal_j"}
SERGIEVSKY = {"Tob": "tob_as", "Jdt": "iudi_as", "Wis": "soph_as", "Bar": "var_as", "2Macc": "mak2_as", "3Macc": "mak3_as"}
MAKARIJ = {"Gen": "gen_m", "Exod": "exod_m", "Lev": "lev_m", "Num": "ari_m", "Deut": "deu_m", "Josh": "nav_m",
           "Judg": "kri_m", "Ruth": "rut_m", "1Sam": "bas1_m", "2Sam": "bas2_m", "Ezra": "ezr1_m", "Neh": "neh_m",
           "Esth": "est_m", "Job": "iob_m", "Song": "asm_m", "Eccl": "ekkl_m", "Lam": "thr_m", "Dan": "dan_m",
           "Hos": "os_m", "Joel": "il_m", "Amos": "am_m", "Obad": "abd_m", "Jonah": "iona_m", "Mic": "mi_m",
           "Nah": "na_m", "Hab": "ab_m", "Zeph": "soph_m", "Hag": "ag_m", "Zech": "zach_m", "Mal": "mal_m"}


def heb2syn(bid, chs):
    """Еврейская нумерация глав/стихов -> синодальная там, где она заведомо сдвинута."""
    c = [list(x) for x in chs]
    if bid == "Joel" and len(c) == 4:        # евр. 3:1-5 = син. 2:28-32; евр. гл. 4 = син. 3
        c = [c[0], c[1] + c[2], c[3]]
    elif bid == "Hos" and len(c) >= 12:      # евр. 12:1 = син. 11:12
        c[10].append(c[11].pop(0))
    elif bid == "Mic" and len(c) >= 5:       # евр. 4:14 = син. 5:1
        c[4].insert(0, c[3].pop())
    elif bid == "Nah" and len(c) >= 2:       # евр. 2:1 = син. 1:15
        c[0].append(c[1].pop(0))
    elif bid == "Neh" and len(c) >= 10:      # евр. 3:33-38 = син. 4:1-6; евр. 10:1 = син. 9:38
        c[3] = c[2][32:] + c[3]
        c[2] = c[2][:32]
        c[8].append(c[9].pop(0))
    return c


def collect(idx, mapping, prefix):
    books = []
    order = [b["id"] for b in RSTDC["books"]]
    for bid in sorted(mapping, key=order.index):
        chs, issues = portal_prefix_book(idx, f"{prefix}.{mapping[bid]}", bid)
        if prefix == "masor.macar":
            chs = heb2syn(bid, chs)
        if issues:
            print("  !", bid, issues[:5])
        if chs:
            books.append(book_obj(bid, chs))
    return books


# ---------------------------------------------------------------------------------------------
# Описания модулей
# ---------------------------------------------------------------------------------------------
def plan():
    """Модули к сборке: (словарь модуля с ключом books_, подпись)."""
    az = "https://azbyka.ru/biblia/"
    rp = "https://biblia.russportal.ru/ («Русская Библия», проект «Русскiй Порталъ»)"
    yield make_module(
        "rus-pobedonostsev", "Победоносцев", "Новый Завет в переводе К. П. Победоносцева (1906)",
        "Весь Новый Завет (27 книг) в русском переводе обер-прокурора Синода К. П. Победоносцева (1827–1907), "
        "изданном в 1906 г. в Синодальной типографии («Опыт к усовершенствованию перевода на русский язык священных "
        "книг Нового Завета»). Перевод с греческого, близкий к церковнославянскому тексту. Нумерация стихов авторская "
        "и местами отличается от синодальной (Деян 21–22, Рим 1, 1 Пет 1, Тит 1, Флм); ссылки на параллельные места "
        "в скобках из стихов убраны, вступление к 2 Ин опущено.",
        "К. П. Победоносцев (1827–1907)", "Синодальная типография, СПб., 1906; электронный текст — " + az +
        " (перевод «Рус. (К.П. Победоносцев)»)",
        "Public Domain (переводчик умер в 1907 г., издание 1906 г.)", build_pobed, version="1906"), None
    yield make_module(
        "rus-rbo-nt", "РБО 1823", "Новый Завет Российского Библейского общества (1821–1824)",
        "Первый полный русский перевод Нового Завета, выполненный в Санкт-Петербургской духовной академии для "
        "Российского Библейского общества (Евангелие от Матфея — Г. Павский, от Марка — Поликарп, от Луки — Моисей, "
        "от Иоанна — Филарет Дроздов); издание 1822–1824 гг. Включены 22 книги: четыре Евангелия, соборные "
        "послания и послания Павла, кроме 1–2 Коринфянам и Евреям; книг Деяния и Откровение на сайте-источнике нет. "
        "Текст переведён из дореформенной орфографии в современную (ѣ, і, ѳ, ъ в конце слов, -аго → -ого и т. п.); "
        "слова перевода сохранены, в том числе устаревшие («естьли» → «если»). Ссылки на параллельные места и "
        "сноски-примечания убраны.",
        "Российское Библейское общество (1816–1826)",
        "Господа нашего Иисуса Христа Новый Завет. СПб.: Российское Библейское общество, 1822–1824; электронный "
        "текст — " + rp, "Public Domain (издание 1820-х гг., авторы перевода умерли более 150 лет назад)",
        build_rbo_nt, version="1822–1824"), None
    yield make_module(
        "rus-yungerov", "Юнгеров", "Ветхий Завет в переводе П. А. Юнгерова с греческого (Септуагинта)",
        "Русский перевод книг Ветхого Завета с греческого текста Септуагинты профессора Казанской духовной "
        "академии П. А. Юнгерова (1856–1921), 1908–1917. Здесь те книги, что есть в открытом электронном виде: "
        "Притчи, Песнь песней, Плач Иеремии, 11 малых пророков (Осия — Малахия, без Захарии), а также первые главы "
        "Бытия (1–24) и Исаии (1–22). Нумерация глав и стихов — по греческому тексту; в Притчах (с гл. 24) и "
        "местами в других книгах она расходится с синодальной. Псалтирь (нумерация Септуагинты) не включена. "
        "Текст переведён из дореформенной орфографии в современную.",
        "П. А. Юнгеров (1856–1921)",
        "Юнгеров П. А. Переводы с греческого текста LXX, Казань, 1908–1917; электронный текст — " + rp,
        "Public Domain (переводчик умер в 1921 г., издания 1908–1917 гг.)",
        lambda: collect("lxx.jung", YUNGEROV, "lxx.jung"), version="1908–1917"), None
    yield make_module(
        "rus-sergievsky", "Сергиевский", "Неканонические книги в переводе А. А. Сергиевского (1862–1869)",
        "Книги Ветхого Завета, которых нет в еврейском каноне, в переводе священника А. А. Сергиевского с "
        "греческого текста Септуагинты (журнал «Православное обозрение», 1862–1869): Товит, Иудифь, Премудрость "
        "Соломона, Варух, 2-я и 3-я Маккавейские. Текст переведён из дореформенной орфографии в современную.",
        "А. А. Сергиевский", "Православное обозрение, М., 1862–1869; электронный текст — " + rp,
        "Public Domain (переводчик умер более 100 лет назад, издания 1860-х гг.)",
        lambda: collect("lxx.serg", SERGIEVSKY, "lxx.serg"), version="1862–1869"), None
    yield make_module(
        # Тот же id, что у прежнего модуля «Макарий» (только Пятикнижие): у установивших он обновится на месте
        "rus-makarij", "Макарий", "Ветхий Завет в переводе архим. Макария (Глухарева), 1834–1847",
        "Перевод книг Ветхого Завета с еврейского архимандрита Макария (Глухарева, 1792–1847), впервые напечатанный "
        "в «Православном обозрении» 1860–1867 гг. Здесь все книги, доступные в открытом электронном виде: Пятикнижие "
        "(включая Числа), Иисус Навин, Судьи, Руфь, 1–2 Царств, Ездра, Неемия, Есфирь, Иов (гл. 1–14), Песнь "
        "песней, Екклесиаст, Плач Иеремии, Даниил, 12 малых пророков. Нет Псалтири, Притчей, Исаии, Иеремии, "
        "Иезекииля, 3–4 Царств и 1–2 Паралипоменон. Текст переведён из дореформенной орфографии в современную; "
        "еврейская нумерация Иоиля, Осии, Михея, Наума и Неемии приведена к синодальной.",
        "Архим. Макарий (М. Я. Глухарев, 1792–1847)",
        "Православное обозрение, 1860–1867; электронный текст — " + rp, "Public Domain (переводчик умер в 1847 г.)",
        lambda: collect("masor.macar", MAKARIJ, "masor.macar"), version="1834–1847"), None


def fetch_all():
    fetch_pobed()
    for idx in ("newt.rbo", "lxx.jung", "lxx.serg", "masor.macar"):
        t = F.page(idx)
        for pid in dict.fromkeys(re.findall(r'<a class=keph href="(?:/)?index\.php\?id=([^"]+)"', t)):
            F.page(pid)


def main(args):
    only = [a for a in args if a.startswith("rus-")]
    if "fetch" in args:
        fetch_all()
    if "build" not in args:
        return
    entries = []
    for mod, label in plan():
        if only and mod["id"] not in only:
            continue
        books = mod["books"]() if callable(mod["books"]) else mod["books"]
        mod["books"] = books
        report(mod["id"], books)
        entries.append(write_module(mod))
    merge_catalog(entries, in_place=True)


if __name__ == "__main__":
    main(sys.argv[1:] or ["build"])
