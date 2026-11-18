"""Структура статьи Дворецкого для чтения в приложении (поле rich модуля dvoretsky-gr).

Блоки статьи (JSON):
  {"k":"h","s":[спаны]}                         — заглавная строка: слово (жирное), грамматика
  {"k":"s","l":0,"n":"1.","m":[спаны],"x":[{"q":[спаны],"t":[спаны]|null}],"au":"Платон (427–347 до н. э.)"|null}
                                                — значение: номер, перевод, примеры (греческий + перевод), авторы значения
  {"k":"p","s":[спаны]}                         — просто абзац
  {"k":"hr"}                                    — граница между омонимами
  {"k":"legend","a":[["Гомер","X–IX вв. до н. э."],…]}   — годы авторов, названных внутри примеров
Спан: [текст, стиль]; стили: r — обычный, g — греческий, h — слово статьи (жирный греческий), b — жирный,
i — курсив/помета, a — автор внутри примера (только имя).
"""
import re
import unicodedata
import dvoretsky_fmt as F

GREEK_CH = "Ͱ-Ͽἀ-῿"
RUN = re.compile(rf"[{GREEK_CH}][^A-Za-zА-Яа-яЁё]*")
CYR = re.compile("[А-Яа-яЁё]")


MARKS = {}
PRINTED = {}
# пометы, которые остаются как есть (числа и века: «II в. до н. э.»)
KEEP = {"гг.", "в.", "вв.", "до_н._э.", "н._э.", "н.э.", "до_н.э."}
# раскрытие сокращений, которых нет в перечне словаря как отдельных статей
OVERRIDE = {"тж.": "также", "т._е.": "то есть", "etc.": "и так далее", "т._д.": "так далее", "т._п.": "тому подобное", "др.": "другие"}
VOICE_KEYS = {"pass.", "med.", "med.-pass.", "act."}
FORM_KEYS = {"compar.", "superl.", "praes.", "impf.", "fut.", "aor.", "aor._1", "aor._2", "pf.", "ppf.", "conjct.", "imper.", "opt.", "inf.",
             "nom.", "gen.", "dat.", "acc.", "voc."}


def set_marks(marks, printed=None):
    """marks — таблица электронной версии; printed — «Условные сокращения» печатного словаря (стр. 10–13 PDF)"""
    MARKS.clear()
    MARKS.update(marks)
    PRINTED.clear()
    for k, v in (printed or {}).items():
        v = re.split(r"\s*[(;]", v)[0].strip(" ,.")
        # только чистые русские расшифровки (без мусора распознавания)
        if v and len(v) <= 40 and re.fullmatch(r"[А-Яа-яЁё ,\-]+", v):
            PRINTED[k.replace(" ", "")] = v


def mark_ru(key, shown):
    """Помета без сокращений и по-русски — как в перечне «Условные сокращения» словаря:
    «поэт.» → «поэтическая форма», «compar.» → «сравнительная степень»"""
    if key in KEEP:
        return shown
    if key in OVERRIDE:
        return OVERRIDE[key]
    pk = key.replace("_", "").replace(" ", "")
    if pk in PRINTED:
        return PRINTED[pk]
    if key not in MARKS or not MARKS[key]:
        return shown
    t = MARKS[key].strip()
    m = re.match(r"^[A-Za-z][A-Za-z\-\. ]*\s*\((.+)\)$", t) or re.match(r"^[A-Za-z][A-Za-z\-\. ]*\s+-\s+(.+)$", t)
    if m:
        t = m.group(1).strip()
    if " (" in t:
        t = t.split(" (")[0].strip()
    if len(t) > 30 and "," in t:
        t = t.split(",")[0].strip()
    return t


ENDINGS = sorted(["ομαι", "ουμαι", "ημι", "αω", "εω", "οω", "ιζω", "ω", "μι", "ος", "ης", "ας", "ον", "η", "α", "ις", "υς", "ευς",
                  "ων", "ηρ", "ωρ", "ιον", "ια", "ιος", "ικος", "ισσα"], key=len, reverse=True)
