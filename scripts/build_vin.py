"""Модуль «Подстрочник (Винокуров)» (public/modules/vin-interlinear.json и .gz): подстрочный перевод греческого
текста Нового Завета Алексея Винокурова (2015), использован с разрешения автора для бесплатного некоммерческого приложения.

Источник — Азбука веры, https://azbyka.ru/biblia/podstrochnik/<книга>.<глава> (одна страница на главу, 260 глав).
Каждая страница кладётся в кэш data-src/vin/cache/az_<книга>.<глава>.html и повторно не запрашивается
(пауза между запросами — 1 с, User-Agent проекта). Сборка идёт только из кэша; недостающие главы докачиваются
командой `python -I scripts/build_vin.py --fetch`.

Слова — в порядке греческого текста. Слово в тексте модуля: {русское|G<номер Стронга>||греческое}; у артикля и других
непереведённых слов русское поле — «·»; квадратные скобки Винокурова (добавленные слова) остаются в русском слове.
Знаки препинания, прилипшие к греческому слову на сайте, выносятся в текст между словами (после слова).
Нумерация сайта — по UBS/NA (как в английских Библиях); в синодальную приводится переносами MOVES (Рим 16:25–27 ->
14:24–26, 2 Кор 11:33 -> к 11:32, Откр 12:18 -> начало 13:1); число стихов сверяется с rst.json.
Стихи, которых нет в UBS3 (есть в византийском тексте), остаются пустыми.
Номера Стронга на сайте у омографов местами перепутаны (ἡ -> 1510, οὐ -> 3739, ὃ -> 3588 и т. п.) —
такие слова исправляются таблицей STRONG_FIX по написанию слова.
Запуск: python -I scripts/build_vin.py [--fetch] [--ubs]
По умолчанию греческий текст — свободный византийский (byz-rp2018), русские слова Винокурова сопоставляются ему по номерам
Стронга и по написанию слова (align()); слова Винокурова, которых нет в византийском тексте, не выводятся. Режим --ubs —
прежний подстрочник в порядке UBS3 (греческий текст защищён, публиковать нельзя).
"""
import difflib
import html
import json
import re
import sys
import time
import unicodedata
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from extra_lib import merge_catalog, write_module  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
MOD = ROOT / "public" / "modules"
CACHE = ROOT / "data-src" / "vin" / "cache"
APPROVED = ROOT / "scripts" / "approved-modules.json"
UA = "AOBible/1.0 (https://dubossarets-wq.github.io/ao-bible/)"
URL = "https://azbyka.ru/biblia/podstrochnik/{}.{}"

# id книги в приложении -> код Азбуки веры
CODES = {
    "Matt": "Mt", "Mark": "Mk", "Luke": "Lk", "John": "Jn", "Acts": "Act", "Jas": "Jac", "1Pet": "1Pet",
    "2Pet": "2Pet", "1John": "1Jn", "2John": "2Jn", "3John": "3Jn", "Jude": "Juda", "Rom": "Rom", "1Cor": "1Cor",
    "2Cor": "2Cor", "Gal": "Gal", "Eph": "Eph", "Phil": "Phil", "Col": "Col", "1Thess": "1Thes", "2Thess": "2Thes",
    "1Tim": "1Tim", "2Tim": "2Tim", "Titus": "Tit", "Phlm": "Phlm", "Heb": "Hebr", "Rev": "Apok",
}
# Исправление номеров Стронга по написанию (строчные, с диакритикой); сайт путает омографы
STRONG_FIX = {
    "ἡ": "3588", "ἢ": "2228", "ἤ": "2228", "οὐ": "3756", "οὔ": "3756", "οὒ": "3756", "ἦν": "2258", "ἦς": "2258",
    "ὃ": "3739", "οἳ": "3739", "οἵ": "3739", "αἳ": "3739", "ἥ": "3739", "ᾗ": "3739", "οὓς": "3739",
    "εἷς": "1520", "ἓν": "1520", "ἕν": "1520", "ἑνὶ": "1520", "εἶ": "1510", "φοβοῦ": "5399",
}
# (книга, глава) -> куда переносятся стихи: {стих: (книга, глава, стих)}; "pre" — слова ставятся перед стихом, иначе после
MOVES = [
    (("Rom", 16, 25), ("Rom", 14, 24), False), (("Rom", 16, 26), ("Rom", 14, 25), False),
    (("Rom", 16, 27), ("Rom", 14, 26), False),
    (("2Cor", 11, 33), ("2Cor", 11, 32), False),
    (("Rev", 12, 18), ("Rev", 13, 1), True),
]
PUNCT = ",.;:·\u0387\u037e!?"  # знаки, прилипшие к греческому слову (· и ano teleia, греческая «;»)

