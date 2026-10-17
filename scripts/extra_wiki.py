"""Переводы Библии с Викитеки для extra_world.py / build_extra.py.

Страницы скачивает scripts/fetch_world.py (wikisource): wikitext каждой страницы сохраняется в
data-src/extra/wikisource/<язык>/<sha1(заглавие)[:16]>.json {"title", "wikitext"}. Скачанное — недоверенные
данные: здесь его только разбираем как текст.

Сейчас:
  be-dm — Новы Запавет у перакладзе Лукі Дзекуць-Малея і Антона Луцкевіча (1931), беларуская Вікікрыніца
          (https://be.wikisource.org/wiki/Новы_Запавет_(Дзекуць-Малей,_Луцкевіч)). Переводчики умерли в 1955 и
          1942 гг. — Public Domain.
"""
import hashlib
import json
import re
import unicodedata
from collections import defaultdict

from extra_lib import SRC

PREFIXES = []  # (язык, префикс заглавий) — для переводов, где все страницы лежат под одним заглавием

BE_DM = [
    ("Паводле Мацьве́я Сьвятое Эвангельле", "Matt"),
    ("Паводле Марка Сьвятое Эвангельле", "Mark"),
    ("Паводле Лукі Сьвятое Эвангельле", "Luke"),
    ("Паводле Іоана Сьвятое Эвангельле", "John"),
    ("Дзе́яньні Сьвятых Апосталаў", "Acts"),
    ("Саборнае пасланьне сьвятога Апостала Якуба", "Jas"),
    ("Пе́ршае саборнае пасланьне сьвятога Апостала Пётры", "1Pet"),
    ("Другое саборнае пасланьне сьвятога Апостала Пётры", "2Pet"),
    ("Пе́ршае саборнае пасланьне сьвятога Апостала Іоана Багаслова", "1John"),
    ("Другое саборнае пасланьне сьвятога Апостала Іоана Багаслова", "2John"),
    ("Трэцяе саборнае пасланьне сьвятога Апостала Іоана Багаслова", "3John"),
    ("Саборнае пасланьне сьвятога Апостала Юды", "Jude"),
    ("Пасланьне да Рымлянаў сьв. ап. Паўлы", "Rom"),
    ("Пе́ршае Пасланьне да Карыньцянаў сьв. ап. Паўлы", "1Cor"),
    ("Другое Пасланьне да Карыньцянаў сьв. ап. Паўлы", "2Cor"),
    ("Пасланьне да Галятаў сьв. ап. Паўлы", "Gal"),
    ("Пасланьне да Эфэсцаў сьв. ап. Паўлы", "Eph"),
    ("Пасланьне да Філіпянаў сьв. ап. Паўлы", "Phil"),
    ("Пасланьне да Каласянаў сьв. ап. Паўлы", "Col"),
    ("Пе́ршае Пасланьне да Фесалонікійцаў сьв. ап. Паўлы", "1Thess"),
    ("Другое Пасланьне да Фесалонікійцаў сьв. ап. Паўлы", "2Thess"),
    ("Пе́ршае Пасланьне да Цімахве́я сьв. ап. Паўлы", "1Tim"),
    ("Другое Пасланьне да Цімахве́я сьв. ап. Паўлы", "2Tim"),
    ("Пасланьне да Ціта сьв. ап. Паўлы", "Titus"),
    ("Пасланьне да Філімона сьв. ап. Паўлы", "Phlm"),
    ("Пасланьне да Жыдоў сьв. ап. Паўлы", "Heb"),
    ("Адкрыцьце сьв. Іоана Багаслова", "Rev"),
]

SETS = {"be-dm": ("be", BE_DM)}
PAGES = {lang: [t for t, _ in pages] for lang, pages in SETS.values()}


def page_path(lang, title):
    h = hashlib.sha1(title.encode("utf-8")).hexdigest()[:16]
    return SRC / "wikisource" / lang / f"{h}.json"


