"""Планы чтения Библии для приложения → public/plans/*.json и public/plans/index.json.

Запуск (нужен public/modules/rst.json — его собирает build_data.py):
  python -I scripts/build_plans.py

Скрипт идемпотентный: при одинаковых входных данных пишет байт-в-байт одинаковые файлы.

Формат ссылки в плане (поле readings — по дню массив ссылок, нумерация СИНОДАЛЬНАЯ, коды книг OSIS):
  «Gen.1»        — глава целиком;
  «Ps.118.1-24»  — стихи 1–24 одной главы;
  «Zech.13.1»    — один стих.
Ссылки в дне идут в порядке чтения; диапазоны через границу главы не используются.

Планы:
  mcheyne     — Роберт Мюррей М'Чейн, «Daily Bread» (1842, Public Domain). Список по дням ниже (MCHEYNE_KJV)
                взят из модуля CrossWire «MCheyne» 1.4 (github.com/DavidHaslam/MCheyne-Daily-Bread-SWORD,
                файл mcheyne.imp.txt) и сверен по всем 365 дням с github.com/willswire/mcheyne
                (App/PlanConstants.swift). Расхождений два, оба решены в пользу оригинала 1842 г.:
                  • 11 мая: «Isa 9:8-21» (в CrossWire опечатка «9:7-21» — стих 9:7 читается накануне);
                  • 8 августа: Иер 45 читается вместе с Иер 36 (так у М'Чейна: обе главы — 4-й год Иоакима);
                    CrossWire в версии 1.3 перенёс её к Иер 44 (16 августа), сочтя опечаткой.
                Список хранится в нумерации KJV и переводится в синодальную функцией kjv_to_synodal().
  bible-year  — 66 канонических книг подряд (синодальный порядок книг), 365 дней, главы целиком,
                дни выровнены по числу стихов.
  nt-90       — Новый Завет за 90 дней (выравнивание по стихам).
  ps-prov-31  — Псалтирь (150 псалмов) и Притчи за 31 день: в день N — Притчи N и группа псалмов подряд.
  gospels-30  — четыре Евангелия за 30 дней (выравнивание по стихам).

Хронологический план не делаем: не найден план с открытой лицензией (PD/CC) — известные годовые
хронологические планы (Tyndale «One Year Chronological», Blue Letter Bible, G. Guthrie «Read the Bible
for Life» и др.) защищены авторским правом или не указывают лицензию.
"""
import json
import re
import sys
from collections import Counter
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):          # консоль Windows (cp1251) не должна ронять вывод
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "plans"
BOOKS = json.loads((ROOT / "src" / "core" / "books.json").read_text(encoding="utf-8"))
CANON = [b["id"] for b in BOOKS if not b.get("dc")]          # 66 книг в синодальном порядке
NT = [b["id"] for b in BOOKS if b["t"] == "NT"]
GOSPELS = ["Matt", "Mark", "Luke", "John"]


def load_verse_counts():
    """Число стихов в каждой главе (синодальная нумерация) по модулю RST."""
    rst = json.loads((ROOT / "public" / "modules" / "rst.json").read_text(encoding="utf-8"))
    assert rst["versification"] == "synodal"
    vc = {b["id"]: [len(ch) for ch in b["chapters"]] for b in rst["books"]}
    missing = [b for b in CANON if b not in vc]
    assert not missing, f"в rst.json нет книг: {missing}"
    assert len(vc["Ps"]) == 150, "в каноническом RST должно быть 150 псалмов (Пс 151 — в rst-dc)"
    return vc


VC = load_verse_counts()


# =============================================================================================
# План М'Чейна
# =============================================================================================