VERSE = re.compile(r'<div class=verse id=verse_(\d+)>(.*?)(?=<div class=verse id=verse_|<div class="?(?:chapter|footer)|\Z)', re.S)
WORD = re.compile(r'<span class=word data-id="\d+" data-word="(\d*)">(.*?)</span>\s*(?=<span class=word|\s*</div|\Z)', re.S)
GREEK = re.compile(r'<a class=greek-word[^>]*>(.*?)</a>', re.S)
RUS = re.compile(r'<span class=rus-word>(.*?)</span>', re.S)


def cache_path(code, ch):
    return CACHE / f"az_{code}.{ch}.html"


def fetch(code, ch):
    p = cache_path(code, ch)
    if p.exists() and p.stat().st_size > 5000:
        return
    req = urllib.request.Request(URL.format(code, ch), headers={"User-Agent": UA, "Accept-Encoding": "gzip"})
    with urllib.request.urlopen(req, timeout=60) as r:
        data = r.read()
        if r.headers.get("Content-Encoding") == "gzip":
            import gzip
            data = gzip.decompress(data)
    CACHE.mkdir(parents=True, exist_ok=True)
    p.write_bytes(data)
    time.sleep(1.1)


def parse_chapter(text):
    """{номер стиха: [(русское, номер Стронга или '', греческое, знак после слова)]}"""
    out = {}
    for vm in VERSE.finditer(text):
        n = int(vm.group(1))
        words = []
        for wm in WORD.finditer(vm.group(2)):
            num, body = wm.group(1), wm.group(2)
            g = GREEK.search(body)
            r = RUS.search(body)
            if not g:
                continue
            greek = html.unescape(re.sub(r"<[^>]+>", "", g.group(1))).strip()
            rus = html.unescape(re.sub(r"<[^>]+>", "", r.group(1))).strip() if r else ""
            punct = ""
            while greek and greek[-1] in PUNCT:
                punct = greek[-1] + punct
                greek = greek[:-1]
            if not greek:
                continue
            num = STRONG_FIX.get(greek.lower(), num)
            if greek.lower() == "ὦ" and num == "3739":
                num = "5599" if rus.lower().startswith("о") else "1510"
            words.append((rus, num, greek, punct))
        out[n] = words
    return out


def verse_text(words):
    parts = []
    for rus, num, greek, punct in words:
        rus = rus.replace("{", "(").replace("}", ")").replace("|", "/") or "·"
        if rus[-1] in PUNCT + "—)":
            punct = ""  # знак уже стоит в русском слове Винокурова
        parts.append("{" + f"{rus}|{'G' + num if num else ''}||{greek}" + "}" + punct)
    return " ".join(parts)


# Группы номеров Стронга, считающихся одним словом (как SAME в src/core/interlinear.js) + формы местоимений
SAME = [
    ["1510", "2258", "2071", "2070", "2075", "2076", "2468", "5600", "1488", "1526", "2277"],
    ["3004", "2036", "2046", "4483"],
    ["3708", "1492", "3700"],
    ["2068", "5315"],
    ["5143", "1408"],
    ["1473", "1700", "1691", "3427", "1698", "1700", "4771", "4675", "4571", "4671", "4674"],
    ["846", "1438", "1683", "4572", "1438"],
    ["3739", "3748", "3745"],
]
GROUP = {}
for _i, _g in enumerate(SAME):
    for _n in _g:
        GROUP.setdefault(_n, _i)


def same_num(a, b):
    if not a or not b:
        return False
    return a == b or (a in GROUP and GROUP.get(a) == GROUP.get(b))


def norm_greek(w):
    w = unicodedata.normalize("NFD", w.lower())
    w = "".join(c for c in w if not unicodedata.combining(c)).replace("ς", "σ")
    return re.sub(r"[^α-ω]", "", w)


BYZ_TOKEN = re.compile(r"\{([^|{}]*)\|([^|{}]*)\|[^{}]*\}([^{]*)")


