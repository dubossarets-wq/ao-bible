"""Свободные русские тексты для build_extra.py (src "usfm:<папка>" в extra_world_list.py).

  python -I scripts/extra_free_ru.py rob            # Русская открытая Библия (Door43, CC BY-SA 4.0)
  python -I scripts/extra_free_ru.py bibleby <slug> # перевод с bible.by -> data-src/extra/bibleby/<slug>-usfm

ROB: https://git.door43.org/Door43-Catalog/ru_rob/archive/master.zip -> data-src/extra/door43/ru_rob/.
Выравнивание по оригиналу (\\zaln-s x-strong=…) превращается в \\w слово|strong="…"\\w* — как у KJV в eBible,
дальше текст читает extra_world.read_usfm. Номера unfoldingWord: греческие пятизначные с лишней последней цифрой
(G10780 = G1078), еврейские с приставками «b:», «d:» и буквенными суффиксами (H1254a) — оставляем только номер.
"""
import html
import json
import re
import sys
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "data-src" / "extra"

# ---------------------------------------------------------------------------------------------
# ROB
# ---------------------------------------------------------------------------------------------

ZALN_S = re.compile(r'\\zaln-s\s*\|([^\\]*?)\\\*')
WORD = re.compile(r'\\w ([^|\\]*)\|[^\\]*?\\w\*')
TOKEN = re.compile(r'\\zaln-s\s*\|[^\\]*?\\\*|\\zaln-e\\\*|\\w [^|\\]*\|[^\\]*?\\w\*')


def _uw_strong(attrs):
    m = re.search(r'x-strong="([^"]*)"', attrs)
    if not m:
        return None
    s = m.group(1).split(":")[-1]
    mm = re.match(r"([HG])(\d+)", s)
    if not mm:
        return None
    n = int(mm.group(2))
    if mm.group(1) == "G" and len(mm.group(2)) == 5:
        n //= 10
    return f"{mm.group(1)}{n}" if n else None


def _rob_line(line):
    """Строка выровненного USFM -> строка с \\w слово|strong="…"\\w* (номера всех открытых \\zaln-s)."""
    out, stack, pos = [], [], 0
    for m in TOKEN.finditer(line):
        out.append(line[pos:m.start()])
        pos = m.end()
        tok = m.group(0)
        if tok.startswith("\\zaln-s"):
            stack.append(_uw_strong(ZALN_S.match(tok).group(1)))
        elif tok.startswith("\\zaln-e"):
            if stack:
                stack.pop()
        else:
            word = WORD.match(tok).group(1)
            nums = []
            for s in stack:
                if s and s not in nums:
                    nums.append(s)
            out.append(f'\\w {word}|strong="{",".join(nums)}"\\w*' if nums else word)
    out.append(line[pos:])
    return "".join(out)


def rob():
    src = SRC / "door43" / "ru_rob" / "ru_rob"
    dst = SRC / "door43" / "ru_rob-usfm"
    dst.mkdir(parents=True, exist_ok=True)
    junk = 0
    for f in sorted(src.glob("*.usfm")):
        lines = []
        for line in f.read_text(encoding="utf-8-sig").splitlines():
            # «\s1 Глава Х», «\cl Глава» — служебные заготовки Door43, не заголовки
            if re.match(r"^\\(cl|s\d?)\s+Глава\b", line.strip()):
                junk += 1
                continue
            lines.append(_rob_line(line))
        text = "\n".join(lines)
        # выровненный текст разбит на строки по слову: склеиваем строки внутри стиха
        text = re.sub(r"\n(?!\\(?:c|v|p|m|q\d?|s\d?|d|ms\d?|nb|b|pi\d?|li\d?|mt\d?|h|toc\d|id|ide|usfm|cl|r)\b)", " ", text)
        (dst / f.name).write_text(text + "\n", encoding="utf-8")
    print(f"ROB: {len(list(dst.glob('*.usfm')))} книг -> {dst}; убрано заготовок «Глава»: {junk}")


# ---------------------------------------------------------------------------------------------
# bible.by: тексты со свободной лицензией или с разрешением автора на некоммерческое использование
# Страница главы: https://bible.by/<slug>/<книга>/<глава>/, книга — номер 1–66 в порядке KJV.
# Стих: <div id="N"><sup>N</sup> текст</div>; примечание — <span class="tooltips" data-original-title="<p>…</p>">.
# Заголовки разделов — <h4> (если есть). Загрузка вежливая: пауза между запросами, страницы кэшируются.
# ---------------------------------------------------------------------------------------------