# Нумерация KJV. Строка: «ММ.ДД чтение | чтение | чтение | чтение» (семейное утро, семейное вечер,
# личное утро, личное вечер); внутри чтения ссылки через запятую. 29 февраля у М'Чейна нет.
MCHEYNE_KJV = """
01.01 Gen.1 | Matt.1 | Ezra.1 | Acts.1
01.02 Gen.2 | Matt.2 | Ezra.2 | Acts.2
01.03 Gen.3 | Matt.3 | Ezra.3 | Acts.3
01.04 Gen.4 | Matt.4 | Ezra.4 | Acts.4
01.05 Gen.5 | Matt.5 | Ezra.5 | Acts.5
01.06 Gen.6 | Matt.6 | Ezra.6 | Acts.6
01.07 Gen.7 | Matt.7 | Ezra.7 | Acts.7
01.08 Gen.8 | Matt.8 | Ezra.8 | Acts.8
01.09 Gen.9, Gen.10 | Matt.9 | Ezra.9 | Acts.9
01.10 Gen.11 | Matt.10 | Ezra.10 | Acts.10
01.11 Gen.12 | Matt.11 | Neh.1 | Acts.11
01.12 Gen.13 | Matt.12 | Neh.2 | Acts.12
01.13 Gen.14 | Matt.13 | Neh.3 | Acts.13
01.14 Gen.15 | Matt.14 | Neh.4 | Acts.14
01.15 Gen.16 | Matt.15 | Neh.5 | Acts.15
01.16 Gen.17 | Matt.16 | Neh.6 | Acts.16
01.17 Gen.18 | Matt.17 | Neh.7 | Acts.17
01.18 Gen.19 | Matt.18 | Neh.8 | Acts.18
01.19 Gen.20 | Matt.19 | Neh.9 | Acts.19
01.20 Gen.21 | Matt.20 | Neh.10 | Acts.20
01.21 Gen.22 | Matt.21 | Neh.11 | Acts.21
01.22 Gen.23 | Matt.22 | Neh.12 | Acts.22
01.23 Gen.24 | Matt.23 | Neh.13 | Acts.23
01.24 Gen.25 | Matt.24 | Esth.1 | Acts.24
01.25 Gen.26 | Matt.25 | Esth.2 | Acts.25
01.26 Gen.27 | Matt.26 | Esth.3 | Acts.26
01.27 Gen.28 | Matt.27 | Esth.4 | Acts.27
01.28 Gen.29 | Matt.28 | Esth.5 | Acts.28
01.29 Gen.30 | Mark.1 | Esth.6 | Rom.1
01.30 Gen.31 | Mark.2 | Esth.7 | Rom.2
01.31 Gen.32 | Mark.3 | Esth.8 | Rom.3
02.01 Gen.33 | Mark.4 | Esth.9, Esth.10 | Rom.4
02.02 Gen.34 | Mark.5 | Job.1 | Rom.5
02.03 Gen.35, Gen.36 | Mark.6 | Job.2 | Rom.6
02.04 Gen.37 | Mark.7 | Job.3 | Rom.7
02.05 Gen.38 | Mark.8 | Job.4 | Rom.8
02.06 Gen.39 | Mark.9 | Job.5 | Rom.9
02.07 Gen.40 | Mark.10 | Job.6 | Rom.10
02.08 Gen.41 | Mark.11 | Job.7 | Rom.11
02.09 Gen.42 | Mark.12 | Job.8 | Rom.12
02.10 Gen.43 | Mark.13 | Job.9 | Rom.13
02.11 Gen.44 | Mark.14 | Job.10 | Rom.14
02.12 Gen.45 | Mark.15 | Job.11 | Rom.15
02.13 Gen.46 | Mark.16 | Job.12 | Rom.16
02.14 Gen.47 | Luke.1.1-38 | Job.13 | 1Cor.1
02.15 Gen.48 | Luke.1.39-80 | Job.14 | 1Cor.2
02.16 Gen.49 | Luke.2 | Job.15 | 1Cor.3
02.17 Gen.50 | Luke.3 | Job.16, Job.17 | 1Cor.4
02.18 Exod.1 | Luke.4 | Job.18 | 1Cor.5
02.19 Exod.2 | Luke.5 | Job.19 | 1Cor.6
02.20 Exod.3 | Luke.6 | Job.20 | 1Cor.7
02.21 Exod.4 | Luke.7 | Job.21 | 1Cor.8
02.22 Exod.5 | Luke.8 | Job.22 | 1Cor.9
02.23 Exod.6 | Luke.9 | Job.23 | 1Cor.10
02.24 Exod.7 | Luke.10 | Job.24 | 1Cor.11
02.25 Exod.8 | Luke.11 | Job.25, Job.26 | 1Cor.12
02.26 Exod.9 | Luke.12 | Job.27 | 1Cor.13
02.27 Exod.10 | Luke.13 | Job.28 | 1Cor.14
02.28 Exod.11, Exod.12.1-21 | Luke.14 | Job.29 | 1Cor.15
03.01 Exod.12.22-51 | Luke.15 | Job.30 | 1Cor.16
03.02 Exod.13 | Luke.16 | Job.31 | 2Cor.1
03.03 Exod.14 | Luke.17 | Job.32 | 2Cor.2
03.04 Exod.15 | Luke.18 | Job.33 | 2Cor.3
03.05 Exod.16 | Luke.19 | Job.34 | 2Cor.4
03.06 Exod.17 | Luke.20 | Job.35 | 2Cor.5
03.07 Exod.18 | Luke.21 | Job.36 | 2Cor.6
03.08 Exod.19 | Luke.22 | Job.37 | 2Cor.7
03.09 Exod.20 | Luke.23 | Job.38 | 2Cor.8
03.10 Exod.21 | Luke.24 | Job.39 | 2Cor.9
03.11 Exod.22 | John.1 | Job.40 | 2Cor.10
03.12 Exod.23 | John.2 | Job.41 | 2Cor.11
03.13 Exod.24 | John.3 | Job.42 | 2Cor.12
03.14 Exod.25 | John.4 | Prov.1 | 2Cor.13
03.15 Exod.26 | John.5 | Prov.2 | Gal.1
03.16 Exod.27 | John.6 | Prov.3 | Gal.2
03.17 Exod.28 | John.7 | Prov.4 | Gal.3
03.18 Exod.29 | John.8 | Prov.5 | Gal.4
03.19 Exod.30 | John.9 | Prov.6 | Gal.5
03.20 Exod.31 | John.10 | Prov.7 | Gal.6
03.21 Exod.32 | John.11 | Prov.8 | Eph.1
03.22 Exod.33 | John.12 | Prov.9 | Eph.2
03.23 Exod.34 | John.13 | Prov.10 | Eph.3
03.24 Exod.35 | John.14 | Prov.11 | Eph.4
03.25 Exod.36 | John.15 | Prov.12 | Eph.5
03.26 Exod.37 | John.16 | Prov.13 | Eph.6
03.27 Exod.38 | John.17 | Prov.14 | Phil.1
03.28 Exod.39 | John.18 | Prov.15 | Phil.2
03.29 Exod.40 | John.19 | Prov.16 | Phil.3
03.30 Lev.1 | John.20 | Prov.17 | Phil.4
03.31 Lev.2, Lev.3 | John.21 | Prov.18 | Col.1
04.01 Lev.4 | Ps.1, Ps.2 | Prov.19 | Col.2
04.02 Lev.5 | Ps.3, Ps.4 | Prov.20 | Col.3
04.03 Lev.6 | Ps.5, Ps.6 | Prov.21 | Col.4
04.04 Lev.7 | Ps.7, Ps.8 | Prov.22 | 1Thess.1
04.05 Lev.8 | Ps.9 | Prov.23 | 1Thess.2
04.06 Lev.9 | Ps.10 | Prov.24 | 1Thess.3
04.07 Lev.10 | Ps.11, Ps.12 | Prov.25 | 1Thess.4
04.08 Lev.11, Lev.12 | Ps.13, Ps.14 | Prov.26 | 1Thess.5
04.09 Lev.13 | Ps.15, Ps.16 | Prov.27 | 2Thess.1
04.10 Lev.14 | Ps.17 | Prov.28 | 2Thess.2
04.11 Lev.15 | Ps.18 | Prov.29 | 2Thess.3
04.12 Lev.16 | Ps.19 | Prov.30 | 1Tim.1
04.13 Lev.17 | Ps.20, Ps.21 | Prov.31 | 1Tim.2
04.14 Lev.18 | Ps.22 | Eccl.1 | 1Tim.3
04.15 Lev.19 | Ps.23, Ps.24 | Eccl.2 | 1Tim.4
04.16 Lev.20 | Ps.25 | Eccl.3 | 1Tim.5
04.17 Lev.21 | Ps.26, Ps.27 | Eccl.4 | 1Tim.6
04.18 Lev.22 | Ps.28, Ps.29 | Eccl.5 | 2Tim.1
04.19 Lev.23 | Ps.30 | Eccl.6 | 2Tim.2
04.20 Lev.24 | Ps.31 | Eccl.7 | 2Tim.3
04.21 Lev.25 | Ps.32 | Eccl.8 | 2Tim.4
04.22 Lev.26 | Ps.33 | Eccl.9 | Titus.1
04.23 Lev.27 | Ps.34 | Eccl.10 | Titus.2
04.24 Num.1 | Ps.35 | Eccl.11 | Titus.3
04.25 Num.2 | Ps.36 | Eccl.12 | Phlm.1
04.26 Num.3 | Ps.37 | Song.1 | Heb.1
04.27 Num.4 | Ps.38 | Song.2 | Heb.2
04.28 Num.5 | Ps.39 | Song.3 | Heb.3
04.29 Num.6 | Ps.40, Ps.41 | Song.4 | Heb.4
04.30 Num.7 | Ps.42, Ps.43 | Song.5 | Heb.5
05.01 Num.8 | Ps.44 | Song.6 | Heb.6
05.02 Num.9 | Ps.45 | Song.7 | Heb.7
05.03 Num.10 | Ps.46, Ps.47 | Song.8 | Heb.8
05.04 Num.11 | Ps.48 | Isa.1 | Heb.9
05.05 Num.12, Num.13 | Ps.49 | Isa.2 | Heb.10
05.06 Num.14 | Ps.50 | Isa.3, Isa.4 | Heb.11
05.07 Num.15 | Ps.51 | Isa.5 | Heb.12
05.08 Num.16 | Ps.52, Ps.53, Ps.54 | Isa.6 | Heb.13
05.09 Num.17, Num.18 | Ps.55 | Isa.7 | Jas.1
05.10 Num.19 | Ps.56, Ps.57 | Isa.8, Isa.9.1-7 | Jas.2
05.11 Num.20 | Ps.58, Ps.59 | Isa.9.8-21, Isa.10.1-4 | Jas.3
05.12 Num.21 | Ps.60, Ps.61 | Isa.10.5-34 | Jas.4
05.13 Num.22 | Ps.62, Ps.63 | Isa.11, Isa.12 | Jas.5
05.14 Num.23 | Ps.64, Ps.65 | Isa.13 | 1Pet.1
05.15 Num.24 | Ps.66, Ps.67 | Isa.14 | 1Pet.2
05.16 Num.25 | Ps.68 | Isa.15 | 1Pet.3
05.17 Num.26 | Ps.69 | Isa.16 | 1Pet.4
05.18 Num.27 | Ps.70, Ps.71 | Isa.17, Isa.18 | 1Pet.5
05.19 Num.28 | Ps.72 | Isa.19, Isa.20 | 2Pet.1
05.20 Num.29 | Ps.73 | Isa.21 | 2Pet.2
05.21 Num.30 | Ps.74 | Isa.22 | 2Pet.3
05.22 Num.31 | Ps.75, Ps.76 | Isa.23 | 1John.1
05.23 Num.32 | Ps.77 | Isa.24 | 1John.2
05.24 Num.33 | Ps.78.1-37 | Isa.25 | 1John.3
05.25 Num.34 | Ps.78.38-72 | Isa.26 | 1John.4
05.26 Num.35 | Ps.79 | Isa.27 | 1John.5
05.27 Num.36 | Ps.80 | Isa.28 | 2John.1
05.28 Deut.1 | Ps.81, Ps.82 | Isa.29 | 3John.1
05.29 Deut.2 | Ps.83, Ps.84 | Isa.30 | Jude.1
05.30 Deut.3 | Ps.85 | Isa.31 | Rev.1
05.31 Deut.4 | Ps.86, Ps.87 | Isa.32 | Rev.2
06.01 Deut.5 | Ps.88 | Isa.33 | Rev.3
06.02 Deut.6 | Ps.89 | Isa.34 | Rev.4
06.03 Deut.7 | Ps.90 | Isa.35 | Rev.5
06.04 Deut.8 | Ps.91 | Isa.36 | Rev.6
06.05 Deut.9 | Ps.92, Ps.93 | Isa.37 | Rev.7
06.06 Deut.10 | Ps.94 | Isa.38 | Rev.8
06.07 Deut.11 | Ps.95, Ps.96 | Isa.39 | Rev.9
06.08 Deut.12 | Ps.97, Ps.98 | Isa.40 | Rev.10
06.09 Deut.13, Deut.14 | Ps.99, Ps.100, Ps.101 | Isa.41 | Rev.11
06.10 Deut.15 | Ps.102 | Isa.42 | Rev.12
06.11 Deut.16 | Ps.103 | Isa.43 | Rev.13
06.12 Deut.17 | Ps.104 | Isa.44 | Rev.14
06.13 Deut.18 | Ps.105 | Isa.45 | Rev.15
06.14 Deut.19 | Ps.106 | Isa.46 | Rev.16
06.15 Deut.20 | Ps.107 | Isa.47 | Rev.17
06.16 Deut.21 | Ps.108, Ps.109 | Isa.48 | Rev.18
06.17 Deut.22 | Ps.110, Ps.111 | Isa.49 | Rev.19
06.18 Deut.23 | Ps.112, Ps.113 | Isa.50 | Rev.20
06.19 Deut.24 | Ps.114, Ps.115 | Isa.51 | Rev.21
06.20 Deut.25 | Ps.116 | Isa.52 | Rev.22
06.21 Deut.26 | Ps.117, Ps.118 | Isa.53 | Matt.1
06.22 Deut.27, Deut.28.1-19 | Ps.119.1-24 | Isa.54 | Matt.2
06.23 Deut.28.20-68 | Ps.119.25-48 | Isa.55 | Matt.3
06.24 Deut.29 | Ps.119.49-72 | Isa.56 | Matt.4
06.25 Deut.30 | Ps.119.73-96 | Isa.57 | Matt.5
06.26 Deut.31 | Ps.119.97-120 | Isa.58 | Matt.6
06.27 Deut.32 | Ps.119.121-144 | Isa.59 | Matt.7
06.28 Deut.33, Deut.34 | Ps.119.145-176 | Isa.60 | Matt.8
06.29 Josh.1 | Ps.120, Ps.121, Ps.122 | Isa.61 | Matt.9
06.30 Josh.2 | Ps.123, Ps.124, Ps.125 | Isa.62 | Matt.10
07.01 Josh.3 | Ps.126, Ps.127, Ps.128 | Isa.63 | Matt.11
07.02 Josh.4 | Ps.129, Ps.130, Ps.131 | Isa.64 | Matt.12
07.03 Josh.5, Josh.6.1-5 | Ps.132, Ps.133, Ps.134 | Isa.65 | Matt.13
07.04 Josh.6.6-27 | Ps.135, Ps.136 | Isa.66 | Matt.14
07.05 Josh.7 | Ps.137, Ps.138 | Jer.1 | Matt.15
07.06 Josh.8 | Ps.139 | Jer.2 | Matt.16
07.07 Josh.9 | Ps.140, Ps.141 | Jer.3 | Matt.17
07.08 Josh.10 | Ps.142, Ps.143 | Jer.4 | Matt.18
07.09 Josh.11 | Ps.144 | Jer.5 | Matt.19
07.10 Josh.12, Josh.13 | Ps.145 | Jer.6 | Matt.20
07.11 Josh.14, Josh.15 | Ps.146, Ps.147 | Jer.7 | Matt.21
07.12 Josh.16, Josh.17 | Ps.148 | Jer.8 | Matt.22
07.13 Josh.18, Josh.19 | Ps.149, Ps.150 | Jer.9 | Matt.23
07.14 Josh.20, Josh.21 | Acts.1 | Jer.10 | Matt.24
07.15 Josh.22 | Acts.2 | Jer.11 | Matt.25
07.16 Josh.23 | Acts.3 | Jer.12 | Matt.26
07.17 Josh.24 | Acts.4 | Jer.13 | Matt.27
07.18 Judg.1 | Acts.5 | Jer.14 | Matt.28
07.19 Judg.2 | Acts.6 | Jer.15 | Mark.1
07.20 Judg.3 | Acts.7 | Jer.16 | Mark.2
07.21 Judg.4 | Acts.8 | Jer.17 | Mark.3
07.22 Judg.5 | Acts.9 | Jer.18 | Mark.4
07.23 Judg.6 | Acts.10 | Jer.19 | Mark.5
07.24 Judg.7 | Acts.11 | Jer.20 | Mark.6
07.25 Judg.8 | Acts.12 | Jer.21 | Mark.7
07.26 Judg.9 | Acts.13 | Jer.22 | Mark.8
07.27 Judg.10, Judg.11.1-11 | Acts.14 | Jer.23 | Mark.9
07.28 Judg.11.12-40 | Acts.15 | Jer.24 | Mark.10
07.29 Judg.12 | Acts.16 | Jer.25 | Mark.11
07.30 Judg.13 | Acts.17 | Jer.26 | Mark.12
07.31 Judg.14 | Acts.18 | Jer.27 | Mark.13
08.01 Judg.15 | Acts.19 | Jer.28 | Mark.14
08.02 Judg.16 | Acts.20 | Jer.29 | Mark.15
08.03 Judg.17 | Acts.21 | Jer.30, Jer.31 | Mark.16
08.04 Judg.18 | Acts.22 | Jer.32 | Ps.1, Ps.2
08.05 Judg.19 | Acts.23 | Jer.33 | Ps.3, Ps.4
08.06 Judg.20 | Acts.24 | Jer.34 | Ps.5, Ps.6
08.07 Judg.21 | Acts.25 | Jer.35 | Ps.7, Ps.8
08.08 Ruth.1 | Acts.26 | Jer.36, Jer.45 | Ps.9
08.09 Ruth.2 | Acts.27 | Jer.37 | Ps.10
08.10 Ruth.3, Ruth.4 | Acts.28 | Jer.38 | Ps.11, Ps.12
08.11 1Sam.1 | Rom.1 | Jer.39 | Ps.13, Ps.14
08.12 1Sam.2 | Rom.2 | Jer.40 | Ps.15, Ps.16
08.13 1Sam.3 | Rom.3 | Jer.41 | Ps.17
08.14 1Sam.4 | Rom.4 | Jer.42 | Ps.18
08.15 1Sam.5, 1Sam.6 | Rom.5 | Jer.43 | Ps.19
08.16 1Sam.7, 1Sam.8 | Rom.6 | Jer.44 | Ps.20, Ps.21
08.17 1Sam.9 | Rom.7 | Jer.46 | Ps.22
08.18 1Sam.10 | Rom.8 | Jer.47 | Ps.23, Ps.24
08.19 1Sam.11 | Rom.9 | Jer.48 | Ps.25
08.20 1Sam.12 | Rom.10 | Jer.49 | Ps.26, Ps.27
08.21 1Sam.13 | Rom.11 | Jer.50 | Ps.28, Ps.29
08.22 1Sam.14 | Rom.12 | Jer.51 | Ps.30
08.23 1Sam.15 | Rom.13 | Jer.52 | Ps.31
08.24 1Sam.16 | Rom.14 | Lam.1 | Ps.32
08.25 1Sam.17 | Rom.15 | Lam.2 | Ps.33
08.26 1Sam.18 | Rom.16 | Lam.3 | Ps.34
08.27 1Sam.19 | 1Cor.1 | Lam.4 | Ps.35
08.28 1Sam.20 | 1Cor.2 | Lam.5 | Ps.36
08.29 1Sam.21, 1Sam.22 | 1Cor.3 | Ezek.1 | Ps.37
08.30 1Sam.23 | 1Cor.4 | Ezek.2 | Ps.38
08.31 1Sam.24 | 1Cor.5 | Ezek.3 | Ps.39
09.01 1Sam.25 | 1Cor.6 | Ezek.4 | Ps.40, Ps.41
09.02 1Sam.26 | 1Cor.7 | Ezek.5 | Ps.42, Ps.43
09.03 1Sam.27 | 1Cor.8 | Ezek.6 | Ps.44
09.04 1Sam.28 | 1Cor.9 | Ezek.7 | Ps.45
09.05 1Sam.29, 1Sam.30 | 1Cor.10 | Ezek.8 | Ps.46, Ps.47
09.06 1Sam.31 | 1Cor.11 | Ezek.9 | Ps.48
09.07 2Sam.1 | 1Cor.12 | Ezek.10 | Ps.49
09.08 2Sam.2 | 1Cor.13 | Ezek.11 | Ps.50
09.09 2Sam.3 | 1Cor.14 | Ezek.12 | Ps.51
09.10 2Sam.4, 2Sam.5 | 1Cor.15 | Ezek.13 | Ps.52, Ps.53, Ps.54
09.11 2Sam.6 | 1Cor.16 | Ezek.14 | Ps.55
09.12 2Sam.7 | 2Cor.1 | Ezek.15 | Ps.56, Ps.57
09.13 2Sam.8, 2Sam.9 | 2Cor.2 | Ezek.16 | Ps.58, Ps.59
09.14 2Sam.10 | 2Cor.3 | Ezek.17 | Ps.60, Ps.61
09.15 2Sam.11 | 2Cor.4 | Ezek.18 | Ps.62, Ps.63
09.16 2Sam.12 | 2Cor.5 | Ezek.19 | Ps.64, Ps.65
09.17 2Sam.13 | 2Cor.6 | Ezek.20 | Ps.66, Ps.67
09.18 2Sam.14 | 2Cor.7 | Ezek.21 | Ps.68
09.19 2Sam.15 | 2Cor.8 | Ezek.22 | Ps.69
09.20 2Sam.16 | 2Cor.9 | Ezek.23 | Ps.70, Ps.71
09.21 2Sam.17 | 2Cor.10 | Ezek.24 | Ps.72
09.22 2Sam.18 | 2Cor.11 | Ezek.25 | Ps.73
09.23 2Sam.19 | 2Cor.12 | Ezek.26 | Ps.74
09.24 2Sam.20 | 2Cor.13 | Ezek.27 | Ps.75, Ps.76
09.25 2Sam.21 | Gal.1 | Ezek.28 | Ps.77
09.26 2Sam.22 | Gal.2 | Ezek.29 | Ps.78.1-37
09.27 2Sam.23 | Gal.3 | Ezek.30 | Ps.78.38-72
09.28 2Sam.24 | Gal.4 | Ezek.31 | Ps.79
09.29 1Kgs.1 | Gal.5 | Ezek.32 | Ps.80
09.30 1Kgs.2 | Gal.6 | Ezek.33 | Ps.81, Ps.82
10.01 1Kgs.3 | Eph.1 | Ezek.34 | Ps.83, Ps.84
10.02 1Kgs.4, 1Kgs.5 | Eph.2 | Ezek.35 | Ps.85
10.03 1Kgs.6 | Eph.3 | Ezek.36 | Ps.86
10.04 1Kgs.7 | Eph.4 | Ezek.37 | Ps.87, Ps.88
10.05 1Kgs.8 | Eph.5 | Ezek.38 | Ps.89
10.06 1Kgs.9 | Eph.6 | Ezek.39 | Ps.90
10.07 1Kgs.10 | Phil.1 | Ezek.40 | Ps.91
10.08 1Kgs.11 | Phil.2 | Ezek.41 | Ps.92, Ps.93
10.09 1Kgs.12 | Phil.3 | Ezek.42 | Ps.94
10.10 1Kgs.13 | Phil.4 | Ezek.43 | Ps.95, Ps.96
10.11 1Kgs.14 | Col.1 | Ezek.44 | Ps.97, Ps.98
10.12 1Kgs.15 | Col.2 | Ezek.45 | Ps.99, Ps.100, Ps.101
10.13 1Kgs.16 | Col.3 | Ezek.46 | Ps.102
10.14 1Kgs.17 | Col.4 | Ezek.47 | Ps.103
10.15 1Kgs.18 | 1Thess.1 | Ezek.48 | Ps.104
10.16 1Kgs.19 | 1Thess.2 | Dan.1 | Ps.105
10.17 1Kgs.20 | 1Thess.3 | Dan.2 | Ps.106
10.18 1Kgs.21 | 1Thess.4 | Dan.3 | Ps.107
10.19 1Kgs.22 | 1Thess.5 | Dan.4 | Ps.108, Ps.109
10.20 2Kgs.1 | 2Thess.1 | Dan.5 | Ps.110, Ps.111
10.21 2Kgs.2 | 2Thess.2 | Dan.6 | Ps.112, Ps.113
10.22 2Kgs.3 | 2Thess.3 | Dan.7 | Ps.114, Ps.115
10.23 2Kgs.4 | 1Tim.1 | Dan.8 | Ps.116
10.24 2Kgs.5 | 1Tim.2 | Dan.9 | Ps.117, Ps.118
10.25 2Kgs.6 | 1Tim.3 | Dan.10 | Ps.119.1-24
10.26 2Kgs.7 | 1Tim.4 | Dan.11 | Ps.119.25-48
10.27 2Kgs.8 | 1Tim.5 | Dan.12 | Ps.119.49-72
10.28 2Kgs.9 | 1Tim.6 | Hos.1 | Ps.119.73-96
10.29 2Kgs.10 | 2Tim.1 | Hos.2 | Ps.119.97-120
10.30 2Kgs.11, 2Kgs.12 | 2Tim.2 | Hos.3, Hos.4 | Ps.119.121-144
10.31 2Kgs.13 | 2Tim.3 | Hos.5, Hos.6 | Ps.119.145-176
11.01 2Kgs.14 | 2Tim.4 | Hos.7 | Ps.120, Ps.121, Ps.122
11.02 2Kgs.15 | Titus.1 | Hos.8 | Ps.123, Ps.124, Ps.125
11.03 2Kgs.16 | Titus.2 | Hos.9 | Ps.126, Ps.127, Ps.128
11.04 2Kgs.17 | Titus.3 | Hos.10 | Ps.129, Ps.130, Ps.131
11.05 2Kgs.18 | Phlm.1 | Hos.11 | Ps.132, Ps.133, Ps.134
11.06 2Kgs.19 | Heb.1 | Hos.12 | Ps.135, Ps.136
11.07 2Kgs.20 | Heb.2 | Hos.13 | Ps.137, Ps.138
11.08 2Kgs.21 | Heb.3 | Hos.14 | Ps.139
11.09 2Kgs.22 | Heb.4 | Joel.1 | Ps.140, Ps.141
11.10 2Kgs.23 | Heb.5 | Joel.2 | Ps.142
11.11 2Kgs.24 | Heb.6 | Joel.3 | Ps.143
11.12 2Kgs.25 | Heb.7 | Amos.1 | Ps.144
11.13 1Chr.1, 1Chr.2 | Heb.8 | Amos.2 | Ps.145
11.14 1Chr.3, 1Chr.4 | Heb.9 | Amos.3 | Ps.146, Ps.147
11.15 1Chr.5, 1Chr.6 | Heb.10 | Amos.4 | Ps.148, Ps.149, Ps.150
11.16 1Chr.7, 1Chr.8 | Heb.11 | Amos.5 | Luke.1.1-38
11.17 1Chr.9, 1Chr.10 | Heb.12 | Amos.6 | Luke.1.39-80
11.18 1Chr.11, 1Chr.12 | Heb.13 | Amos.7 | Luke.2
11.19 1Chr.13, 1Chr.14 | Jas.1 | Amos.8 | Luke.3
11.20 1Chr.15 | Jas.2 | Amos.9 | Luke.4
11.21 1Chr.16 | Jas.3 | Obad.1 | Luke.5
11.22 1Chr.17 | Jas.4 | Jonah.1 | Luke.6
11.23 1Chr.18 | Jas.5 | Jonah.2 | Luke.7
11.24 1Chr.19, 1Chr.20 | 1Pet.1 | Jonah.3 | Luke.8
11.25 1Chr.21 | 1Pet.2 | Jonah.4 | Luke.9
11.26 1Chr.22 | 1Pet.3 | Mic.1 | Luke.10
11.27 1Chr.23 | 1Pet.4 | Mic.2 | Luke.11
11.28 1Chr.24, 1Chr.25 | 1Pet.5 | Mic.3 | Luke.12
11.29 1Chr.26, 1Chr.27 | 2Pet.1 | Mic.4 | Luke.13
11.30 1Chr.28 | 2Pet.2 | Mic.5 | Luke.14
12.01 1Chr.29 | 2Pet.3 | Mic.6 | Luke.15
12.02 2Chr.1 | 1John.1 | Mic.7 | Luke.16
12.03 2Chr.2 | 1John.2 | Nah.1 | Luke.17
12.04 2Chr.3, 2Chr.4 | 1John.3 | Nah.2 | Luke.18
12.05 2Chr.5, 2Chr.6.1-11 | 1John.4 | Nah.3 | Luke.19
12.06 2Chr.6.12-42 | 1John.5 | Hab.1 | Luke.20
12.07 2Chr.7 | 2John.1 | Hab.2 | Luke.21
12.08 2Chr.8 | 3John.1 | Hab.3 | Luke.22
12.09 2Chr.9 | Jude.1 | Zeph.1 | Luke.23
12.10 2Chr.10 | Rev.1 | Zeph.2 | Luke.24
12.11 2Chr.11, 2Chr.12 | Rev.2 | Zeph.3 | John.1
12.12 2Chr.13 | Rev.3 | Hag.1 | John.2
12.13 2Chr.14, 2Chr.15 | Rev.4 | Hag.2 | John.3
12.14 2Chr.16 | Rev.5 | Zech.1 | John.4
12.15 2Chr.17 | Rev.6 | Zech.2 | John.5
12.16 2Chr.18 | Rev.7 | Zech.3 | John.6
12.17 2Chr.19, 2Chr.20 | Rev.8 | Zech.4 | John.7
12.18 2Chr.21 | Rev.9 | Zech.5 | John.8
12.19 2Chr.22, 2Chr.23 | Rev.10 | Zech.6 | John.9
12.20 2Chr.24 | Rev.11 | Zech.7 | John.10
12.21 2Chr.25 | Rev.12 | Zech.8 | John.11
12.22 2Chr.26 | Rev.13 | Zech.9 | John.12
12.23 2Chr.27, 2Chr.28 | Rev.14 | Zech.10 | John.13
12.24 2Chr.29 | Rev.15 | Zech.11 | John.14
12.25 2Chr.30 | Rev.16 | Zech.12, Zech.13.1 | John.15
12.26 2Chr.31 | Rev.17 | Zech.13.2-9 | John.16
12.27 2Chr.32 | Rev.18 | Zech.14 | John.17
12.28 2Chr.33 | Rev.19 | Mal.1 | John.18
12.29 2Chr.34 | Rev.20 | Mal.2 | John.19
12.30 2Chr.35 | Rev.21 | Mal.3 | John.20
12.31 2Chr.36 | Rev.22 | Mal.4 | John.21
"""

