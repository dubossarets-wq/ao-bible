"""Дополнительные модули AO Bible: переводы, комментарии, словари, параллельные места и карты из источников
со свободной лицензией (Public Domain, CC0, CC BY, CC BY-SA). Формат — docs/MODULE_SCHEMA.md.

Запуск (после build_data.py и build_dc.py — дописывает свои записи в public/modules/catalog.json):
  python -I scripts/build_extra.py              # все модули
  python -I scripts/build_extra.py kjv mhcc     # только перечисленные id (остальные записи каталога не трогаются)

Исходники (скачаны в data-src/extra/; откуда загружать заново — ниже):
  crosswire/*.zip        — модули CrossWire SWORD (https://crosswire.org/ftpmirror/pub/sword/packages/rawzip/),
                           распаковываются в crosswire/x/<Модуль>/
  sword-src/             — canon_synodal.h и versificationmgr.cpp из исходников SWORD (таблица Synodal<->KJV)
  ebible/eng-kjv2006/    — KJV с номерами Стронга, USFM (https://ebible.org/Scriptures/eng-kjv2006_usfm.zip)
  morphhb/repo/          — git clone https://github.com/openscriptures/morphhb (OSHB)
  byztxt/repo/           — git clone https://github.com/byztxt/byzantine-majority-text (RP2018)
  openbible/             — https://a.openbible.info/data/cross-references.zip
  lopukhin/github-swmail-lopukhin_commentary/ — https://github.com/swmail/lopukhin_commentary
  nikifor/ru-wikisource/ — статьи «БЭАН/…» Русской Викитеки (MediaWiki API)
  ru-wikisource-dump/    — словари Викитеки (Даль, ПБЭ, ЭСБЕ, ЕЭБЕ): scripts/extra_dicts_ru.py extract | fetch
  wikimedia-maps/        — карты с Wikimedia Commons + manifest.json (лицензия и автор каждой карты)
Нужен pysword в .pylib (см. build_dc.py).
"""
import json
import os
import re
import shutil
import sys
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import extra_bibles as B  # noqa: E402
import extra_comm as C  # noqa: E402
import extra_dicts as D  # noqa: E402
import extra_ru as R  # noqa: E402
import extra_dicts_ru as RD  # noqa: E402
from extra_lib import (BOOK_BY_ID, CW, OUT, SRC, kjv2syn, log, merge_catalog, parse_osis_ref,  # noqa: E402
                       write_module)

# Картинки карт: путь от корня сайта (src/core/schema.js принимает https://, data:image/ и путь вида
# modules/maps/<id>/файл.jpg; build.mjs публикует папку maps/<id> вместе с модулем). Абсолютный адрес можно
# задать переменной AOB_MAPS_BASE (например, https://dubossarets-wq.github.io/ao-bible/).
MAPS_BASE = os.environ.get("AOB_MAPS_BASE", "")

BASE = {"format": "aob-module", "formatVersion": 1}
CW_SRC = "CrossWire Bible Society, модуль {} (https://crosswire.org/sword/modules/)"


def unpack_crosswire():
    for z in sorted((SRC / "crosswire").glob("*.zip")):
        dest = CW / z.stem
        if not (dest / "mods.d").exists():
            zipfile.ZipFile(z).extractall(dest)


def bible(meta, col, skip=()):
    books = col.books(skip)
    B.validate(books, meta["id"])
    feats = meta.setdefault("features", {})
    feats.setdefault("strongs", any("{" in v for b in books for ch in b["chapters"] for v in ch))
    feats.setdefault("headings", any(b.get("headings") for b in books))
    return {**BASE, "type": "bible", "versification": "synodal", **meta, "books": books}


# ---------------------------------------------------------------------------------------------
# Переводы
# ---------------------------------------------------------------------------------------------

def m_kjv():
    col = B.usfm_bible(SRC / "ebible" / "eng-kjv2006", kjv2syn)
    return bible({
        "id": "kjv", "name": "KJV", "title": "King James Version (1769) с номерами Стронга", "language": "en",
        "description": "Английская Библия короля Якова (Authorized Version, стандартный текст 1769 г.) с номерами "
                       "Стронга и курсивом добавленных слов. 66 книг. Нумерация стихов переведена в синодальную "
                       "(Псалтирь, Иов, Малахия и др.), надписания псалмов — отдельным стихом, как в синодальном.",
        "version": "eBible.org eng-kjv2006 (2026-09-26)", "author": "Перевод 1611 г., редакция 1769 г.; номера Стронга — CrossWire / eBible.org",
        "source": "https://ebible.org/find/details.php?id=eng-kjv2006",
        "license": "Public Domain (вне Великобритании; в Великобритании права на печать — королевский патент)",
        "features": {"strongs": True, "italics": True, "headings": False},
    }, col)


def m_bsb():
    col = B.sword_bible("BSB", "kjv", kjv2syn)
    return bible({
        "id": "bsb", "name": "BSB", "title": "Berean Standard Bible с номерами Стронга", "language": "en",
        "description": "Современный английский перевод Berean Standard Bible с номерами Стронга у каждого слова или "
                       "фразы и заголовками разделов. Нумерация стихов переведена в синодальную.",
        "version": "CrossWire BSB " + B.sword_version("BSB"), "author": "Bible Hub / Berean Bible (2016–2023)",
        "source": CW_SRC.format("BSB") + "; https://berean.bible",
        "license": "CC0 1.0 (общественное достояние, с 30.04.2023)",
        "features": {"strongs": True, "headings": True},
    }, col)


