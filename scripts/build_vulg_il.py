"""Модуль «Подстрочник к Вульгате (по словарю)» (public/modules/vulg-interlinear.json и .gz): слова латинской
Вульгаты (Климентина, модуль vulgata, синодальная нумерация), у каждого — лемма и краткое русское значение.

Это не перевод, а подсказка по словарю: значение подбирается так же, как в подстрочнике к Септуагинте
(src/core/interlinear.js, lxxInterlinear) — из вариантов значения слова берётся тот, что есть в синодальном стихе
(сначала точное совпадение, затем то же слово в другой форме или с приставкой), а если в стихе такого нет —
краткое словарное значение. Без машинного перевода и без ИИ.

Исходники (недоверенные данные — только читаем; каталог задаётся --src, по умолчанию data-src/vulg):
  ruwikt/la.jsonl — латинские статьи русского Викисловаря (выгрузка kaikki.org, wiktextract; CC BY-SA 4.0)
  collatinus/lemmes.la, collatinus/lem_ext.la — частоты лемм Collatinus (GPL) для выбора между омонимичными леммами
Лемматизатор — пакет pycollatinus 0.1.6 (порт Collatinus, GPL v2): pip install pycollatinus==0.1.6.
Нужны также собранные модули public/modules/vulgata.json и rst-dc.json (синодальный текст с неканоническими книгами).

Статьи Викисловаря, перенесённые из словаря И. Х. Дворецкого (у них пометки авторов: «Sen», «Vlg», «Eccl», «PM»,
«C», «L» и т. п., латинские примеры «aliquid», этимология в квадратных скобках), не используются вовсе — ни для
значения, ни для подбора по стиху. Для частых таких лемм значения свои (scripts/vulg_il_lex.py, OWN); остальные
остаются без значения. Свои таблицы там же: служебные слова (FUNC), леммы и значения отдельных форм.

Как собирается:
1. Текст Вульгаты: квадратные скобки издания убираются; слова — латинские буквы (æ, œ, ë сохраняются в слове,
   для поиска приводятся к ae, oe, e; j -> i, v -> u).
2. Леммы — Collatinus (редкие и вспомогательные леммы сводятся к словарным таблицей LEMMA_ALIAS). Если лемм
   несколько: таблица FORM_LEMMA (тогда других не рассматриваем), затем лемма, чьё значение нашлось в синодальном
   стихе, затем лемма со значением, затем самая вероятная (частоты Collatinus, уточнённые по Вульгате шагами EM).
   Написание лемм Collatinus и Викисловаря сводится (adfero / affero, praelium / proelium).
   Энклитика -que («Dixitque») даёт «и» перед значением.
3. Значение: слово, которое в Вульгате почти всегда пишется с заглавной, сначала ищется среди имён синодального
   стиха (по созвучию «скелетов» согласных); затем подбор по синодальному стиху (rst-dc) в три прохода (точно /
   та же основа / с приставкой; имя синодального стиха к строчному латинскому слову — только при общем начале из
   5+ букв); затем снова имена; иначе — значение формы (FORM_GLOSS), свои значения (OWN, FUNC) или первое значение
   Викисловаря. Выбранное слово синодального стиха пишется со строчной, если в синодальном тексте оно обычно
   строчное, но сохраняет заглавную, если латинское слово с заглавной не в начале фразы (Verbum -> «Слово»).
Слово в тексте модуля: «форма|лемма|значение» через пробел (пустая лемма — совпадает с формой; пробелы в значении —
«_»; лишние «|» в конце опускаются). Модуль служебный (features.helper): в списке переводов его нет, его читает
окно «Подстрочник» (вкладка «Вульгата»).
Запуск: python -I -X utf8 scripts/build_vulg_il.py [--src <каталог исходников>] [--report <файл>] [--review <файл>]
"""
import argparse
import collections
import difflib
import json
import os
import re
import sys
import unicodedata
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from extra_lib import log, merge_catalog, write_module  # noqa: E402
from vulg_il_lex import FORM_GLOSS, FORM_LEMMA, FUNC, LEMMA_ALIAS, OWN  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
MOD = ROOT / "public" / "modules"
APPROVED = ROOT / "scripts" / "approved-modules.json"
MID = "vulg-interlinear"

