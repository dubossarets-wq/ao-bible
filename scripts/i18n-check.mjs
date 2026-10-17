// Словари интерфейса: собирает строки t('…') и N_('…') из src и сверяет с src/i18n/<код>.json.
// Запуск:
//   node scripts/i18n-check.mjs               — сколько строк, чего не хватает в каждом словаре, лишние ключи
//   node scripts/i18n-check.mjs --raw         — строки кода с кириллицей вне t()/N_() (кандидаты на перевод)
//   node scripts/i18n-check.mjs --keys f.json — записать все ключи в файл (заготовка для нового словаря)
//   node scripts/i18n-check.mjs --prune       — убрать из словарей ключи, которых больше нет в коде
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'src');
const dictDir = path.join(src, 'i18n');
const args = process.argv.slice(2);

async function walk(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (p !== dictDir) out.push(...(await walk(p)));
    } else if (/\.(jsx?|mjs)$/.test(e.name)) out.push(p);
  }
  return out;
}

// t('…'), t("…"), t(`…`) без ${} и N_(…) — первым аргументом строка
const CALL = /\b(?:t|N_)\(\s*(?:'((?:\\.|[^'\\])*)'|"((?:\\.|[^"\\])*)"|`((?:\\.|[^`\\$])*)`)/g;
const unescape = (s) => s.replace(/\\(u\{[0-9a-fA-F]+\}|u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|.)/g, (m, c) => {
  if (c[0] === 'u') return String.fromCodePoint(parseInt(c.replace(/[u{}]/g, ''), 16));
  if (c[0] === 'x') return String.fromCharCode(parseInt(c.slice(1), 16));
  return { n: '\n', t: '\t', r: '\r' }[c] ?? c;
});

const keys = new Map(); // ключ → файлы
const raw = [];
for (const file of await walk(src)) {
  const text = await readFile(file, 'utf8');
  const rel = path.relative(root, file).replace(/\\/g, '/');
  for (const m of text.matchAll(CALL)) {
    const k = unescape(m[1] ?? m[2] ?? m[3]);
    if (!keys.has(k)) keys.set(k, new Set());
    keys.get(k).add(rel);
  }
  if (args.includes('--raw')) {
    let skip = false; // между «i18n-ignore-start» и «i18n-ignore-end» — данные по-русски, не подписи
    text.split(/\r?\n/).forEach((line, i) => {
      if (line.includes('i18n-ignore-start')) skip = true;
      if (line.includes('i18n-ignore-end')) skip = false;
      if (skip || /^\s*(\/\/|\*|\/\*)/.test(line) || line.includes('i18n-ignore')) return;
      const rest = line.replace(CALL, '').replace(/\{\/\*.*?\*\/\}/g, '').replace(/\/\/.*$/, '');
      if (/[А-Яа-яЁё]/.test(rest)) raw.push(`${rel}:${i + 1}: ${line.trim().slice(0, 160)}`);
    });
  }
}

// Названия и описания готовых планов чтения и подписи фото-фонов: данные по-русски, переводятся при показе — t(plan.name)
for (const [file, pick] of [
  ['public/plans/index.json', (j) => j.plans.flatMap((p) => [p.name, p.description])],
  ['public/images/verse-bg/index.json', (j) => j.images.map((im) => im.title)],
]) {
  for (const k of pick(JSON.parse(await readFile(path.join(root, file), 'utf8'))).filter(Boolean)) {
    if (!keys.has(k)) keys.set(k, new Set());
    keys.get(k).add(file);
  }
}

// Грамматические термины разбора слов (src/core/morph.js переводит их при показе): поля «ru» в morphData.json
{
  const walk = (o) => {
    if (!o || typeof o !== 'object') return;
    if (typeof o.ru === 'string') {
      if (!keys.has(o.ru)) keys.set(o.ru, new Set());
      keys.get(o.ru).add('src/core/morphData.json');
    }
    for (const v of Object.values(o)) walk(v);
  };
  walk(JSON.parse(await readFile(path.join(src, 'core/morphData.json'), 'utf8')));
}

const params = (s) => [...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
console.log(`строк интерфейса: ${keys.size}`);
const prune = args.includes('--prune');
for (const f of (await readdir(dictDir)).filter((f) => f.endsWith('.json')).sort()) {
  const p = path.join(dictDir, f);
  const dict = JSON.parse(await readFile(p, 'utf8'));
  const missing = [...keys.keys()].filter((k) => !(k in dict));
  const extra = Object.keys(dict).filter((k) => !keys.has(k));
  const bad = [];
  for (const [k, v] of Object.entries(dict)) {
    if (!keys.has(k)) continue;
    const vals = k.includes('|') ? (v && typeof v === 'object' ? Object.values(v) : [null]) : [v];
    const want = params(k.split('|')[0]);
    for (const x of vals) if (typeof x !== 'string' || params(x) !== want) bad.push(k);
  }
  console.log(`${f.padEnd(8)} нет: ${missing.length}, лишних: ${extra.length}, с ошибкой подстановок: ${new Set(bad).size}`);
  if (args.includes('-v')) {
    for (const k of missing) console.log('   нет  ', k);
    for (const k of new Set(bad)) console.log('   ошибка', k, '→', JSON.stringify(dict[k]));
  }
  if (prune && extra.length) {
    for (const k of extra) delete dict[k];
    await writeFile(p, JSON.stringify(dict, null, 1) + '\n');
  }
}
const ki = args.indexOf('--keys');
if (ki >= 0) {
  await writeFile(args[ki + 1], JSON.stringify(Object.fromEntries([...keys.keys()].map((k) => [k, [...keys.get(k)].join(' ')])), null, 1));
  console.log(`ключи записаны: ${args[ki + 1]}`);
}
if (raw.length) {
  console.log(`\nкириллица вне t(): ${raw.length}`);
  for (const r of raw) console.log(r);
}