# Псалтирь: KJV (еврейская нумерация) → синодальная (греческая). Значение — список (глава, стихи|None).
# Пс 9–10 KJV = Пс 9 син. (KJV 9:1–20 → 9:2–21, надписание — 9:1); Пс 114–115 KJV = Пс 113 син.;
# Пс 116 KJV = Пс 114–115 син.; Пс 147 KJV = Пс 146–147 син. Проверено по таблице SWORD canon_synodal.h.
def ps_kjv_to_syn(p):
    if p <= 8 or p >= 148:
        return [(p, None)]
    if p == 9:
        return [(9, (1, 21))]
    if p == 10:
        return [(9, (22, 39))]
    if p == 114:
        return [(113, (1, 8))]
    if p == 115:
        return [(113, (9, 26))]
    if p == 116:
        return [(114, None), (115, None)]
    if p == 147:
        return [(146, None), (147, None)]
    return [(p - 1, None)]


# Части глав, у которых синодальная нумерация стихов отличается от KJV (по таблице SWORD):
# в синодальном Нав 5:16 = KJV Нав 6:1, поэтому Нав 6 сдвинута на один стих.
PARTIAL_KJV_TO_SYN = {
    ("Josh", 6, 1, 5): [("Josh", 5, (16, 16)), ("Josh", 6, (1, 4))],
    ("Josh", 6, 6, 27): [("Josh", 6, (5, 26))],
}
# Части глав без сдвига (сверено с таблицей SWORD): номера стихов совпадают.
PARTIAL_SAME = {("Luke", 1), ("Exod", 12), ("Isa", 9), ("Isa", 10), ("Deut", 28), ("Judg", 11),
                ("2Chr", 6), ("Zech", 13)}