USFM_CODES = ["GEN", "EXO", "LEV", "NUM", "DEU", "JOS", "JDG", "RUT", "1SA", "2SA", "1KI", "2KI", "1CH", "2CH",
              "EZR", "NEH", "EST", "JOB", "PSA", "PRO", "ECC", "SNG", "ISA", "JER", "LAM", "EZK", "DAN", "HOS",
              "JOL", "AMO", "OBA", "JON", "MIC", "NAM", "HAB", "ZEP", "HAG", "ZEC", "MAL",
              # Новый Завет — в русском порядке: Деяния, соборные послания, затем Павловы (45 = Иакова)
              "MAT", "MRK", "LUK", "JHN", "ACT", "JAS", "1PE", "2PE", "1JN", "2JN", "3JN", "JUD",
              "ROM", "1CO", "2CO", "GAL", "EPH", "PHP", "COL", "1TH", "2TH", "1TI", "2TI", "TIT", "PHM", "HEB", "REV"]
OSIS_BY_USFM = {"GEN": "Gen", "EXO": "Exod", "LEV": "Lev", "NUM": "Num", "DEU": "Deut", "JOS": "Josh",
                "JDG": "Judg", "RUT": "Ruth", "1SA": "1Sam", "2SA": "2Sam", "1KI": "1Kgs", "2KI": "2Kgs",
                "1CH": "1Chr", "2CH": "2Chr", "EZR": "Ezra", "NEH": "Neh", "EST": "Esth", "JOB": "Job", "PSA": "Ps",
                "PRO": "Prov", "ECC": "Eccl", "SNG": "Song", "ISA": "Isa", "JER": "Jer", "LAM": "Lam", "EZK": "Ezek",
                "DAN": "Dan", "HOS": "Hos", "JOL": "Joel", "AMO": "Amos", "OBA": "Obad", "JON": "Jonah", "MIC": "Mic",
                "NAM": "Nah", "HAB": "Hab", "ZEP": "Zeph", "HAG": "Hag", "ZEC": "Zech", "MAL": "Mal", "MAT": "Matt",
                "MRK": "Mark", "LUK": "Luke", "JHN": "John", "ACT": "Acts", "JAS": "Jas", "1PE": "1Pet",
                "2PE": "2Pet", "1JN": "1John", "2JN": "2John", "3JN": "3John", "JUD": "Jude", "ROM": "Rom",
                "1CO": "1Cor", "2CO": "2Cor", "GAL": "Gal", "EPH": "Eph", "PHP": "Phil", "COL": "Col",
                "1TH": "1Thess", "2TH": "2Thess", "1TI": "1Tim", "2TI": "2Tim", "TIT": "Titus", "PHM": "Phlm",
                "HEB": "Heb", "REV": "Rev"}
UA = "AO-Bible-module-builder (+https://aobible.app; bulk download of a few texts with free license)"


def _get(url, cache):
    if cache.exists():
        return cache.read_text(encoding="utf-8")
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                t = r.read().decode("utf-8", errors="replace") if r.status == 200 else ""
            break
        except urllib.error.HTTPError as e:
            if e.code == 404:
                t = ""
                break
            time.sleep(5 * (attempt + 1))
        except Exception:
            time.sleep(5 * (attempt + 1))
    else:
        raise RuntimeError(url)
    cache.parent.mkdir(parents=True, exist_ok=True)
    cache.write_text(t, encoding="utf-8")
    time.sleep(1.0)
    return t


def _chapter_count(slug, book, cdir):
    """Сколько глав в книге: ссылки вида /<slug>/<book>/<n>/ на странице первой главы."""
    t = _get(f"https://bible.by/{slug}/{book}/1/", cdir / f"{book:02d}-001.html")
    if 'data-chapter="1"' not in t:
        return 0
    nums = [int(n) for n in re.findall(rf'href="/{re.escape(slug)}/{book}/(\d+)/"', t)]
    return max(nums + [1])


TIP = re.compile(r'<span class="tooltips"[^>]*data-original-title="([^"]*)"[^>]*>.*?</span>\s*</span>', re.S)


def _plain(s):
    s = re.sub(r"<br\s*/?>", " ", s)
    s = re.sub(r"<[^>]+>", "", s)
    return re.sub(r"\s+", " ", html.unescape(s)).strip()