def parse_byz(text):
    """[(греческое, номер Стронга без G или '', знаки после слова)]"""
    out = []
    for m in BYZ_TOKEN.finditer(text):
        nums = re.findall(r"G0*(\d+)", m.group(2))
        out.append((m.group(1), nums[0] if nums else "", m.group(3).strip()))
    return out


def align(byz_words, vin_words):
    """Для каждого слова byz — индекс слова Винокурова или None. Возвращает (список, число неиспользованных слов Винокурова)."""
    nb, nv = len(byz_words), len(vin_words)
    res = [None] * nb
    used = [False] * nv
    # 1) совпадение нормализованного греческого слова, монотонно (самая длинная общая подпоследовательность)
    kb = [norm_greek(w[0]) for w in byz_words]
    kv = [norm_greek(w[2]) for w in vin_words]
    for blk in difflib.SequenceMatcher(None, kb, kv, autojunk=False).get_matching_blocks():
        for d in range(blk.size):
            res[blk.a + d] = blk.b + d
            used[blk.b + d] = True
    # 2) остальные — по номеру Стронга (k-е вхождение), сначала в промежутке между опорными словами, потом по всему стиху
    for i in range(nb):
        if res[i] is not None or not byz_words[i][1]:
            continue
        lo = max((res[j] for j in range(i) if res[j] is not None), default=-1)
        hi = min((res[j] for j in range(i + 1, nb) if res[j] is not None), default=nv)
        cand = [k for k in range(lo + 1, hi) if not used[k] and vin_words[k][1] == byz_words[i][1]]
        if not cand:
            cand = [k for k in range(lo + 1, hi) if not used[k] and same_num(vin_words[k][1], byz_words[i][1])]
        if not cand:
            cand = [k for k in range(nv) if not used[k] and vin_words[k][1] == byz_words[i][1]]
        if not cand:
            cand = [k for k in range(nv) if not used[k] and same_num(vin_words[k][1], byz_words[i][1])]
        if cand:
            res[i] = cand[0]
            used[cand[0]] = True
    return res, used


def byz_verse_text(bt, vin_words, stats):
    bw = parse_byz(bt)
    res, used = align(bw, vin_words)
    parts = []
    for (greek, num, punct), k in zip(bw, res):
        rus = "·"
        if k is not None:
            r = vin_words[k][0]
            while len(r) > 1 and r[-1] in ",.;:··;!?":
                r = r[:-1]  # знаки — из византийского текста
            rus = r.replace("{", "(").replace("}", ")").replace("|", "/") or "·"
            if rus != "·":
                stats["ru"] += 1
        stats["words"] += 1
        stats["paired"] += k is not None
        parts.append("{" + f"{rus}|{'G' + num if num else ''}||{greek}" + "}" + punct)
    lost = [vin_words[k] for k in range(len(vin_words)) if not used[k]]
    stats["vin"] += len(vin_words)
    stats["lost"] += len(lost)
    stats["lost_list"].extend(lost)
    return " ".join(parts)