# Последний стих глав KJV, которые М'Чейн делит на части (для проверки оригинала)
KJV_LAST_VERSE = {("Luke", 1): 80, ("Exod", 12): 51, ("Isa", 9): 21, ("Isa", 10): 34, ("Ps", 78): 72,
                  ("Deut", 28): 68, ("Ps", 119): 176, ("Josh", 6): 27, ("Judg", 11): 40, ("2Chr", 6): 42,
                  ("Zech", 13): 9}


def parse_ref(s):
    """«Gen.1» → (book, c, None); «Luke.1.1-38» → (book, c, (1, 38)); «Zech.13.1» → (book, c, (1, 1))."""
    m = re.fullmatch(r"([1-3]?[A-Za-z]+)\.(\d+)(?:\.(\d+)(?:-(\d+))?)?", s.strip())
    assert m, f"не разобрана ссылка {s!r}"
    bk, c, v1, v2 = m.groups()
    assert bk in VC, f"неизвестная книга {bk!r}"
    if v1 is None:
        return bk, int(c), None
    return bk, int(c), (int(v1), int(v2 or v1))


def fmt_ref(bk, c, vr):
    if vr is None or vr == (1, VC[bk][c - 1]):
        return f"{bk}.{c}"
    if vr[0] == vr[1]:
        return f"{bk}.{c}.{vr[0]}"
    return f"{bk}.{c}.{vr[0]}-{vr[1]}"