def _parse_chapter(t):
    """-> [(стих, текст, [примечания], [заголовки перед стихом])]"""
    i = t.find('<div class="text')
    if i < 0:
        return []
    body = t[i:]
    end = body.find("</div>\n</div>")
    body = body[:end] if end > 0 else body
    out, pending = [], []
    for m in re.finditer(r'<h\d[^>]*>(.*?)</h\d>|<div id="(\d+)"[^>]*>(.*?)</div>', body, re.S):
        if m.group(1) is not None:
            h = _plain(m.group(1))
            if h:
                pending.append(h)
            continue
        v, raw = int(m.group(2)), m.group(3)
        notes = [_plain(html.unescape(n)) for n in TIP.findall(raw)]
        notes = [re.sub(r"^\d+:\d+(?:[-–]\d+)?\s*", "", n) for n in notes]
        raw = TIP.sub("", raw)
        raw = re.sub(r"<sup>\d+</sup>", "", raw, count=1)
        out.append((v, _plain(raw), notes, pending))
        pending = []
    return out


def bibleby(slug, books=range(1, 67)):
    cdir = SRC / "bibleby" / slug
    dst = SRC / "bibleby" / f"{slug}-usfm"
    dst.mkdir(parents=True, exist_ok=True)
    for f in dst.glob("*.usfm"):
        f.unlink()
    notes = {}
    total = 0
    for b in books:
        n = _chapter_count(slug, b, cdir)
        if not n:
            continue
        code = USFM_CODES[b - 1]
        lines = [f"\\id {code} bible.by/{slug}"]
        for c in range(1, n + 1):
            t = _get(f"https://bible.by/{slug}/{b}/{c}/", cdir / f"{b:02d}-{c:03d}.html")
            vs = _parse_chapter(t)
            if not vs:
                continue
            lines.append(f"\\c {c}")
            for v, text, nn, heads in vs:
                for h in heads:
                    lines.append(f"\\s1 {h}")
                lines.append(f"\\v {v} {text}")
                if nn:
                    notes[f"{code}.{c}.{v}"] = nn
                total += 1
        (dst / f"{b:02d}-{code}.usfm").write_text("\n".join(lines) + "\n", encoding="utf-8")
        print(f"  {slug} {code}: {n} гл.", flush=True)
    (dst / "notes.json").write_text(json.dumps(notes, ensure_ascii=False, indent=0), encoding="utf-8")
    print(f"bible.by/{slug}: {total} стихов, примечаний к {len(notes)} стихам -> {dst}")


def bibleby_notes(slug):
    """Примечания переводчика (notes.json после bibleby()) -> записи комментария {OSIS-ссылка: текст}."""
    f = SRC / "bibleby" / f"{slug}-usfm" / "notes.json"
    out = {}
    for key, notes in json.loads(f.read_text(encoding="utf-8")).items():
        code, c, v = key.split(".")
        out[f"{OSIS_BY_USFM[code]}.{c}.{v}"] = "\n\n".join(notes)
    return out


# ---------------------------------------------------------------------------------------------
# Толкования с bible.by (Public Domain — дореволюционные русские переводы): Феофилакт Болгарский,
# Иоанн Златоуст, Августин. Страницы глав: https://bible.by/<slug>/<книга>/<глава>/.
# ---------------------------------------------------------------------------------------------

def bibleby_pages(slug):
    """Скачивает (или берёт из кэша) все главы толкования -> [(OSIS-книга, глава, html)]."""
    cdir = SRC / "bibleby" / slug
    idx = _get(f"https://bible.by/{slug}/", cdir / "index.html")
    books = sorted({int(b) for b in re.findall(rf'href="/{re.escape(slug)}/(\d+)/1/"', idx)})
    out = []
    for b in books:
        n = _chapter_count(slug, b, cdir)
        for c in range(1, n + 1):
            t = _get(f"https://bible.by/{slug}/{b}/{c}/", cdir / f"{b:02d}-{c:03d}.html")
            if 'data-chapter="' in t:
                out.append((OSIS_BY_USFM[USFM_CODES[b - 1]], c, t))
        print(f"  {slug} {USFM_CODES[b - 1]}: {n} гл.", flush=True)
    return out


def _comm_body(t):
    i = t.find('<div class="text')
    j = t.find("Медиа кит", i)
    body = t[i:j if j > 0 else len(t)]
    # подсказки bible.by с синодальным текстом упомянутого стиха — не часть толкования
    body = re.sub(r'<span class="verse-text"><span class="sub">\d+</span>.*?</span>\s*', "", body, flags=re.S)
    return body


