"""Русские словари из Русской Викитеки для build_extra.py (тексты — общественное достояние, изданы до 1917 г.;
электронный текст и оформление Викитеки — CC BY-SA 4.0).

Откуда берутся страницы (всё сохраняется в data-src/extra/ru-wikisource-dump/pages/, ничего из скачанного не исполняется):
  python -I scripts/extra_dicts_ru.py extract      # из дампа Викитеки (ruwikisource-*-pages-articles.xml.bz2, ~2 ГБ,
                                                   # https://dumps.wikimedia.org/ruwikisource/latest/) -> pages/<набор>.jsonl
  python -I scripts/extra_dicts_ru.py fetch [набор…] # страницы сканов через MediaWiki API -> pages/api/<набор>.jsonl
                                                   # (читаются вместо выгрузки из дампа; ~1,5 ч из-за ограничений API)

Наборы:
  esbe, eebe — статьи «ЭСБЕ/…» и «ЕЭБЕ/…» (Энциклопедический словарь и Еврейская энциклопедия Брокгауза и Ефрона),
               текст прямо в статье, современная орфография; из дампа (extract)
  dal2       — «Страница:Толковый словарь Даля (2-е издание). Том N (188x).pdf/…» (fetch): статьи — секции
               <section begin="Слово"/> на страницах скана, дореформенная орфография
  pbe        — «Страница:Православная богословская энциклопедия. Том N.djvu/…» (fetch; вычитанные страницы),
               у статей — {{ВАР2|дореформенная|современная орфография}}
Не используются: 3-е изд. Даля (1903–1909) — на Викитеке почти не вычитано (OCR с ошибками); Полный православный
богословский энциклопедический словарь (ППБЭС) — на Викитеке всего 16 страниц сканов.
"""
import bz2
import json
import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from extra_lib import SRC, log  # noqa: E402

DUMP_DIR = SRC / "ru-wikisource-dump"
PAGES = DUMP_DIR / "pages"

# (набор, пространство имён, проверка заглавия)
SETS = [
    ("pbe", 104, lambda t: t.startswith("Страница:Православная богословская энциклопедия")),
    ("eebe", 0, lambda t: t.startswith("ЕЭБЕ/")),
    ("esbe", 0, lambda t: t.startswith("ЭСБЕ/")),
]


def extract():
    dumps = sorted(DUMP_DIR.glob("ruwikisource-*-pages-articles.xml.bz2"))
    assert dumps, f"нет дампа в {DUMP_DIR}"
    PAGES.mkdir(parents=True, exist_ok=True)
    outs = {name: open(PAGES / f"{name}.jsonl", "w", encoding="utf-8") for name, _, _ in SETS}
    counts = dict.fromkeys(outs, 0)
    n = 0
    with bz2.open(dumps[-1], "rb") as f:
        ns_tag = None
        for ev, el in ET.iterparse(f, events=("end",)):
            tag = el.tag.rsplit("}", 1)[-1]
            if tag != "page":
                continue
            n += 1
            if n % 200000 == 0:
                log(f"  {n} страниц…", counts)
            if ns_tag is None:
                ns_tag = el.tag[:-4]
            title = el.findtext(ns_tag + "title") or ""
            ns = int(el.findtext(ns_tag + "ns") or -1)
            for name, want_ns, ok in SETS:
                if ns == want_ns and ok(title):
                    rev = el.find(ns_tag + "revision")
                    text = rev.findtext(ns_tag + "text") if rev is not None else ""
                    red = el.find(ns_tag + "redirect")
                    rec = {"title": title, "text": text or "", "redirect": red.get("title") if red is not None else None,
                           "timestamp": rev.findtext(ns_tag + "timestamp") if rev is not None else None}
                    outs[name].write(json.dumps(rec, ensure_ascii=False) + "\n")
                    counts[name] += 1
                    break
            el.clear()
    for o in outs.values():
        o.close()
    (DUMP_DIR / "SOURCE.txt").write_text(
        f"Источник: {dumps[-1].name} (https://dumps.wikimedia.org/ruwikisource/). Извлечено страниц: "
        + json.dumps(counts, ensure_ascii=False) + "\n", encoding="utf-8")
    log("готово:", counts)


# Тот же набор страниц сканов можно получить без дампа — через MediaWiki API (пачками по 50, пауза 0,5 с)
API_SETS = {
    "dal2": "Толковый словарь Даля (2-е издание). Том ",
    "pbe": "Православная богословская энциклопедия",
}
# С какой степени вычитки загружать текст страниц (0 — пусто, 1 — не вычитано, 3 — вычитано, 4 — проверено).
# Даль, 2-е изд.: текст залит ботом из готовой электронной версии (качество 1), но чистый — проверяется ocr_noise().
API_MIN_QUALITY = {"dal2": 1, "pbe": 3}


def page_qualities(prefix):
    """{заглавие страницы: степень вычитки} без загрузки текста (prop=proofread)."""
    out, cont = {}, {}
    while True:
        r = _api(action="query", generator="allpages", gapnamespace=104, gapprefix=prefix, gaplimit="500",
                 prop="proofread", **cont)
        for pg in r.get("query", {}).get("pages", []):
            out[pg["title"]] = int(pg.get("proofread", {}).get("quality", 0))
        if "continue" not in r:
            return out
        cont = {k: v for k, v in r["continue"].items()}