def kjv_to_synodal(bk, c, vr):
    """Одна ссылка KJV → список синодальных (book, chapter, (v1, v2)|None)."""
    if bk == "Ps":
        parts = ps_kjv_to_syn(c)
        if vr is None:
            return [("Ps", sc, svr) for sc, svr in parts]
        assert len(parts) == 1 and parts[0][1] is None, f"часть псалма с перенумерацией: Ps {c}"
        return [("Ps", parts[0][0], vr)]        # Пс 78 и 119 KJV: номера стихов совпадают (77, 118 син.)
    if vr is None:
        return [(bk, c, None)]                  # главы целиком — по номеру главы
    if (bk, c, *vr) in PARTIAL_KJV_TO_SYN:
        return PARTIAL_KJV_TO_SYN[(bk, c, *vr)]
    assert (bk, c) in PARTIAL_SAME, f"нет правила для части главы {bk} {c}:{vr}"
    return [(bk, c, vr)]


def merge_day(refs):
    """Склеивает соседние части одной главы и убирает части, уже покрытые главой целиком."""
    out = []
    for bk, c, vr in refs:
        full = (1, VC[bk][c - 1])
        vr = vr or full
        if out and out[-1][0] == bk and out[-1][1] == c:
            a = out[-1][2]
            if a[0] <= vr[0] <= a[1] + 1:
                out[-1] = (bk, c, (a[0], max(a[1], vr[1])))
                continue
        if any(o[0] == bk and o[1] == c and o[2][0] <= vr[0] and vr[1] <= o[2][1] for o in out):
            continue
        out.append((bk, c, vr))
    return [fmt_ref(*r) for r in out]