def m_oshb():
    col = B.oshb()
    return bible({
        "id": "oshb", "name": "OSHB", "title": "Еврейский текст Ветхого Завета (Ленинградский кодекс) с номерами Стронга",
        "language": "he",
        "description": "Масоретский текст по Вестминстерскому Ленинградскому кодексу (WLC) с огласовками и знаками "
                       "кантилляции, номерами Стронга и морфологическими кодами OSHB. Нумерация переведена в "
                       "синодальную (по таблице VerseMap OSHB и SWORD); Ис 64:1 в еврейском тексте входит в 63:19.",
        "version": "openscriptures/morphhb (git)", "author": "Open Scriptures Hebrew Bible (D. Owens, D. Troidl и др.); WLC — Groves Center",
        "source": "https://github.com/openscriptures/morphhb",
        "license": "CC BY 4.0 (Open Scriptures Hebrew Bible); текст WLC — Public Domain",
        "features": {"strongs": True, "morphology": True},
    }, col)


def m_byz():
    col = B.byz(kjv2syn)
    return bible({
        "id": "byz-rp2018", "name": "Byz", "title": "Новый Завет на греческом: Византийский текст (Робинсон — Пирпонт 2018)",
        "language": "grc",
        "description": "Греческий Новый Завет в византийской текстовой форме (Robinson–Pierpont 2018) с ударениями, "
                       "номерами Стронга и морфологическими кодами Робинсона. Нумерация переведена в синодальную.",
        "version": "byztxt/byzantine-majority-text (git)", "author": "Maurice A. Robinson, William G. Pierpont",
        "source": "https://github.com/byztxt/byzantine-majority-text",
        "license": "Public Domain (передано в общественное достояние авторами)",
        "features": {"strongs": True, "morphology": True},
    }, col)


def m_csl():
    col = B.sword_bible("CSlElizabeth", "synodal", None, strongs=False)
    h = col.headings.get("Ps", {})
    if "150:6" in h:  # надписание Пс 151 в модуле стоит после Пс 150:6
        col.heading("Ps", 151, 1, h.pop("150:6"))
    return bible({
        "id": "csl-elizabeth", "name": "ЦСЯ", "title": "Елизаветинская Библия на церковнославянском языке (1751/1757)",
        "language": "cu",
        "description": "Церковнославянская Библия в редакции 1751 г. (издание 1757 г.) гражданским шрифтом в "
                       "современной орфографии, полный канон с неканоническими книгами. Синодальная нумерация.",
        "version": "CrossWire CSlElizabeth " + B.sword_version("CSlElizabeth"), "author": "Елизаветинская Библия (1751); электронный текст — rusbible.ru",
        "source": CW_SRC.format("CSlElizabeth"), "license": "Public Domain",
        "features": {"strongs": False, "deuterocanonical": True},
    }, col)


MAKARIJ_FIX = str.maketrans({"ј": "ѣ", "Ј": "Ѣ", "ѕ": "ѳ", "Ѕ": "Ѳ", "ў": "ѵ"})


def _makarij_fix(raw):
    raw = raw.translate(MAKARIJ_FIX)  # шрифтовая подстановка старой орфографии в исходнике: ј=ѣ, ѕ=ѳ, ў=ѵ
    return re.sub(r"\[ \(\w+ \d+:\d+\) (.*?) \]", r"\1", raw)


def m_makarij():
    col = B.sword_bible("RusMakarij", "kjv", kjv2syn, strongs=False, fix=_makarij_fix,
                        book_filter=lambda b: b != "Num")
    return bible({
        "id": "rus-makarij", "name": "Макарий", "title": "Пятикнижие в переводе архим. Макария (Глухарева)",
        "language": "ru",
        "description": "Перевод книг Моисеевых с еврейского архимандрита Макария (Глухарева, 1792–1847) в "
                       "дореформенной орфографии: Бытие, Исход, Левит, Второзаконие. Книга Чисел не включена — в "
                       "исходном электронном тексте у неё сбиты главы и стихи.",
        "version": "CrossWire RusMakarij " + B.sword_version("RusMakarij"), "author": "Архим. Макарий (Глухарев); электронный текст — С. А. Федосов (Slavic Bible)",
        "source": CW_SRC.format("RusMakarij"), "license": "Public Domain",
        "features": {"strongs": False},
    }, col)


def m_kulish():
    col = B.sword_bible("UkrKulish", "kjv", kjv2syn, strongs=False)
    return bible({
        "id": "ukr-kulish", "name": "Куліш", "title": "Новий Завіт у перекладі П. Куліша (1871)", "language": "uk",
        "description": "Украинский перевод Нового Завета Пантелеймона Кулиша (1871). Нумерация стихов переведена в "
                       "синодальную (Рим 16:25–27 → 14:24–26 и др.).",
        "version": "CrossWire UkrKulish " + B.sword_version("UkrKulish"), "author": "П. О. Куліш; электронный текст — Unbound Bible (Biola University)",
        "source": CW_SRC.format("UkrKulish"), "license": "Public Domain",
        "features": {"strongs": False},
    }, col)


# ---------------------------------------------------------------------------------------------
# Переводы на других языках (scripts/extra_world_list.py): eBible.org и CrossWire, нумерация — синодальная
# ---------------------------------------------------------------------------------------------

# Схема нумерации модуля SWORD (поле Versification) -> с какого перевода нумерации начинать подбор
SWORD_PREFER = {"kjv": "kjv", "kjva": "kjv", "nrsv": "nrsv", "nrsva": "nrsv", "synodal": "syn", "synodalprot": "syn",
                "orthodox": "syn", "vulg": "vulg", "catholic": "vulg", "catholic2": "vulg", "segond": "segond",
                "calvin": "calvin", "darbyfr": "darbyfr", "mt": "mt", "leningrad": "mt", "german": "mt", "luther": "mt"}
_EBIBLE_META = None