def _api(**params):
    import time
    import urllib.parse
    import urllib.request
    params.update(format="json", formatversion="2", maxlag="5")
    url = "https://ru.wikisource.org/w/api.php"
    body = urllib.parse.urlencode(params).encode("utf-8")  # POST: 50 длинных заглавий не помещаются в адрес
    for i in range(12):
        try:
            req = urllib.request.Request(url, data=body, headers={"User-Agent": "AOBible-build/1.0 (dictionary import)"})
            with urllib.request.urlopen(req, timeout=120) as r:
                return json.load(r)
        except Exception as e:  # noqa: BLE001
            log(f"  ошибка API: {e}")
            time.sleep(60 if "429" in str(e) else 3 + 5 * i)  # 429 — слишком часто: ждём минуту
    raise RuntimeError(url)


def fetch(names):
    """Страницы сканов (пространство 104) по префиксу -> pages/api/<набор>.jsonl (читается вместо выгрузки из дампа)."""
    import time
    (PAGES / "api").mkdir(parents=True, exist_ok=True)
    for name in names:
        prefix = API_SETS[name]
        titles, cont = [], {}
        while True:
            r = _api(action="query", list="allpages", apnamespace=104, apprefix=prefix, aplimit="500", **cont)
            titles += [x["title"] for x in r["query"]["allpages"]]
            if "continue" not in r:
                break
            cont = {"apcontinue": r["continue"]["apcontinue"]}
        log(f"{name}: {len(titles)} страниц")
        minq = API_MIN_QUALITY.get(name, 1)
        if minq > 1:
            q = page_qualities(prefix)
            titles = [t for t in titles if q.get(t, 0) >= minq]
            log(f"  вычитанных (качество ≥ {minq}): {len(titles)}")
        dest = PAGES / "api" / f"{name}.jsonl"
        have = set()
        if dest.exists():  # продолжение прерванной загрузки
            for line in dest.read_text(encoding="utf-8").splitlines():
                try:
                    have.add(json.loads(line)["title"])
                except ValueError:
                    pass
            good = [line for line in dest.read_text(encoding="utf-8").splitlines() if line.strip().endswith("}")]
            dest.write_text("".join(line + "\n" for line in good), encoding="utf-8")
        titles = [t for t in titles if t not in have]
        log(f"  уже есть {len(have)}, загрузить {len(titles)}")
        with open(dest, "a", encoding="utf-8") as out:
            for i in range(0, len(titles), 50):
                r = _api(action="query", prop="revisions", rvprop="content|timestamp", rvslots="main",
                         titles="|".join(titles[i:i + 50]))
                for pg in r["query"]["pages"]:
                    rev = (pg.get("revisions") or [{}])[0]
                    out.write(json.dumps({"title": pg["title"], "text": rev.get("slots", {}).get("main", {}).get("content", ""),
                                          "redirect": None, "timestamp": rev.get("timestamp")}, ensure_ascii=False) + "\n")
                out.flush()
                if i % 500 == 0:
                    log(f"  {name}: {i + 50}/{len(titles)}")
                time.sleep(2)


def read_set(name):
    p = PAGES / "api" / f"{name}.jsonl"
    if not p.exists():
        p = PAGES / f"{name}.jsonl"
    return [json.loads(line) for line in p.read_text(encoding="utf-8").splitlines() if line.strip()]


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    if sys.argv[1:] == ["extract"]:
        extract()
    elif sys.argv[1:2] == ["fetch"]:
        fetch(sys.argv[2:] or list(API_SETS))


# ---------------------------------------------------------------------------------------------
# Дореформенная орфография -> современная (для текста Даля и ключей статей)
# ---------------------------------------------------------------------------------------------

_LETTERS = str.maketrans({"ѣ": "е", "Ѣ": "Е", "і": "и", "І": "И", "ѳ": "ф", "Ѳ": "Ф", "ѵ": "и", "Ѵ": "И",
                          "ѧ": "я", "Ѧ": "Я", "ѫ": "у", "Ѫ": "У", "ѯ": "кс", "ѱ": "пс"})
_CYR = "А-Яа-яЁёѢѣІіѲѳѴѵ"
_ACC = "́̀"
WORD_RE = re.compile(f"[{_CYR}][{_CYR}{_ACC}]*")
# Окончания прилагательных -аго/-яго -> -ого/-его; слова, где -аго — часть основы
_AGO_KEEP = {"благо", "наго", "драго", "саго", "аго", "маго", "яго", "чикаго", "сантьяго"}
_AGO_STRESSED = {"большаго", "чужаго", "небольшаго", "пребольшаго"}
_IJA_ADJ = {"другия", "многия", "строгия", "нагия", "благия", "убогия", "долгия", "дорогия", "всякия"}
# Приставки на -з перед глухим согласным (без-/из-/раз-/воз-/чрез-) -> -с; низ- и воз+к не трогаем (низкий, возка)
_PREFIX = re.compile(r"^(без|из|раз|роз|воз|чрез|через)(?=[кпстфхцчшщ])", re.I)