def main():
    byz = {b["id"]: b for b in json.loads((MOD / "byz-rp2018.json").read_text(encoding="utf-8"))["books"]}
    rst = {b["id"]: b for b in json.loads((MOD / "rst.json").read_text(encoding="utf-8"))["books"]}
    if "--fetch" in sys.argv:
        for bid, code in CODES.items():
            for ch in range(1, len(byz[bid]["chapters"]) + 1):
                fetch(code, ch)
    parsed = {}
    for bid, code in CODES.items():
        for ci in range(len(byz[bid]["chapters"])):
            p = cache_path(code, ci + 1)
            if not p.exists():
                sys.exit(f"нет кэша {p.name}; запустите с --fetch")
            parsed[(bid, ci + 1)] = parse_chapter(p.read_text(encoding="utf-8"))
    for (b1, c1, v1), (b2, c2, v2), pre in MOVES:
        moved = parsed[(b1, c1)].pop(v1, [])
        old = parsed[(b2, c2)].get(v2, [])
        parsed[(b2, c2)][v2] = moved + old if pre else old + moved
    ubs = "--ubs" in sys.argv
    books, words, numbered, diffs, nverses = [], 0, 0, [], 0
    st = {"words": 0, "paired": 0, "ru": 0, "vin": 0, "lost": 0, "lost_list": []}
    per_book = {}
    for bid in CODES:
        chapters = []
        ref = rst[bid]["chapters"]
        for ci in range(len(ref)):
            ch = parsed[(bid, ci + 1)]
            nv = len(ref[ci])
            if max(ch, default=0) > nv:
                diffs.append(f"{bid} {ci + 1}: стих {max(ch)} больше, чем в синодальной нумерации ({nv})")
            empty = [v for v in range(1, nv + 1) if not ch.get(v)]
            if empty:
                diffs.append(f"{bid} {ci + 1}: пустые стихи {empty} (в UBS3 нет)")
            row = []
            for v in range(1, nv + 1):
                w = ch.get(v, [])
                if ubs:
                    row.append(verse_text(w))
                else:
                    bt = byz[bid]["chapters"][ci][v - 1] if v <= len(byz[bid]["chapters"][ci]) else ""
                    b0 = (st["words"], st["ru"], st["vin"], st["lost"])
                    row.append(byz_verse_text(bt, [x for x in w if x[2]], st))
                    pb = per_book.setdefault(bid, [0, 0, 0, 0])
                    for q in range(4):
                        pb[q] += (st["words"], st["ru"], st["vin"], st["lost"])[q] - b0[q]
                words += len(w)
                numbered += sum(1 for x in w if x[1])
                nverses += bool(w)
            chapters.append(row)
        rb = rst[bid]
        books.append({"id": bid, "number": rb["number"], "name": rb["name"], "short": rb["short"], "chapters": chapters})
    module = {
        "format": "aob-module", "formatVersion": 1, "type": "bible", "id": "vin-interlinear",
        "name": "Подстрочник (Винокуров)",
        "title": "Подстрочный перевод греческого текста Нового Завета А. Винокурова",
        "language": "ru", "versification": "synodal",
        "description": ("Подстрочный перевод греческого текста Нового Завета Алексея Винокурова (2015). Слова идут в порядке "
                        "греческого текста: под каждым греческим словом — русское соответствие и номер Стронга. Квадратные "
                        "скобки — слова, добавленные для связности русской фразы; точка «·» — слово без русского перевода "
                        "(например, артикль).") if ubs else
                       ("Греческий текст — византийский (Робинсон — Пирпонт, 2018, общественное достояние); русские слова — "
                        "подстрочный перевод А. Винокурова (с разрешения автора), сопоставлены по номерам Стронга. Слова идут "
                        "в порядке греческого текста; квадратные скобки — слова, добавленные для связности русской фразы; "
                        "точка «·» — слово без русского перевода (например, артикль)."),
        "version": "2015" if ubs else "2015 / RP2018",
        "author": ("Алексей Винокуров (подстрочный перевод, 2015); греческий текст — UBS3/NA26" if ubs else
                   "Алексей Винокуров (русские слова подстрочника, 2015); Maurice A. Robinson, William G. Pierpont (греческий текст, 2018)"),
        "source": "https://azbyka.ru/biblia/podstrochnik",
        "license": ("Используется с разрешения автора для бесплатного некоммерческого приложения" if ubs else
                    "Греческий текст — Public Domain; русские слова А. Винокурова — с разрешения автора, для бесплатного некоммерческого приложения"),
        "features": {"strongs": True, "interlinear": True},
        "books": books,
    }
    entry = write_module(module)
    merge_catalog([entry])
    approved = json.loads(APPROVED.read_text(encoding="utf-8"))
    if "vin-interlinear" not in approved["ids"]:
        approved["ids"].append("vin-interlinear")
        APPROVED.write_text(json.dumps(approved, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    if not ubs:
        print(f"слов byz: {st['words']}, с русским словом: {st['ru']} ({st['ru'] / st['words']:.1%}), "
              f"в паре с «·»/артиклем: {st['paired'] - st['ru']}, без пары: {st['words'] - st['paired']}")
        print(f"слов Винокурова: {st['vin']}, потеряно (нет в byz): {st['lost']} ({st['lost'] / st['vin']:.1%})")
        for bid, (w, r, vn, lo) in per_book.items():
            print(f"  {bid}: {r / max(1, w):.1%} byz-слов с русским; потеряно слов Винокурова {lo}/{vn}")
        from collections import Counter
        c = Counter((x[2], x[0]) for x in st["lost_list"])
        print("частые потерянные:", c.most_common(25))
    print(f"стихов: {nverses}, слов: {words}, с номером Стронга: {numbered} ({numbered / max(1, words):.1%})")
    print("расхождения с синодальной нумерацией (rst.json):", *diffs, sep="\n  ")


if __name__ == "__main__":
    main()