def ebible_meta(eid):
    global _EBIBLE_META
    if _EBIBLE_META is None:
        import csv
        f = SRC / "ebible-meta" / "translations.csv"
        _EBIBLE_META = {r["translationId"]: r for r in csv.DictReader(open(f, encoding="utf-8-sig"))} if f.exists() else {}
    return _EBIBLE_META.get(eid, {})


def world_bible(d):
    import extra_world as W
    kind, name = d["src"].split(":", 1)
    if kind == "ebible":
        src, heads = W.read_usfm(SRC / "ebible" / name)
        prefer = d.get("prefer")
        em = ebible_meta(name)
        version = f"eBible.org {name}" + (f" ({em['UpdateDate']})" if em.get("UpdateDate") else "")
        source = f"https://ebible.org/find/details.php?id={name} (лицензия: https://ebible.org/{name}/copr.htm)"
    elif kind == "wikisource":
        import extra_wiki as WK
        src, heads = WK.read(name)
        prefer = d.get("prefer") or "syn"
        version = d.get("version") or f"Викитека ({WK.SETS[name][0]}.wikisource.org)"
        source = d["source"]
    else:
        from extra_lib import sword_conf
        vers = sword_conf(name).get("Versification", "KJV").lower()
        src, heads = W.read_sword(name, vers)
        prefer = d.get("prefer") or SWORD_PREFER.get(vers, "kjv")
        version = f"CrossWire {name} " + B.sword_version(name)
        source = CW_SRC.format(name) + " (DistributionLicense в conf-файле модуля)"
    # schemes в списке — ограничить подбор нумерации (для текстов, уже близких к синодальной схеме)
    schemes, best, _ = W.choose_schemes(src, prefer, **({"schemes": tuple(d["schemes"])} if d.get("schemes") else {}))
    # per_chapter в списке — схема для отдельных глав книги, где источник сбит (см. extra_world_list.py)
    for book, chmap in d.get("per_chapter", {}).items():
        if book in schemes:
            schemes[book].per_chapter.update(chmap)
    other = {b: repr(s) for b, s in schemes.items() if repr(s) != best}
    log(f"  [{d['id']}] нумерация источника: {best}" + (f"; отдельно: {other}" if other else ""))
    col = W.collect(src, heads, schemes, d["id"])
    books = col.books()
    cov, short = W.quality(books, d["id"])
    W.spot_check(books, d["id"])
    if len(short) > 3 or cov < 0.9:
        log(f"  [{d['id']}] ОТКЛОНЁН: текст неполный или со сбитой разбивкой на стихи")
        return None
    nt_only = all(BOOK_BY_ID.get(b["id"], {}).get("t") == "NT" for b in books)
    feats = {"rtl": True} if d.get("rtl") else {}
    desc = d["desc"] + (" Только Новый Завет." if nt_only and "Нов" not in d["desc"] else "") + \
        " Нумерация стихов приведена к синодальной."
    return bible({
        "id": d["id"], "name": d["name"], "title": d["title"], "language": d["lang"], "description": desc,
        "version": version, "author": d["author"], "source": source, "license": d["license"], "features": feats,
    }, col)


def _world_builders():
    from extra_world_list import BIBLES, DOUBTFUL
    out = []
    for d in BIBLES + DOUBTFUL:
        fn = (lambda dd: lambda: world_bible(dd))(d)
        fn.__name__ = "m_w_" + d["id"].replace("-", "_")
        BUILDER_IDS[fn.__name__] = [d["id"]]
        out.append(fn)
    return out


# ---------------------------------------------------------------------------------------------
# Комментарии
# ---------------------------------------------------------------------------------------------

def commentary(meta, entries):
    return {**BASE, "type": "commentary", "versification": "synodal", **meta, "entries": C.sort_entries(entries)}


# Прежде «Толковая Библия» публиковалась тремя модулями lopukhin-1/2/3 (по томам), Barnes — двумя barnes-1/2;
# теперь каждая работа — один модуль (приложение при обновлении заменяет старые id на новый).
REPLACED_IDS = {"lopukhin-1": "lopukhin", "lopukhin-2": "lopukhin", "lopukhin-3": "lopukhin",
                "barnes-1": "barnes", "barnes-2": "barnes"}


def m_lopukhin():
    entries, skipped = R.lopukhin()
    if skipped:
        log("  лопухин: пропущены ссылки", skipped)
    return commentary({
        "id": "lopukhin", "name": "Лопухин", "title": "Толковая Библия Лопухина", "language": "ru",
        "description": "«Толковая Библия, или Комментарий на все книги Св. Писания Ветхого и Нового Завета» под ред. "
                       "А. П. Лопухина и его преемников (СПб., 1904–1913) — все книги в одном модуле. Вступления к "
                       "книгам и главам, толкования на стихи и группы стихов. Синодальная нумерация.",
        "version": "swmail/lopukhin_commentary d471c95", "author": "А. П. Лопухин и преемники (1904–1913); электронный текст — волонтёры (OCR, вычитка), SWORD-модуль — swmail",
        "source": "https://github.com/swmail/lopukhin_commentary (SWORD-модуль, DistributionLicense=Public Domain)",
        "license": "Public Domain", "replaces": ["lopukhin-1", "lopukhin-2", "lopukhin-3"],
    }, entries)


def m_mhcc():
    return commentary({
        "id": "mhcc", "name": "M. Henry", "title": "Matthew Henry's Concise Commentary", "language": "en",
        "description": "Краткий комментарий Мэтью Генри на всю Библию (англ.). Статьи на группы стихов; ссылки "
                       "переведены в синодальную нумерацию.",
        "version": "CrossWire MHCC " + B.sword_version("MHCC"), "author": "Matthew Henry (1662–1714)",
        "source": CW_SRC.format("MHCC"), "license": "Public Domain",
    }, C.sword_commentary("MHCC", intro_title="Introduction"))