ENDINGS = sorted({e.replace("ς", "σ") for e in ENDINGS}, key=len, reverse=True)
_STEM = {"full": "", "root": None, "short": False}


def _norm(w):
    d = unicodedata.normalize("NFD", w)
    d = "".join(c for c in d if not unicodedata.combining(c)).lower().replace("ς", "σ")
    return "".join(c for c in d if "α" <= c <= "ω")


def _strip_end(w):
    for e in ENDINGS:
        if w.endswith(e) and len(w) - len(e) >= 3:
            return w[:-len(e)]
    return w


def set_head(head):
    """Основа заглавного слова — по ней в примерах находится нужная форма"""
    full = _norm(head)
    parts = [x for x in re.split(r"[-‐‑]", head) if _norm(x)]
    _STEM["full"] = _strip_end(full)
    _STEM["short"] = len(full) < 3
    _STEM["exact"] = full
    last = _norm(parts[-1]) if len(parts) > 1 else ""
    _STEM["root"] = _strip_end(last) if len(last) >= 3 else None


def _is_key(word):
    t = _norm(word)
    if not t or not _STEM["exact"]:
        return False
    if _STEM["short"]:
        return t == _STEM["exact"]
    st = _STEM["full"]
    if len(st) >= 3 and t.startswith(st[:max(3, len(st) - 1)]):
        return True
    rt = _STEM["root"]
    return bool(rt and len(rt) >= 3 and rt[:max(3, len(rt) - 1)] in t)


def _tokens(el, head, bold=False, ital=False, out=None, root=True):
    """Элемент → плоский список токенов: ('t', текст, жирный, курсив) | ('m', помета) | ('a', ключ автора)"""
    if out is None:
        out = []
    tag = el.tag
    if tag == "tilde":
        # «~» в словаре — сокращённое заглавное слово («μ.»); в примере оно пишется без дефиса состава (μή-τε → μήτε)
        out.append(("k", head.replace("-", "")))
        return out
    if tag == "br":
        out.append(("t", " ", bold, ital))
        return out
    if tag == "mark":
        raw = el.text or ""
        out.append(("m", mark_ru(raw, raw.replace("_", " ")), raw))
        return out
    if tag == "author":
        out.append(("a", el.text or ""))
        return out
    if tag == "num":
        return out
    b, i = bold or tag == "bold", ital or tag == "italic"
    if el.text:
        out.append(("t", el.text, b, i))
    for c in el:
        _tokens(c, head, b, i, out, False)
        if c.tail:
            out.append(("t", c.tail, b, i))
    return out


def _spans(text, bold, ital, in_head=False, keys=True):
    """Кусок текста → спаны: греческие отрезки отдельно"""
    out, pos = [], 0
    for m in RUN.finditer(text):
        if m.start() > pos:
            out.append([text[pos:m.start()], "b" if bold else "i" if ital else "r"])
        run = m.group(0)
        if bold and in_head:
            out.append([run, "h"])
        else:
            # слово целиком: греческие буквы вместе с комбинирующими знаками (ударения, долготы) и знаком элизии
            for piece in re.split(rf"([{GREEK_CH}̀-ͯ][{GREEK_CH}̀-ͯ᾽ʼ’]*)", run):
                if piece:
                    out.append([piece, "k" if keys and _is_key(piece) and re.match(rf"[{GREEK_CH}]", piece) else "g"])
        pos = m.end()
    if pos < len(text):
        out.append([text[pos:], "b" if bold else "i" if ital else "r"])
    return out