def mcheyne_source():
    days = []
    for line in MCHEYNE_KJV.strip().splitlines():
        date, rest = line.split(" ", 1)
        groups = [[parse_ref(x) for x in g.split(",")] for g in rest.split("|")]
        assert len(groups) == 4, date
        days.append((date, groups))
    return days


def verse_coverage(days_refs):
    """Счётчик покрытия каждого стиха: (book, c, v) → сколько раз читается."""
    cov = Counter()
    for refs in days_refs:
        for r in refs:
            bk, c, vr = parse_ref(r) if isinstance(r, str) else r
            lo, hi = vr or (1, VC[bk][c - 1])
            for v in range(lo, hi + 1):
                cov[(bk, c, v)] += 1
    return cov


def check_mcheyne(src, readings):
    # 1) Оригинал (KJV): каждая глава — целиком или частями, без пропусков и наложений;
    #    ВЗ (кроме Псалтири) — один раз, Псалтирь и НЗ — дважды.
    parts = {}
    for _, groups in src:
        for g in groups:
            for bk, c, vr in g:
                parts.setdefault((bk, c), []).append(vr)
    errors = []
    for bk in CANON:
        want = 2 if bk == "Ps" or bk in NT else 1
        for c in range(1, len(VC[bk]) + 1):
            p = parts.get((bk, c), [])
            whole = sum(1 for x in p if x is None)
            pieces = sorted(x for x in p if x is not None)
            got = whole
            if pieces:
                last = KJV_LAST_VERSE[(bk, c)]
                cov = Counter(v for lo, hi in pieces for v in range(lo, hi + 1))
                n = set(cov.values())
                if set(cov) != set(range(1, last + 1)) or len(n) != 1:
                    errors.append(f"KJV {bk} {c}: части {pieces} не покрывают 1–{last} равномерно")
                got += n.pop() if len(n) == 1 else 0
            if got != want:
                errors.append(f"KJV {bk} {c}: читается {got} раз(а), ожидалось {want}")
    extra = set(parts) - {(bk, c) for bk in CANON for c in range(1, len(VC[bk]) + 1)}
    errors += [f"KJV: лишняя глава {x}" for x in sorted(extra)]
    # 2) Синодальный результат: каждый стих RST ВЗ (кроме Псалтири) — 1 раз, Псалтирь и НЗ — 2 раза.
    cov = verse_coverage(readings)
    bad = 0
    for bk in CANON:
        want = 2 if bk == "Ps" or bk in NT else 1
        for c, n in enumerate(VC[bk], 1):
            for v in range(1, n + 1):
                if cov.get((bk, c, v), 0) != want:
                    bad += 1
                    if bad <= 10:
                        errors.append(f"син. {bk} {c}:{v} читается {cov.get((bk, c, v), 0)} раз(а), ожидалось {want}")
    assert not errors, "Ошибки плана М'Чейна:\n  " + "\n  ".join(errors)
    n_ch = sum(len(VC[b]) for b in CANON)
    print(f"  М'Чейн: {len(readings)} дней; оригинал KJV и синодальный результат — каждая из {n_ch} глав "
          f"и каждый из {sum(cov.values())} прочтений стихов на месте (ВЗ ×1, Псалтирь и НЗ ×2)")