def m_jfb():
    return commentary({
        "id": "jfb", "name": "JFB", "title": "Jamieson, Fausset & Brown Commentary (1871)", "language": "en",
        "description": "Критико-толковый комментарий Джеймисона, Фоссета и Брауна на всю Библию (англ.). Ссылки "
                       "переведены в синодальную нумерацию.",
        "version": "CrossWire JFB " + B.sword_version("JFB"), "author": "Robert Jamieson, A. R. Fausset, David Brown",
        "source": CW_SRC.format("JFB"), "license": "Public Domain",
    }, C.sword_commentary("JFB", intro_title="Introduction"))


def m_barnes():
    return commentary({
        "id": "barnes", "name": "Barnes", "title": "Barnes' Notes on the New Testament", "language": "en",
        "description": "Комментарий Альберта Барнса на весь Новый Завет (англ.) в одном модуле. Ссылки переведены в "
                       "синодальную нумерацию.",
        "version": "CrossWire Barnes " + B.sword_version("Barnes"), "author": "Albert Barnes (1798–1870)",
        "source": CW_SRC.format("Barnes"), "license": "Public Domain", "replaces": ["barnes-1", "barnes-2"],
    }, C.sword_commentary("Barnes", intro_title="Introduction"))


# Комментарии CrossWire (Public Domain по DistributionLicense в conf-файле; у Geneva поле не заполнено — текст 1599 г.)
# (id, имя, заглавие, описание, автор, модуль SWORD, язык, заголовок вступлений, схема нумерации модуля)
SWORD_COMMENTARIES = [
    ("clarke", "Clarke", "Adam Clarke's Commentary on the Bible (1810–1826)",
     "Комментарий Адама Кларка на всю Библию (англ.): филологические и исторические примечания к стихам.",
     "Adam Clarke (1762–1832)", "Clarke", "en", "Introduction", "kjv"),
    ("wesley", "Wesley", "John Wesley's Explanatory Notes (1754–1765)",
     "Краткие пояснения Джона Уэсли ко всей Библии (англ.).", "John Wesley (1703–1791)", "Wesley", "en",
     "Introduction", "kjv"),
    ("scofield", "Scofield", "Scofield Reference Notes (1917)",
     "Справочные примечания Библии Скофилда, издание 1917 г. (англ.).", "C. I. Scofield (1843–1921)", "Scofield",
     "en", "Introduction", "kjv"),
    ("geneva-notes", "Geneva notes", "Geneva Bible Translation Notes (1599)",
     "Примечания Женевской Библии 1599 г. — первый английский «учебный» комментарий эпохи Реформации.",
     "Переводчики Женевской Библии (1560–1599)", "Geneva", "en", "Introduction", "kjv"),
    ("pnt", "PNT", "The People's New Testament (1891)",
     "Комментарий на Новый Завет для широкого читателя Б. У. Джонсона (англ.).", "B. W. Johnson (1833–1894)", "PNT",
     "en", "Introduction", "kjv"),
    ("burkitt", "Burkitt", "Burkitt's Expository Notes on the New Testament",
     "Толкования Уильяма Беркитта на Новый Завет (англ., 1700).", "William Burkitt (1650–1703)", "Burkitt", "en",
     "Introduction", "kjv"),
    ("catena-aurea", "Catena Aurea", "Catena Aurea: толкования святых отцов на Евангелия (Фома Аквинский)",
     "«Золотая цепь» — подборка толкований святых отцов (Иоанна Златоуста, Августина, Иеронима, Илария, Оригена, "
     "Феофилакта и др.) на каждый стих четырёх Евангелий, составленная Фомой Аквинским; английский перевод под "
     "ред. Дж. Г. Ньюмена (1841–1845).", "Thomas Aquinas; пер. J. H. Newman и др.", "Catena", "en", "Introduction",
     "kjv"),
    ("treasury-of-david", "Treasury of David", "C. H. Spurgeon: The Treasury of David",
     "«Сокровищница Давида» — толкование Чарльза Сперджена на Псалтирь с выдержками из других авторов (англ.). "
     "Номера псалмов переведены в синодальные.", "Charles H. Spurgeon (1834–1892)", "TDavid", "en", "Introduction",
     "kjv"),
    ("keil-delitzsch", "K&D", "Keil & Delitzsch: Commentary on the Old Testament",
     "Классический научный комментарий К. Ф. Кейля и Ф. Делича на весь Ветхий Завет (англ. пер. 1857–1878).",
     "C. F. Keil (1807–1888), F. Delitzsch (1813–1890)", "KD", "en", "Introduction", "kjv"),
    ("lightfoot", "Lightfoot", "John Lightfoot: Commentary from the Talmud and Hebraica",
     "Комментарий Джона Лайтфута на Евангелия и другие книги НЗ по талмудическим и иудейским источникам (англ.).",
     "John Lightfoot (1602–1675)", "Lightfoot", "en", "Introduction", "kjv"),
    ("fourfold-gospel", "Fourfold Gospel", "The Fourfold Gospel and Commentary on Acts",
     "Гармония Евангелий с комментарием Дж. У. Макгарви и Ф. Пендлтона, а также комментарий на Деяния (англ.).",
     "J. W. McGarvey, Philip Y. Pendleton", "TFG", "en", "Introduction", "kjv"),
    ("luther-comm", "Luther", "Martin Luther: Commentary on Selected Passages",
     "Толкования Мартина Лютера на избранные места Писания (англ. перевод).", "Martin Luther (1483–1546)", "Luther",
     "en", "Introduction", "kjv"),
    ("chrysostome-fr", "Chrysostome", "Saint Jean Chrysostome: commentaires de la Bible",
     "Толкования свт. Иоанна Златоуста на книги Библии во французском переводе (XIX в.).",
     "Св. Иоанн Златоуст (ок. 347–407); фр. пер. XIX в.", "FreChry", "fr", "Introduction", "catholic"),
    ("augustin-fr", "Augustin", "Saint Augustin: commentaires de la Bible",
     "Толкования блж. Августина на книги Библии во французском переводе (XIX в.).",
     "Бл. Августин (354–430); фр. пер. XIX в.", "FreAug", "fr", "Introduction", "catholic"),
    ("jerome-fr", "Jérôme", "Saint Jérôme: commentaires de la Bible",
     "Толкования блж. Иеронима Стридонского на книги Библии во французском переводе (XIX в.).",
     "Бл. Иероним (ок. 342–420); фр. пер. XIX в.", "FreJer", "fr", "Introduction", "catholic"),
    ("glossa-ordinaria", "Glossa", "Glossa ordinaria (латынь, изд. Миня)",
     "Средневековый латинский свод святоотеческих толкований на Библию — «Обычная глосса» (по изданию Миня).",
     "Валафрид Страбон (приписывается); изд. J.-P. Migne", "VulgGlossa", "la", "Prologus", "vulg"),
    ("kanttekeningen", "Kanttekeningen", "Kanttekeningen bij de Statenvertaling (1637)",
     "Примечания на полях Statenvertaling (нидерл., 1637) — классический реформатский комментарий.",
     "Переводчики Statenvertaling", "DutKant", "nl", "Inleiding", "kjv"),
    ("rieger", "Rieger", "Carl Heinrich Rieger: Betrachtungen über das Neue Testament",
     "Пиетистские толкования Карла Генриха Ригера на Новый Завет (нем., XVIII в.).",
     "Carl Heinrich Rieger (1726–1791)", "Rieger", "de", "Einleitung", "kjv"),
]