def _tok_spans(tokens, tab, in_head=False, keys=True):
    out = []
    for t in tokens:
        if t[0] == "t":
            out.extend(_spans(t[1], t[2], t[3], in_head, keys and not in_head))
        elif t[0] == "m":
            # помета, прилипшая к слову («и<mark>др.</mark>»), — через пробел
            if out and re.search(r"[A-Za-zА-Яа-яЁёͰ-Ͽἀ-῿]$", out[-1][0]):
                out.append([" ", out[-1][1]])
            out.append([t[1], "i"])
        elif t[0] == "k":
            out.append([t[1], "k"])
        else:
            k = t[1]
            out.append(["у" if k == "ap." else F.fmt_one(k, tab, nested=False).split(" (")[0].split(" [")[0], "a"])
    return _merge(out)


def _merge(sp):
    res = []
    for s in sp:
        if not s[0]:
            continue
        if res and res[-1][1] == s[1]:
            res[-1][0] += s[0]
        else:
            res.append([s[0], s[1]])
    return res


def _tidy(sp):
    """убрать пробелы по краям, лишние пробелы внутри"""
    sp = _merge([[re.sub(r"\s+", " ", t), s] for t, s in sp])
    while sp and not sp[0][0].strip():
        sp.pop(0)
    while sp and not sp[-1][0].strip():
        sp.pop()
    if sp:
        sp[0][0] = sp[0][0].lstrip()
        sp[-1][0] = sp[-1][0].rstrip()
    return sp


def _cap(sp):
    for s in sp:
        mm = re.search(r"[A-Za-zА-Яа-яЁё]", s[0])
        if mm:
            if s[1] in ("r", "i", "b") and CYR.match(mm.group(0)) and mm.group(0).islower():
                s[0] = s[0][:mm.start()] + mm.group(0).upper() + s[0][mm.start() + 1:]
            return sp
    return sp


def _split_phases(tokens):
    """Токены значения → (значение, [примеры]): первое «:» вне скобок открывает примеры, «;» вне скобок их разделяет"""
    meaning, chunks, cur, phase, depth = [], [], [], 0, 0
    for t in tokens:
        if t[0] != "t":
            (meaning if phase == 0 else cur).append(t)
            continue
        buf = ""
        def flush():
            nonlocal buf
            if buf:
                (meaning if phase == 0 else cur).append(("t", buf, t[2], t[3]))
                buf = ""
        for ch in t[1]:
            if ch in "([":
                depth += 1
            elif ch in ")]":
                depth -= 1
            if ch == ":" and depth <= 0 and phase == 0:
                flush(); phase = 1
                continue
            if ch == ";" and depth <= 0 and phase == 1:
                flush(); chunks.append(cur); cur = []
                continue
            buf += ch
        flush()
    if cur:
        chunks.append(cur)
    return meaning, [c for c in chunks if any((x[0] != "t") or x[1].strip(" .,;") for x in c)]


def _trailing_authors(tokens):
    """Авторы в конце значения → (значение без них, [ключи])"""
    i = len(tokens)
    keys = []
    while i > 0:
        t = tokens[i - 1]
        if t[0] == "t" and not t[1].strip(" ,;."):
            i -= 1
        elif t[0] == "a":
            keys.insert(0, t[1]); i -= 1
        else:
            break
    rest = tokens[:i]
    if not keys or not rest:
        return tokens, []
    last = next((x for x in reversed(rest) if x[0] != "t" or x[1].strip()), None)
    if last is None or (last[0] == "t" and (re.search(rf"[{GREEK_CH}]\s*$", last[1]) or last[1].rstrip().endswith((":", "(")))):
        return tokens, []
    depth = sum(x[1].count("(") + x[1].count("[") - x[1].count(")") - x[1].count("]") for x in rest if x[0] == "t")
    if depth != 0:
        return tokens, []
    return rest, keys


def _example(tokens, tab):
    """Пример: до последнего автора — цитата, после него — перевод"""
    idx = max((i for i, t in enumerate(tokens) if t[0] == "a"), default=-1)
    if idx < 0:
        return {"q": _cap_none(_tidy(_tok_spans(tokens, tab))), "t": None}
    q, t = tokens[:idx + 1], tokens[idx + 1:]
    t_sp = _tidy(_tok_spans(t, tab))
    if t_sp:
        t_sp[0][0] = t_sp[0][0].lstrip(" ,")
    t_sp = _tail(_tidy(t_sp))
    return {"q": _tidy(_tok_spans(q, tab)), "t": t_sp or None}


