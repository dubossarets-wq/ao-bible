#!/usr/bin/env python3
"""Аудиомодули AO Bible (type: "audio"): записи глав + время начала каждого стиха.

Источники (только явно свободные лицензии, аудиофайлы на наш сайт НЕ кладём — в модуле прямые
ссылки на archive.org):

  rst  — «Синодальный перевод (1876) — полная аудиозапись», Hexapla
         https://archive.org/details/hexapla-audio-synodal-1876 (Public Domain Mark 1.0).
         Синтез речи (Fun-CosyVoice3), по mp3 на главу. У каждой главы есть файл-спутник со временем
         начала стихов — берём его, сверив число стихов с нашим rst.json. Главы, где число стихов
         не совпало (вставки по LXX в Притч 4/13/18, Нав 24, Дан 3), выравниваем сами.
  kjv  — LibriVox «Bible (KJV), Complete», чтец Michael Armenta
         https://librivox.org/bible-complete-king-james-version/ (Public Domain).
         Файлы по 1 ч на несколько глав; времена стихов получаем принудительным выравниванием
         текста kjv.json с записью.

Выравнивание: torchaudio MMS_FA (wav2vec2, обучена на 1100+ языках, латиница; русский текст
транслитерируем). Между стихами — «звёздочка» (*), которая поглощает всё, чего нет в тексте:
объявления LibriVox, «Глава третья», лишние стихи. Работает на CUDA, если есть, иначе на CPU.

Запуск (из корня проекта; torch/torchaudio — в .pylib-audio, см. ниже):
  python -I scripts/build_audio.py rst                 # русский модуль целиком (+ выравнивание 5 глав)
  python -I scripts/build_audio.py kjv --books John    # английский: выровнять книги (по умолчанию — Евангелия)
  python -I scripts/build_audio.py verify-rst John.3 Ps.22   # сверить разметку Hexapla с нашим выравниванием
  python -I scripts/build_audio.py catalog             # только обновить catalog.json по готовым модулям
Установка библиотек (один раз):
  python -m pip install --target .pylib-audio torch==2.7.1 torchaudio==2.7.1 numpy==2.2.6 \
      --index-url https://download.pytorch.org/whl/cu128 --extra-index-url https://pypi.org/simple

Идемпотентно: скачанное (проверка md5), эмиссии модели и результаты выравнивания кешируются
в data-src/audio/… (папка в .gitignore); повторный запуск только пересобирает JSON.
"""
import argparse
import gzip
import hashlib
import json
import os
import re
import subprocess
import sys
import time
import unicodedata
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "modules"
DATA = ROOT / "data-src" / "audio"
PYLIB = ROOT / ".pylib-audio"
ALIGN_VERSION = 13  # меняется — кеш выравнивания пересчитывается
RST_ALIGN_VERSION = 10  # то же для Hexapla (последние правки касались только пропусков в записи — у синтеза их нет)
WWJD_ALIGN_VERSION = 12  # то же для записей wwjdru
STAR_LOGP = float(os.environ.get("AOB_STAR_LOGP", "-0.05"))  # log p «звёздочки» на кадр
MIN_SCORE = 0.15  # средняя вероятность букв стиха ниже — стих в записи не найден (пропущен/сжат)
UA = "AO-Bible-audio-builder/1.0 (+https://github.com/)"

# Протестантский порядок 66 книг (так нумерует Hexapla: 0 = Бытие … 65 = Откровение)
PROT = ("Gen Exod Lev Num Deut Josh Judg Ruth 1Sam 2Sam 1Kgs 2Kgs 1Chr 2Chr Ezra Neh Esth Job Ps Prov "
        "Eccl Song Isa Jer Lam Ezek Dan Hos Joel Amos Obad Jonah Mic Nah Hab Zeph Hag Zech Mal Matt Mark "
        "Luke John Acts Rom 1Cor 2Cor Gal Eph Phil Col 1Thess 2Thess 1Tim 2Tim Titus Phlm Heb Jas 1Pet "
        "2Pet 1John 2John 3John Jude Rev").split()
# Названия книг у LibriVox (в заголовках разделов «John Ch. 1 - 8»)
LV_NAMES = {"Song of Solomon": "Song", "Phillipians": "Phil", "Philippians": "Phil", "Psalms": "Ps", "Psalm": "Ps"}
EN_NAMES = dict(zip(
    ["Genesis", "Exodus", "Leviticus", "Numbers", "Deuteronomy", "Joshua", "Judges", "Ruth", "1 Samuel", "2 Samuel",
     "1 Kings", "2 Kings", "1 Chronicles", "2 Chronicles", "Ezra", "Nehemiah", "Esther", "Job", "Psalms", "Proverbs",
     "Ecclesiastes", "Song of Solomon", "Isaiah", "Jeremiah", "Lamentations", "Ezekiel", "Daniel", "Hosea", "Joel",
     "Amos", "Obadiah", "Jonah", "Micah", "Nahum", "Habakkuk", "Zephaniah", "Haggai", "Zechariah", "Malachi",
     "Matthew", "Mark", "Luke", "John", "Acts", "Romans", "1 Corinthians", "2 Corinthians", "Galatians", "Ephesians",
     "Philippians", "Colossians", "1 Thessalonians", "2 Thessalonians", "1 Timothy", "2 Timothy", "Titus", "Philemon",
     "Hebrews", "James", "1 Peter", "2 Peter", "1 John", "2 John", "3 John", "Jude", "Revelation"], PROT))
EN_NAMES.update(LV_NAMES)
GOSPELS = ["Matt", "Mark", "Luke", "John"]


def log(*a):
    print(*a, flush=True)


# --- Сеть и файлы ----------------------------------------------------------------------------------

def http_get(url, dest=None, md5=None, retries=4):
    """Скачивает URL (в память или в файл dest). Файл с совпадающим md5 повторно не качается."""
    if dest is not None:
        dest = Path(dest)
        if dest.exists() and (md5 is None or file_md5(dest) == md5):
            return dest
        dest.parent.mkdir(parents=True, exist_ok=True)
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=120) as r:
                if dest is None:
                    return r.read()
                part = dest.with_name(dest.name + ".part")
                with open(part, "wb") as f:
                    while True:
                        b = r.read(1 << 20)
                        if not b:
                            break
                        f.write(b)
            if md5 and file_md5(part) != md5:
                raise IOError(f"md5 не совпал: {url}")
            os.replace(part, dest)
            return dest
        except Exception as e:  # noqa: BLE001 — сеть archive.org иногда рвётся
            if attempt == retries - 1:
                raise
            log(f"  повтор ({e}): {url}")
            time.sleep(3 * (attempt + 1))