def _comm_mapper(vers):
    import extra_world as W
    if vers == "kjv":
        return kjv2syn
    if vers == "vulg":  # Псалтирь Вульгаты нумеруется как синодальная (по LXX), остальное — по таблице SWORD
        return lambda b, c, v: W.mapper("syn" if b == "Ps" else "vulg")(b, c, v)
    if vers == "catholic":  # схема SWORD Catholic: еврейская нумерация псалмов и стихов
        return W.mapper("mt")
    return W.mapper(vers)


def _sword_comm_builder(row):
    mid, name, title, desc, author, sword, lang, intro, vers = row

    def fn():
        from extra_lib import sword_conf
        conf = sword_conf(sword)
        lic = conf.get("DistributionLicense") or "Public Domain (по сроку: текст старше 1900 г.; в conf лицензия не указана)"
        entries = C.sword_commentary(sword, intro_title=intro, versification=vers, mapper=_comm_mapper(vers))
        if not entries:
            log(f"  {mid}: статей нет — пропуск")
            return None
        bad = 0
        for k, v in entries.items():  # символы-заменители U+FFFD (битые байты в исходнике) убираем
            t = v["text"] if isinstance(v, dict) else v
            if "�" in t:
                bad += t.count("�")
                t = t.replace("�", "")
                entries[k] = {**v, "text": t} if isinstance(v, dict) else t
        if bad:
            log(f"  {mid}: убрано символов U+FFFD: {bad}")
        return commentary({
            "id": mid, "name": name, "title": title, "language": lang,
            "description": desc + " Ссылки переведены в синодальную нумерацию.",
            "version": f"CrossWire {sword} " + B.sword_version(sword), "author": author,
            "source": CW_SRC.format(sword), "license": lic,
        }, entries)
    fn.__name__ = "m_c_" + mid.replace("-", "_")
    BUILDER_IDS[fn.__name__] = [mid]
    return fn


# ---------------------------------------------------------------------------------------------
# Словари
# ---------------------------------------------------------------------------------------------

def dictionary(meta, entries, kind="words"):
    return {**BASE, "type": "dictionary", "dictionaryKind": kind, **meta, "entries": entries}


def m_nikifor():
    return dictionary({
        "id": "nikifor", "name": "Никифор", "title": "Библейская энциклопедия архимандрита Никифора (1891–1892)",
        "language": "ru",
        "description": "Иллюстрированная полная популярная Библейская энциклопедия архим. Никифора (Бажанова): "
                       "4,5 тыс. статей о лицах, местах, предметах и понятиях Библии. Ищется по слову, на которое "
                       "нажали в тексте; у статей — ссылки на стихи (синодальная нумерация).",
        "version": "Викитека, выгрузка 2026-10-13", "author": "Архимандрит Никифор (Бажанов); электронный текст — участники Русской Викитеки",
        "source": "https://ru.wikisource.org/wiki/Библейская_энциклопедия_архимандрита_Никифора",
        "license": "CC BY-SA 4.0 (Викитека; текст 1891–1892 гг. — Public Domain)", "versification": "synodal",
    }, R.nikifor())


WS_LIC = "Public Domain (издано в Российской империи до 1917 г.); электронный текст Викитеки — CC BY-SA 4.0"


def _ws_version(set_name):
    rows = RD.read_set(set_name)
    last = max((r.get("timestamp") or "" for r in rows), default="")[:10]
    return f"Викитека, правки по {last}" if last else "Викитека"