LATIN_WORD = re.compile(r"[A-Za-zÆæŒœËëÿ]+")
RU_WORD = re.compile(r"[А-Яа-яЁё]+(?:-[А-Яа-яЁё]+)*")


def strip_marks(s):
    return "".join(c for c in unicodedata.normalize("NFD", s) if not unicodedata.combining(c))


def la(s):
    s = strip_marks(s).lower().replace("æ", "ae").replace("œ", "oe")
    return s.replace("j", "i").replace("v", "u")


def ru(s):
    return s.lower().replace("ё", "е")


# --- Статьи Дворецкого в Викисловаре --------------------------------------------------------------------------
# Сокращения имён авторов (Sen — Сенека, Vlg — Вульгата, Eccl — церковные писатели, PM — Плиний Старший и т. д.)
DV_AUTH = re.compile(
    r"(?<![\w.])(?:Vlg|Eccl|Sen|PM|PJ|Dig|Su|Lcr|Ter|Tert|Aug|Hier|Lact|Amm|Vr|Col|CTh|Ap|Cs|Nep|Sl|Lcn|Prp|Ctl|Tib|"
    r"Just|Vtr|AG|Macr|VM|Eutr|Cld|Sil|Pall|Veg|Cels|Front|Enn|Pac|Isid|Prud|Aus|Ulp|Gai|VF|Ctn|Pt|St|Sid|Q|Pl|Fl|"
    r"Ph|Man|rhH|Bell|Hirt|Capit|Lampr|Spart|Vop|Treb|Symm|Cassiod|Arn|Cypr|Ambr|Cod|Inst|Nov|Mela|Sol|Fest)(?!\w)")
DV_SINGLE = re.compile(r"(?<![\w.])[CVOLHTJM](?:,|\)|;|:|\.?\s*$| etc| и др)")
DV_OTHER = re.compile(r"\[[a-z][a-z +.,-]*\]|\b(?:aliqu\w*|alicui|alicujus|aliquo|sc\.|etc\.?|intens\. к)(?!\w)")


def dvoretsky(g):
    return bool(DV_AUTH.search(g) or DV_SINGLE.search(g) or DV_OTHER.search(g))


SKIP_GLOSS = re.compile(r"\s*(форма|причастие|деепричастие|сравнительная|превосходная|супин|инфинитив|герундий|"
                        r"мн\. ч\.|то же, что|употребляется|указывает|служит|частица|предлог|союз|"
                        r"прич\.|страд\.|наст\.|прош\.|буд\.|повел\.|аналогично)")
POMETY = re.compile(r"\b(перен|тж|церк|лингв|анат|поэт|устар|разг|бот|зоол|юр|рел|миф|воен|мор|архит|мед|фин|"
                    r"полит|филос|астр|грам|ритор|театр|с\.-х|книжн|редко|преим|библ|иноск|ирон|уменьш|ласк|"
                    r"собир|pl|sg|abs|impers|med\.-pass)\.?(?![\w-])")


def clean_items(g):
    g = re.sub(r"\([^)]*\)|\[[^\]]*\]|#|«[^»]*»", " ", g)
    out = []
    for part in re.split(r"[;,]", g):
        part = POMETY.sub(" ", part)
        part = re.sub(r"\s+", " ", part).strip(" .:-—!?")
        if part and re.fullmatch(r"[а-яёА-ЯЁ -]+", part) and len(part) <= 30 and len(part.split()) <= 3:
            out.append(part)
    return out


def load_wiktionary(path):
    """Лемма -> список значений (по порядку статей и значений) только из статей без признаков Дворецкого."""
    entries = collections.defaultdict(list)
    flagged = set()
    for line in open(path, encoding="utf-8"):
        d = json.loads(line)
        k = la(d["word"])
        glosses = [g for s in d.get("senses", []) for g in s.get("glosses", [])]
        if any(dvoretsky(g) for g in glosses):
            flagged.add(k)
            continue
        entries[k].append((d.get("pos"), d["word"], glosses))
    wk = {}
    head = {}
    for k, lst in entries.items():
        if k in flagged:
            continue
        # нарицательное слово раньше имени собственного (clemens «милостивый» раньше Clemens «Климент»)
        lst.sort(key=lambda e: e[1][:1].isupper())
        items = []
        for _, _, glosses in lst:
            for g in glosses:
                if SKIP_GLOSS.match(g):
                    continue
                for it in clean_items(g):
                    if it not in items:
                        items.append(it)
        if items:
            wk[k] = items
            head[k] = lst[0][1]
    return wk, head, flagged