def check_with_sword(src):
    """Дополнительная сверка с таблицей SWORD (scripts/extra_lib.py), если её исходники скачаны."""
    try:
        sys.path.insert(0, str(ROOT / "scripts"))
        from extra_lib import kjv2syn  # noqa: E402
    except Exception as e:  # исходники SWORD — в data-src/extra (не в git)
        print(f"  (сверка с таблицей SWORD пропущена: {type(e).__name__})")
        return
    last_kjv = {9: 20, 10: 18, 114: 8, 115: 18, 116: 19, 147: 20}   # последние стихи «делимых» псалмов KJV
    checked = 0
    for _, groups in src:
        for g in groups:
            for bk, c, vr in g:
                if bk != "Ps" and vr is None:
                    continue                    # главы целиком вне Псалтири переносим по номеру главы
                mine = kjv_to_synodal(bk, c, vr)
                syn = set()
                for b2, c2, vr2 in mine:
                    lo, hi = vr2 or (1, VC[b2][c2 - 1])
                    syn |= {(b2, c2, v) for v in range(lo, hi + 1)}
                if vr is None:                  # псалом целиком: первый (и последний) стих
                    verses = [1] + ([last_kjv[c]] if c in last_kjv else [])
                else:
                    verses = range(vr[0], vr[1] + 1)
                got = {kjv2syn(bk, c, v) for v in verses}
                assert got <= syn, f"расхождение с SWORD: {bk} {c}:{vr} → {mine}; SWORD {sorted(got - syn)}"
                if vr is not None:
                    assert got == syn, f"расхождение с SWORD: {bk} {c}:{vr} → {mine}; SWORD {sorted(got)}"
                checked += 1
    print(f"  сверка с таблицей SWORD (canon_synodal.h): {checked} ссылок с перенумерацией — совпадают")


def build_mcheyne():
    src = mcheyne_source()
    readings = []
    for _, groups in src:
        refs = [s for g in groups for r in g for s in kjv_to_synodal(*r)]
        readings.append(merge_day(refs))
    check_mcheyne(src, readings)
    check_with_sword(src)
    return {
        "id": "mcheyne",
        "name": "План М'Чейна",
        "description": "Классический план Роберта Мюррея М'Чейна (1842): четыре чтения в день. "
                       "За год — Ветхий Завет один раз, Новый Завет и Псалтирь дважды. "
                       "План привязан к календарю: день 1 — 1 января, на 29 февраля чтений нет.",
        "days": len(readings),
        "calendar": True,
        "versification": "synodal",
        "source": "Robert Murray M'Cheyne, «Daily Bread» (Данди, 1842). Список — модуль CrossWire MCheyne 1.4 "
                  "(https://github.com/DavidHaslam/MCheyne-Daily-Bread-SWORD), сверен с "
                  "https://github.com/willswire/mcheyne; нумерация переведена в синодальную.",
        "license": "Public Domain",
        "readings": readings,
    }