def m_dal():
    entries = RD.dal()
    return dictionary({
        "id": "dal", "name": "Даль", "title": "Толковый словарь живого великорусского языка В. И. Даля (2-е изд., 1880–1882)",
        "language": "ru",
        "description": "Словарь Владимира Даля: статьи-гнёзда с толкованиями, примерами и пословицами; для производных "
                       "слов гнезда — отдельные статьи с отрывком («Благостыня» → из статьи «Благий»). В модуль вошли "
                       "слова, которые встречаются в Синодальном, церковнославянском и других русских переводах "
                       "(весь словарь — свыше 100 МБ). Орфография приведена к современной автоматически (ѣ, і, ъ, "
                       "-аго, приставки без-/из-/раз-), ударения сохранены.",
        "version": _ws_version("dal2"), "author": "В. И. Даль (1801–1872); электронный текст — участники Русской Викитеки",
        "source": "https://ru.wikisource.org/wiki/Толковый_словарь_Владимира_Даля (2-е издание, страницы сканов «Толковый словарь Даля (2-е издание)»)",
        "license": WS_LIC,
    }, entries)


def m_pbe():
    return dictionary({
        "id": "pbe", "name": "ПБЭ", "title": "Православная богословская энциклопедия (1900–1911), тт. 1–12",
        "language": "ru",
        "description": "«Православная богословская энциклопедия, или Богословский энциклопедический словарь» под ред. "
                       "А. П. Лопухина (тт. 1–6) и Н. Н. Глубоковского (тт. 7–12), буквы А — Константинопольская "
                       "церковь. Статьи, вычитанные на Викитеке (пока почти только тт. 1–2: А — Бытие), в современной "
                       "орфографии; взяты те, что находятся по словам русских переводов Библии. Ссылки на стихи — "
                       "в синодальной нумерации.",
        "version": _ws_version("pbe"), "author": "А. П. Лопухин, Н. Н. Глубоковский (ред.) и авторы статей; электронный текст — участники Русской Викитеки",
        "source": "https://ru.wikisource.org/wiki/Православная_богословская_энциклопедия",
        "license": WS_LIC, "versification": "synodal",
    }, RD.pbe())


def m_esbe_bible():
    return dictionary({
        "id": "esbe-bible", "name": "Брокгауз", "title": "Энциклопедический словарь Брокгауза и Ефрона: статьи к Библии",
        "language": "ru",
        "description": "Выборка из Энциклопедического словаря Брокгауза и Ефрона (1890–1907): статьи о библейских "
                       "лицах, местах, книгах и понятиях, богословии и Церкви — те, что находятся по словам русских "
                       "переводов Библии и имеют ссылки на Писание или библейскую тему. Весь словарь (≈120 тыс. "
                       "статей, ≈500 МБ) для чтения Библии не нужен.",
        "version": "Викитека, дамп " + RD.dump_date(), "author": "Ф. А. Брокгауз, И. А. Ефрон (изд.), авторы статей; электронный текст — участники Русской Викитеки",
        "source": "https://ru.wikisource.org/wiki/Энциклопедический_словарь_Брокгауза_и_Ефрона",
        "license": WS_LIC, "versification": "synodal",
    }, RD.esbe())


def m_eebe_bible():
    return dictionary({
        "id": "eebe-bible", "name": "Евр. энциклопедия", "title": "Еврейская энциклопедия Брокгауза и Ефрона (1906–1913): статьи к Библии",
        "language": "ru",
        "description": "Выборка из Еврейской энциклопедии Брокгауза и Ефрона: статьи о библейских лицах, местах, "
                       "обрядах и понятиях с ссылками на Писание, которые находятся по словам русских переводов. "
                       "Имена в заглавиях — часто в еврейской передаче; ссылки переведены в синодальную нумерацию "
                       "(названия книг — по еврейской Библии: I Сам. = 1 Цар., I Цар. = 3 Цар.).",
        "version": "Викитека, дамп " + RD.dump_date(), "author": "Л. Каценельсон, Д. Гинцбург (ред.), авторы статей; электронный текст — участники Русской Викитеки",
        "source": "https://ru.wikisource.org/wiki/Еврейская_энциклопедия_Брокгауза_и_Ефрона",
        "license": WS_LIC, "versification": "synodal",
    }, RD.eebe())


def _en_dict(mid, name, title, desc, author, sword):
    return dictionary({
        "id": mid, "name": name, "title": title, "language": "en", "description": desc,
        "version": f"CrossWire {sword} " + B.sword_version(sword), "author": author,
        "source": CW_SRC.format(sword), "license": "Public Domain",
    }, D.word_dictionary(sword))


def m_easton():
    return _en_dict("easton", "Easton", "Easton's Bible Dictionary (1897)",
                    "Библейский словарь М. Г. Истона (англ.), ~4 тыс. статей. Ищется по английскому слову (KJV, BSB). "
                    "Ссылки в тексте статей — в нумерации KJV.", "Matthew George Easton (1823–1894)", "Easton")


def m_smith():
    return _en_dict("smith", "Smith", "Smith's Bible Dictionary (1884)",
                    "Библейский словарь Уильяма Смита (англ.), ~4,5 тыс. статей. Ищется по английскому слову. "
                    "Ссылки в тексте статей — в нумерации KJV.", "William Smith (1813–1893)", "Smith")


def m_hitchcock():
    return _en_dict("hitchcock", "Hitchcock", "Hitchcock's Bible Names Dictionary (1869)",
                    "Значения библейских имён собственных по Р. Д. Хичкоку (англ.), ~2,6 тыс. имён.",
                    "Roswell D. Hitchcock (1817–1887)", "Hitchcock")


def m_nave():
    return _en_dict("nave", "Nave", "Nave's Topical Bible (1896)",
                    "Тематический указатель Орвилла Нейва (англ.): ~5 тыс. тем со списками мест Писания "
                    "(ссылки в нумерации KJV).", "Orville J. Nave (1841–1917)", "Nave")


def m_isbe():
    return _en_dict("isbe", "ISBE", "International Standard Bible Encyclopedia (1915)",
                    "Международная стандартная библейская энциклопедия под ред. Джеймса Орра (англ.), ~9 тыс. статей: "
                    "лица, места, понятия, обычаи, богословие. Ищется по английскому слову. Ссылки — в нумерации KJV.",
                    "James Orr (ред.), J. L. Nuelsen, E. Y. Mullins, M. O. Evans, M. G. Kyle", "ISBE")


