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
ALIGN_VERSION = 3  # меняется — кеш выравнивания пересчитывается
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

    def tokens(self, romanized):
        return [self.dict[c] for c in romanized.replace(" ", "") if c in self.dict]

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
        targets, idx = [self.star], []
        for g in groups:
            idx.append((len(targets), len(targets) + len(g)))
            targets += g
            targets.append(self.star)
        e = em[f0:f1].unsqueeze(0).to(self.dev)
        t = torch.tensor([targets], dtype=torch.int32, device=self.dev)
        ali, sc = self.F.forced_align(e, t, blank=0)
        spans = self.F.merge_tokens(ali[0].cpu(), sc[0].exp().cpu())
        assert len(spans) == len(targets), (len(spans), len(targets))
        res = []
        for a, b in idx:
            ss = spans[a:b]
            res.append((f0 + ss[0].start, f0 + ss[-1].end, sum(s.score for s in ss) / len(ss)))
        return res

    def align_stream(self, em, verses, first_margin_s=120, group_letters=2500):
        """verses — [(ключ, токены)] в порядке чтения. Выравнивает группами по ~group_letters букв,
        окно каждой группы — от конца предыдущей. Возвращает {ключ: (t_начала, t_конца, оценка)}."""
        T = em.shape[0]
        total = sum(len(t) for _, t in verses)
        rate = max(total / T, 0.05)  # букв на кадр (оценка темпа)
        res, pos, i, first = {}, 0, 0, True
        while i < len(verses):
            j, n = i, 0
            while j < len(verses) and (n < group_letters or j == i):
                n += len(verses[j][1])
                j += 1
            if len(verses) - j <= 3:  # хвост не оставляем крошечным
                j = len(verses)
                n = sum(len(t) for _, t in verses[i:j])
            margin = (first_margin_s if first else 30) * self.FPS
            span = int(n / rate * 1.5) + margin
            for attempt in range(4):
                f1 = min(T, pos + span)
                need = n + sum(1 for _, t in verses[i:j] for a, b in zip(t, t[1:]) if a == b) + (j - i) + 1
                if f1 - pos < need:
                    f1 = min(T, pos + need * 2)
                r = self._align(em, [t for _, t in verses[i:j]], pos, f1)
                if r[-1][1] < f1 - 3 * self.FPS or f1 >= T:
                    break
                span *= 2  # текст упёрся в край окна — расширяем
            for (k, _), x in zip(verses[i:j], r):
                res[k] = x
            pos = r[-1][1] + 1
            i, first = j, False
        return {k: (a / self.FPS, b / self.FPS, s) for k, (a, b, s) in res.items()}


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
    for mid in ("audio-rst-hexapla", "audio-kjv-librivox"):
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


def align_hexapla_chapter(al, bid, ch, b, mp3name, md5, verses_text):
    """Наше выравнивание главы Hexapla (mp3 скачивается в data-src/audio/hexapla-synodal/mp3)."""
    key = hashlib.sha1(json.dumps([ALIGN_VERSION, verses_text], ensure_ascii=False).encode()).hexdigest()[:12]
    cache = DATA / "hexapla-synodal" / "align" / f"{bid}.{ch}.{key}.json"
    if cache.exists():
        return json.loads(cache.read_text(encoding="utf-8"))
    mp3 = http_get(f"https://archive.org/download/{HEX}/{mp3name}",
                   DATA / "hexapla-synodal" / "mp3" / mp3name.replace("/", "_"), md5=md5)
    wav = load_wav(mp3)
    em = al.emission(wav, DATA / "hexapla-synodal" / "emis" / (mp3name.replace("/", "_") + ".npy"))
    vs = [(i + 1, al.tokens(romanize(t))) for i, t in enumerate(verses_text)]
    vs = [(k, t) for k, t in vs if t]
    r = al.align_stream(em, vs, first_margin_s=20)
    res = {"verses": [[k, *r[k]] for k, _ in vs], "duration": len(wav) / 16000}
    cache.parent.mkdir(parents=True, exist_ok=True)
    cache.write_text(json.dumps(res), encoding="utf-8")
    return res


