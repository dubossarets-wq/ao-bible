"""Перевод дореформенной русской орфографии в современную (для build_ru_old.py).

Буквенные замены однозначны (ѣ→е, і→и, ѳ→ф, ѵ→и, твёрдый знак на конце слова убирается). Неоднозначные окончания
(-ыя/-ія, -аго/-яго, -яя) выбираются по словарю: берётся тот вариант, который встречается в синодальном тексте
(public/modules/rst.json, rst-dc.json), иначе — вариант по умолчанию.
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
_VOCAB = None

LETTERS = str.maketrans({"ѣ": "е", "Ѣ": "Е", "і": "и", "І": "И", "ѳ": "ф", "Ѳ": "Ф", "ѵ": "и", "Ѵ": "И",
                         "ѡ": "о", "Ѡ": "О", "ѕ": "з", "Ѕ": "З", "ѯ": "кс", "ѱ": "пс", "ѫ": "у", "ѧ": "я", "ꙋ": "у"})
ACCENTS = re.compile("[̀́̂̀́]")
WORD = re.compile(r"[А-Яа-яЁёѢѣІіѲѳѴѵ́]+")

# слова, которые правилами не получаются
SPECIAL = {"естьли": "если", "естли": "если", "ежели": "если", "чтó": "что", "ужь": "уже", "ужъ": "уже",
           "нынѣ": "ныне", "тожде": "то же", "пакибытіи": "пакибытии", "однѣ": "одни",
           "онѣ": "они", "своея": "своей", "твоея": "твоей", "моея": "моей", "нашея": "нашей", "вашея": "вашей",
           "нея": "неё", "сея": "сей", "оныя": "оные", "сія": "сии", "сіи": "сии", "всея": "всей"}


def vocab():
    global _VOCAB
    if _VOCAB is None:
        v = set()
        for n in ("rst", "rst-dc"):
            d = json.loads((ROOT / "public" / "modules" / f"{n}.json").read_text(encoding="utf-8"))
            for b in d["books"]:
                for ch in b["chapters"]:
                    for s in ch:
                        v.update(w.lower() for w in re.findall(r"[А-Яа-яЁё]+", s))
        _VOCAB = v
    return _VOCAB


def _word(w):
    low = w.lower()
    if low in SPECIAL:
        r = SPECIAL[low]
        return r.capitalize() if w[0].isupper() else r
    w = ACCENTS.sub("", w)
    w = w.translate(LETTERS)
    if w.endswith(("ъ", "Ъ")):
        w = w[:-1]
    elif len(w) > 1 and w[-1] in "ъЪ":
        w = w[:-1]
    # варианты окончаний
    cands = [w]
    lw = w.lower()
    if lw.endswith("аго") and len(lw) > 4:
        cands.insert(0, w[:-3] + ("его" if lw[-4] in "жшщч" else "ого"))
    if lw.endswith("яго") and len(lw) > 4:
        cands.insert(0, w[:-3] + "его")
    if lw.endswith("ыя") and len(lw) > 3:
        cands.insert(0, w[:-2] + "ые")
    if lw.endswith("ия") and len(lw) > 3:
        cands.append(w[:-2] + "ие")
    if lw.endswith("яя") and len(lw) > 3:
        cands.append(w[:-2] + "ая")
    if lw.endswith("ея") and len(lw) > 3:
        cands.append(w[:-2] + "ее")
    if lw == "ея":
        return "её" if w[0].islower() else "Её"
    if lw == "онѣ" or lw == "оне":
        return "они"
    V = vocab()
    for c in cands:
        if c.lower() in V:
            return c
    return cands[0]  # нет в словаре: -аго/-яго/-ыя заменены, остальное — как есть


def modernize(text):
    """Дореформенная орфография -> современная. Знаки препинания и пробелы сохраняются."""
    return WORD.sub(lambda m: _word(m.group(0)), text)