def load_freq(src):
    freq = {}
    for f in ("lemmes.la", "lem_ext.la"):
        p = src / "collatinus" / f
        if not p.exists():
            continue
        for line in open(p, encoding="utf-8"):
            if line.startswith("!") or "|" not in line:
                continue
            parts = line.rstrip("\n").split("|")
            k = la(re.sub(r"\d+$", "", parts[0].split("=")[0]))
            try:
                freq[k] = max(freq.get(k, 0), int(parts[-1]))
            except ValueError:
                pass
    return freq


# --- Сопоставление со словами синодального стиха ------------------------------------------------------------------
def near(a, b):
    if a == b:
        return True
    n = min(len(a), len(b))
    if n < 3:
        return False
    p = 0
    while p < n and a[p] == b[p]:
        p += 1
    return p >= 3 and p >= n - 2


PREFIXES = ("со", "по", "при", "на", "вы", "у", "за", "с", "о", "от", "пре", "раз", "рас", "воз", "вос", "из", "ис",
            "в", "во", "под", "пере", "до", "об")


ASSIM = [("adf", "aff"), ("adn", "ann"), ("ads", "ass"), ("adt", "att"), ("adp", "app"), ("adc", "acc"), ("adg", "agg"),
         ("adl", "all"), ("adr", "arr"), ("conl", "coll"), ("conr", "corr"), ("inm", "imm"), ("inl", "ill"),
         ("inr", "irr"), ("inp", "imp"), ("obf", "off"), ("subf", "suff"), ("subp", "supp"), ("exs", "ex")]


def spelling_variants(k):
    """Другие написания леммы (классическое / средневековое): affero -> adfero, proelium -> praelium и т. п."""
    out = set()
    for a, b in ASSIM:
        if k.startswith(b):
            out.add(a + k[len(b):])
        if k.startswith(a):
            out.add(b + k[len(a):])
    for a, b in (("oe", "ae"), ("ae", "oe"), ("ae", "e"), ("pae", "poe"), ("cr", "chr"), ("c", "ch"), ("i", "y"),
                 ("ti", "ci"), ("ci", "ti"), ("ll", "l"), ("mn", "m"), ("ei", "eii"), ("ic", "iic")):
        if a in k:
            out.add(k.replace(a, b, 1))
    out.discard(k)
    return out


def own(k):
    v = OWN.get(k)
    if isinstance(v, str):
        v = OWN[k] = [x.strip() for x in v.split(",") if x.strip()]
    return list(v or [])


def eq(a, b):
    return a == b


_s3 = {}


def stems3(w):
    """Первые три буквы слова — и того же слова без приставки (для быстрого поиска пар near / stem_near)."""
    if w not in _s3:
        out = {w[:3]}
        for pre in PREFIXES:
            if w.startswith(pre) and len(w) - len(pre) >= 3:
                out.add(w[len(pre):len(pre) + 3])
        _s3[w] = out
    return _s3[w]


def stem_near(a, b):
    if len(a) < 4 or len(b) < 4:
        return False
    for pre in PREFIXES:
        if b.startswith(pre) and near(a, b[len(pre):]):
            return True
        if a.startswith(pre) and near(a[len(pre):], b):
            return True
    return False


# Созвучие имён: латинское и русское написание сводятся к «скелету» из классов согласных
# (в Климентине согласный звук пишется v, гласный — u, поэтому v -> B, а u — гласная)
LAT_SKEL = [("ph", "F"), ("th", "F"), ("ch", "K"), ("qu", "KB"), ("x", "KS"), ("b", "B"), ("p", "B"), ("v", "B"),
            ("w", "B"), ("f", "F"), ("c", "K"), ("k", "K"), ("g", "K"), ("s", "S"), ("z", "S"), ("d", "D"),
            ("t", "D"), ("l", "L"), ("r", "R"), ("m", "M"), ("n", "N")]