def m_amtract():
    return _en_dict("amtract", "ATS", "American Tract Society Bible Dictionary (1859)",
                    "Библейский словарь Американского трактатного общества под ред. У. У. Рэнда (англ.), ~2,3 тыс. "
                    "статей. Ищется по английскому слову. Ссылки — в нумерации KJV.",
                    "W. W. Rand (ред.), American Tract Society", "AmTract")


def m_torrey():
    return _en_dict("torrey", "Torrey", "R. A. Torrey's New Topical Textbook (1897)",
                    "Тематический указатель Р. А. Торри (англ.): ~600 тем со списками мест Писания (нумерация KJV).",
                    "Reuben A. Torrey (1856–1928)", "Torrey")


def m_webster1828():
    d = _en_dict("webster1828", "Webster 1828", "Webster's American Dictionary of the English Language (1828)",
                 "Толковый словарь английского языка Ноя Уэбстера 1828 г. (англ.), ~62 тыс. слов — язык эпохи KJV; "
                 "многие статьи с примерами из Писания. Ищется по английскому слову.",
                 "Noah Webster (1758–1843); электронный текст — Akai Tsurugi (github.com/akaitsurugi/webster1828)",
                 "Webster1828")
    d["license"] = "CC BY-SA 4.0 (электронный текст Akai Tsurugi; словарь 1828 г. — Public Domain)"
    d["source"] += "; https://github.com/akaitsurugi/webster1828"
    return d


def m_abbott_smith():
    return dictionary({
        "id": "abbott-smith", "name": "Abbott-Smith", "title": "Abbott-Smith: A Manual Greek Lexicon of the New Testament (1922)",
        "language": "en",
        "description": "Греческо-английский словарь Нового Завета Дж. Эбботт-Смита по номерам Стронга: значения, "
                       "параллели в Септуагинте, синонимы. Открывается для слов с номерами Стронга (RST+, KJV, BSB, Byz).",
        "version": "CrossWire AbbottSmithStrongs " + B.sword_version("AbbottSmithStrongs"),
        "author": "George Abbott-Smith (1864–1947); электронный текст — Tyndale House / CrossWire",
        "source": CW_SRC.format("AbbottSmithStrongs"), "license": "Public Domain",
    }, D.abbott_smith(), kind="strongs")


def m_bdb():
    return dictionary({
        "id": "bdb-glosses", "name": "BDB", "title": "Brown–Driver–Briggs: краткие значения еврейских слов",
        "language": "en",
        "description": "Краткие значения из еврейско-английского словаря Брауна — Драйвера — Бриггса (1906) по "
                       "номерам Стронга (англ.). Дополняет словарь Стронга для Ветхого Завета.",
        "version": "CrossWire BDBGlosses_Strongs " + B.sword_version("BDBGlosses_Strongs"),
        "author": "F. Brown, S. R. Driver, C. A. Briggs; выборка значений — CrossWire",
        "source": CW_SRC.format("BDBGlosses_Strongs"), "license": "Public Domain",
    }, D.bdb_glosses(), kind="strongs")


# ---------------------------------------------------------------------------------------------
# Параллельные места
# ---------------------------------------------------------------------------------------------

def crossrefs(meta, refs):
    refs = C.sort_refs(refs)
    n = sum(len(v) for v in refs.values())
    meta["description"] = meta["description"].format(n=n, v=len(refs))
    return {**BASE, "type": "crossrefs", "versification": "synodal", **meta, "refs": refs}


def m_openbible():
    return crossrefs({
        "id": "xrefs-openbible", "name": "OpenBible", "title": "Параллельные места OpenBible.info", "language": "en",
        "description": "{n} ссылок для {v} стихов, упорядочены по голосам читателей (взяты ссылки с ≥1 голосом). "
                       "Основа — Treasury of Scripture Knowledge и др. Нумерация переведена в синодальную.",
        "version": "OpenBible.info cross references, 2026-10-12", "author": "OpenBible.info",
        "source": "https://www.openbible.info/labs/cross-references/",
        "license": "CC BY (OpenBible.info)",
    }, C.openbible())


def m_tsk():
    return crossrefs({
        "id": "xrefs-tsk", "name": "TSK", "title": "Treasury of Scripture Knowledge", "language": "en",
        "description": "Сокровищница библейских знаний (ок. 1880): {n} параллельных мест для {v} стихов. "
                       "Нумерация переведена в синодальную.",
        "version": "CrossWire TSK " + B.sword_version("TSK"), "author": "J. Canne, Browne, B. Blayney, T. Scott и др. (изд. S. Bagster)",
        "source": CW_SRC.format("TSK"), "license": "Public Domain",
    }, C.tsk())


# ---------------------------------------------------------------------------------------------
# Карты
# ---------------------------------------------------------------------------------------------

