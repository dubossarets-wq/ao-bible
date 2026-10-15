#!/usr/bin/env python3
"""Фоны для «картинки со стихом»: public/images/verse-bg/NN.jpg, NN-t.jpg и index.json.

Источник — только Wikimedia Commons, и только файлы с лицензией «Public domain» или «CC0»
(поле extmetadata.LicenseShortName из API Commons). Если у файла лицензия иная — скрипт
останавливается и ничего не пишет.

Для каждого фото:
  * исходник скачивается в data-src/verse-bg-src/ (в git не попадает);
  * вертикальный кадр 4:5 (обрезка по высоте целиком, горизонтальный центр — поле fx),
    1080×1350, JPEG ~80 (качество снижается, пока файл не станет ≤ 220 КБ, но не ниже 68);
  * миниатюра 160×200, JPEG 70;
  * метаданные (EXIF и пр.) не переносятся, цвет приводится к sRGB.

Запуск (из корня проекта):
  python -I scripts/build_verse_bg.py            # скачать недостающее и пересобрать всё
  python -I scripts/build_verse_bg.py --check    # только проверить лицензии по API
Pillow: берётся из системного Python; если его нет —
  python -m pip install --target .pylib-img pillow
"""
import io
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.append(os.path.join(ROOT, ".pylib-img"))
from PIL import Image, ImageCms, ImageFilter, ImageOps, ImageStat  # noqa: E402

SRC_DIR = os.path.join(ROOT, "data-src", "verse-bg-src")
OUT_DIR = os.path.join(ROOT, "public", "images", "verse-bg")
API = "https://commons.wikimedia.org/w/api.php"
UA = "AOBible-verse-bg/1.0 (personal Bible PWA; github.com/dubossarets-wq)"
ALLOWED = {"Public domain", "CC0"}
SIZE, THUMB = (1080, 1350), (160, 200)
MAX_BYTES = 220 * 1024

# id, файл на Commons, название, горизонтальный центр кадра (0..1), тон (dark — белый текст
# читается и так; light — приложение затемнит сильнее)
IMAGES = [
    ("01", "Mediteranian sea at sunrise.jpg", "Рассвет над морем", 0.66, "dark"),
    ("02", "Sea of Galilee at sunset DSF0254.jpg", "Галилейское море на закате", 0.5, "dark"),
    ("03", "View of the Negev from Masada at sunrise DSF2801.jpg", "Пустыня у Масады на рассвете", 0.4, "dark"),
    ("04", "Har 'Arif Makhtesh 041014.jpg", "Пустыня Негев", 0.5, "light"),
    ("05", "Olive tree Testour.jpg", "Оливковое дерево", 0.38, "light"),
    ("06", "Barley field, Ehrenbach, cloud.jpg", "Ячменное поле вечером", 0.55, "dark"),
    ("07", "Milky Way and starry night sky (26972689115).jpg", "Звёздное небо", 0.66, "dark"),
    ("08", "Foggy forest hillside.jpg", "Лес в тумане", 0.5, "light"),
    ("09", "Sunrise on Lake McDonald (5431843828).jpg", "Снежные горы над озером", 0.45, "light"),
    ("10", "Sunrise on Yellowstone Lake (Flat Mountain Arm) (32985162453).jpg", "Заря над озером", 0.5, "dark"),
    ("11", "Sea sky and clouds, Ibiza, Spain.jpg", "Море и облака", 0.5, "light"),
    ("12", "Bank of pink clouds over Gåseberg 2.jpg", "Облака на закате", 0.55, "dark"),
]


def http_get(url, tries=6):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=180) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            if e.code not in (429, 500, 502, 503, 504) or i == tries - 1:
                raise
            wait = e.headers.get("Retry-After", "")
            time.sleep(int(wait) if wait.isdigit() else 20 * (i + 1))


def strip_html(s):
    s = re.sub(r"<[^>]+>", " ", s or "")
    s = re.sub(r"\s+", " ", s).strip()
    return s.replace("&amp;", "&").replace("&quot;", '"').replace("&#039;", "'")


def fetch_meta(names):
    titles = ["File:" + n for n in names]
    q = urllib.parse.urlencode({
        "action": "query", "prop": "imageinfo", "titles": "|".join(titles), "format": "json",
        "iiprop": "url|size|sha1|extmetadata",
        "iiextmetadatafilter": "LicenseShortName|License|Artist|Credit|UsageTerms",
    })
    data = json.loads(http_get(API + "?" + q))
    norm = {n["to"]: n["from"] for n in data["query"].get("normalized", [])}
    out = {}
    for p in data["query"]["pages"].values():
        title = norm.get(p["title"], p["title"])
        if "imageinfo" not in p:
            raise SystemExit(f"Нет файла на Commons: {title}")
        ii = p["imageinfo"][0]
        em = ii.get("extmetadata", {})
        out[title[5:]] = {
            "license": em.get("LicenseShortName", {}).get("value", ""),
            "license_code": em.get("License", {}).get("value", ""),
            "author": strip_html(em.get("Artist", {}).get("value", "")),
            "url": ii["url"], "page": ii["descriptionurl"], "sha1": ii["sha1"],
            "width": ii["width"], "height": ii["height"],
        }
    return out


