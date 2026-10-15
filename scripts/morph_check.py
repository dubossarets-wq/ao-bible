"""Проверка таблиц расшифровки морфологии src/core/morphData.json на реальных кодах модулей.

Берёт все морфологические коды из public/modules/byz-rp2018.json (коды Робинсона) и
public/modules/oshb.json (коды OSHB) — третье поле разметки {слово|Стронг|код} — и разбирает
каждый по morphData.json. Код считается разобранным полностью, если каждая его часть нашлась
в таблицах (нет «неизвестных» частей). Выводит статистику покрытия по уникальным кодам и по
словоупотреблениям, а также примеры.

Функции parse_greek() / parse_hebrew() / describe() — эталонная реализация разбора: приложение
(src/core/morph.js) может повторить её один в один.

Запуск:
  python -I scripts/morph_check.py            — статистика и примеры
  python -I scripts/morph_check.py -v         — плюс полный список неразобранных кодов
  python -I scripts/morph_check.py V-PAI-1S HC/Vqw3ms   — разобрать отдельные коды
Код возврата 1, если хоть один код из модулей не разобран полностью.
"""
import json
import re
import sys
from collections import Counter
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):          # консоль Windows (cp1251) не должна ронять вывод
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parent.parent
DATA = json.loads((ROOT / "src" / "core" / "morphData.json").read_text(encoding="utf-8"))
MODULES = {"greek": "byz-rp2018", "hebrew": "oshb"}


# ---------------------------------------------------------------------------------------------
# Разбор
# ---------------------------------------------------------------------------------------------

def slot_table(section, name, lang=None):
    by_lang = section.get("slotsByLanguage", {})
    if name in by_lang:
        return by_lang[name].get(lang, {})
    return section["slots"].get(name, {})


def match_form(section, form, body, lang=None):
    """Разбор тела кода по одной форме. Возвращает список (slot, key, value|None) или None."""
    ph = section.get("placeholder")
    pos, out = 0, []
    for name in form["slots"]:
        if pos == len(body):
            if section.get("allowShort"):
                break                           # хвостовые слоты опущены
            return None
        if name == "-":
            if body[pos] != "-":
                return None
            pos += 1
            continue
        if ph and body[pos] == ph:
            out.append((name, ph, None))
            pos += 1
            continue
        table = slot_table(section, name, lang)
        key = next((body[pos:pos + n] for n in range(min(4, len(body) - pos), 0, -1)
                    if body[pos:pos + n] in table), None)
        if key is None:
            return None
        out.append((name, key, table[key]))
        pos += len(key)
    if pos != len(body):
        return None
    for name, allowed in form.get("when", {}).items():
        got = next((k for n, k, _ in out if n == name), None)
        if got is not None and got != ph and got not in allowed:
            return None
    return out


def parse_body(section, pos_code, body, lang=None):
    """→ {'pos', 'posInfo', 'slots': [...]} или {'pos', 'error'}."""
    info = section["pos"].get(pos_code)
    if info is None:
        return {"pos": pos_code, "error": f"неизвестная часть речи {pos_code!r}"}
    for form in info["forms"]:
        slots = match_form(section, form, body, lang)
        if slots is not None:
            return {"pos": pos_code, "posInfo": info, "slots": slots}
    return {"pos": pos_code, "posInfo": info, "error": f"не разобрано {body!r}"}


def parse_greek(code):
    g = DATA["greek"]
    parts = code.split(g["separator"])
    suffixes = []
    while len(parts) > 1 and parts[-1] in g["suffixes"]:
        suffixes.insert(0, parts.pop())
    seg = parse_body(g, parts[0], g["separator"].join(parts[1:]))
    seg["suffixes"] = [(s, g["suffixes"][s]) for s in suffixes]
    return {"code": code, "lang": "greek", "segments": [seg]}


