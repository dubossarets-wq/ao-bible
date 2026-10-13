"""Словари из CrossWire SWORD (lexdict) для build_extra.py."""
import re
import unicodedata

from extra_lib import html_to_text, iter_ld


def _tei_text(raw):
    """TEI/ThML -> текст; нумерованные значения (<sense n="1.">) — с новой строки."""
    s = re.sub(r"<sense\s+n=\"([^\"]*)\"\s*>", lambda m: "\n" + m.group(1).strip() + " ", raw)
    s = re.sub(r"<entryFree[^>]*>|</entryFree>|<entry\b[^>]*>|</entry>", "", s)
    s = re.sub(r"<title>.*?</title>", "", s, count=1, flags=re.S)
    s = re.sub(r"<orth>.*?</orth>", "", s, flags=re.S)
    s = re.sub(r"<(li)\b[^>]*>", "\n• ", s, flags=re.I)
    return html_to_text(s)


def _headword(key, raw):
    m = re.search(r"<entryFree n=\"([^\"]*)\"", raw) or re.search(r"<title>(.*?)</title>", raw)
    hw = m.group(1).strip() if m else key.strip()
    return hw.title() if hw.isupper() else hw


def word_dictionary(name, words_from_key=True):
    """Словарь по словам: ключ — заглавное слово в нижнем регистре."""
    entries = {}
    for key, raw in iter_ld(name):
        key = key.strip()
        if not key or raw.startswith("@LINK"):
            continue
        text = _tei_text(raw)
        if not text:
            continue
        hw = _headword(key, raw)
        k = key.lower().replace("ё", "е")
        if k in entries:
            entries[k]["text"] += "\n\n" + text
        else:
            entries[k] = {"word": hw, "text": text}
    return entries


def _bare_upper(w):
    w = unicodedata.normalize("NFD", w.upper())
    return "".join(ch for ch in w if not unicodedata.combining(ch))


def abbott_smith():
    """G. Abbott-Smith, A Manual Greek Lexicon of the NT: ключи-номера Стронга ссылаются (@LINK) на статьи-леммы."""
    raw = dict(iter_ld("AbbottSmithStrongs"))
    by_lemma = {}
    for k, v in raw.items():
        if not k[:5].isdigit():
            by_lemma.setdefault(_bare_upper(k), (k, v))
    entries = {}
    for k, v in raw.items():
        m = re.match(r"^(\d+)([A-Z]?)$", k)
        if not m or m.group(2) or not v.startswith("@LINK"):
            continue
        target = v[6:].strip()
        hit = by_lemma.get(_bare_upper(target))
        if not hit:
            continue
        body = hit[1]
        lemma = re.search(r"<entry n=\"([^|\"]*)", body)
        entries["G" + str(int(m.group(1)))] = {"lemma": lemma.group(1) if lemma else target, "text": _tei_text(body)}
    return entries


def bdb_glosses():
    entries = {}
    for k, raw in iter_ld("BDBGlosses_Strongs"):
        m = re.match(r"^H0*(\d+)$", k.strip())
        if not m:
            continue
        lemmas = re.findall(r"<foreign xml:lang=\"he\">(.*?)</foreign>", raw)
        body = re.sub(r"<title>.*?</title>", "", raw)
        body = re.sub(r"^\s*(\[?\s*<foreign xml:lang=\"he\">.*?</foreign>\s*[,\]]?\s*)+", "", re.sub(r"<entryFree[^>]*>", "", body))
        text = _tei_text(body).replace("\n", " ")
        text = re.sub(r"\s+", " ", text).strip(" ,;")
        e = {"definition": text}
        if lemmas:
            e["lemma"] = re.sub(r"<[^>]+>", "", lemmas[0])
        if text:
            entries["H" + m.group(1)] = e
    return entries
