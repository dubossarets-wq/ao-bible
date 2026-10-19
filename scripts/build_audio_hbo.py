"""Аудиомодуль «Ветхий Завет на иврите» (audio-hbo-shmuelof): живое чтение Авраама Шмуэлофа.

Записи — archive.org/details/HebBible_AShmuelof (929 глав, выложил eBible.org, CC BY-NC-ND 4.0); файлы
не меняются и не копируются — приложение проигрывает их с archive.org, как и другие аудиокниги.
Время стихов — готовая разметка авторов: аудиокниги ePub eBible.org (EPUB 3 Media Overlays, файлы *.smil)
делят каждый стих на части («1a», «1b»), у каждой — начало и конец в записи главы. Из ePub по сети читаются
только маленькие файлы разметки (zip читается по частям, Range-запросами) — записи не скачиваются.
MP3 в ePub и на archive.org — одни и те же файлы (совпадают размеры), поэтому время подходит без пересчёта.
Нумерация масоретская -> синодальная — как у текста OSHB (extra_bibles.oshb_mapper).

Запуск: python -I scripts/build_audio_hbo.py
"""
import json
import re
import struct
import sys
import time
import urllib.parse
import urllib.request
import zlib
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from extra_lib import merge_catalog, write_module  # noqa: E402
from extra_bibles import USFM_BOOKS, oshb_mapper  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "data-src" / "audio" / "hbo-smil"
APPROVED = ROOT / "scripts" / "approved-modules.json"
EPUB_INDEX = "https://ebible.org/multimedia/hbo/"
ITEM = "HebBible_AShmuelof"
UA = {"User-Agent": "AOBibleAudio/1.0 (https://dubossarets-wq.github.io/ao-bible/)"}


def get(url, rng=None):
    h = dict(UA)
    if rng:
        h["Range"] = f"bytes={rng[0]}-{rng[1]}"
    for attempt in range(5):
        try:
            return urllib.request.urlopen(urllib.request.Request(url, headers=h), timeout=60).read()
        except Exception:
            time.sleep(3 * (attempt + 1))
    raise RuntimeError(url)


def remote_zip(url):
    """Записи центрального каталога zip по сети: {имя: (смещение, сжатый размер, метод, размер)}"""
    size = int(urllib.request.urlopen(urllib.request.Request(url, headers=UA, method="HEAD"), timeout=60).headers["Content-Length"])
    tail = get(url, (max(0, size - 65536), size - 1))
    i = tail.rfind(b"PK\x05\x06")
    cd_size, cd_off = struct.unpack("<II", tail[i + 12:i + 20])
    cd = get(url, (cd_off, cd_off + cd_size - 1))
    out, p = {}, 0
    while cd[p:p + 4] == b"PK\x01\x02":
        method, = struct.unpack("<H", cd[p + 10:p + 12])
        csize, usize = struct.unpack("<II", cd[p + 20:p + 28])
        nlen, elen, clen = struct.unpack("<HHH", cd[p + 28:p + 34])
        off, = struct.unpack("<I", cd[p + 42:p + 46])
        name = cd[p + 46:p + 46 + nlen].decode("utf-8")
        out[name] = (off, csize, method, usize)
        p += 46 + nlen + elen + clen
    return out


def read_entry(url, entry):
    off, csize, method, _ = entry
    head = get(url, (off, off + 29))
    nlen, elen = struct.unpack("<HH", head[26:30])
    data = get(url, (off + 30 + nlen + elen, off + 30 + nlen + elen + csize - 1))
    return zlib.decompress(data, -15) if method == 8 else data


def book_smil(url, usfm):
    """Разметка книги: [(глава, стих, начало, конец, имя mp3 в ePub)] и размеры mp3 ePub"""
    cache = CACHE / f"{usfm}.json"
    if cache.exists():
        return json.loads(cache.read_text(encoding="utf-8"))
    z = remote_zip(url)
    sizes = {n.split("/")[-1]: e[3] for n, e in z.items() if n.endswith(".mp3")}
    parts = []
    for n in sorted(z):
        m = re.search(r"-(\d{3})\.xhtml\.smil$", n)
        if not m:
            continue
        c = int(m.group(1))
        smil = read_entry(url, z[n]).decode("utf-8")
        for t in re.finditer(r'<text src="[^"#]*#(\d+)[a-z]*"\s*/>\s*<audio clipBegin="([\d.]+)" clipEnd="([\d.]+)" src="\.\./Audio/([^"]+)"', smil):
            parts.append([c, int(t.group(1)), float(t.group(2)), float(t.group(3)), t.group(4)])
    res = {"parts": parts, "sizes": sizes}
    CACHE.mkdir(parents=True, exist_ok=True)
    cache.write_text(json.dumps(res), encoding="utf-8")
    return res