def parse_hebrew(code):
    h = DATA["hebrew"]
    lang = code[:1]
    if lang not in h["languages"]:
        return {"code": code, "lang": lang, "segments": [{"pos": "", "error": f"неизвестный язык {lang!r}"}]}
    segs = []
    for s in code[1:].split(h["segmentSeparator"]):
        seg = parse_body(h, s[:1], s[1:], lang) if s else {"pos": "", "error": "пустой сегмент"}
        seg["suffixes"] = []
        segs.append(seg)
    return {"code": code, "lang": lang, "segments": segs}


def parse(code):
    # OSHB: язык H/A и дальше без дефисов; Робинсон: заглавные латинские буквы, цифры, дефисы
    if re.fullmatch(r"[HA][A-Za-z0-9/]*", code) and "-" not in code and code not in DATA["greek"]["pos"]:
        return parse_hebrew(code)
    return parse_greek(code)


def ok(parsed):
    return all("error" not in s for s in parsed["segments"])


def describe(parsed, short=False):
    key = "abbr" if short else "ru"
    texts = []
    for s in parsed["segments"]:
        if "error" in s:
            texts.append(f"?{s['pos']}")
            continue
        words = [s["posInfo"][key]] + [v[key] for _, _, v in s["slots"] if v] + [v[key] for _, v in s["suffixes"]]
        texts.append(", ".join(words))
    return " + ".join(texts)


# ---------------------------------------------------------------------------------------------
# Проверка покрытия
# ---------------------------------------------------------------------------------------------

def module_codes(module_id):
    path = ROOT / "public" / "modules" / f"{module_id}.json"
    mod = json.loads(path.read_text(encoding="utf-8"))
    codes = Counter()
    for b in mod["books"]:
        for ch in b["chapters"]:
            for v in ch:
                for tok in re.findall(r"\{([^{}]*)\}", v):
                    f = tok.split("|")
                    if len(f) >= 3 and f[2]:
                        codes[f[2]] += 1
    return codes


def check(verbose=False):
    failed = 0
    for lang, mid in MODULES.items():
        codes = module_codes(mid)
        fn = parse_greek if lang == "greek" else parse_hebrew
        bad = {c: n for c, n in codes.items() if not ok(fn(c))}
        total, uses = len(codes), sum(codes.values())
        bad_uses = sum(bad.values())
        print(f"{mid} ({DATA[lang]['scheme']}): уникальных кодов {total}, разобрано полностью "
              f"{total - len(bad)} ({100 * (total - len(bad)) / total:.2f} %); "
              f"словоупотреблений {uses}, разобрано {uses - bad_uses} ({100 * (uses - bad_uses) / uses:.2f} %)")
        if lang == "hebrew":
            segs = Counter()
            for c, n in codes.items():
                segs[len(c[1:].split("/"))] += n
            print("  частей в коде (приставки/слово/суффиксы): " +
                  ", ".join(f"{k} — {v}" for k, v in sorted(segs.items())))
        for c, n in sorted(bad.items(), key=lambda kv: -kv[1])[: None if verbose else 20]:
            p = fn(c)
            errs = "; ".join(s["error"] for s in p["segments"] if "error" in s)
            print(f"  НЕ РАЗОБРАН {c} ×{n}: {errs}")
        failed += len(bad)
        top = [c for c, _ in codes.most_common(5)]
        for c in top:
            print(f"  {c:<14} {describe(fn(c))}")
    return failed


def main(argv):
    args = [a for a in argv if not a.startswith("-")]
    if args:
        for c in args:
            p = parse(c)
            print(f"{c}: {describe(p)}  [{describe(p, short=True)}]" + ("" if ok(p) else "  — ЕСТЬ НЕИЗВЕСТНЫЕ ЧАСТИ"))
        return 0
    failed = check(verbose="-v" in argv)
    print("Итог: все коды разобраны полностью" if not failed else f"Итог: не разобрано {failed} кодов")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
