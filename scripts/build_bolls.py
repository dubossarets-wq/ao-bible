"""Переводы с bolls.life, которых нет ни в нашем каталоге, ни в bible.helloao.org: python scripts/build_bolls.py

У Bolls большинство переводов защищены авторским правом (НРП, NKJV, ESV…) — их не берём. Здесь только тексты
в общественном достоянии; Bolls разрешает скачивать переводы целиком (docs/API.md: «download the translation…»).
Пишет public/modules/<id>.json(.gz) и строки каталога (public/modules/catalog.json), добавляет id в
scripts/approved-modules.json.
"""
import gzip
import json
import os
import sys
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MOD = os.path.join(ROOT, 'public', 'modules')

# книги Bolls по номерам (1–66 — протестантский канон)
ORDER = ['Gen', 'Exod', 'Lev', 'Num', 'Deut', 'Josh', 'Judg', 'Ruth', '1Sam', '2Sam', '1Kgs', '2Kgs', '1Chr', '2Chr', 'Ezra', 'Neh',
         'Esth', 'Job', 'Ps', 'Prov', 'Eccl', 'Song', 'Isa', 'Jer', 'Lam', 'Ezek', 'Dan', 'Hos', 'Joel', 'Amos', 'Obad', 'Jonah', 'Mic',
         'Nah', 'Hab', 'Zeph', 'Hag', 'Zech', 'Mal', 'Matt', 'Mark', 'Luke', 'John', 'Acts', 'Rom', '1Cor', '2Cor', 'Gal', 'Eph', 'Phil',
         'Col', '1Thess', '2Thess', '1Tim', '2Tim', 'Titus', 'Phlm', 'Heb', 'Jas', '1Pet', '2Pet', '1John', '2John', '3John', 'Jude', 'Rev']

MODULES = [
    {
        'bolls': 'KB',
        'id': 'karoli1908',
        'name': 'Károli 1908',
        'title': 'Károli Biblia (revideált kiadás, 1908)',
        'description': 'Венгерская Библия Гашпара Кароли (1590) в пересмотренном издании 1908 года — классический протестантский перевод.',
        'language': 'hu',
        'author': 'Gáspár Károli (1529–1591); пересмотр 1908 г.',
        'license': 'Public Domain',
    },
    {
        'bolls': 'PCB',
        'id': 'peking1899',
        'name': '京委本',
        'title': '京委本聖經 (Peking Committee Bible, 1899)',
        'description': 'Китайская Библия на мандаринском наречии, перевод Пекинского комитета (XIX век), издание 1899 года.',
        'language': 'zh',
        'author': 'Пекинский комитет переводчиков',
        'license': 'Public Domain',
    },
]


def strip(s):
    # стих у Bolls — HTML: оставляем текст
    import re
    s = re.sub(r'<br\s*/?>', ' ', s)
    s = re.sub(r'<[^>]+>', '', s)
    s = s.replace('{', '').replace('}', '')
    return re.sub(r'\s+', ' ', s).strip()


def build(m):
    url = f"https://bolls.life/static/translations/{m['bolls']}.json"
    with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'AOBible-build'})) as r:
        verses = json.load(r)
    books = {}
    for v in verses:
        if not 1 <= v['book'] <= 66 or v['chapter'] < 1 or v['verse'] < 1:
            continue
        ch = books.setdefault(ORDER[v['book'] - 1], {}).setdefault(v['chapter'], {})
        ch[v['verse']] = strip(v['text'])
    out_books = []
    for bid in ORDER:
        if bid not in books:
            continue
        chs = books[bid]
        chapters = []
        for c in range(1, max(chs) + 1):
            vs = chs.get(c, {})
            chapters.append([vs.get(i, '') for i in range(1, (max(vs) if vs else 0) + 1)])
        out_books.append({'id': bid, 'chapters': chapters})
    mod = {
        'format': 'aob-module', 'formatVersion': 1, 'type': 'bible', 'versification': 'kjv',
        'id': m['id'], 'name': m['name'], 'title': m['title'], 'language': m['language'], 'description': m['description'],
        'version': f"bolls.life {m['bolls']}", 'author': m['author'],
        'source': f"https://bolls.life/{m['bolls']}/1/1/ (полный текст: {url})", 'license': m['license'],
        'features': {}, 'books': out_books,
    }
    raw = json.dumps(mod, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
    with open(os.path.join(MOD, m['id'] + '.json'), 'wb') as f:
        f.write(raw)
    gz = gzip.compress(raw, 9)
    with open(os.path.join(MOD, m['id'] + '.json.gz'), 'wb') as f:
        f.write(gz)
    entry = {k: mod[k] for k in ('id', 'type', 'name', 'title', 'description', 'language', 'version', 'author', 'source', 'license', 'features', 'versification')}
    entry.update({'url': m['id'] + '.json', 'urlGz': m['id'] + '.json.gz', 'size': len(raw), 'sizeGz': len(gz)})
    print(m['id'], len(out_books), 'книг', sum(len(c) for b in out_books for c in b['chapters']), 'стихов', len(gz) // 1024, 'КБ')
    return entry


def main():
    entries = [build(m) for m in MODULES]
    cat_path = os.path.join(MOD, 'catalog.json')
    cat = json.load(open(cat_path, encoding='utf-8'))
    ids = {e['id'] for e in entries}
    cat['modules'] = [m for m in cat['modules'] if m['id'] not in ids] + entries
    with open(cat_path, 'w', encoding='utf-8', newline='\n') as f:
        f.write(json.dumps(cat, ensure_ascii=False, indent=1) + '\n')
    ap_path = os.path.join(ROOT, 'scripts', 'approved-modules.json')
    ap = json.load(open(ap_path, encoding='utf-8'))
    for i in ids:
        if i not in ap['ids']:
            ap['ids'].append(i)
    with open(ap_path, 'w', encoding='utf-8', newline='\n') as f:
        f.write(json.dumps(ap, ensure_ascii=False, indent=1) + '\n')


if __name__ == '__main__':
    sys.exit(main())