def _clean(s):
    # «==Разьдзеліцца» посреди стиха — след автозамены на Викитеке (слово «разьдзел…» принято за заголовок)
    s = re.sub(r"==\s*Разьдзе", "разьдзе", s)
    s = re.sub(r"<ref[^>/]*/>", "", s)
    s = re.sub(r"(?is)<ref[^>]*>.*?</ref>", "", s)
    s = re.sub(r"\{\{[^{}]*\}\}", "", s)
    s = re.sub(r"\[\[(?:[^|\]]*\|)?([^\]]*)\]\]", r"\1", s)
    s = re.sub(r"<[^>]+>", " ", s)
    s = s.replace("'''", "").replace("''", "")
    # Знак ударения (U+0301) в издании 1931 г. стоит над многими словами; убираем — иначе не работает поиск
    s = unicodedata.normalize("NFC", unicodedata.normalize("NFD", s).replace("́", ""))
    return re.sub(r"\s+", " ", s).strip()


_CHAPTER = re.compile(r"^==+\s*Разьдзе́?л\s+(\d+)\s*==+\s*$")
_VERSE_TPL = re.compile(r"^\{\{верш\|раздзел=(\d+)\|верш=(\d+)\}\}\s*(.*)$")
_VERSE_NUM = re.compile(r"^(\d+)\s+(.*)$")
_SUBSCRIPTION = re.compile(r"^(Пісана|Напісана|Пісаны|Напісаны)\b")
# Подпись в конце последнего стиха послания: «… Амін. Да Філіпянаў пісана з Рыму праз Эпафрадзіта.»
_SUBSCRIPTION_TAIL = re.compile(r"(?<=[.!])\s+Да [^.]*?\b(на)?пісан\w*\b.*$")


# Перенос в синодальную нумерацию (в остальном издание 1931 г. уже следует ей; стихи сверх синодальной главы —
# Деян 19:41, 2 Кор 11:33 — collect дописывает к последнему стиху): славословие Рим 16:25–27 — в конец 14 главы.
# И сбитые номера в транскрипции: Флм 23–24 слиты в стих «23», а последний стих помечен «24» (это 25).
RENUMBER = {"be-dm": {("Rom", 16, 25): (14, 24), ("Rom", 16, 26): (14, 25), ("Rom", 16, 27): (14, 26),
                      ("Phlm", 1, 24): (1, 25)}}


def read(set_id):
    """-> (src {book: {(c, v): text}}, headings {}) в нумерации источника."""
    lang, pages = SETS[set_id]
    src = {}
    for title, book in pages:
        p = page_path(lang, title)
        if not p.exists():
            raise FileNotFoundError(f"{set_id}: нет страницы «{title}» — запустите fetch_world.py wikisource")
        text = json.loads(p.read_text(encoding="utf-8"))["wikitext"]
        verses = defaultdict(list)
        c = v = 0
        for line in text.splitlines():
            line = line.strip()
            if not line:
                continue
            m = _CHAPTER.match(line)
            if m:
                c, v = int(m.group(1)), 0
                continue
            if not c or line.startswith(("{{раздзел", "[[Катэгорыя", "<div", "</div", "|", "}}")):
                continue
            m = _VERSE_TPL.match(line) or _VERSE_NUM.match(line)
            if m:
                n = int(m.group(m.re.groups - 1))
                if n > v + 5 and n - 10 == v + 1:   # опечатка в номере стиха (Евр 13: «35» вместо 25)
                    n -= 10
                v = n
                verses[(c, v)].append(m.group(m.re.groups))
            elif v:
                verses[(c, v)].append(line)   # продолжение стиха (поэтические строки)
        for (fb, fc, fv), to in RENUMBER.get(set_id, {}).items():
            if fb == book and (fc, fv) in verses:
                verses[to] = verses.pop((fc, fv))
        out = {k: _clean(" ".join(p)) for k, p in verses.items()}
        out = {k: t for k, t in out.items() if t}
        # Подписи в конце посланий («Пісана да Рымлянаў з Карынту…») — не текст стиха
        last = max(out) if out else None
        if last and _SUBSCRIPTION.match(out[last]):
            del out[last]
            last = max(out)
        if last:
            out[last] = _SUBSCRIPTION_TAIL.sub("", out[last])
        src[book] = out
    return src, {}