def _modern_word(w):
    plain = w.replace("́", "").replace("̀", "")
    low = plain.lower()
    if low.endswith("ъ") and len(low) > 1:
        w = re.sub(f"ъ[{_ACC}]*$", "", w)
        low = low[:-1]
    w = w.translate(_LETTERS)
    low = low.translate(_LETTERS)
    if len(low) >= 5 and (low.endswith("аго") or low.endswith("яго")) and low not in _AGO_KEEP \
            and not low.endswith("благо"):
        # после шипящих и ц — безударное -его (высшаго -> высшего), кроме ударных большого, чужого и т. п.
        soft = low[-4] in "жшчщц" and low not in _AGO_STRESSED
        w = re.sub(f"([аяАЯ])([{_ACC}]*)(го)$",
                   lambda m: ("о" if m.group(1) in "аА" and not soft else "е") + m.group(2) + m.group(3), w)
    elif len(low) >= 5 and not w[:1].isupper() and plain.lower().endswith("ія") and (low.endswith("кия") or low.endswith("хия") or low in _IJA_ADJ):
        w = w[:-1] + "е"  # какія, такія, великія, другія -> какие, такие, великие, другие
    elif len(low) >= 5 and low.endswith("ыя"):
        w = w[:-1] + ("е" if w[-1] == "я" else "Е")
    elif low in ("ея",):
        w = w[0] + "е"
    elif low in ("онѣ", "однѣ", "одне", "оне"):
        w = w[:-1] + "и"
    m = _PREFIX.match(w)
    if m and len(low) > len(m.group(1)) + 2 and not low.startswith("возк"):
        p = m.group(1)
        w = p[:-1] + ("с" if p[-1] == "з" else "С") + w[len(p):]
    return w


def modern(s):
    """Текст в дореформенной орфографии -> современная (ѣ, і, ѳ, ѵ, ъ на конце, -аго, -ыя, без-/из-/раз-)."""
    return WORD_RE.sub(lambda m: _modern_word(m.group(0)), s)


def word_key(w):
    """Ключ статьи: как normalizeWord в src/core/verseMarkup.js (нижний регистр, ё -> е), без ударений."""
    w = re.sub(f"[{_ACC}]", "", w)
    return w.lower().replace("ё", "е").strip()


# ---------------------------------------------------------------------------------------------
# Страницы сканов (пространство «Страница:»): статьи — секции <section begin="Слово"/>…<section end="Слово"/>
# ---------------------------------------------------------------------------------------------

_PAGE_NO = re.compile(r"[Тт]ом\.? ?(\d+).*?/(\d+)$")
_SEC = re.compile(r"<section\s+(begin|end)\s*=\s*\"?([^\"/>]*?)\"?\s*/?>", re.I)


def page_order(title):
    m = _PAGE_NO.search(title)
    return (int(m.group(1)), int(m.group(2))) if m else (0, 0)


def page_quality(text):
    m = re.search(r"<pagequality\s+level=\"(\d)\"", text)
    return int(m.group(1)) if m else 0


def sections(pages, min_quality=3):
    """{название секции: [(викитекст, качество, заглавие страницы), …]} в порядке страниц.
    Страницы без вычитки (качество < min_quality: 0 — без текста, 1 — не вычитана, 2 — проблемная) пропускаются."""
    out = {}
    skipped = 0
    for p in sorted(pages, key=lambda r: page_order(r["title"])):
        text = p["text"]
        q = page_quality(text)
        if q < min_quality:
            skipped += 1
            continue
        body = re.sub(r"<noinclude>.*?</noinclude>", "", text, flags=re.S)
        pos = 0
        cur = None
        for m in _SEC.finditer(body):
            kind, name = m.group(1).lower(), m.group(2).strip()
            if kind == "begin":
                cur, pos = name, m.end()
            elif cur is not None and name == cur:
                out.setdefault(cur, []).append((body[pos:m.start()], q, p["title"]))
                cur = None
    return out, skipped


# ---------------------------------------------------------------------------------------------
# Викитекст -> текст
# ---------------------------------------------------------------------------------------------

import extra_ru as R  # noqa: E402
from extra_lib import fmt_ref, synodal  # noqa: E402

PIPE = "\x01"  # {{!}} — вертикальная черта внутри параметров шаблона (возвращается после разбора)
BOOK_ALIASES = {"Апок": "Откр", "Матф": "Мф", "Мат": "Мф", "Марк": "Мк", "Лук": "Лк", "Иоанн": "Ин",
                "1Иоан": "1Ин", "2Иоан": "2Ин", "3Иоан": "3Ин", "Числ": "Чис", "Плач": "Плч", "Ефес": "Еф",
                "Фил": "Флп", "Филип": "Флп", "Евр.": "Евр", "Иуды": "Иуд", "Притч.": "Притч", "Иисус Нав": "Нав",
                "Ездр": "1Ездр", "Езд": "1Ездр", "Неем.": "Неем", "Есф": "Эсф", "Песн.Песн": "Песн", "Пес": "Песн",
                "Дан.": "Дан", "Ам.": "Ам", "Иак.": "Иак", "1Петр.": "1Пет", "2Петр": "2Пет", "Сол": "Фес",
                "1Сол": "1Фес", "2Сол": "2Фес", "Тим": "1Тим", "Ос.": "Ос", "Иерем.": "Иер", "Иез.": "Иез"}
_DROP = {"колонтитул", "heading", "indent", "отступ", "nop", "clear", "!!", "якорь", "anchor", "pagenum", "custom rule",
         "rule", "dhr", "реф", "сноски", "примечания", "references", "изображение", "img float", "ifloat", "иллюстрация"}


_HEADERS = {"эсбе", "еэбе", "мэсбе", "ппбэс", "пбэ", "тсд", "бэан", "словарная статья", "отексте"}