def main():
    html = get(EPUB_INDEX).decode("utf-8")
    epubs = {}
    for href in re.findall(r'href="(Tanakh fluent [^"]+\.epub)"', html):
        m = re.match(r"Tanakh fluent (\d+)-", href)
        epubs[int(m.group(1))] = EPUB_INDEX + urllib.parse.quote(href)
    meta = json.loads(get(f"https://archive.org/metadata/{ITEM}"))
    by_size = {}
    lengths = {}
    for f in meta["files"]:
        if f["name"].endswith(".mp3"):
            by_size.setdefault(int(f["size"]), []).append(f["name"])
            lengths[f["name"]] = float(f.get("length") or 0)
    mapper = oshb_mapper()
    chapters = defaultdict(lambda: {"url": None, "verses": {}, "duration": 0})
    skipped = 0
    files, segments = {}, {}
    for n in sorted(epubs):
        sm = book_smil(epubs[n], str(n))
        # USFM-код книги — из имени mp3 в ePub: 00-RUT-001.mp3
        for c, v, beg, end, mp3 in sm["parts"]:
            usfm = mp3.split("-")[1]
            book = USFM_BOOKS[usfm]
            names = by_size.get(sm["sizes"][mp3], [])
            if len(names) > 1:  # два файла одного размера — выбираем по номеру главы в имени
                names = [x for x in names if re.search(rf"_0*{c}\.mp3$", x)] or names
            if len(names) != 1:
                skipped += 1
                continue
            url = f"https://archive.org/download/{ITEM}/{names[0]}"
            sb, sc, sv = mapper(book, c, v)
            # Разметка стиха целиком (для подстрочника): файл, начало, конец
            fi = files.setdefault(url, len(files))
            seg = segments.get(f"{sb}.{sc}.{sv}")
            if seg is None:
                segments[f"{sb}.{sc}.{sv}"] = [fi, beg, end]
            elif seg[0] == fi:
                seg[1], seg[2] = min(seg[1], beg), max(seg[2], end)
            ch = chapters[f"{sb}.{sc}"]
            if ch["url"] is None:
                ch["url"], ch["duration"] = url, lengths[names[0]]
            if ch["url"] != url:
                skipped += 1  # синодальная глава захватывает стихи другой еврейской главы (Иоиль, Малахия…)
                continue
            if sv not in ch["verses"] or beg < ch["verses"][sv]:
                ch["verses"][sv] = beg
        print(n, flush=True)
    out = {}
    for k in sorted(chapters, key=lambda x: (x.split(".")[0], int(x.split(".")[1]))):
        ch = chapters[k]
        out[k] = {"url": ch["url"], "verses": sorted([[v, round(t, 2)] for v, t in ch["verses"].items()]), "duration": ch["duration"]}
    module = {
        "format": "aob-module", "formatVersion": 1, "type": "audio",
        "id": "audio-hbo-shmuelof", "name": "Аудио ВЗ (иврит)",
        "title": "Ветхий Завет на иврите — живое чтение Авраама Шмуэлофа",
        "description": "Еврейский текст Ветхого Завета читает Авраам Шмуэлоф (живой голос, современное израильское "
                       "произношение). Запись на каждую главу, время стихов — разметка авторов из аудиокниг eBible.org. "
                       "Звучит в подстрочнике: кнопка «Слушать» у стиха.",
        "language": "he", "version": "eBible.org (2016)", "author": "Авраам Шмуэлоф; публикация — eBible.org",
        "source": f"https://archive.org/details/{ITEM}",
        "license": "CC BY-NC-ND 4.0 (записи не изменяются, проигрываются с archive.org)",
        "translation": "oshb", "versification": "synodal", "chapters": out,
        "files": list(files), "segments": {k: [v[0], round(v[1], 2), round(v[2], 2)] for k, v in segments.items()},
    }
    entry = write_module(module)
    merge_catalog([entry])
    approved = json.loads(APPROVED.read_text(encoding="utf-8"))
    if module["id"] not in approved["ids"]:
        approved["ids"].append(module["id"])
        APPROVED.write_text(json.dumps(approved, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"глав: {len(out)}, стихов в главах: {sum(len(c['verses']) for c in out.values())}, стихов с разметкой: {len(segments)}, пропущено частей (другая запись): {skipped}")


if __name__ == "__main__":
    main()