def _merge_examples(exs):
    """Фрагмент без греческого текста (только автор или перевод) — продолжение предыдущего примера"""
    out = []
    for ex in exs:
        has_greek = any(st in ("g", "k") for _, st in ex["q"])
        if has_greek or not out:
            out.append(ex)
            continue
        prev = out[-1]
        if all(st == "a" for _, st in ex["q"]):
            # «μή τι νεώτερον ἀγγέλλεις; Plat. не приходишь ли…?» — «;» был греческим вопросительным знаком:
            # вернуть его в цитату, автора и перевод — к ней
            q = prev["q"]
            if prev["t"] is None and q and re.search(rf"[{GREEK_CH}]\s*$", q[-1][0]):
                q = q + [[";", "g"]]
            prev["q"] = _merge(q + [[" ", "r"]] + ex["q"])
            if ex["t"]:
                prev["t"] = _tidy(_merge((prev["t"] or []) + ([[" ", "r"]] if prev["t"] else []) + ex["t"]))
        else:
            extra = ex["q"] + ([[" ", "r"]] + ex["t"] if ex["t"] else [])
            prev["t"] = _tidy(_merge((prev["t"] or []) + [[" ", "r"]] + extra))
    return out


def _tail(sp):
    """убрать «;» и «,» в конце"""
    while sp and not sp[-1][0].strip(" ;,"):
        sp.pop()
    if sp:
        sp[-1][0] = sp[-1][0].rstrip(" ;,")
    return sp


def _cap_none(sp):
    return sp


def _inline_keys(sp_lists, tokens_lists):
    keys = []
    for toks in tokens_lists:
        for t in toks:
            if t[0] == "a" and t[1] not in keys:
                keys.append(t[1])
    return keys


def _atoms(tokens):
    """Текстовые токены — по одному символу, чтобы резать по скобкам"""
    out = []
    for t in tokens:
        if t[0] == "t":
            out.extend(("t", ch, t[2], t[3]) for ch in t[1])
        else:
            out.append(t)
    return out


def _unatoms(atoms):
    out = []
    for a in atoms:
        if a[0] == "t" and out and out[-1][0] == "t" and out[-1][2] == a[2] and out[-1][3] == a[3]:
            out[-1] = ("t", out[-1][1] + a[1], a[2], a[3])
        else:
            out.append(a)
    return out


def _extract_forms(tokens, tab):
    """Шапка статьи → (токены шапки без групп форм, [{label, s}]). Группа форм — скобки, где есть помета времени или степени"""
    at = _atoms(tokens)
    rows, keep, i, n = [], [], 0, len(at)
    while i < n:
        a = at[i]
        if a[0] == "t" and a[1] == "(":
            depth, j = 0, i
            while j < n:
                if at[j][0] == "t" and at[j][1] == "(":
                    depth += 1
                elif at[j][0] == "t" and at[j][1] == ")":
                    depth -= 1
                    if depth == 0:
                        break
                j += 1
            inner = at[i + 1:j]
            d, marks_at = 0, []
            for k, x in enumerate(inner):
                if x[0] == "t" and x[1] in "([":
                    d += 1
                elif x[0] == "t" and x[1] in ")]":
                    d -= 1
                elif x[0] == "m" and d == 0 and x[2] in FORM_KEYS:
                    marks_at.append(k)
            if j < n and marks_at:
                pre = inner[:marks_at[0]]
                if any((x[0] != "t") or x[1].strip() for x in pre):
                    keep.extend([("t", "(", False, False)] + pre + [("t", ")", False, False)])
                voice = None
                for r, k in enumerate(marks_at):
                    end = marks_at[r + 1] if r + 1 < len(marks_at) else len(inner)
                    body = inner[k + 1:end]
                    # «…; pass.: praes. …» — пометка залога с двоеточием относится к строкам ниже
                    while body and body[-1][0] == "t" and body[-1][1] in " ;,":
                        body = body[:-1]
                    cur_voice = voice
                    if body and body[-1][0] == "t" and body[-1][1] == ":":
                        rest = body[:-1]
                        while rest and rest[-1][0] == "t" and not rest[-1][1].strip():
                            rest = rest[:-1]
                        if rest and rest[-1][0] == "m" and rest[-1][2] in VOICE_KEYS:
                            voice = rest[-1][1]
                            body = rest[:-1]
                    sp = _tail(_tidy(_tok_spans(_unatoms(body), tab, keys=False)))
                    lab = inner[k][1]
                    lab = lab[:1].upper() + lab[1:]
                    if cur_voice:
                        lab += f" ({cur_voice})"
                    rows.append({"label": lab, "s": sp})
                i = j + 1
                continue
        keep.append(a)
        i += 1
    return _unatoms(keep), rows