def wiki_hook(name, pos, named, orth=None):
    low = name.strip().lower()
    if low == "!":
        return PIPE
    if low in ("акут", "акут3", "акут2", "´", "ударение"):
        return "́"
    if low in ("вар2", "вар"):  # {{ВАР2|дореформенная|современная}}
        new = pos[1].strip() if len(pos) > 1 else ""
        return new if new else (orth(pos[0]) if orth and pos else (pos[0] if pos else ""))
    if low == "tsdl":
        return pos[1] if len(pos) > 1 and pos[1].strip() else (pos[0] if pos else "")
    if low in _DROP or low in _HEADERS:
        return ""
    if name.strip() == "Библия" and pos:
        bk = pos[0].strip().replace(" ", "")
        if bk not in R.RU_BOOKS and bk in BOOK_ALIASES:
            return "{{Библия|" + "|".join([BOOK_ALIASES[bk]] + pos[1:] + [f"{k}={v}" for k, v in named.items()]) + "}}"
    if low in ("lang", "lang-he", "lang-el", "lang-grc", "lang-la", "polytonic", "греч", "евр", "иврит"):
        return pos[-1] if pos else ""
    if len(pos) > 1 and re.fullmatch(r"[\d.]+\s*(em|%|px|pt|ex)?", pos[0].strip()):
        return "".join(pos[1:])  # {{межбуквенный интервал|0.4em|Благодат|ь.}}, {{resize|182%|…}}
    if low in ("sfrac", "дробь", "frac"):
        return "/".join(p.strip() for p in pos)
    return None


def _tables(w):
    out = []
    for line in w.split("\n"):
        s = line.strip()
        if s.startswith("{|") or s.startswith("|}") or s.startswith("|-") or s.startswith("|+"):
            continue
        if s.startswith("|") or s.startswith("!"):
            cells = re.split(r"\|\||!!", s[1:])
            cells = [c.split("|", 1)[1] if re.match(r"^\s*[\w-]+=\"[^\"]*\"[^|]*\|", c) else c for c in cells]
            out.append(" · ".join(c.strip() for c in cells))
        else:
            out.append(line)
    return "\n".join(out)


def wiki_text(w, refs, orth=None):
    w = re.sub(r"<noinclude>.*?</noinclude>", "", w, flags=re.S)
    w = re.sub(r"<section[^>]*/?>", "", w)
    w = re.sub(r"__[A-ZА-Я]+__", "", w)
    w = re.sub(r"<math>.*?</math>", "", w, flags=re.S)
    w = re.sub(r"<gallery.*?</gallery>", "", w, flags=re.S | re.I)
    # ссылки [[…]] изнутри наружу: картинки с подписями, содержащими ссылки, убираются целиком
    for _ in range(5):
        w2 = re.sub(r"\[\[([^\[\]]*)\]\]", lambda m: "" if re.match(
            r"\s*(Файл|File|Изображение|Image|Категория|Category):", m.group(1), re.I) else m.group(1).split("|")[-1], w)
        if w2 == w:
            break
        w = w2
    w = R._wikitext_to_text(w, refs, hook=lambda n, p, k: wiki_hook(n, p, k, orth))
    w = _tables(w)
    w = w.replace(PIPE, "|").replace("{{", "").replace("}}", "").replace("[[", "").replace("]]", "")
    w = re.sub(r"\[\s*\]", "", w)
    w = re.sub("[﻿​‌‍⁠]", "", w)  # BOM и невидимые пробелы из исходников
    return R.norm_space(fix_scripts(w))


# OCR и набор путают одинаковые на вид латинские и русские буквы («Иepoвоам», «Maxпела», «пo»)
_LAT2CYR = str.maketrans("AaBEeKkMHOoPpCcTXxy", "АаВЕеКкМНОоРрСсТХху")
_CYR2LAT = str.maketrans("АаВЕеКкМНОоРрСсТХху", "AaBEeKkMHOoPpCcTXxy")
_MIXED = re.compile(r"\b(?=\w*[A-Za-z])(?=\w*[А-Яа-яЁё])[A-Za-zА-Яа-яЁё]+\b")


def fix_scripts(s):
    def one(m):
        w = m.group(0)
        lat = sum(1 for c in w if "a" <= c.lower() <= "z")
        cyr = len(w) - lat
        to_cyr, to_lat = w.translate(_LAT2CYR), w.translate(_CYR2LAT)
        ok_cyr, ok_lat = not re.search(r"[A-Za-z]", to_cyr), not re.search(r"[А-Яа-яЁё]", to_lat)
        if ok_cyr and (cyr >= lat or not ok_lat):
            return to_cyr
        return to_lat if ok_lat else w
    return _MIXED.sub(one, s)


# Ссылки на Писание в простом тексте статей: «(Исх. XXV, 8—9)», «Быт. 12, 3», «(Быт., 14, 13; 21, 27—32)»
def _books(pairs):
    out = {}
    for names, osis in pairs:
        for n in names.split():
            out[n] = osis
    return out


_NUMBERED_SYN = [("Цар", ["1Sam", "2Sam", "1Kgs", "2Kgs"]), ("Пар", ["1Chr", "2Chr"]), ("Ездр", ["Ezra", "1Esd", "2Esd"]),
                 ("Мак", ["1Macc", "2Macc", "3Macc"]), ("Пет Петр", ["1Pet", "2Pet"]), ("Ин Иоан", ["1John", "2John", "3John"]),
                 ("Кор", ["1Cor", "2Cor"]), ("Фес Сол", ["1Thess", "2Thess"]), ("Тим", ["1Tim", "2Tim"])]