def _paras(html_part):
    """HTML -> абзацы обычного текста."""
    s = re.sub(r"(?i)<br\s*/?>", "\n", html_part)
    s = re.sub(r"(?i)</p>|<p[^>]*>", "\n\n", s)
    s = re.sub(r"<[^>]+>", "", s)
    s = html.unescape(s).replace("\xa0", " ")
    out = []
    for p in re.split(r"\n\s*\n", s):
        p = re.sub(r"[ \t]+", " ", p).strip()
        p = re.sub(r" *\n *", "\n", p)
        if p:
            out.append(p)
    return out


def _add(entries, key, text, title=None):
    if not text:
        return
    if key in entries:
        old = entries[key]
        ot, ottl = (old["text"], old.get("title")) if isinstance(old, dict) else (old, None)
        text, title = ot + "\n\n" + text, ottl or title
    entries[key] = {"title": title, "text": text} if title else text


def augustine():
    entries = {}
    for book, c, t in bibleby_pages("aic"):
        for m in re.finditer(r'<div id="(\d+)"[^>]*>(.*?)</div>', _comm_body(t), re.S):
            ps = _paras(m.group(2))
            if ps and re.fullmatch(r"Стих[и]?\s*[\d\s,–-]+", ps[0]):
                ps = ps[1:]
            _add(entries, f"{book}.{c}.{int(m.group(1))}", "\n\n".join(ps))
    return entries


def _words(s):
    return [w for w in re.findall(r"[а-яё]+", s.lower().replace("ё", "е")) if len(w) > 2]


def theophylact(syn_text):
    """syn_text(book, c) -> [стихи синодального текста] для привязки абзацев «<strong>цитата</strong> толкование»."""
    entries = {}
    for book, c, t in bibleby_pages("feofilakt"):
        verses = [set(_words(v)) for v in syn_text(book, c)]
        body = _comm_body(t)
        cur = 1
        # абзац: <P>…</p>; цитата стиха — <strong> в начале абзаца
        for m in re.finditer(r"(?is)<p[^>]*>(.*?)</p>", body):
            raw = m.group(1)
            lm = re.match(r"\s*<strong>(.*?)</strong>", raw, re.S)
            if lm and verses:
                lw = _words(re.sub(r"<[^>]+>", "", lm.group(1)))[:8]
                if lw:
                    best, best_v = 0.0, None
                    for v in range(cur, min(len(verses), cur + 12) + 1):
                        sc = sum(1 for w in lw if w in verses[v - 1]) / len(lw)
                        if sc > best + 0.1:
                            best, best_v = sc, v
                    if best_v and best >= 0.5:
                        cur = best_v
            text = "\n\n".join(_paras(raw))
            _add(entries, f"{book}.{c}.{cur}", text)
    return entries


def chrysostom():
    """Беседы Златоуста: «БЕСЕДА N» + ссылка на стих, с которого беседа начинается."""
    entries = {}
    for book, c, t in bibleby_pages("zlatoust"):
        body = _comm_body(t)
        parts = re.split(r"(?i)(<p[^>]*>\s*БЕСЕДА[^<]{0,40}</p>)", body)
        # до первой «БЕСЕДЫ» — продолжение беседы с прошлой главы или вступление: к стиху 1
        _add(entries, f"{book}.{c}.1", "\n\n".join(_paras(parts[0])))
        for i in range(1, len(parts), 2):
            title = re.sub(r"^БЕСЕДА", "Беседа", _paras(parts[i])[0])
            rest = parts[i + 1]
            v = 1
            lm = re.search(r'<span class="link">[^<]*?(\d+):(\d+)', rest)
            if lm and int(lm.group(1)) == c:
                v = int(lm.group(2))
            _add(entries, f"{book}.{c}.{v}", "\n\n".join(_paras(rest)), title=re.sub(r"\s+", " ", title))
    return entries


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    if sys.argv[1] == "rob":
        rob()
    elif sys.argv[1] == "bibleby":
        bibleby(sys.argv[2], range(int(sys.argv[3]), int(sys.argv[4]) + 1) if len(sys.argv) > 4 else range(1, 67))
    elif sys.argv[1] == "pages":
        for s in sys.argv[2:]:
            print(s, len(bibleby_pages(s)), "глав")