RU_SKEL = {"б": "B", "п": "B", "в": "B", "ф": "F", "к": "K", "г": "K", "х": "K", "с": "S", "з": "S", "ц": "S",
           "ш": "S", "ж": "S", "щ": "S", "ч": "K", "д": "D", "т": "D", "л": "L", "р": "R", "м": "M", "н": "N"}


def lat_skel(w):
    w = strip_marks(w).lower()
    out = ""
    i = 0
    while i < len(w):
        for a, b in LAT_SKEL:
            if w.startswith(a, i):
                out += b
                i += len(a)
                break
        else:
            i += 1
    out = re.sub(r"(.)\1+", r"\1", out)
    # латинское окончание имени (Jonathas, Jonathan, Jonatham) не в счёт
    if len(out) > 2 and re.search(r"[aeiouy](s|m)$", w):
        out = out[:-1]
    return out


def ru_skel(w):
    out = "".join(RU_SKEL.get(c, "") for c in w.lower())
    return re.sub(r"(.)\1+", r"\1", out)


def name_score(lat, ruw):
    """Насколько латинское имя похоже на русское: 0 — не похоже, иначе доля совпадения «скелетов» согласных."""
    a, b = lat_skel(lat), ru_skel(ruw)
    if not a or not b or a[0] != b[0]:
        return 0
    r = difflib.SequenceMatcher(None, a, b).ratio()
    if len(a) <= 2 or len(b) <= 2:
        ok = (a.startswith(b) or b.startswith(a)) and abs(len(a) - len(b)) <= 1 and abs(len(lat) - len(ruw)) <= 3
        return r if ok else 0
    return r if r >= 0.75 else 0


def best_name(lat, sw):
    """Самое похожее неиспользованное имя синодального стиха (или None)."""
    best, score = None, 0
    for s in sw:
        if not s["used"] and s["t"][0].isupper():
            sc = name_score(lat, s["t"])
            if sc > score:
                best, score = s, sc
    return best


