"""Комментарии (CrossWire SWORD) и параллельные места (TSK, OpenBible.info) для build_extra.py.
Все ссылки переводятся из нумерации KJV в синодальную (extra_lib.kjv2syn)."""
import re
from collections import OrderedDict, defaultdict

from extra_lib import (BOOK_ORDER, SRC, fmt_ref, html_to_text, iter_sword_verses, kjv2syn, kjv_range_to_syn, log,
                       parse_osis_ref, parse_ref_list)


def _syn_key(refs):
    """Список стихов KJV одной статьи -> ключ OSIS в синодальной нумерации (стих или диапазон)."""
    syn = [kjv2syn(b, c, max(v, 1)) for b, c, v in refs]
    b = syn[0][0]
    syn = [x for x in syn if x[0] == b]
    lo, hi = min((c, v) for _, c, v in syn), max((c, v) for _, c, v in syn)
    return fmt_ref(b, lo[0], lo[1], hi[0], hi[1])


def sword_commentary(name, books=None, intro_title="Введение"):
    """entries {"Gen.1.1-5": "текст"}; стих 0 (вступление к главе/книге) — отдельная статья с заголовком."""
    runs = OrderedDict()
    for b, c, v, raw, ident in iter_sword_verses(name, "kjv"):
        if books and b not in books:
            continue
        key = ident if v > 0 else ("intro", b, c)
        if key not in runs:
            runs[key] = {"refs": [], "raw": raw}
        runs[key]["refs"].append((b, c, v))
    entries = {}
    for key, r in runs.items():
        text = html_to_text(r["raw"])
        if not text:
            continue
        refs = r["refs"]
        if key[0] == "intro":
            b, c, _ = refs[0]
            k = fmt_ref(*kjv2syn(b, c, 1))
            val = {"title": intro_title, "text": text}
        else:
            k = _syn_key(refs)
            val = text
        if k in entries:  # совпал ключ (например, вступление и статья к первому стиху)
            old = entries[k]
            ot = old["text"] if isinstance(old, dict) else old
            nt = val["text"] if isinstance(val, dict) else val
            entries[k] = {"title": intro_title, "text": ot + "\n\n" + nt} if isinstance(old, dict) or isinstance(val, dict) else ot + "\n\n" + nt
        else:
            entries[k] = val
    return entries


def sort_entries(entries):
    def key(k):
        p = parse_osis_ref(k)
        return (BOOK_ORDER.get(p[0], 999), p[1], p[2], p[3], p[4]) if p else (999, 0, 0, 0, 0)
    return dict(sorted(entries.items(), key=lambda kv: key(kv[0])))


# ---------------------------------------------------------------------------------------------
# Параллельные места
# ---------------------------------------------------------------------------------------------

def _add_ref(refs, key, ref):
    lst = refs[key]
    if ref not in lst and ref != key:
        lst.append(ref)


def tsk():
    """Treasury of Scripture Knowledge: все <scripRef> статьи стиха, без ссылок на тот же стих."""
    refs = defaultdict(list)
    for b, c, v, raw, ident in iter_sword_verses("TSK", "kjv", with_zero=False):
        sb, sc, sv = kjv2syn(b, c, v)
        key = f"{sb}.{sc}.{sv}"
        for m in re.finditer(r"<scripRef(?:\s+passage=\"([^\"]*)\")?[^>]*>(.*?)</scripRef>", raw, re.S):
            body = re.sub(r"<[^>]+>", "", m.group(2))
            # Номер стиха-«оглавления» в начале главы (<scripRef passage="Ge 1:3">3</scripRef>) — это не ссылка
            if m.group(1) and re.fullmatch(r"\d+", body.strip()):
                continue
            # группа без названия книги относится к книге самого стиха
            for bk, c1, v1, c2, v2 in parse_ref_list(m.group(1) or body, b, c):
                _add_ref(refs, key, kjv_range_to_syn(bk, c1, v1, c2, v2))
    return dict(refs)


def openbible(min_votes=1):
    """OpenBible.info: «From Verse / To Verse / Votes»; ссылки упорядочены по числу голосов."""
    rows = defaultdict(list)
    with open(SRC / "openbible" / "cross_references.txt", encoding="utf-8") as fh:
        next(fh)
        for line in fh:
            p = line.rstrip("\n").split("\t")
            if len(p) < 3 or int(p[2]) < min_votes:
                continue
            fr, to = parse_osis_ref(p[0]), parse_osis_ref(p[1])
            if not fr or not to:
                continue
            sb, sc, sv = kjv2syn(fr[0], fr[1], fr[2])
            rows[f"{sb}.{sc}.{sv}"].append((int(p[2]), kjv_range_to_syn(*to)))
    refs = {}
    for k, lst in rows.items():
        out = []
        for _, r in sorted(lst, key=lambda x: -x[0]):
            if r not in out and r != k:
                out.append(r)
        if out:
            refs[k] = out
    return refs


def sort_refs(refs):
    def key(k):
        b, c, v = k.split(".")
        return (BOOK_ORDER.get(b, 999), int(c), int(v))
    return dict(sorted(refs.items(), key=lambda kv: key(kv[0])))