# =============================================================================================
# Генерируемые планы: главы подряд, дни выровнены по числу стихов
# =============================================================================================

def chapters_of(books):
    return [(bk, c, VC[bk][c - 1]) for bk in books for c in range(1, len(VC[bk]) + 1)]


def partition(weights, k):
    """Делит последовательность весов на k непрерывных непустых групп так, чтобы сумма квадратов
    отклонений от среднего была минимальной (динамическое программирование). Возвращает границы."""
    n = len(weights)
    assert n >= k
    target = sum(weights) / k
    pre = [0]
    for w in weights:
        pre.append(pre[-1] + w)
    INF = float("inf")
    # максимальная длина группы: столько глав, сколько помещается в 3 средних дня (но не меньше 1)
    max_len = 1
    j = 0
    for i in range(1, n + 1):
        while pre[i] - pre[j] > 3 * target and i - j > 1:
            j += 1
        max_len = max(max_len, i - j)
    prev = [INF] * (n + 1)
    prev[0] = 0.0
    back = []
    for g in range(1, k + 1):
        cur = [INF] * (n + 1)
        arg = [0] * (n + 1)
        lo, hi = g, n - (k - g)
        for i in range(lo, hi + 1):
            best, bj = INF, 0
            for j in range(max(g - 1, i - max_len), i):
                p = prev[j]
                if p == INF:
                    continue
                d = pre[i] - pre[j] - target
                v = p + d * d
                if v < best:
                    best, bj = v, j
            cur[i], arg[i] = best, bj
        back.append(arg)
        prev = cur
    bounds = [n]
    i = n
    for g in range(k, 0, -1):
        i = back[g - 1][i]
        bounds.append(i)
    bounds.reverse()
    return bounds


def even_plan(books, days):
    chs = chapters_of(books)
    b = partition([w for _, _, w in chs], days)
    readings = [[f"{bk}.{c}" for bk, c, _ in chs[b[i]:b[i + 1]]] for i in range(days)]
    loads = [sum(w for _, _, w in chs[b[i]:b[i + 1]]) for i in range(days)]
    assert [r for d in readings for r in d] == [f"{bk}.{c}" for bk, c, _ in chs]
    print(f"    {len(chs)} глав, {sum(loads)} стихов; в день {min(loads)}–{max(loads)} стихов "
          f"(в среднем {sum(loads) / days:.1f})")
    return readings


def build_generated():
    plans = []
    print("  Библия за год:")
    plans.append({
        "id": "bible-year", "name": "Библия за год",
        "description": "66 канонических книг подряд в синодальном порядке за 365 дней. "
                       "Главы читаются целиком, объём дней выровнен по числу стихов (около 85 стихов в день).",
        "readings": even_plan(CANON, 365)})
    print("  Новый Завет за 90 дней:")
    plans.append({
        "id": "nt-90", "name": "Новый Завет за 90 дней",
        "description": "Весь Новый Завет подряд (синодальный порядок книг) за 90 дней, "
                       "главы целиком, дни выровнены по числу стихов.",
        "readings": even_plan(NT, 90)})
    # Псалтирь и Притчи: Притчи N в день N, Псалтирь делится на 31 непрерывную часть по стихам
    print("  Псалтирь и Притчи за месяц:")
    ps = even_plan(["Ps"], 31)
    prov = [f"Prov.{c}" for c in range(1, len(VC["Prov"]) + 1)]
    assert len(prov) == 31
    plans.append({
        "id": "ps-prov-31", "name": "Псалтирь и Притчи за месяц",
        "description": "31 день: каждый день — несколько псалмов подряд (вся Псалтирь, 150 псалмов) "
                       "и одна глава Притчей по числу дня.",
        "readings": [p + [q] for p, q in zip(ps, prov)]})
    print("  Евангелия за 30 дней:")
    plans.append({
        "id": "gospels-30", "name": "Евангелия за 30 дней",
        "description": "Четыре Евангелия подряд — от Матфея, Марка, Луки и Иоанна — за 30 дней, "
                       "главы целиком, дни выровнены по числу стихов.",
        "readings": even_plan(GOSPELS, 30)})
    for p in plans:
        p["days"] = len(p["readings"])
        p["versification"] = "synodal"
        p["source"] = "Сгенерировано scripts/build_plans.py по тексту RST (число стихов в главах)"
        p["license"] = "Public Domain"
    return plans


# =============================================================================================
# Запись
# =============================================================================================

KEY_ORDER = ("id", "name", "description", "days", "calendar", "versification", "source", "license", "readings")


def dump_plan(plan):
    """JSON с одной строкой на день — удобно читать и сравнивать в git."""
    head = {k: plan[k] for k in KEY_ORDER if k in plan and k != "readings"}
    lines = [json.dumps(head, ensure_ascii=False, indent=2)[:-2] + ","]
    lines.append('  "readings": [')
    days = [json.dumps(d, ensure_ascii=False) for d in plan["readings"]]
    lines.append(",\n".join("    " + d for d in days))
    lines.append("  ]\n}\n")
    return "\n".join(lines)


def write(path, text):
    path.parent.mkdir(parents=True, exist_ok=True)
    old = path.read_text(encoding="utf-8") if path.exists() else None
    if old != text:
        path.write_text(text, encoding="utf-8", newline="\n")
        print(f"  записан {path.relative_to(ROOT)}")
    else:
        print(f"  без изменений {path.relative_to(ROOT)}")


def main():
    print("Планы чтения:")
    plans = [build_mcheyne()] + build_generated()
    for p in plans:
        for d, refs in enumerate(p["readings"], 1):
            assert refs, f"{p['id']}: пустой день {d}"
            for r in refs:
                parse_ref(r)
        assert p["days"] == len(p["readings"])
        json.loads(dump_plan(p))                # формат корректен
        write(OUT / f"{p['id']}.json", dump_plan(p))
    index = {
        "_doc": "Список планов чтения. readings в файле плана — по дню массив ссылок в синодальной нумерации: "
                "«Gen.1» — глава, «Ps.118.1-24» — стихи одной главы, «Zech.13.1» — стих. "
                "calendar: true — день N плана соответствует N-му дню невисокосного года (29 февраля пропускается). "
                "Файлы собирает scripts/build_plans.py.",
        "plans": [{"id": p["id"], "name": p["name"], "description": p["description"], "days": p["days"],
                   "file": f"{p['id']}.json"} for p in plans],
    }
    write(OUT / "index.json", json.dumps(index, ensure_ascii=False, indent=2) + "\n")


if __name__ == "__main__":
    main()