def file_md5(p):
    h = hashlib.md5()
    with open(p, "rb") as f:
        for b in iter(lambda: f.read(1 << 20), b""):
            h.update(b)
    return h.hexdigest()


def cached_json(url, path, max_age_days=30):
    path = Path(path)
    if path.exists() and time.time() - path.stat().st_mtime < max_age_days * 86400:
        return json.loads(path.read_text(encoding="utf-8"))
    data = json.loads(http_get(url))
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    return data


def ia_files(item):
    md = cached_json(f"https://archive.org/metadata/{item}", DATA / "meta" / f"{item}.json")
    return md, {f["name"]: f for f in md["files"]}


def length_sec(s):
    """'63:19' / '1:02:03' / '288.62' → секунды."""
    if s is None:
        return None
    if ":" in str(s):
        t = 0.0
        for part in str(s).split(":"):
            t = t * 60 + float(part)
        return t
    return float(s)


def load_wav(path):
    """Декодирует запись через ffmpeg в 16 кГц моно float32."""
    import numpy as np
    raw = subprocess.run(["ffmpeg", "-v", "error", "-nostdin", "-i", str(path), "-ac", "1", "-ar", "16000",
                          "-f", "f32le", "-"], check=True, capture_output=True).stdout
    return np.frombuffer(raw, dtype=np.float32).copy()


# --- Текст -------------------------------------------------------------------------------------------

STRONG_RE = re.compile(r"\{([^{}|]*)\|[^{}]*\}")
RU = {"а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "е": "e", "ё": "e", "ж": "zh", "з": "z", "и": "i",
      "й": "i", "к": "k", "л": "l", "м": "m", "н": "n", "о": "o", "п": "p", "р": "r", "с": "s", "т": "t",
      "у": "u", "ф": "f", "х": "kh", "ц": "ts", "ч": "ch", "ш": "sh", "щ": "shch", "ъ": "", "ы": "y", "ь": "",
      "э": "e", "ю": "yu", "я": "ya", "і": "i", "ѣ": "e", "ѳ": "f", "ѵ": "i"}


def plain(v):
    """Снимает разметку модулей: {слово|H123}, ‹курсив›, [скобки]."""
    v = STRONG_RE.sub(r"\1", v)
    return re.sub(r"[‹›\[\]]", "", v)


def romanize(text):
    """Текст стиха → строка латиницы a-z и ' (алфавит MMS_FA); слова через пробел."""
    t = plain(text).lower().replace("’", "'").replace("ʼ", "'")
    t = "".join(RU.get(c, c) for c in t)
    t = unicodedata.normalize("NFKD", t)
    t = "".join(c for c in t if not unicodedata.combining(c))
    words = [w.strip("'") for w in re.findall(r"[a-z']+", t)]
    return " ".join(w for w in words if w)


def load_bible(mid):
    d = json.loads((OUT / f"{mid}.json").read_text(encoding="utf-8"))
    return {b["id"]: b["chapters"] for b in d["books"]}


# --- Выравнивание ---------------------------------------------------------------------------------