# --- Сборка ------------------------------------------------------------------------------------------------------
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", default=str(ROOT / "data-src" / "vulg"))
    ap.add_argument("--report", default=None)
    ap.add_argument("--review", default=None, help="файл: частые леммы с их значением по умолчанию (для проверки)")
    args = ap.parse_args()
    src = Path(args.src)
    from pycollatinus import Lemmatiseur

    report = []

    def rep(*a):
        line = " ".join(str(x) for x in a)
        report.append(line)
        log(line)

    wk, head, flagged = load_wiktionary(src / "ruwikt" / "la.jsonl")
    # Написание лемм Collatinus и Викисловаря различается (adfero / affero, praelium / proelium, sepulchrum / sepulcrum)
    for k in list(wk):
        for v in spelling_variants(k):
            if v not in wk and v not in flagged:
                wk[v] = wk[k]
                head.setdefault(v, head[k])
    log(f"Викисловарь: {len(wk)} лемм со значениями, {len(flagged)} статей Дворецкого исключено")
    freq = load_freq(src)
    vul = json.loads((MOD / "vulgata.json").read_text(encoding="utf-8"))
    syn = {b["id"]: b for b in json.loads((MOD / "rst-dc.json").read_text(encoding="utf-8"))["books"]}

    # Слова Вульгаты
    verses = []  # (book, ch, v, [слово])
    forms = collections.Counter()
    for b in vul["books"]:
        for ci, ch in enumerate(b["chapters"]):
            for vi, text in enumerate(ch):
                clean = (text or "").replace("[", "").replace("]", "")
                ws = []
                for m in LATIN_WORD.finditer(clean):
                    before = clean[:m.start()].rstrip()
                    # заглавная буква не в начале фразы (Verbum, Filium) — у слова синодального стиха сохраняется
                    ws.append((m.group(0), not before or before[-1] in ".?!:;"))
                verses.append((b["id"], ci, vi, ws))
                forms.update(w for w, _ in ws)
    log(f"Вульгата: {len(verses)} стихов, {sum(forms.values())} слов, {len(forms)} форм")

    # Леммы каждой формы (Collatinus); энклитика -que
    lem = Lemmatiseur()
    cache = {}

    def lemmas(w):
        key = w
        if key in cache:
            return cache[key]
        out, caps = [], set()
        try:
            res = lem.lemmatise(w)
        except Exception:
            res = []
        for x in res:
            k = la(re.sub(r"\d+$", "", x["lemma"]))
            k = LEMMA_ALIAS.get(k, k)
            if x["lemma"][:1].isupper():
                caps.add(k)
            if k not in out:
                out.append(k)
        # строчное слово — не имя собственное (Eus для eam и т. п.)
        if w[0].islower():
            low = [k for k in out if k not in caps]
            out = low or out
        lw = la(w)
        if lw in FORM_LEMMA:
            out = [FORM_LEMMA[lw]] + [k for k in out if k != FORM_LEMMA[lw]]
        if not out and lw in wk:
            out = [lw]
        cache[key] = out
        return out

    # Доля написаний с заглавной буквы не в начале фразы — признак имени собственного
    cap_n, all_n = collections.Counter(), collections.Counter()
    for *_, ws in verses:
        for w, initial in ws:
            if not initial:
                all_n[la(w)] += 1
                cap_n[la(w)] += w[0].isupper()
    capital = collections.defaultdict(float, {k: cap_n[k] / n for k, n in all_n.items() if n >= 2})

    # Вероятности лемм: частоты Collatinus, уточнённые по Вульгате (EM)
    cand = {w: lemmas(w) for w in forms}
    known = lambda k: k in FUNC or k in OWN or k in wk  # noqa: E731
    prior = collections.Counter()
    for w, cs in cand.items():
        for k in cs:
            prior[k] = max(prior[k], freq.get(k, 0) + 1) * (3 if known(k) else 1)
    for _ in range(4):
        new = collections.Counter()
        for w, n in forms.items():
            cs = cand[w]
            if not cs:
                continue
            tot = sum(prior[k] for k in cs) or 1
            for k in cs:
                new[k] += n * prior[k] / tot
        prior = collections.Counter({k: v + 0.01 for k, v in new.items()})

    def ordered(w):
        cs = cand[w]
        if not cs:
            return []
        lw = la(w)
        fixed = FORM_LEMMA.get(lw)
        if fixed:
            return [fixed]  # лемма задана таблицей — другие не рассматриваются (est — не e «из»)
        # сначала леммы, для которых есть значение (sanctos — sanctus, а не sancio; spicas — spica, а не spico)
        rest = sorted(cs, key=lambda k: -prior[k])
        top = prior[rest[0]] if rest else 0
        rest = [k for k in rest if known(k) or prior[k] >= 0.02 * top]
        return sorted(rest, key=lambda k: not known(k))

    def options(k):
        """Варианты значения леммы: свои, служебные, Викисловарь."""
        out = []
        for src_list in (own(k), FUNC.get(k), wk.get(k)):
            for o in src_list or []:
                if o not in out:
                    out.append(o)
        return out

    mk_cache = {}

    def match_keys(k):
        """Слова для сравнения со стихом: однословные значения целиком, у многословных — главное слово (4+ букв).
        Из Викисловаря — только первые 10 значений (дальше — редкие, они дают ложные совпадения)."""
        if k in mk_cache:
            return mk_cache[k]
        out = []
        # многословные служебные («со мною», «потому что») не сопоставляются — показываются целиком
        # у служебных — только свои варианты (Викисловарь даёт «со мной» -> «мной» и т. п.)
        lst = own(k) + [o for o in FUNC.get(k) or [] if " " not in o] + ([] if k in FUNC else list((wk.get(k) or [])[:10]))
        for o in lst:
            parts = ru(o).split()
            key = parts[0] if len(parts) == 1 else next((p for p in parts if len(p) >= 4), None)
            if key and key not in out:
                out.append(key)
        mk_cache[k] = out
        return out

    def default_gloss(w, k):
        lw = la(w)
        if lw in FORM_GLOSS and (FORM_LEMMA.get(lw, k) == k):
            return FORM_GLOSS[lw]
        o = options(k)
        return o[0] if o else ""

    # Как писать подобранное русское слово: со строчной, если в синодальном тексте оно обычно строчное
    case = collections.Counter()
    for b in syn.values():
        for ch in b["chapters"]:
            for v in ch:
                for i, m in enumerate(RU_WORD.finditer(v or "")):
                    t = m.group(0)
                    case[(ru(t), t[0].isupper())] += 1

    def as_written(t):
        if t[0].isupper() and case[(ru(t), False)] > case[(ru(t), True)]:
            return t[0].lower() + t[1:]
        return t

    stats = collections.defaultdict(collections.Counter)
    lemma_use = collections.Counter()
    lemma_how = collections.defaultdict(collections.Counter)
    out_books = collections.OrderedDict()
    for bk, ci, vi, ws in verses:
        sb = syn.get(bk)
        stext = ""
        if sb and ci < len(sb["chapters"]) and vi < len(sb["chapters"][ci]):
            stext = sb["chapters"][ci][vi] or ""
        sw = [{"t": m.group(0), "k": ru(m.group(0)), "used": False,
               "name": m.group(0)[0].isupper() and case[(ru(m.group(0)), True)] > case[(ru(m.group(0)), False)]}
              for m in RU_WORD.finditer(stext)]
        toks = []
        for w, initial in ws:
            cs = ordered(w)
            lw = la(w)
            enc = False
            # энклитика -que: без неё слово даёт ту же лемму (Dixitque -> dico), а не neque, itaque, quisque
            if (lw.endswith("que") and len(lw) > 4 and cs and lw not in FORM_LEMMA and not cs[0].endswith("que")
                    and cs[0] not in FUNC and cs[0] in lemmas(w[:-3])):
                enc = True
            toks.append({"w": w, "cs": cs, "lemma": cs[0] if cs else "", "gloss": "", "how": "", "enc": enc,
                         "keep": w[0].isupper() and not initial,
                         "name": w[0].isupper() and lw not in OWN and capital[lw] >= 0.8 and cs[:1] != ["deus"]})

        by3 = collections.defaultdict(list)  # первые три буквы (и без приставки) -> слова стиха
        for s in sw:
            for p3 in stems3(s["k"]):
                by3[p3].append(s)

        def match(tk, same):
            for k in tk["cs"]:
                for ok in match_keys(k):
                    pool = [s for s in sw if s["k"] == ok] if same is eq else [s for p3 in stems3(ok) for s in by3.get(p3, ())]
                    for s in pool:
                        if not s["used"] and (same is eq or not s["name"] or tk["w"][0].isupper()
                                                 or len(os.path.commonprefix([ok, s["k"]])) >= 5) and same(ok, s["k"]):
                            s["used"] = True
                            tk["lemma"], tk["gloss"], tk["how"] = k, s["t"] if tk["keep"] else as_written(s["t"]), "syn"
                            return True
            return False

        # Слово, которое в Вульгате почти всегда с заглавной (Manasses, Josue, Pilatus), — сначала как имя
        for tk in toks:
            if tk["name"]:
                s = best_name(tk["w"], sw)
                if s:
                    s["used"] = True
                    tk["gloss"], tk["how"], tk["lemma"] = s["t"], "name", ""
        for same in (eq, near, stem_near):
            for tk in toks:
                if not tk["gloss"] and tk["cs"]:
                    if same is not eq and tk["cs"][0] in FUNC:
                        continue  # служебные — только точное совпадение
                    match(tk, same)
        # Имена: созвучие с именами синодального стиха
        for tk in toks:
            if tk["gloss"] or not tk["w"][0].isupper():
                continue
            if tk["cs"] and any(options(k) for k in tk["cs"]) and not tk["name"]:
                continue
            s = best_name(tk["w"], sw)
            if s:
                s["used"] = True
                tk["gloss"], tk["how"] = s["t"], "name"
                if not tk["cs"]:
                    tk["lemma"] = ""
        for tk in toks:
            if not tk["gloss"] and tk["cs"]:
                g = default_gloss(tk["w"], tk["lemma"])
                if g:
                    tk["gloss"], tk["how"] = g, "dict"
            if tk["gloss"] and tk["enc"] and not tk["gloss"].startswith("и "):
                tk["gloss"] = "и " + tk["gloss"]
            stats[bk]["all"] += 1
            stats[bk]["gloss"] += bool(tk["gloss"])
            stats[bk][tk["how"] or "none"] += 1
            if tk["lemma"]:
                lemma_use[tk["lemma"]] += 1
                lemma_how[tk["lemma"]][tk["how"] or "none"] += 1

        cells = []
        for tk in toks:
            lemma = tk["lemma"]
            shown = head.get(lemma, lemma) if lemma else ""
            if shown and la(shown) == la(tk["w"]):
                shown = ""
            gloss = tk["gloss"].replace(" ", "_")
            cells.append(f"{tk['w']}|{shown}|{gloss}".rstrip("|"))
        book = out_books.setdefault(bk, [])
        while len(book) <= ci:
            book.append([])
        while len(book[ci]) <= vi:
            book[ci].append("")
        book[ci][vi] = " ".join(cells)

    books = []
    for b in vul["books"]:
        books.append({"id": b["id"], "name": b.get("name"), "short": b.get("short"), "chapters": out_books[b["id"]]})

    module = {
        "format": "aob-module", "formatVersion": 1, "type": "bible", "versification": "synodal", "id": MID,
        "name": "Vulg-IL",
        "title": "Подстрочник к Вульгате (по словарю)",
        "language": "la",
        "description": (
            "Слова латинской Вульгаты (Климентинское издание, синодальная нумерация) по порядку; у каждого — лемма "
            "и краткое русское значение по словарю. Значение подобрано по словам синодального стиха, а если такого "
            "слова в стихе нет — первое словарное значение; это не перевод данного места. Служебный модуль для окна "
            "«Подстрочник» (вкладка «Вульгата»)."),
        "version": "1.0 (Clementina, eBible.org latVUC 2014; ru.wiktionary.org через kaikki.org; Collatinus)",
        "author": ("Текст — Вульгата бл. Иеронима, Климентинское издание; леммы — Collatinus (Y. Ouvrard, Ph. Verkerk; "
                   "порт pycollatinus — T. Clérice); значения — участники русского Викисловаря; служебные слова и "
                   "часть значений — AO Bible"),
        "source": ("https://ebible.org/find/details.php?id=latVUC; https://ru.wiktionary.org (выгрузка "
                   "https://kaikki.org/dictionary/rawdata.html); https://github.com/biblissima/collatinus"),
        "license": ("Текст Вульгаты — Public Domain; значения из Викисловаря — CC BY-SA 4.0 (участники Викисловаря), "
                    "модуль распространяется на тех же условиях; леммы получены лемматизатором Collatinus (GPL)"),
        "features": {"strongs": False, "headings": False, "helper": True},
        "books": books,
    }
    entry = write_module(module)
    merge_catalog([entry], in_place=True)
    approved = json.loads(APPROVED.read_text(encoding="utf-8"))
    if MID not in approved["ids"]:
        approved["ids"].append(MID)
        APPROVED.write_text(json.dumps(approved, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")

    rep(f"Статей Викисловаря с признаками словаря Дворецкого (исключены): {len(flagged)}")
    dv_used = collections.Counter({k: n for k, n in lemma_use.items() if k in flagged})
    rep(f"Из них лемм в Вульгате: {len(dv_used)}, слов: {sum(dv_used.values())}; со своим значением: "
        f"{sum(1 for k in dv_used if k in OWN or k in FUNC)}")
    rep("Слова со значением (по книгам): всего / со значением (из них по синодальному стиху, по созвучию имени, по словарю)")
    tot = collections.Counter()
    for bk in out_books:
        s = stats[bk]
        tot.update(s)
        rep(f"  {bk}: {s['all']} / {s['gloss']} = {s['gloss'] / max(1, s['all']):.1%} "
            f"(стих {s['syn']}, имя {s['name']}, словарь {s['dict']})")
    rep(f"  всего: {tot['all']} / {tot['gloss']} = {tot['gloss'] / max(1, tot['all']):.1%} "
        f"(стих {tot['syn']}, имя {tot['name']}, словарь {tot['dict']}, без значения {tot['none']})")
    if args.report:
        Path(args.report).write_text("\n".join(report) + "\n", encoding="utf-8")
    if args.review:
        rows = []
        for k, n in lemma_use.most_common(8000):
            o = options(k)
            h = lemma_how[k]
            src_ = "own" if k in OWN else "func" if k in FUNC else "wk" if k in wk else ("DV" if k in flagged else "-")
            rows.append(f"{n}\t{k}\t{src_}\t{h['syn']}/{h['dict']}/{h['none']}\t{' ; '.join(o[:6])}")
        Path(args.review).write_text("\n".join(rows) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