REF_BOOKS_SYN = _books([
    ("Быт Бытия", "Gen"), ("Исх Исход", "Exod"), ("Лев Левит", "Lev"), ("Чис Числ", "Num"), ("Втор Второз", "Deut"),
    ("Нав", "Josh"), ("Суд Судей", "Judg"), ("Руф", "Ruth"), ("Неем", "Neh"), ("Есф Эсф", "Esth"), ("Иов", "Job"),
    ("Пс Псал Псалом", "Ps"), ("Притч Прит", "Prov"), ("Еккл Екклез", "Eccl"), ("Песн", "Song"), ("Ис Исаии Исаия", "Isa"),
    ("Иер Иерем", "Jer"), ("Плач Плч", "Lam"), ("Иез Иезек", "Ezek"), ("Дан", "Dan"), ("Ос", "Hos"), ("Иоил", "Joel"),
    ("Ам Амос", "Amos"), ("Авд", "Obad"), ("Ион Иона", "Jonah"), ("Мих", "Mic"), ("Наум", "Nah"), ("Авв", "Hab"),
    ("Соф", "Zeph"), ("Агг", "Hag"), ("Зах", "Zech"), ("Мал", "Mal"), ("Тов", "Tob"), ("Иудиф", "Jdt"), ("Прем", "Wis"),
    ("Сир", "Sir"), ("Вар", "Bar"), ("Мф Мат Матф", "Matt"), ("Мк Мр Марк", "Mark"), ("Лк Лук", "Luke"),
    ("Ин Иоан", "John"), ("Деян", "Acts"), ("Иак", "Jas"), ("Иуд", "Jude"), ("Рим", "Rom"), ("Гал", "Gal"),
    ("Еф Ефес", "Eph"), ("Флп Фил Филип", "Phil"), ("Кол", "Col"), ("Тит", "Titus"), ("Флм Филим", "Phlm"),
    ("Евр", "Heb"), ("Откр Апок", "Rev")])
for _names, _osis in _NUMBERED_SYN:
    for _n in _names.split():
        for _k, _o in enumerate(_osis, 1):
            REF_BOOKS_SYN[f"{_k}{_n}"] = _o
# Еврейская энциклопедия: названия по еврейской Библии (I Сам. = 1Sam, I Цар. = 1Kgs, Хрон. = Chr), нумерация масоретская
REF_BOOKS_MT = _books([
    ("Быт Бытие", "Gen"), ("Исх Исход", "Exod"), ("Лев Левит", "Lev"), ("Чис Числ", "Num"),
    ("Втор Второз Второзак", "Deut"), ("Иош Иошуа Нав", "Josh"), ("Суд Судей", "Judg"), ("Руфь Руф", "Ruth"),
    ("Эзра Эзр Ездр", "Ezra"), ("Нехем Неем", "Neh"), ("Эсф Эсфирь Есф", "Esth"), ("Иов", "Job"), ("Пс Псалм Псал", "Ps"),
    ("Притч", "Prov"), ("Экклез Еккл Когел", "Eccl"), ("Песнь Песн", "Song"), ("Исаия Ис", "Isa"),
    ("Иерем Иер", "Jer"), ("Плач", "Lam"), ("Иезек Иез", "Ezek"), ("Дан Даниил", "Dan"), ("Осия Ос", "Hos"),
    ("Иоиль Иоил", "Joel"), ("Амос Ам", "Amos"), ("Овадия Авд", "Obad"), ("Иона Ион", "Jonah"), ("Миха Мих", "Mic"),
    ("Наум", "Nah"), ("Хабак Авв", "Hab"), ("Цефан Соф", "Zeph"), ("Хаггай Агг", "Hag"), ("Захар Зах", "Zech"),
    ("Малах Мал", "Mal")])
for _n, _osis in (("Сам", ["1Sam", "2Sam"]), ("Цар", ["1Kgs", "2Kgs"]), ("Хрон", ["1Chr", "2Chr"])):
    for _k, _o in enumerate(_osis, 1):
        REF_BOOKS_MT[f"{_k}{_n}"] = _o

_NUM = {"1": 1, "2": 2, "3": 3, "4": 4, "I": 1, "II": 2, "III": 3, "IV": 4, "І": 1, "ІІ": 2, "ІІІ": 3, "И": 1, "ИИ": 2}
_ROMAN = {"I": 1, "V": 5, "X": 10, "L": 50, "C": 100}
_REF_CACHE = {}


def _roman(s):
    if s.isdigit():
        return int(s)
    n = 0
    for a, b in zip(s, s[1:] + " "):
        v = _ROMAN[a]
        n += -v if b != " " and _ROMAN[b] > v else v
    return n


def _ref_re(books):
    key = id(books)
    if key not in _REF_CACHE:
        names = sorted({re.sub(r"^\d", "", k) for k in books}, key=len, reverse=True)
        _REF_CACHE[key] = re.compile(
            r"(?<![А-Яа-яЁёA-Za-z])(?:(IV|I{1,3}|І{1,3}|[1-4]|И{1,2}\.)\s?)?(" + "|".join(map(re.escape, names)) +
            r")\.?,?\s?([IVXLC]+|\d{1,3}),\s?(\d{1,3})(?:\s?[—–-]\s?(\d{1,3}))?")
    return _REF_CACHE[key]


