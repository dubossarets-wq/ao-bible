// Словари по частям (modules/dict-idx/): приложение показывает статьи из словарей, которые человек ещё не скачал.
// Целиком словарь — до 23 МБ, поэтому статьи разложены по первым буквам ключа в маленькие сжатые файлы
// (≈ 200 КБ до сжатия). Приложение берёт только ту часть, где лежит искомое слово или номер Стронга.
//
//   modules/dict-idx/index.json — список: id, название, язык, вид (words | strongs), начала ключей частей
//                                 (shards) и частей индекса «словоформа → номера Стронга» (wshards)
//   modules/dict-idx/<id>/<n>.json.gz  — { ключ: статья } для части shards[n]
//   modules/dict-idx/<id>/w<n>.json.gz — { словоформа: [[номер, частота], …] } для части wshards[n]
//
// Часть — все ключи с одинаковым началом в 2 буквы; слишком большая делится по 3, 4… буквам (ключи короче
// остаются в части с началом-ключом). Ключ всегда лежит ровно в одной части; часть ищется по условию
// «ключ начинается с начала части».
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import path from 'node:path';

const LIMIT = 200 * 1024;

function split(obj) {
  const keys = Object.keys(obj).sort();
  const shards = [];
  const sizeOf = (ks) => ks.reduce((s, k) => s + k.length + JSON.stringify(obj[k]).length + 4, 0);
  const cps = (k) => Array.from(k);
  const place = (ks, len) => {
    const groups = new Map();
    for (const k of ks) {
      const p = cps(k).slice(0, len).join('');
      if (!groups.has(p)) groups.set(p, []);
      groups.get(p).push(k);
    }
    for (const [p, g] of groups) {
      const longer = g.filter((k) => cps(k).length > len);
      if (sizeOf(g) > LIMIT && len < 8 && longer.length) {
        const short = g.filter((k) => cps(k).length <= len);
        if (short.length) shards.push([p, short]);
        place(longer, len + 1);
      } else {
        shards.push([p, g]);
      }
    }
  };
  place(keys, 2);
  return shards;
}

async function writeShards(dir, prefix, obj, shards) {
  for (let i = 0; i < shards.length; i++) {
    const part = {};
    for (const k of shards[i][1]) part[k] = obj[k];
    await writeFile(path.join(dir, `${prefix}${i}.json.gz`), gzipSync(Buffer.from(JSON.stringify(part)), { level: 9 }));
  }
}

/** modules — записи каталога (только одобренные), src — папка public/modules, out — dist/…/modules/dict-idx */
export async function buildDictIndex(modules, src, out) {
  const dicts = [];
  let files = 0;
  for (const m of modules.filter((x) => x.type === 'dictionary')) {
    const file = path.join(src, m.url || `${m.id}.json`);
    let j;
    try {
      j = JSON.parse(await readFile(file, 'utf8'));
    } catch {
      continue;
    }
    const entries = j.entries;
    if (!entries || typeof entries !== 'object' || Array.isArray(entries)) continue;
    const dir = path.join(out, m.id);
    await mkdir(dir, { recursive: true });
    const shards = split(entries);
    await writeShards(dir, '', entries, shards);
    files += shards.length;
    const d = {
      id: m.id,
      name: m.name || j.name || m.id,
      title: m.title || j.title || '',
      language: m.language || j.language || '',
      kind: m.dictionaryKind || j.dictionaryKind || 'words',
      shards: shards.map((s) => s[0]),
    };
    if (j.wordIndex && typeof j.wordIndex === 'object') {
      const ws = split(j.wordIndex);
      await writeShards(dir, 'w', j.wordIndex, ws);
      files += ws.length;
      d.wshards = ws.map((s) => s[0]);
    }
    dicts.push(d);
  }
  await mkdir(out, { recursive: true });
  await writeFile(path.join(out, 'index.json'), JSON.stringify({ format: 'aob-dict-index', formatVersion: 1, dicts }));
  return { dicts: dicts.length, files };
}