def to_srgb(im):
    icc = im.info.get("icc_profile")
    if icc:
        try:
            src = ImageCms.ImageCmsProfile(io.BytesIO(icc))
            im = ImageCms.profileToProfile(im, src, ImageCms.createProfile("sRGB"), outputMode="RGB")
        except Exception:
            pass
    return im.convert("RGB")


def crop_45(im, fx):
    w, h = im.size
    tw = round(h * 4 / 5)
    if tw <= w:
        left = min(max(round(w * fx - tw / 2), 0), w - tw)
        return im.crop((left, 0, left + tw, h))
    th = round(w * 5 / 4)
    top = (h - th) // 2
    return im.crop((0, top, w, top + th))


def encode(im, quality):
    buf = io.BytesIO()
    im.save(buf, "JPEG", quality=quality, optimize=True, progressive=True, subsampling="4:2:0")
    return buf.getvalue()


def save_jpeg(im, path, quality, limit=None):
    """Пишет JPEG. С limit: снижает качество до 72; если мелкая фактура (звёзды, камни) всё ещё
    не влезает — слегка размывает (под текстом это даже на пользу). Возвращает (описание, байты)."""
    note, data = f"q{quality}", encode(im, quality)
    if limit:
        q = quality
        while len(data) > limit and q > 72:
            q -= 2
            note, data = f"q{q}", encode(im, q)
        for r in (0.5, 0.8, 1.1, 1.5, 2.0):
            if len(data) <= limit:
                break
            soft = im.filter(ImageFilter.GaussianBlur(r))
            note, data = f"q76 blur{r}", encode(soft, 76)
    with open(path, "wb") as f:
        f.write(data)
    return note, len(data)


def main():
    check_only = "--check" in sys.argv
    meta = fetch_meta([x[1] for x in IMAGES])
    bad = [(n, m["license"]) for n, m in meta.items() if m["license"] not in ALLOWED]
    for n, m in meta.items():
        print(f"  {m['license']:14} {m['width']}x{m['height']}  {n}")
    if bad:
        raise SystemExit("Недопустимая лицензия: " + "; ".join(f"{n} — {lic}" for n, lic in bad))
    small = [n for n, m in meta.items() if min(m["width"], m["height"]) < 1600]
    if small:
        raise SystemExit("Слишком маленький исходник: " + "; ".join(small))
    if check_only:
        print("Лицензии в порядке.")
        return

    os.makedirs(SRC_DIR, exist_ok=True)
    os.makedirs(OUT_DIR, exist_ok=True)
    index = []
    for iid, name, title, fx, tone in IMAGES:
        m = meta[name]
        ext = os.path.splitext(m["url"])[1].lower() or ".jpg"
        src = os.path.join(SRC_DIR, f"{iid}{ext}")
        if not os.path.exists(src) or os.path.getsize(src) == 0:
            print(f"  скачиваю {name} …")
            blob = http_get(m["url"])
            with open(src, "wb") as f:
                f.write(blob)
            time.sleep(15)  # upload.wikimedia.org строго ограничивает скачивание оригиналов
        with Image.open(src) as im:
            im.load()
            im = to_srgb(ImageOps.exif_transpose(im))
        frame = crop_45(im, fx)
        big = frame.resize(SIZE, Image.LANCZOS)
        q, size = save_jpeg(big, os.path.join(OUT_DIR, f"{iid}.jpg"), 80, MAX_BYTES)
        _, tsize = save_jpeg(frame.resize(THUMB, Image.LANCZOS), os.path.join(OUT_DIR, f"{iid}-t.jpg"), 70)
        lum = ImageStat.Stat(big.convert("L")).mean[0]
        print(f"  {iid}.jpg  {q}  {size // 1024} КБ, миниатюра {tsize // 1024} КБ, яркость {lum:.0f}, {tone}")
        index.append({
            "id": iid, "file": f"{iid}.jpg", "thumb": f"{iid}-t.jpg", "title": title,
            "author": m["author"], "license": m["license"], "source": m["page"], "tone": tone,
        })
    with open(os.path.join(OUT_DIR, "index.json"), "w", encoding="utf-8", newline="\n") as f:
        json.dump({"images": index}, f, ensure_ascii=False, indent=1)
        f.write("\n")
    print(f"Готово: {len(index)} фонов в {OUT_DIR}")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