_CONT = re.compile(r"^\s?[;]\s?([IVXLC]+|\d{1,3}),\s?(\d{1,3})(?:\s?[—–-]\s?(\d{1,3}))?")


def plain_refs(text, books=None, mapper=None, limit=40):
    """Ссылки на стихи в тексте статьи -> OSIS (синодальная нумерация); неверные (нет такого стиха) отбрасываются."""
    books = books or REF_BOOKS_SYN
    syn = synodal()
    out = []

    def add(osis, c, v, v2):
        if mapper:
            _, c1, v1 = mapper(osis, c, v)
            _, c2, w2 = mapper(osis, c, v2)
            if c2 != c1:
                w2 = v1
            c, v, v2 = c1, v1, w2
        if syn.exists(osis, c, v) and (v2 == v or (v2 > v and syn.exists(osis, c, v2))):
            r = fmt_ref(osis, c, v, c, v2)
            if r not in out:
                out.append(r)

    for m in _ref_re(books).finditer(text):
        num = _NUM.get((m.group(1) or "").rstrip(".").strip(), 0)
        name = m.group(2)
        osis = books.get(f"{num}{name}") if num else books.get(name)
        if not osis:
            continue
        try:
            c = _roman(m.group(3))
        except KeyError:
            continue
        v = int(m.group(4))
        add(osis, c, v, int(m.group(5)) if m.group(5) else v)
        pos = m.end()
        while len(out) < limit:
            mm = _CONT.match(text[pos:pos + 40])
            if not mm:
                break
            try:
                c = _roman(mm.group(1))
            except KeyError:
                break
            v = int(mm.group(2))
            add(osis, c, v, int(mm.group(3)) if mm.group(3) else v)
            pos += mm.end()
        if len(out) >= limit:
            break
    return out


# ---------------------------------------------------------------------------------------------
# Слова русских переводов: какие статьи вообще найдутся по нажатию (src/core/lexicon.js)
# ---------------------------------------------------------------------------------------------

from extra_lib import OUT  # noqa: E402

# Окончания — как ENDINGS в src/core/lexicon.js
ENDINGS = ['ениями', 'ениях', 'остями', 'ствами', 'иями', 'ями', 'ами', 'ого', 'его', 'ому', 'ему', 'ыми', 'ими',
           'ешь', 'ете', 'ите', 'ают', 'яют', 'ует', 'ует', 'ться', 'тся', 'ась', 'ось', 'ись', 'ыся', 'вши', 'ший',
           'щий', 'ние', 'ния', 'нию', 'ием', 'иях', 'ой', 'ей', 'ий', 'ый', 'ая', 'яя', 'ое', 'ее', 'ую', 'юю', 'ом',
           'ем', 'ах', 'ях', 'ов', 'ев', 'ам', 'ям', 'ть', 'ти', 'ет', 'ит', 'ут', 'ют', 'ат', 'ят', 'ил', 'ел', 'ла',
           'ли', 'ло', 'ся', 'сь', 'ы', 'и', 'а', 'я', 'о', 'е', 'у', 'ю', 'ь', 'й']


def stem(w):
    w = word_key(w)
    for e in ENDINGS:
        if len(w) - len(e) >= 3 and w.endswith(e):
            return w[:-len(e)]
    return w


_BIBLE_WORDS = None
RU_BIBLES = ("rst", "rst-dc", "csl-elizabeth", "rus-makarij")
_TOKEN = re.compile(r"[^\W\d_]+(?:[-’'][^\W\d_]+)*")


def bible_words():
    """{словоформа (как normalizeWord): частота} по русским и церковнославянскому переводам из public/modules."""
    global _BIBLE_WORDS
    if _BIBLE_WORDS is None:
        import unicodedata
        cnt = {}
        for mid in RU_BIBLES:
            f = OUT / f"{mid}.json"
            if not f.exists():
                continue
            m = json.loads(f.read_text(encoding="utf-8"))
            for b in m["books"]:
                for ch in b["chapters"]:
                    for v in ch:
                        v = re.sub(r"\{([^|}]*)\|[^}]*\}", r"\1", v)
                        v = "".join(c for c in unicodedata.normalize("NFD", v) if not unicodedata.combining(c))
                        for t in _TOKEN.findall(unicodedata.normalize("NFC", v)):
                            k = word_key(t)
                            cnt[k] = cnt.get(k, 0) + 1
        _BIBLE_WORDS = cnt
    return _BIBLE_WORDS


def reachable(keys):
    """Ключи, которые найдутся по словам переводов: точное совпадение, совпадение основ или ключ начинается с
    основы слова (как префиксный поиск в lexicon.js, но без ограничения «первые 4» — с запасом на улучшение поиска)."""
    words = bible_words()
    stems = {stem(w) for w in words}
    import bisect
    srt = sorted(keys)
    ok = set(k for k in keys if k in words or stem(k) in stems)
    for s in stems:
        i = bisect.bisect_left(srt, s)
        while i < len(srt) and srt[i].startswith(s):
            ok.add(srt[i])
            i += 1
    return ok


# ---------------------------------------------------------------------------------------------
# Энциклопедии Брокгауза и Ефрона (ЭСБЕ, ЕЭБЕ): только статьи, полезные при чтении Библии
# ---------------------------------------------------------------------------------------------

BIBLE_CUE = re.compile(r"библ|ветхозав|новозав|евангел|апостол|пророк|израил|иуде|евре|христ|богослов|церк|священ|"
                       r"писани|палестин|ханаан|храм|моисе|левит|патриарх|ассир|вавилон|египт|иерусал", re.I)