def build_rst(args):
    rst = load_bible("rst")
    chapters, mism, al = {}, [], None
    for bid, ch, b, mp3name, dur, md5 in hexapla_chapters():
        texts = rst.get(bid, [])
        if ch > len(texts):
            continue  # Пс 151 — нет в rst.json
        off = hexapla_offsets(b, ch - 1)
        url = f"https://archive.org/download/{HEX}/{mp3name}"
        if len(off) == len(texts[ch - 1]):
            verses = [[i + 1, round(ms / 1000, 2)] for i, ms in enumerate(off)]
        else:
            mism.append(f"{bid}.{ch} ({len(off)}≠{len(texts[ch - 1])})")
            if args.no_align:
                continue
            al = al or Aligner()
            r = align_hexapla_chapter(al, bid, ch, b, mp3name, md5, texts[ch - 1])
            keys = [v[0] for v in r["verses"]]
            starts = verse_starts(keys, {v[0]: v[1:] for v in r["verses"]})
            verses = [[k, s] for k, s in zip(keys, starts)]
            dur = round(r["duration"], 2)
        chapters[f"{bid}.{ch}"] = {"url": url, "verses": verses, "duration": round(dur, 2) if dur else None}
    log(f"  главы с несовпавшим числом стихов (выровнены заново): {', '.join(mism)}")
    mod = {
        "format": "aob-module", "formatVersion": 1, "type": "audio",
        "id": "audio-rst-hexapla", "name": "Аудио RST (синтез)",
        "title": "Синодальный перевод — синтезированное чтение (Hexapla)",
        "description": "Вся Библия (66 книг) по главам. Чтение синтезировано (Fun-CosyVoice3, голос по образцу "
                       "согласившегося диктора), не живой чтец. Время стихов — разметка Hexapla, сверенная с "
                       "текстом; главы с добавлениями по LXX выровнены заново. Записи загружаются с archive.org.",
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
        r = align_hexapla_chapter(al, bid, ch, b, name, md5, rst[bid][ch - 1])
        off = hexapla_offsets(b, ch - 1)
        diffs = [v[1] - off[v[0] - 1] / 1000 for v in r["verses"] if v[0] <= len(off)]
        ad = sorted(abs(d) for d in diffs)
        log(f"{ref}: {len(diffs)} стихов, длительность {r['duration']:.0f} с, {time.time()-t0:.1f} с; "
            f"|Δ| медиана {ad[len(ad)//2]:.2f} с, макс {ad[-1]:.2f} с, сдвиг ср. {sum(diffs)/len(diffs):+.2f} с; "
            f"оценка мин {min(v[3] for v in r['verses']):.2f}")


# --- KJV: LibriVox, Michael Armenta ---------------------------------------------------------------

LV_ITEM = "bible_kjv_complete_2001_librivox"


def lv_sections():
    """Разделы LibriVox → [(номер, mp3, [(OSIS, глава)…])]."""
    api = cached_json("https://librivox.org/api/feed/audiobooks?id=10501&format=json&extended=1",
                      DATA / "meta" / "librivox-10501.json")
    out = []
    for s in api["books"][0]["sections"]:
        m = re.fullmatch(r"\s*(.+?)\s+Ch\.\s*(\d+)\s*(?:-\s*(\d+))?\s*", s["title"])
        bid = EN_NAMES[m[1]]
        a, b = int(m[2]), int(m[3] or m[2])
        out.append((int(s["section_number"]), s["listen_url"].rsplit("/", 1)[1], [(bid, c) for c in range(a, b + 1)]))
    return out


def build_kjv(args):
    kjv = load_bible("kjv")
    _, files = ia_files(LV_ITEM)
    books = args.books.split(",") if args.books else GOSPELS
    secs = lv_sections()
    # Главы, разрезанные между файлами (Деян 10: конец 102-го и начало 103-го), не размечаем
    seen = {}
    for n, mp3, chs in secs:
        for c in chs:
            seen[c] = seen.get(c, 0) + 1
    al, chapters = None, {}
    old = OUT / "audio-kjv-librivox.json"
    if old.exists():
        chapters = json.loads(old.read_text(encoding="utf-8"))["chapters"]
    for n, mp3, chs in secs:
        chs = [c for c in chs if c[0] in books]
        if not chs:
            continue
        whole = [c for c in chs if seen[c] == 1]
        f = files[mp3]
        texts = [(f"{b}.{c}", v + 1, t) for b, c in whole for v, t in enumerate(kjv[b][c - 1])]
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
            vs = [((ck, v), al.tokens(romanize(t))) for ck, v, t in texts]
            vs = [(k, t) for k, t in vs if t]
            a = al.align_stream(em, vs)
            r = {"duration": len(wav) / 16000, "verses": [[ck, v, *a[(ck, v)]] for (ck, v), _ in vs]}
            cache.parent.mkdir(parents=True, exist_ok=True)
            cache.write_text(json.dumps(r), encoding="utf-8")
            log(f"  {mp3}: {r['duration']/60:.0f} мин аудио, выравнивание {time.time()-t0:.0f} с")
        url = f"https://archive.org/download/{LV_ITEM}/{mp3}"
        by_ch = {}
        for ck, v, a, b, s in r["verses"]:
            by_ch.setdefault(ck, []).append((v, a, b, s))
        prev_end = None
        for ck in [f"{b}.{c}" for b, c in whole]:
            vv = by_ch.get(ck)
            if not vv:
                continue
            al_map = {v: (a, b, s) for v, a, b, s in vv}
            starts = verse_starts([v for v, *_ in vv], al_map)
            first = starts[0]
            start = max(0.0, first - 2.5) if prev_end is None else round(min(first, prev_end + 0.3), 2)
            end = vv[-1][2] + 0.6
            chapters[ck] = {"url": url, "verses": [[v, s] for (v, *_), s in zip(vv, starts)],
                            "duration": round(r["duration"], 2), "start": round(start, 2), "end": round(end, 2)}
            prev_end = vv[-1][2]
        # конец главы не заходит за начало следующей
        keys = [f"{b}.{c}" for b, c in whole if f"{b}.{c}" in chapters]
        for k1, k2 in zip(keys, keys[1:]):
            chapters[k1]["end"] = round(min(chapters[k1]["end"], chapters[k2]["start"]), 2)
        low = [(ck, v, round(s, 2)) for ck, v, a, b, s in r["verses"] if s < 0.25]
        if low:
            log(f"  {mp3}: стихи с низкой уверенностью: {low[:12]}{' …' if len(low) > 12 else ''}")
    order = {b: i for i, b in enumerate(PROT)}
    chapters = dict(sorted(chapters.items(), key=lambda kv: (order[kv[0].split('.')[0]], int(kv[0].split('.')[1]))))
    covered = sorted({k.split(".")[0] for k in chapters}, key=order.get)
    mod = {
        "format": "aob-module", "formatVersion": 1, "type": "audio",
        "id": "audio-kjv-librivox", "name": "Аудио KJV",
        "title": "King James Version — LibriVox (чтец Michael Armenta)",
        "description": "Живое чтение Библии короля Якова (LibriVox, один чтец на всю Библию). Размечены книги: "
                       + ", ".join(covered) + ". В одном файле несколько глав: у каждой главы есть start/end "
                       "(секунды от начала файла). Время стихов получено принудительным выравниванием текста "
                       "(MMS_FA). Записи загружаются с archive.org.",
        "language": "en", "version": "1.0 (LibriVox 2020)",
        "author": "Michael Armenta (чтец); текст — KJV 1769",
        "source": "https://librivox.org/bible-complete-king-james-version/ (https://archive.org/details/"
                  "bible_kjv_complete_2001_librivox)",
        "license": "Public Domain",
        "translation": "kjv", "versification": "synodal",
        "chapters": chapters,
    }
    return write_module(mod)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("rst")
    p.add_argument("--no-align", action="store_true", help="не выравнивать главы с несовпавшим числом стихов")
    p = sub.add_parser("kjv")
    p.add_argument("--books", help="книги OSIS через запятую (по умолчанию Matt,Mark,Luke,John); "
                                   "ранее размеченные главы сохраняются")
    p = sub.add_parser("verify-rst")
    p.add_argument("refs", nargs="+")
    sub.add_parser("catalog")
    args = ap.parse_args()
    if args.cmd == "rst":
        merge_catalog([build_rst(args)])
    elif args.cmd == "kjv":
        merge_catalog([build_kjv(args)])
    elif args.cmd == "verify-rst":
        verify_rst(args)
    else:
        rebuild_catalog()


if __name__ == "__main__":
    main()
