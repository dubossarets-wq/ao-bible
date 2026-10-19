"""Вежливая загрузка страниц biblia.russportal.ru (кодировка windows-1251) в кэш data-src/ru-old/cache/."""
import gzip
import hashlib
import re
import time
import urllib.request
from pathlib import Path

CACHE = Path(__file__).resolve().parent.parent / "data-src" / "ru-old" / "cache"
UA = "AOBible/1.0 (https://dubossarets-wq.github.io/ao-bible/)"
BASE = "http://biblia.russportal.ru/index.php?id="  # у https-сертификата другое имя хоста
_last = [0.0]


def page(pid, pause=1.1):
    """HTML страницы index.php?id=<pid>; из кэша, иначе с сайта (пауза >= 1 с между запросами)."""
    CACHE.mkdir(parents=True, exist_ok=True)
    f = CACHE / (re.sub(r"[^\w.-]", "_", pid) + ".html")
    if f.exists() and f.stat().st_size > 500:
        return f.read_text(encoding="utf-8")
    for attempt in range(4):
        wait = pause - (time.time() - _last[0])
        if wait > 0:
            time.sleep(wait)
        _last[0] = time.time()
        try:
            req = urllib.request.Request(BASE + pid, headers={"User-Agent": UA, "Accept-Encoding": "gzip"})
            with urllib.request.urlopen(req, timeout=60) as r:
                d = r.read()
                if r.headers.get("Content-Encoding") == "gzip":
                    d = gzip.decompress(d)
            t = d.decode("cp1251", errors="replace")
            f.write_text(t, encoding="utf-8")
            return t
        except Exception as e:  # noqa: BLE001
            print("  повтор", pid, e)
            time.sleep(3 * (attempt + 1))
    raise RuntimeError("не удалось загрузить " + pid)


def url_page(url, name, enc="utf-8", pause=1.1):
    """Произвольный адрес в кэш (имя файла — name)."""
    CACHE.mkdir(parents=True, exist_ok=True)
    f = CACHE / (re.sub(r"[^\w.-]", "_", name) + ".html")
    if f.exists() and f.stat().st_size > 500:
        return f.read_text(encoding="utf-8")
    for attempt in range(4):
        wait = pause - (time.time() - _last[0])
        if wait > 0:
            time.sleep(wait)
        _last[0] = time.time()
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Encoding": "gzip"})
            with urllib.request.urlopen(req, timeout=60) as r:
                d = r.read()
                if r.headers.get("Content-Encoding") == "gzip":
                    d = gzip.decompress(d)
            t = d.decode(enc, errors="replace")
            f.write_text(t, encoding="utf-8")
            return t
        except Exception as e:  # noqa: BLE001
            print("  повтор", name, e)
            time.sleep(3 * (attempt + 1))
    raise RuntimeError("не удалось загрузить " + url)