def _title_word(title, prefix):
    w = title[len(prefix):]
    w = re.sub(r"\s*\(.*\)\s*$", "", w)
    return w.split(",")[0].strip()


def bible_articles(name, prefix, books=None, mapper=None, need_refs=False):
    """Статьи энциклопедии, которые найдутся по слову библейского текста и относятся к Библии.
    Ключ — заглавное слово (до запятой и уточнения в скобках); несколько статей с одним ключом объединяются.
    Отбор: (1) заглавие — одно слово, совпадающее со словоформой русских переводов или её основой;
    (2) не статья о человеке нового времени («Фамилия, Имя»); (3) в статье есть ссылки на стихи Писания или
    (если need_refs=False) библейская тематика в начале статьи (не меньше 1 признака в первых 400 знаках и 2 — в 1500)."""
    words = bible_words()
    stems = {stem(w) for w in words}
    rows = read_set(name)
    entries = {}
    stat = {"всего": 0, "взято": 0}
    for r in sorted(rows, key=lambda r: r["title"]):
        t = r["title"]
        if r["redirect"] or "/" in t[len(prefix):]:
            continue
        stat["всего"] += 1
        if re.search(r",\s*[A-ZА-ЯЁ]", t):
            continue
        word = _title_word(t, prefix)
        key = word_key(word)
        if not key or " " in key or not (key in words or stem(key) in stems):
            continue
        refs = []
        text = wiki_text(r["text"], refs)
        if len(text) < 40:
            continue
        refs += [x for x in plain_refs(text, books, mapper) if x not in refs]
        cue_ok = len(BIBLE_CUE.findall(text[:400])) >= 1 and len(BIBLE_CUE.findall(text[:1500])) >= 2
        if not (refs or (cue_ok and not need_refs)):
            continue
        stat["взято"] += 1
        e = entries.setdefault(key, {"word": word, "parts": [], "refs": []})
        e["parts"].append((t[len(prefix):], text))
        e["refs"] += [x for x in refs if x not in e["refs"]]
    for e in entries.values():
        parts = e.pop("parts")
        if len(parts) == 1:
            e["text"] = parts[0][1]
        else:  # несколько статей с одним заглавным словом: «Иосиф, патриарх», «Иосиф Аримафейский»…
            # уточнение из заглавия («Иосиф, патриарх московский») — первой строкой, если статья начинается иначе
            e["text"] = "\n\n* * *\n\n".join(txt if txt.startswith(sub) else f"{sub}\n{txt}" for sub, txt in parts)
        e["refs"] = e["refs"][:40]
        if not e["refs"]:
            del e["refs"]
    log(f"  {name}: статей {stat['всего']}, взято {stat['взято']}, ключей {len(entries)}")
    return dict(sorted(entries.items()))


def esbe():
    return bible_articles("esbe", "ЭСБЕ/")


def eebe():
    import extra_world as W
    return bible_articles("eebe", "ЕЭБЕ/", books=REF_BOOKS_MT, mapper=W.mapper("mt"), need_refs=True)


# ---------------------------------------------------------------------------------------------
# Толковый словарь В. И. Даля, 2-е изд. (1880–1882): статьи-гнёзда; производные слова гнезда набраны
# полужирным курсивом ('''''слово''''') — по ним добавляются ключи с отрывком статьи
# ---------------------------------------------------------------------------------------------

D_OPEN, D_CLOSE = "\x02", "\x03"
_OCR_BAD = re.compile(r"[А-Яа-яЁёѣі][A-Za-z]|[A-Za-z][А-Яа-яЁёѣі]|[А-Яа-яЁёѣі]\d|\d[А-Яа-яЁёѣі]")


def ocr_noise(text):
    """Доля «подозрительных» слов (латиница или цифры внутри русского слова) — признак невычитанного OCR."""
    words = text.split()
    return sum(1 for w in words if _OCR_BAD.search(w)) / max(1, len(words))


def _dal_clean(s):
    s = s.replace("||", " ‖ ").replace(D_OPEN, "").replace(D_CLOSE, "")
    s = re.sub(r"\s+([,.;:])", r"\1", s)
    return R.norm_space(modern(s))


def _section_word(name):
    w = re.sub(r"\s*\(.*\)\s*$", "", name)
    w = re.sub(r"\s+\d+$", "", w).strip()
    return modern(w)