class Aligner:
    """MMS_FA + torchaudio.functional.forced_align. Эмиссии считаются кусками по 30 с с полями 2 с."""
    SR = 16000
    HOP = 320  # 20 мс на кадр
    FPS = 50

    def __init__(self):
        if PYLIB.exists():
            sys.path.insert(0, str(PYLIB))
        os.environ.setdefault("TORCH_HOME", str(DATA / "models"))
        import torch
        import torchaudio
        self.torch, self.F = torch, torchaudio.functional
        self.dev = "cuda" if torch.cuda.is_available() else "cpu"
        bundle = torchaudio.pipelines.MMS_FA
        self.model = bundle.get_model(with_star=False).to(self.dev).eval()
        self.dict = bundle.get_dict(star=None)
        self.star = len(self.dict)  # своя колонка «*» с log p = 0
        log(f"  выравнивание: MMS_FA на {self.dev}")

    def tokens(self, text):
        """Текст стиха → токены. Между предложениями и частями стиха (. ; : ! ? –) ставится «*»:
        внутри стиха чтец может читать то, чего нет в нашем тексте (добавления по LXX у Hexapla),
        и без звёздочки такая вставка «съедает» соседние слова."""
        out = []
        for part in re.split(r"[.;:!?–—()]+", plain(text)):
            tk = [self.dict[c] for c in romanize(part).replace(" ", "") if c in self.dict]
            if tk:
                if out:
                    out.append(self.star)
                out += tk
        return out

    def emission(self, wav, cache=None):
        import numpy as np
        if cache and Path(cache).exists():
            return self.torch.from_numpy(np.load(cache).astype(np.float32))
        torch = self.torch
        chunk, ctx = 30 * self.SR, 2 * self.SR
        out = []
        with torch.inference_mode():
            for s in range(0, len(wav), chunk):
                a, b = max(0, s - ctx), min(len(wav), s + chunk + ctx)
                x = torch.from_numpy(wav[a:b]).unsqueeze(0).to(self.dev)
                em, _ = self.model(x)
                em = torch.log_softmax(em[0], dim=-1).float().cpu()
                off = (s - a) // self.HOP
                n = (min(len(wav), s + chunk) - s) // self.HOP
                out.append(em[off:off + n])
        em = torch.cat(out)
        em = torch.cat([em, torch.zeros(em.shape[0], 1)], dim=1)  # колонка звёздочки
        if cache:
            Path(cache).parent.mkdir(parents=True, exist_ok=True)
            np.save(cache, em.numpy().astype(np.float16))
        return em

    def _align(self, em, groups, f0, f1):
        """groups — списки токенов стихов. Возвращает [(кадр начала, кадр конца, средняя вероятность)]."""
        torch = self.torch
        # Две «звёздочки»: по краям окна — бесплатная (вступление, начало следующей главы), между стихами и
        # частями стиха — с небольшим штрафом за кадр, чтобы текст не «расползался» по похожей речи дальше
        # (переписи, родословия, Числ 1 и 7: одинаковые формулы в соседних стихах).
        edge, inner = self.star, self.star + 1
        targets, idx = [edge], []
        for k, g in enumerate(groups):
            idx.append((len(targets), len(targets) + len(g)))
            targets += [inner if x == self.star else x for x in g]
            targets.append(inner if k < len(groups) - 1 else edge)
        e = em[f0:f1]
        e = torch.cat([e[:, :self.star], torch.zeros(e.shape[0], 1), torch.full((e.shape[0], 1), STAR_LOGP)], 1)
        e = e.unsqueeze(0).to(self.dev)
        t = torch.tensor([targets], dtype=torch.int32, device=self.dev)
        ali, sc = self.F.forced_align(e, t, blank=0)
        spans = self.F.merge_tokens(ali[0].cpu(), sc[0].exp().cpu())
        assert len(spans) == len(targets), (len(spans), len(targets))
        res, gap = [], int(0.8 * self.FPS)
        for a, b in idx:
            ss = [x for x in spans[a:b] if x.token < self.star]
            # CTC может «растянуть» первую букву стиха на чужую речь перед ним (вступление, «Глава 1»):
            # если после первой-второй буквы разрыв > 0,8 с, начало стиха — после него.
            # То же для последних букв (конец стиха).
            i0 = 0
            for k in range(1, min(3, len(ss))):
                if ss[k].start - ss[k - 1].end > gap:
                    i0 = k
            i1 = len(ss) - 1
            for k in range(len(ss) - 1, max(0, len(ss) - 3), -1):
                if ss[k].start - ss[k - 1].end > gap:
                    i1 = k - 1
            if i1 < i0:
                i0, i1 = 0, len(ss) - 1
            res.append((f0 + ss[i0].start, f0 + ss[i1].end, sum(s.score for s in ss) / len(ss)))
        return res

    def align_stream(self, em, verses, first_margin_s=120, group_letters=2500, max_gap_s=None):
        """verses — [(ключ, токены)] в порядке чтения. Выравнивает группами по ~group_letters букв,
        окно каждой группы — от конца предыдущей. max_gap_s — для живого чтения: стих, начавшийся дальше
        этого от конца предыдущего, считается «перескочившим» (чтец пропустил текст).
        Возвращает {ключ: (t_начала, t_конца, оценка)}."""
        T = em.shape[0]
        total = sum(len(t) for _, t in verses)
        rate = max(total / T, 0.05)  # букв на кадр (оценка темпа)
        res = {}

        def run(i, pos, first):
            """Выравнивает группу стихов с i-го от кадра pos. Возвращает (j, результаты) или (j, None)."""
            j, n = i, 0
            while j < len(verses) and (n < group_letters or j == i):
                n += len(verses[j][1])
                j += 1
            if len(verses) - j <= 3:  # хвост не оставляем крошечным
                j = len(verses)
                n = sum(len(t) for _, t in verses[i:j])
            margin = (first_margin_s if first else 30) * self.FPS
            span = int(n / rate * 1.5) + margin
            need = n + sum(1 for _, t in verses[i:j] for a, b in zip(t, t[1:]) if a == b) + (j - i) + 1
            if T - pos < need:
                return j, None
            best = None
            for attempt in range(5):
                f1 = min(T, pos + span)
                if f1 - pos < need:
                    f1 = min(T, pos + need * 2)
                r = self._align(em, [t for _, t in verses[i:j]], pos, f1)
                score = sum(x[2] for x in r) / len(r)
                if best is None or score > best[0]:
                    best = (score, r)
                if f1 >= T or (r[-1][1] < f1 - 3 * self.FPS and score >= 0.6):
                    break
                # текст упёрся в край окна или совпал плохо (в записи длинная вставка) — расширяем окно
                span *= 3
            return j, best[1]

        def mean3(r, m=0):
            x = [y[2] for y in r[m:m + 3]]
            return sum(x) / len(x)

        gap = max_gap_s * self.FPS if max_gap_s else None

        def bad(r, m, pos=None, first=False):  # с m-го стиха текст и запись перестали совпадать
            if r[m][2] < 0.35 and mean3(r, m) < 0.45:
                return True
            if gap:
                prev_end = r[m - 1][1] if m else (None if first else pos)
                return prev_end is not None and r[m][0] - prev_end > gap
            return False

        pos, i, first = 0, 0, True
        while i < len(verses):
            j, r = run(i, pos, first)
            if r is None:  # записи не хватает на оставшийся текст — дальше не размечаем
                log(f"  ! не хватило записи на {len(verses) - i} стихов, начиная с {verses[i][0]}")
                break
            if bad(r, 0, pos, first):
                # Чтец пропустил кусок текста (так бывает: 2 Цар 19:17–35 у LibriVox нет) — ищем, через
                # сколько стихов запись снова совпадает с текстом; пропущенные стихи остаются без времени
                base = mean3(r)

                def ok(k):
                    j2, r2 = run(i + k, pos, first)
                    if r2 is None:
                        return None
                    if os.environ.get("AOB_DEBUG"):
                        log(f"    пропуск {k}: {verses[i + k][0]} оценка {mean3(r2):.2f} (было {base:.2f})")
                    good = mean3(r2) >= 0.6 and mean3(r2) > base - 0.1 and not bad(r2, 0, pos, first)
                    return (j2, r2) if good else False

                prev_k = 0
                for k in (1, 2, 3, 5, 8, 12, 18, 25, 35, 50, 70):
                    if i + k >= len(verses):
                        break
                    hit = ok(k)
                    if hit is None:
                        break
                    if hit:
                        # уточняем: самый короткий пропуск между предыдущей пробой и этой
                        for kk in range(prev_k + 1, k):
                            h2 = ok(kk)
                            if h2:
                                k, hit = kk, h2
                                break
                        log(f"  ! в записи нет стихов {verses[i][0]} … {verses[i + k - 1][0]} ({k} шт.)")
                        i, (j, r) = i + k, hit
                        break
                    prev_k = k
            # Конец последних стихов группы ничем не «закреплён»: их хвост может уехать на такие же слова
            # дальше (Исх 14:22 и 14:29 оба кончаются «on their left»). Поэтому два последних стиха
            # группы не принимаем, а выравниваем заново в начале следующей. Так же поступаем со стихами
            # после места, где совпадение резко упало.
            keep = j - i if j == len(verses) else max(1, j - i - 2)
            cut = next((m for m in range(1, keep) if bad(r, m)), None)
            if cut:
                keep = cut
            for (k, _), x in zip(verses[i:i + keep], r[:keep]):
                res[k] = x
            pos = r[keep - 1][1] + 1
            i, first = i + keep, False
        return {k: (a / self.FPS, b / self.FPS, s) for k, (a, b, s) in res.items()}