def m_maps():
    src = SRC / "wikimedia-maps"
    man = src / "manifest.json"
    if not man.exists():
        log("  карты: нет manifest.json — пропуск")
        return None
    items = json.loads(man.read_text(encoding="utf-8"))
    dest = OUT / "maps" / "bible-maps"
    if dest.exists():
        shutil.rmtree(dest)
    dest.mkdir(parents=True)
    maps = []
    for it in items:
        f = src / it["file"]
        if not f.exists():
            log("  карты: нет файла", f)
            continue
        assert f.stat().st_size <= 2_000_000, f"{f} больше 2 МБ"
        shutil.copyfile(f, dest / f.name)
        refs = [r for r in it.get("refs", []) if parse_osis_ref(r)]
        credit = f"{it.get('author') or 'автор не указан'}, {it['license']}, Wikimedia Commons: {it['commonsUrl']}"
        maps.append({
            "id": it["id"], "title": it["titleRu"],
            "description": (it.get("descriptionRu", "").strip() + "\n\nИсточник: " + credit).strip(),
            "image": (MAPS_BASE.rstrip("/") + "/" if MAPS_BASE else "") + f"modules/maps/bible-maps/{f.name}",
            "refs": refs,
        })
    lic = sorted({it["license"] for it in items})
    return {**BASE, "type": "maps", "id": "bible-maps", "name": "Карты", "title": "Библейские карты (Wikimedia Commons)",
            "language": "ru",
            "description": f"{len(maps)} карт библейских земель и событий из Wikimedia Commons. У каждой карты в "
                           f"описании — автор, лицензия и ссылка на оригинал.",
            "version": "1.0", "author": "Авторы карт указаны у каждой карты",
            "source": "https://commons.wikimedia.org (список файлов — data-src/extra/wikimedia-maps/manifest.json)",
            "license": "Разные свободные лицензии по картам: " + ", ".join(lic),
            "versification": "synodal", "maps": maps}


# ---------------------------------------------------------------------------------------------

BUILDERS = [m_kjv, m_bsb, m_oshb, m_byz, m_csl, m_makarij, m_kulish,
            m_lopukhin, m_mhcc, m_jfb, m_barnes,
            m_nikifor, m_dal, m_pbe, m_esbe_bible, m_eebe_bible,
            m_easton, m_smith, m_hitchcock, m_nave, m_isbe, m_amtract, m_torrey, m_webster1828,
            m_abbott_smith, m_bdb,
            m_openbible, m_tsk, m_maps]

BUILDER_IDS = {"m_kjv": ["kjv"], "m_bsb": ["bsb"], "m_oshb": ["oshb"], "m_byz": ["byz-rp2018"],
               "m_csl": ["csl-elizabeth"], "m_makarij": ["rus-makarij"], "m_kulish": ["ukr-kulish"],
               "m_lopukhin": ["lopukhin"], "m_mhcc": ["mhcc"], "m_jfb": ["jfb"],
               "m_barnes": ["barnes"], "m_nikifor": ["nikifor"], "m_dal": ["dal"],
               "m_pbe": ["pbe"], "m_esbe_bible": ["esbe-bible"], "m_eebe_bible": ["eebe-bible"], "m_easton": ["easton"],
               "m_smith": ["smith"], "m_hitchcock": ["hitchcock"], "m_nave": ["nave"], "m_isbe": ["isbe"],
               "m_amtract": ["amtract"], "m_torrey": ["torrey"], "m_webster1828": ["webster1828"],
               "m_abbott_smith": ["abbott-smith"], "m_bdb": ["bdb-glosses"], "m_openbible": ["xrefs-openbible"],
               "m_tsk": ["xrefs-tsk"], "m_maps": ["bible-maps"]}


def main(argv):
    sys.stdout.reconfigure(errors="replace")
    want = set(argv)
    unpack_crosswire()
    entries = []
    for fn in BUILDERS + [_sword_comm_builder(r) for r in SWORD_COMMENTARIES] + _world_builders():
        ids = BUILDER_IDS[fn.__name__]
        if want and not want.intersection(ids):
            continue
        log(f"{fn.__name__[2:]}…")
        res = fn()
        for mod in (res if isinstance(res, list) else [res] if res else []):
            check_module(mod)
            entries.append(write_module(mod))
    merge_catalog(entries, in_place=bool(want))


# ---------------------------------------------------------------------------------------------
# Проверка по правилам src/core/schema.js
# ---------------------------------------------------------------------------------------------

OSIS_VERSE = re.compile(r"^[1-4]?[A-Za-z]+\.\d+\.\d+(-(\d+\.)?\d+)?$")
XREF_KEY = re.compile(r"^[1-3]?[A-Za-z]+\.\d+\.\d+$")


def check_module(m):
    for k in ("format", "formatVersion", "type", "id", "name", "license", "source"):
        assert m.get(k), f"{m.get('id')}: нет поля {k}"
    assert re.fullmatch(r"[a-z0-9-]+", m["id"]), m["id"]
    t = m["type"]
    if t == "bible":
        seen = set()
        for b in m["books"]:
            assert b["id"] not in seen
            seen.add(b["id"])
            assert b["id"] in BOOK_BY_ID or (b.get("name") and b.get("short") and b.get("t") == "AP"), b["id"]
            assert all(isinstance(v, str) for ch in b["chapters"] for v in ch)
            for ch in b["chapters"]:
                for v in ch:
                    assert v.count("{") == v.count("}"), (m["id"], b["id"], v[:80])
    elif t == "commentary":
        bad = [k for k in m["entries"] if not OSIS_VERSE.match(k)]
        assert not bad, (m["id"], bad[:5])
    elif t == "crossrefs":
        bad = [k for k in m["refs"] if not XREF_KEY.match(k)]
        bad += [r for v in m["refs"].values() for r in v if not parse_osis_ref(r)]
        assert not bad, (m["id"], bad[:5])
    elif t == "dictionary":
        if m["dictionaryKind"] == "strongs":
            assert all(re.fullmatch(r"[HG]\d+[a-z]?", k) for k in m["entries"])
        for e in m["entries"].values():
            for r in e.get("refs", []):
                assert parse_osis_ref(r), r
    elif t == "maps":
        for mp in m["maps"]:
            img = mp["image"]
            assert re.match(r"^(https?:|data:image/)", img) or (
                re.fullmatch(r"[\w./-]+\.(jpe?g|png|webp|gif|svg)", img, re.I) and ".." not in img), img


if __name__ == "__main__":
    main(sys.argv[1:])