def article_blocks(entry, head, tab):
    """<entry> → список блоков и список ключей авторов, названных внутри примеров/значений"""
    blocks, inline = [], []
    set_head(head)
    for body in entry.findall("body"):
        first = True
        for part in body:
            items = [(part, 0)] if part.tag == "text" else [(it, int(it.get("level") or 1) - 1) for it in part.findall("item")]
            for el, lvl in items:
                toks = _tokens(el, head)
                num_el = el.find("num")
                num = (num_el.text or "").strip() if num_el is not None else ""
                num = re.sub(r"^(\d+)\)$", r"\1.", num)
                if part.tag == "text" and first:
                    first = False
                    # заглавная строка: до первой русской буквы вне жирного/курсива/пометы
                    cut = len(toks)
                    for i, t in enumerate(toks):
                        if t[0] == "t" and not t[2] and not t[3] and CYR.search(t[1]):
                            cut = i
                            break
                    hd, rest = toks[:cut], toks[cut:]
                    if cut < len(toks) and toks[cut][0] == "t":
                        # разрезать токен по первой кириллице
                        t = toks[cut]
                        m = CYR.search(t[1])
                        # голова забирает слово/грамматику до начала русского текста
                        hd = toks[:cut] + [("t", t[1][:m.start()], t[2], t[3])]
                        rest = [("t", t[1][m.start():], t[2], t[3])] + toks[cut + 1:]
                    hd, rows = _extract_forms(hd, tab)
                    blocks.append({"k": "h", "s": _tidy(_tok_spans(hd, tab, in_head=True))})
                    if rows:
                        blocks.append({"k": "f", "rows": rows})
                    toks = rest
                    if not any((t[0] != "t") or t[1].strip() for t in toks):
                        continue
                first = next((i for i, t in enumerate(toks) if t[0] != "t" or t[1].strip()), None)
                if first is not None and toks[first][0] == "m" and toks[first][2] in VOICE_KEYS and first + 1 < len(toks):
                    toks = toks[:first] + [("m", toks[first][1] + ":", toks[first][2])] + toks[first + 1:]
                meaning, chunks = _split_phases(toks)
                meaning, au = _trailing_authors(meaning)
                inline_src = [meaning] + chunks
                for k in _inline_keys(None, inline_src):
                    if k not in inline and k != "ap.":
                        inline.append(k)
                blk = {"k": "s", "l": lvl, "n": num or None,
                       "m": _cap(_tail(_tidy(_tok_spans(meaning, tab)))),
                       "x": _merge_examples([_example(c, tab) for c in chunks]),
                       "au": F._join(au, tab) if au else None}
                if not blk["m"] and not blk["x"] and not blk["au"]:
                    continue
                blocks.append(blk)
        blocks.append({"k": "hr"})
    if blocks and blocks[-1]["k"] == "hr":
        blocks.pop()
    return blocks, inline