def fill_missing(found, all_verses):
    """Стихам, которых нет в записи (чтец пропустил надписание псалма или стих), даём время следующего
    найденного стиха: подсветка его просто «проскочит», а переход к нему начнёт с ближайшего места."""
    t = dict(found)
    out, nxt = [], None
    for v in sorted(set(all_verses) | set(t), reverse=True):
        if v in t:
            nxt = t[v]
        if nxt is not None:
            out.append([v, nxt])
    return out[::-1]


def verse_starts(keys, al, lead=0.2):
    """Время начала стихов: начало первой буквы минус небольшой запас, не раньше конца предыдущего."""
    out, prev_end = [], 0.0
    for k in keys:
        a, b, _ = al[k]
        out.append(round(max(prev_end, a - lead, 0.0), 2))
        prev_end = b
    return out


# --- Модуль и каталог ---------------------------------------------------------------------------------

def write_module(mod):
    mid = mod["id"]
    data = json.dumps(mod, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    gz = gzip.compress(data, 9, mtime=0)
    (OUT / f"{mid}.json").write_bytes(data)
    (OUT / f"{mid}.json.gz").write_bytes(gz)
    log(f"  {mid}: {len(mod['chapters'])} глав, {len(data)/1e3:.0f} КБ, gz {len(gz)/1e3:.0f} КБ")
    return catalog_entry(mod, len(data), len(gz))


def catalog_entry(mod, size, size_gz):
    e = {k: mod[k] for k in ("id", "type", "name", "title", "description", "language", "version", "author",
                             "source", "license", "translation", "versification") if k in mod}
    e.update({"url": f"{mod['id']}.json", "urlGz": f"{mod['id']}.json.gz", "size": size, "sizeGz": size_gz})
    return e


def merge_catalog(entries):
    """Слияние по id: свои записи заменяются на месте, новые — после последнего аудиомодуля (или в конец)."""
    p = OUT / "catalog.json"
    cat = json.loads(p.read_text(encoding="utf-8"))
    mods = cat["modules"]
    pos = {m["id"]: i for i, m in enumerate(mods)}
    for e in entries:
        if e["id"] in pos:
            mods[pos[e["id"]]] = e
        else:
            same = [i for i, m in enumerate(mods) if m.get("type") == "audio"]
            at = same[-1] + 1 if same else len(mods)
            mods.insert(at, e)
            pos = {m["id"]: i for i, m in enumerate(mods)}
    p.write_text(json.dumps(cat, ensure_ascii=False, indent=1), encoding="utf-8")
    log(f"catalog: {len(mods)} записей")


def rebuild_catalog():
    entries = []
    for mid in ("audio-rst-hexapla", "audio-kjv-librivox", "audio-rst-nt-wwjd", "audio-rst-ot-wwjd"):
        f = OUT / f"{mid}.json"
        if f.exists():
            data = f.read_bytes()
            gzf = OUT / f"{mid}.json.gz"
            entries.append(catalog_entry(json.loads(data), len(data), gzf.stat().st_size))
    merge_catalog(entries)


# --- Синодальный: Hexapla ------------------------------------------------------------------------------

HEX = "hexapla-audio-synodal-1876"


def hexapla_chapters():
    """[(OSIS, глава, номер книги Hexapla, имя mp3, длительность)] для 66 книг."""
    _, files = ia_files(HEX)
    out = []
    for name, f in files.items():
        m = re.fullmatch(r"(\d+)/(\d+)\.mp3", name)
        if m and int(m[1]) < 66:
            b, c = int(m[1]), int(m[2])
            ogg = files.get(f"{b}/{c}.ogg", {})
            out.append((PROT[b], c + 1, b, name, length_sec(ogg.get("length") or f.get("length")), f.get("md5")))
    return sorted(out, key=lambda x: (PROT.index(x[0]), x[1]))


def hexapla_offsets(b, c0):
    p = DATA / "hexapla-synodal" / "json" / f"{b}_{c0}.json"
    if not p.exists():
        http_get(f"https://archive.org/download/{HEX}/{b}/{c0}.json", p)
    return json.loads(p.read_text(encoding="utf-8"))["offsets"]


def align_hexapla_chapter(al, bid, ch, mp3, verses_text):
    """Наше выравнивание главы Hexapla (кешируется по тексту главы и версии алгоритма).
    mp3 — путь к файлу или функция, которая его вернёт (скачивание — только если кеша нет)."""
    key = hashlib.sha1(json.dumps([RST_ALIGN_VERSION, verses_text], ensure_ascii=False).encode()).hexdigest()[:12]
    cache = DATA / "hexapla-synodal" / "align" / f"{bid}.{ch}.{key}.json"
    if cache.exists():
        return json.loads(cache.read_text(encoding="utf-8"))
    if callable(mp3):
        mp3 = mp3()
    wav = load_wav(mp3)
    em = al.emission(wav)
    vs = [(i + 1, al.tokens(t)) for i, t in enumerate(verses_text)]
    vs = [(k, t) for k, t in vs if t]
    r = al.align_stream(em, vs, first_margin_s=20)
    res = {"verses": [[k, *r[k]] for k, _ in vs if k in r], "duration": len(wav) / 16000}
    cache.parent.mkdir(parents=True, exist_ok=True)
    cache.write_text(json.dumps(res), encoding="utf-8")
    return res


def hexapla_mp3(mp3name, md5):
    return http_get(f"https://archive.org/download/{HEX}/{mp3name}",
                    DATA / "hexapla-synodal" / "mp3" / mp3name.replace("/", "_"), md5=md5)


def compare_hexapla(r, off):
    """Расхождение нашей разметки с разметкой Hexapla: (медиана |Δ|, максимум |Δ|)."""
    d = sorted(abs(v[1] - off[v[0] - 1] / 1000) for v in r["verses"] if v[0] <= len(off))
    return (d[len(d) // 2], d[-1]) if d else (0, 0)


def build_rst(args):
    """Время стихов — наше выравнивание каждой главы; разметка Hexapla служит для сверки
    (--sidecar: взять разметку Hexapla как есть там, где совпало число стихов, без выравнивания)."""
    from concurrent.futures import ThreadPoolExecutor
    rst = load_bible("rst")
    books = set(args.books.split(",")) if args.books else None
    items = [x for x in hexapla_chapters() if x[1] <= len(rst.get(x[0], [])) and (not books or x[0] in books)]
    chapters = {}
    old = OUT / "audio-rst-hexapla.json"
    if books and old.exists():
        chapters = json.loads(old.read_text(encoding="utf-8"))["chapters"]
    al = None if args.sidecar else Aligner()
    pool = ThreadPoolExecutor(6)
    futs = {}

    def prefetch(i):
        for j in range(i, min(i + 12, len(items))):
            if j not in futs:
                futs[j] = pool.submit(hexapla_mp3, items[j][3], items[j][5])

    stats, low, t0 = [], [], time.time()
    for i, (bid, ch, b, mp3name, dur, md5) in enumerate(items):
        texts = rst[bid][ch - 1]
        off = hexapla_offsets(b, ch - 1)
        url = f"https://archive.org/download/{HEX}/{mp3name}"
        if args.sidecar:
            if len(off) != len(texts):
                continue
            verses = [[k + 1, round(ms / 1000, 2)] for k, ms in enumerate(off)]
        else:
            key = hashlib.sha1(json.dumps([RST_ALIGN_VERSION, texts], ensure_ascii=False).encode()).hexdigest()[:12]
            if not (DATA / "hexapla-synodal" / "align" / f"{bid}.{ch}.{key}.json").exists():
                prefetch(i)
            fut = futs.pop(i, None)
            r = align_hexapla_chapter(al, bid, ch, fut.result if fut else (lambda: hexapla_mp3(mp3name, md5)), texts)
            good = [v for v in r["verses"] if v[3] >= MIN_SCORE]
            if len(good) < 0.8 * len(texts):
                log(f"  ! {bid}.{ch}: в записи не нашлось большей части стихов — глава пропущена")
                continue
            keys = [v[0] for v in good]
            verses = fill_missing([[k, s] for k, s in zip(keys, verse_starts(keys, {v[0]: v[1:] for v in good}))],
                                  [v[0] for v in r["verses"]])
            dur = r["duration"]
            if len(off) == len(texts):
                stats.append((f"{bid}.{ch}", *compare_hexapla(r, off)))
            low += [f"{bid}.{ch}:{v[0]}({v[3]:.2f})" for v in r["verses"] if v[3] < 0.3]
        chapters[f"{bid}.{ch}"] = {"url": url, "verses": verses, "duration": round(dur, 2) if dur else None}
        if (i + 1) % 100 == 0:
            log(f"  {i + 1}/{len(items)} глав, {time.time() - t0:.0f} с")
    pool.shutdown(cancel_futures=True)
    if stats:
        good = sum(1 for _, med, mx in stats if med < 0.5 and mx < 1.5)
        log(f"  сверка с разметкой Hexapla: {good} из {len(stats)} глав совпали (медиана |Δ| < 0.5 с, макс < 1.5 с)")
        worst = sorted(stats, key=lambda x: -x[1])[:15]
        log("  наибольшие расхождения (глава, медиана/макс, с): "
            + ", ".join(f"{k} {m:.1f}/{x:.1f}" for k, m, x in worst))
        (DATA / "hexapla-synodal" / "compare.json").write_text(json.dumps(stats), encoding="utf-8")
    if low:
        log(f"  стихи с низкой уверенностью ({len(low)}): {' '.join(low[:30])}{' …' if len(low) > 30 else ''}")
    order = {bk: i for i, bk in enumerate(PROT)}
    chapters = dict(sorted(chapters.items(), key=lambda kv: (order[kv[0].split('.')[0]], int(kv[0].split('.')[1]))))
    mod = {
        "format": "aob-module", "formatVersion": 1, "type": "audio",
        "id": "audio-rst-hexapla", "name": "Аудио RST (синтез)",
        "title": "Синодальный перевод — синтезированное чтение (Hexapla)",
        "description": "Вся Библия (66 книг), запись на каждую главу. Чтение синтезировано (Fun-CosyVoice3, голос "
                       "по образцу согласившегося диктора) — это не живой чтец. Время стихов получено "
                       "принудительным выравниванием текста RST с записью (MMS_FA) и сверено с разметкой Hexapla. "
                       "Записи загружаются с archive.org.",
        "language": "ru", "version": "1.0 (archive.org, 2026-08)",
        "author": "Hexapla (синтез речи); перевод — Святейший Синод, 1876",
        "source": "https://archive.org/details/hexapla-audio-synodal-1876 (https://hexaplabible.com)",
        "license": "Public Domain (Public Domain Mark 1.0)",
        "translation": "rst", "versification": "synodal",
        "chapters": chapters,
    }
    return write_module(mod)


def verify_rst(args):
    """Сравнивает разметку Hexapla с нашим выравниванием для указанных глав."""
    rst = load_bible("rst")
    al = Aligner()
    idx = {(bid, ch): (b, name, md5) for bid, ch, b, name, _, md5 in hexapla_chapters()}
    for ref in args.refs:
        bid, ch = ref.split(".")
        ch = int(ch)
        b, name, md5 = idx[(bid, ch)]
        t0 = time.time()
        r = align_hexapla_chapter(al, bid, ch, lambda: hexapla_mp3(name, md5), rst[bid][ch - 1])
        off = hexapla_offsets(b, ch - 1)
        diffs = [v[1] - off[v[0] - 1] / 1000 for v in r["verses"] if v[0] <= len(off)]
        ad = sorted(abs(d) for d in diffs)
        log(f"{ref}: {len(diffs)} стихов, длительность {r['duration']:.0f} с, {time.time()-t0:.1f} с; "
            f"|Δ| медиана {ad[len(ad)//2]:.2f} с, макс {ad[-1]:.2f} с, сдвиг ср. {sum(diffs)/len(diffs):+.2f} с; "
            f"оценка мин {min(v[3] for v in r['verses']):.2f}")
        if args.show:
            for v in r["verses"]:
                h = off[v[0] - 1] / 1000 if v[0] <= len(off) else float("nan")
                log(f"   {v[0]:3d}  наше {v[1]:8.2f}–{v[2]:8.2f} (оценка {v[3]:.2f})  Hexapla {h:8.2f}  Δ {v[1]-h:+.2f}")


# --- KJV: LibriVox, Michael Armenta ---------------------------------------------------------------

LV_ITEM = "bible_kjv_complete_2001_librivox"


def lv_sections():
    """Разделы LibriVox → [(номер, mp3, книга, первая глава KJV, последняя глава KJV)]."""
    api = cached_json("https://librivox.org/api/feed/audiobooks?id=10501&format=json&extended=1",
                      DATA / "meta" / "librivox-10501.json")
    out = []
    for s in api["books"][0]["sections"]:
        m = re.fullmatch(r"\s*(.+?)\s+(?:Ch\.\s*)?(\d+)\s*(?:-\s*(\d+))?\s*", s["title"])
        out.append((int(s["section_number"]), s["listen_url"].rsplit("/", 1)[1], EN_NAMES[m[1]], int(m[2]),
                    int(m[3] or m[2])))
    return out


def kjv_position():
    """(книга, глава, стих) нашего kjv.json (синодальная нумерация) → (глава, стих) KJV — порядок чтения.
    Таблица соответствия — из scripts/extra_lib.py (SWORD canon_synodal.h); без неё считаем нумерацию общей."""
    try:
        sys.path.insert(0, str(ROOT / "scripts"))
        import extra_lib
        syn = extra_lib.synodal()
        return lambda b, c, v: tuple(syn.to_kjv(b, c, v)[1:3])
    except Exception as e:  # noqa: BLE001
        log(f"  нет таблицы синодальной нумерации ({e}) — нумерация KJV считается совпадающей")
        return lambda b, c, v: (c, v)


def build_kjv(args):
    kjv = load_bible("kjv")
    _, files = ia_files(LV_ITEM)
    books = PROT if args.books == "all" else (args.books.split(",") if args.books else GOSPELS)
    secs = lv_sections()
    pos = kjv_position()
    # Главы KJV, разрезанные между файлами (Деян 10 — конец 102-го и начало 103-го), не размечаем
    cnt = {}
    for n, mp3, bid, a, b in secs:
        for c in range(a, b + 1):
            cnt[(bid, c)] = cnt.get((bid, c), 0) + 1
    split = {k for k, n in cnt.items() if n > 1}
    # Поток стихов каждого файла в порядке чтения KJV
    streams, owner = {}, {}
    for n, mp3, bid, a, b in secs:
        if bid not in books:
            continue
        vs = []
        for c, chap in enumerate(kjv[bid], 1):
            for v, t in enumerate(chap, 1):
                kc, kv = pos(bid, c, v)
                if a <= kc <= b and (bid, kc) not in split and t.strip():
                    vs.append(((kc, kv, c, v), f"{bid}.{c}", v, t))
        vs.sort(key=lambda x: x[0])
        streams[mp3] = (n, bid, a, [(ck, v, t) for _, ck, v, t in vs])
        for _, ck, v, t in vs:
            owner.setdefault(ck, set()).add(mp3)
    shared = {ck for ck, s in owner.items() if len(s) > 1}  # синодальная глава в двух файлах — пропускаем
    if shared:
        log(f"  главы на границе файлов (пропущены): {', '.join(sorted(shared))}")
    al, chapters = None, {}
    old = OUT / "audio-kjv-librivox.json"
    if old.exists():
        chapters = {k: v for k, v in json.loads(old.read_text(encoding="utf-8"))["chapters"].items()
                    if k.split(".")[0] not in books}
    tot_audio, tot_time = 0.0, 0.0
    for mp3, (n, bid, a, texts) in streams.items():
        f = files[mp3]
        key = hashlib.sha1(json.dumps([ALIGN_VERSION, mp3, texts], ensure_ascii=False).encode()).hexdigest()[:12]
        cache = DATA / "librivox-kjv" / "align" / f"{mp3}.{key}.json"
        t0 = time.time()
        if cache.exists():
            r = json.loads(cache.read_text(encoding="utf-8"))
        else:
            al = al or Aligner()
            path = http_get(f"https://archive.org/download/{LV_ITEM}/{mp3}", DATA / "librivox-kjv" / "mp3" / mp3,
                            md5=f.get("md5"))
            wav = load_wav(path)
            em = al.emission(wav, DATA / "librivox-kjv" / "emis" / f"{mp3}.npy")
            vs = [((ck, v), al.tokens(t)) for ck, v, t in texts]
            vs = [(k, t) for k, t in vs if t]
            # начало файла — объявление LibriVox; если первая глава разрезана, её начало тоже пропускаем
            margin = 120 + (900 if (bid, a) in split else 0)
            res = al.align_stream(em, vs, first_margin_s=margin, max_gap_s=30)
            r = {"duration": len(wav) / 16000, "verses": [[ck, v, *res[(ck, v)]] for (ck, v), _ in vs if (ck, v) in res]}
            cache.parent.mkdir(parents=True, exist_ok=True)
            cache.write_text(json.dumps(r), encoding="utf-8")
            tot_audio += r["duration"]
            tot_time += time.time() - t0
            log(f"  {mp3}: {r['duration']/60:.0f} мин аудио, выравнивание {time.time()-t0:.0f} с")
        url = f"https://archive.org/download/{LV_ITEM}/{mp3}"
        # главы в порядке чтения; у каждой берём первый непрерывный отрезок стихов
        runs, order_ck = {}, []
        for i, (ck, v, s0, e0, sc) in enumerate(r["verses"]):
            if ck in shared:
                continue
            if ck not in runs:
                runs[ck] = [[i, v, s0, e0, sc]]
                order_ck.append(ck)
            elif runs[ck][-1] is not None and runs[ck][-1][0] == i - 1:
                runs[ck].append([i, v, s0, e0, sc])
            else:
                runs[ck].append(None)  # стих вне основного отрезка (напр. Рим 14:24–26 = KJV 16:25–27)
        prev_end, dropped = None, []
        for ck in order_ck:
            vv = []
            for x in runs[ck]:
                if x is None:
                    break
                vv.append(x)
            # время стихов должно расти вместе с номером; ненайденные стихи (оценка < MIN_SCORE) — без времени
            n_all, all_vs = len(kjv[ck.split(".")[0]][int(ck.split(".")[1]) - 1]), None
            vv = [x for k, x in enumerate(vv) if (k == 0 or x[1] > vv[k - 1][1]) and x[4] >= MIN_SCORE]
            all_vs = list(range(1, n_all + 1))
            if len(vv) < 0.7 * n_all:
                dropped.append(ck)
                continue
            al_map = {x[1]: (x[2], x[3], x[4]) for x in vv}
            starts = verse_starts([x[1] for x in vv], al_map)
            first = starts[0]
            start = max(0.0, first - 2.5) if prev_end is None else min(first, prev_end + 0.3)
            chapters[ck] = {"url": url, "verses": fill_missing([[x[1], s] for x, s in zip(vv, starts)], all_vs),
                            "duration": round(r["duration"], 2), "start": round(start, 2),
                            "end": round(vv[-1][3] + 0.6, 2)}
            prev_end = vv[-1][3]
        if dropped:
            log(f"  {mp3}: главы не размечены (в записи не нашлось большей части стихов): {', '.join(dropped)}")
        for k1, k2 in zip(order_ck, order_ck[1:]):  # конец главы не заходит за начало следующей
            if k1 in chapters and k2 in chapters:
                chapters[k1]["end"] = round(min(chapters[k1]["end"], chapters[k2]["start"]), 2)
        low = [f"{ck}:{v}({s:.2f})" for ck, v, a_, b_, s in r["verses"] if s < 0.3]
        if low:
            log(f"  {mp3}: стихи с низкой уверенностью ({len(low)}): {' '.join(low[:15])}{' …' if len(low) > 15 else ''}")
    if tot_audio:
        log(f"  выровнено {tot_audio/3600:.1f} ч аудио за {tot_time/60:.1f} мин")
    order = {b: i for i, b in enumerate(PROT)}
    chapters = dict(sorted(chapters.items(), key=lambda kv: (order[kv[0].split('.')[0]], int(kv[0].split('.')[1]))))
    covered = sorted({k.split(".")[0] for k in chapters}, key=order.get)
    what = "вся Библия" if len(covered) == 66 else "книги " + ", ".join(covered)
    mod = {
        "format": "aob-module", "formatVersion": 1, "type": "audio",
        "id": "audio-kjv-librivox", "name": "Аудио KJV",
        "title": "King James Version — LibriVox (чтец Michael Armenta)",
        "description": f"Живое чтение Библии короля Якова (LibriVox, один чтец на всю Библию). Размечены: {what}. "
                       "В одном файле записано несколько глав: у главы есть start/end — секунды от начала файла. "
                       "Время стихов получено принудительным выравниванием текста KJV с записью (MMS_FA). "
                       "Записи загружаются с archive.org.",
        "language": "en", "version": "1.0 (LibriVox 2020)",
        "author": "Michael Armenta (чтец); текст — KJV 1769",
        "source": "https://librivox.org/bible-complete-king-james-version/ (https://archive.org/details/"
                  "bible_kjv_complete_2001_librivox)",
        "license": "Public Domain",
        "translation": "kjv", "versification": "synodal",
        "chapters": chapters,
    }
    return write_module(mod)


# --- Синодальный, живое чтение: wwjdru на archive.org ------------------------------------------------

WWJD = {
    "nt": {"item": "RU-NT-NonDrama", "id": "audio-rst-nt-wwjd", "name": "Аудио НЗ",
           "title": "Новый Завет — живое чтение (без музыки)", "what": "Новый Завет"},
    "ot": {"item": "Russian-NT-NonDrama", "id": "audio-rst-ot-wwjd", "name": "Аудио ВЗ",
           "title": "Ветхий Завет — живое чтение (без музыки)", "what": "Ветхий Завет"},
}
WW_ALIAS = {"revelations": "Rev", "psalm": "Ps", "1king": "1Kgs", "2king": "2Kgs", "songofsolomon": "Song"}


def ww_book(name, num):
    key = (num + name).lower()
    if key in WW_ALIAS:
        return WW_ALIAS[key]
    for en, osis in EN_NAMES.items():
        if en.replace(" ", "").lower() == key:
            return osis
    raise KeyError(name)


def ww_files(item):
    """[(OSIS, глава в имени файла, имя mp3, md5)] в порядке книг и глав."""
    _, files = ia_files(item)
    out = []
    for name, f in files.items():
        m = re.fullmatch(r"(\d\d)(\d?)_?([A-Za-z]+?)_?(\d+)\.mp3", name)
        if m:
            out.append((ww_book(m[3], m[2]), int(m[4]), name, f.get("md5")))
    order = {b: i for i, b in enumerate(PROT)}
    return sorted(out, key=lambda x: (order[x[0]], x[1]))


def ww_candidates(bid, c, nch):
    """Синодальные главы, которые может содержать файл с номером c (сначала — самая вероятная)."""
    cand = [c]
    if bid == "Ps":  # нумерация в имени файла может быть еврейской (KJV): Пс 23 KJV = Пс 22 синод.
        cand += [c - 1, c + 1]
    elif bid in ("Joel", "Mal", "Num", "1Kgs", "Job", "Song", "Isa", "Dan", "Jonah", "Neh", "1Chr", "Exod"):
        cand += [c - 1, c + 1]
    return [x for x in dict.fromkeys(cand) if 1 <= x <= nch]


def build_wwjd(args):
    from concurrent.futures import ThreadPoolExecutor
    cfg = WWJD[args.part]
    item, mid = cfg["item"], cfg["id"]
    rst = load_bible("rst")
    items = ww_files(item)
    if args.books:
        items = [x for x in items if x[0] in args.books.split(",")]
    base = DATA / f"wwjd-{args.part}"
    old = OUT / f"{mid}.json"
    chapters = json.loads(old.read_text(encoding="utf-8"))["chapters"] if old.exists() else {}
    pool = ThreadPoolExecutor(6)
    futs = {}

    def mp3_path(it):
        return http_get(f"https://archive.org/download/{item}/{it[2]}", base / "mp3" / it[2], md5=it[3])

    def prefetch(i):
        for k in range(i, min(i + 12, len(items))):
            if k not in futs:
                futs[k] = pool.submit(mp3_path, items[k])

    al, t0, audio_s, align_s = None, time.time(), 0.0, 0.0
    problems, cur_book, seen, skipped = [], None, {}, []
    order = {b: i for i, b in enumerate(PROT)}

    def save():
        ch = dict(sorted(chapters.items(), key=lambda kv: (order[kv[0].split('.')[0]], int(kv[0].split('.')[1]))))
        books = sorted({k.split(".")[0] for k in ch}, key=order.get)
        mod = {
            "format": "aob-module", "formatVersion": 1, "type": "audio",
            "id": mid, "name": cfg["name"], "title": cfg["title"],
            "description": f"{cfg['what']} в Синодальном переводе, живые чтецы, без музыки, запись на каждую главу. "
                           "Записи выложены на archive.org пользователем wwjdru под лицензией CC BY-NC-SA 3.0; "
                           "вероятно, это записи Faith Comes By Hearing. Время стихов получено принудительным "
                           "выравниванием текста RST с записью (MMS_FA). Озвучены книги: " + ", ".join(books) + ".",
            "language": "ru", "version": "1.0 (archive.org, 2010)",
            "author": "wwjdru (sites.google.com/site/wwjdru)",
            "source": f"https://archive.org/details/{item}",
            "license": "CC BY-NC-SA 3.0 (по странице archive.org)",
            "translation": "rst", "versification": "synodal",
            "chapters": ch,
        }
        merge_catalog([write_module(mod)])

    for i, it in enumerate(items):
        bid, c, name, md5 = it
        if cur_book and bid != cur_book:
            save()
        cur_book = bid
        nch = len(rst[bid])
        cands = ww_candidates(bid, c, nch)
        key = hashlib.sha1(json.dumps([WWJD_ALIGN_VERSION, name, [rst[bid][x - 1] for x in cands]],
                                      ensure_ascii=False).encode()).hexdigest()[:12]
        cache = base / "align" / f"{name}.{key}.json"
        if cache.exists():
            r = json.loads(cache.read_text(encoding="utf-8"))
        else:
            prefetch(i)
            ta = time.time()
            al = al or Aligner()
            wav = load_wav(futs.pop(i).result())
            em = al.emission(wav)
            best = None
            for sc in cands:
                vs = [(v, al.tokens(t)) for v, t in enumerate(rst[bid][sc - 1], 1)]
                vs = [(k, t) for k, t in vs if t]
                a = al.align_stream(em, vs, first_margin_s=60, max_gap_s=30)
                found = [k for k, _ in vs if k in a and a[k][2] >= MIN_SCORE]
                score = sum(a[k][2] for k in found) / max(1, len(vs))  # пропущенные стихи тянут оценку вниз
                if best is None or score > best[0]:
                    best = (score, sc, a, [k for k, _ in vs])
                if score >= 0.7:
                    break
            score, sc, a, keys = best
            r = {"chapter": sc, "score": score, "duration": len(wav) / 16000, "all": keys,
                 "verses": [[k, *a[k]] for k in keys if k in a]}
            cache.parent.mkdir(parents=True, exist_ok=True)
            cache.write_text(json.dumps(r), encoding="utf-8")
            audio_s += r["duration"]
            align_s += time.time() - ta
        sc = r["chapter"]
        good = [v for v in r["verses"] if v[3] >= MIN_SCORE]
        # Чтецы иногда сокращают перечни имён (Быт 36, 46 — родословия): такие стихи остаются без времени,
        # а глава размечается, если найденные стихи совпали надёжно
        mean_good = sum(v[3] for v in good) / max(1, len(good))
        if mean_good < 0.6 or len(good) < 0.3 * len(r["all"]):
            problems.append(f"{name}→{bid}.{sc} (оценка {r['score']:.2f}, найдено {len(good)}/{len(r['all'])})")
            continue
        if sc != c:
            log(f"  {name}: это синодальная глава {bid}.{sc}")
        miss = [v for v in r["all"] if v not in {g[0] for g in good}]
        if miss:
            log(f"  {bid}.{sc}: стихов нет в записи (или не найдены): {miss}")
            skipped.append(f"{bid}.{sc}:{miss[0]}" + (f"–{miss[-1]}" if len(miss) > 1 else "") + f" ({len(miss)})")
        keys = [v[0] for v in good]
        starts = verse_starts(keys, {v[0]: v[1:] for v in good})
        ck = f"{bid}.{sc}"
        if ck in seen:
            problems.append(f"{ck}: два файла ({seen[ck]} и {name}) — оставлен второй")
        seen[ck] = name
        chapters[ck] = {"url": f"https://archive.org/download/{item}/{name}",
                        "verses": fill_missing([[k, s] for k, s in zip(keys, starts)], r["all"]),
                        "duration": round(r["duration"], 2)}
        if (i + 1) % 50 == 0:
            log(f"  {i + 1}/{len(items)} файлов, {time.time() - t0:.0f} с")
    pool.shutdown(cancel_futures=True)
    if audio_s:
        log(f"  выровнено {audio_s/3600:.1f} ч аудио за {align_s/60:.1f} мин")
    if problems:
        log(f"  не размечены ({len(problems)}): " + "; ".join(problems))
    if skipped:
        log(f"  главы с пропущенными в записи стихами ({len(skipped)}): " + ", ".join(skipped))
    save()


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("rst")
    p.add_argument("--sidecar", action="store_true", help="без выравнивания: разметка Hexapla как есть")
    p.add_argument("--books", help="книги OSIS через запятую (по умолчанию все); прочие главы сохраняются")
    p = sub.add_parser("kjv")
    p.add_argument("--books", help="книги OSIS через запятую или all (по умолчанию Matt,Mark,Luke,John); "
                                   "ранее размеченные главы других книг сохраняются")
    p = sub.add_parser("verify-rst")
    p.add_argument("refs", nargs="+")
    p.add_argument("--show", action="store_true", help="показать каждый стих")
    p = sub.add_parser("wwjd")
    p.add_argument("part", choices=["nt", "ot"], help="nt — Новый Завет, ot — Ветхий")
    p.add_argument("--books", help="книги OSIS через запятую (по умолчанию все); прочие главы сохраняются")
    sub.add_parser("catalog")
    args = ap.parse_args()
    if args.cmd == "rst":
        merge_catalog([build_rst(args)])
    elif args.cmd == "kjv":
        merge_catalog([build_kjv(args)])
    elif args.cmd == "verify-rst":
        verify_rst(args)
    elif args.cmd == "wwjd":
        build_wwjd(args)
    else:
        rebuild_catalog()


if __name__ == "__main__":
    main()