def dal(set_name="dal2", min_quality=1, max_noise=0.02, fragment=700, only_reachable=True):
    rows = read_set(set_name)
    secs, skipped = sections(rows, min_quality=min_quality)
    entries, derived = {}, {}
    noisy = 0
    for name, parts in secs.items():
        raw = " ".join(p[0] for p in parts)
        # ровно пять кавычек с обеих сторон и без кавычек внутри (иначе ''' + '' соседних слов дают ложное совпадение)
        # и начинается с буквы: «'''Слово''''', текст…» — это конец полужирного и начало курсива, а не производное
        raw = re.sub(r"(?<!')'''''([^\W\d_][^'\n]{0,119}?)'''''(?!')", lambda m: D_OPEN + m.group(1) + D_CLOSE, raw)
        text = wiki_text(raw, [])
        if ocr_noise(text) > max_noise:
            noisy += 1
            continue
        word = _section_word(name)
        key = word_key(word)
        if not key or len(text) < 3:
            continue
        clean = _dal_clean(text)
        if key in entries:
            entries[key]["text"] += "\n\n" + clean
        else:
            entries[key] = {"word": word, "text": clean}
        # производные слова: «Благостыня» -> отрывок от этого слова до следующего производного
        for m in re.finditer(D_OPEN + "(.*?)" + D_CLOSE, text, re.S):
            # до следующего производного слова, но не короче ~250 знаков («Милосердие ср.» — мало)
            nxt = text.find(D_OPEN, m.end())
            while 0 < nxt < m.start() + 250:
                nxt = text.find(D_OPEN, nxt + 1)
            frag = text[m.start():nxt if nxt > 0 else len(text)]
            if len(frag) > fragment:
                cut = frag.rfind(" ", 0, fragment)
                frag = frag[:cut if cut > 0 else fragment] + " …"
            frag = _dal_clean(frag)
            for w in re.split(r"[,;]\s*|\s+или\s+", modern(m.group(1))):
                if w.strip().startswith(("—", "-", "–")):  # «—послушный» = «благопослушный», «—ся» — не отдельные слова
                    continue
                w = w.strip(" .,;:—-()[]")
                k = word_key(w)
                if not k or " " in k or not re.fullmatch(r"[а-я-]+", k) or k == key:
                    continue
                derived.setdefault(k, (w[:1].upper() + w[1:], frag, word))
    added = 0
    for k, (w, frag, nest) in derived.items():
        if k not in entries:
            entries[k] = {"word": w, "text": f"{frag}\n\n(Из статьи «{nest}».)", "_derived": True}
            added += 1
    total = len(entries)
    if only_reachable:  # только слова, которые встречаются в русских переводах (или совпадают с ними по основе)
        words = bible_words()
        stems = {stem(w) for w in words}
        entries = {k: v for k, v in entries.items() if k in words or stem(k) in stems}
    nests = sum(1 for v in entries.values() if not v.get("_derived"))
    for v in entries.values():
        v.pop("_derived", None)
    log(f"  {set_name}: секций {len(secs)}, страниц без вычитки пропущено {skipped}, с шумом OCR {noisy}; "
        f"статей всего {total} (производных {added}); взято гнёзд {nests}, производных {len(entries) - nests}")
    return dict(sorted(entries.items()))


# ---------------------------------------------------------------------------------------------
# Богословские энциклопедии на страницах сканов (ППБЭС 1913, ПБЭ 1900–1911): статьи — секции страниц,
# текст в современной орфографии — второй параметр {{ВАР2|…|…}} (где его нет — переводим сами)
# ---------------------------------------------------------------------------------------------

def scan_encyclopedia(set_name, min_quality=3, only_reachable=False):
    rows = read_set(set_name)
    secs, skipped = sections(rows, min_quality=min_quality)
    words = bible_words()
    stems = {stem(w) for w in words}
    entries = {}
    stat = {"секций": len(secs), "пропущено страниц без вычитки": skipped, "шум OCR": 0, "не по словам Библии": 0}
    for name, parts in secs.items():
        if not name or name.lower() in ("список", "предисловие"):
            continue
        refs = []
        raw = "\n".join(p[0] for p in parts)
        text = wiki_text(raw, refs, orth=modern)
        if re.search(r"[ѣѢѳѲѵ]|ъ\b", text):  # кусок без ВАР2 — в дореформенной орфографии
            text = modern(text)
        text = R.norm_space(text)
        if len(text) < 20:
            continue
        if ocr_noise(text) > 0.03:
            stat["шум OCR"] += 1
            continue
        word = re.sub(r"\s*\(.*\)\s*$", "", name).split(",")[0].strip()
        key = word_key(modern(word))
        if not key:
            continue
        first = key.split()[0]  # «агнец божий» найдётся по слову «агнец» (поиск по началу ключа)
        if only_reachable and not (first in words or stem(first) in stems):
            stat["не по словам Библии"] += 1
            continue
        refs += [x for x in plain_refs(text) if x not in refs]
        e = entries.setdefault(key, {"word": modern(word), "parts": [], "refs": []})
        e["parts"].append((modern(name), text))
        e["refs"] += [x for x in refs if x not in e["refs"]]
    for e in entries.values():
        parts = e.pop("parts")
        # строки-заголовки, повторяющие заглавное слово ({{h2|Авраамъ}}), убираем; уточнение из заглавия секции
        # («Авраам (мученик)») ставим, только если статья начинается не с заглавного слова
        w0 = e["word"].lower()
        parts = [(sub, re.sub(r"^(?:\s*" + re.escape(w0) + r"[.,]?\s*\n)+", "", txt, flags=re.I)) for sub, txt in parts]
        e["text"] = parts[0][1] if len(parts) == 1 else \
            "\n\n* * *\n\n".join(txt if txt.lower().startswith(w0) else f"{sub}\n{txt}" for sub, txt in parts)
        e["refs"] = e["refs"][:40]
        if not e["refs"]:
            del e["refs"]
    log(f"  {set_name}: {stat}, ключей {len(entries)}")
    return dict(sorted(entries.items()))


def pbe():
    return scan_encyclopedia("pbe", only_reachable=True)


def dump_date():
    m = sorted(DUMP_DIR.glob("ruwikisource-*-pages-articles.xml.bz2"))
    d = re.search(r"-(\d{8})-", m[-1].name).group(1) if m else ""
    return f"{d[:4]}-{d[4:6]}-{d[6:]}" if d else "?"
