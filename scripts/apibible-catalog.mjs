// Каталог переводов API.Bible (читаются по сети, не скачиваются): node scripts/apibible-catalog.mjs
// Ходит через наш посредник https://aobible.app/bapi (ключ — секрет на Cloudflare, здесь его нет).
// Пишет scripts/apibible-catalog.json: строки каталога и книги каждого перевода (OSIS-код → число глав).
// Книги уже собранных переводов не запрашиваются повторно — запросы к API на счету (5000 в месяц).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { USFM } from './usfm.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT = path.join(ROOT, 'scripts', 'apibible-catalog.json');
const BASE = 'https://aobible.app/bapi';
const get = async (p) => {
  const r = await fetch(BASE + p, { headers: { origin: 'https://aobible.app' } });
  if (!r.ok) throw new Error(`${p}: ${r.status}`);
  return (await r.json()).data;
};

// Эти переводы уже есть в каталоге приложения обычными модулями — по сети их не предлагаем
const SKIP = new Set([
  'de4e12af7f28f599-01', 'de4e12af7f28f599-02', // KJV
  '317e03834065a236-01', 'bba9f40183526463-01', // BSB
  'bf8f1c7f3f9045a5-01', // JPS 1917
  '926aa5efbc5e04e2-01', // Luther 1912
  '95410db44ef800c1-01', // Elberfelder 1905
  '06125adad2d5898a-01', // ASV
  '179568874c45066f-01', // DRA
  '01b29f4b342acc35-01', // LSV
  'c315fa9f71d4af3a-01', // Geneva
  '65bfdebd704a8324-01', '6bab4d6c61b31b80-01', 'c114c33098c4fef1-01', // Brenton (англ. и греч.)
  '3aefb10641485092-01', // TR
  '901dcd9744e1bf69-01', // Патриарший текст 1904
  '2c500771ea16da93-01', '0b262f1ed7f084a6-01', // WLC (есть OSHB)
  '6c696cd1d82e2723-03', '6c696cd1d82e2723-04', // НУП
  'c61908161b077c4c-01', // Kralická
  'a93a92589195411f-01', // Darby (фр.)
  '41f25b97f468e10b-01', // Diodati
  '592420522e16049f-01', // RV 1909
  '06995ce9cd23361b-01', // Даничић
  '611f8eb23aec8f13-01', // Neno
  '7ea794434e9ea7ee-01', // 当代译本
  'd63894c8d9a7a503-01', // Bíblia Livre
  '1e8ab327edbce67f-01', // IRV хинди
  'fbb8b0e1943b417c-01', // Słowo Życia
  '7142879509583d59-01', '7142879509583d59-02', '7142879509583d59-03', '7142879509583d59-04', // WEB — британское издание
  '72f4e6dc683324df-01', '72f4e6dc683324df-02', '72f4e6dc683324df-03', // WEB — обновлённое
  '32664dc3288a28df-01', '32664dc3288a28df-02', '32664dc3288a28df-03', // WEB — американское
  '04da588535d2f823-04', // WMB — британское издание (американское остаётся)
  '55212e3cf5d04d49-01', // KJV — Кембриджское издание
]);
// санскрит — одной записью (деванагари), а не двадцатью письменностями
const ONLY_SAN = 'e8b40ccabe793c0d-01';
const SKIP_DBL = new Set(['9879dbb7cfe39e4d']); // WEB во всех изданиях

// ISO 639-3 → код языка приложения (где есть двухбуквенный)
const LANG = {
  eng: 'en', deu: 'de', fra: 'fr', spa: 'es', por: 'pt', ita: 'it', pol: 'pl', ces: 'cs', srp: 'sr', ukr: 'uk', cmn: 'zh',
  hin: 'hi', arb: 'ar', ind: 'id', vie: 'vi', tha: 'th', tur: 'tr', nld: 'nl', fin: 'fi', est: 'et', hrv: 'hr', slk: 'sk',
  nob: 'nb', heb: 'he', hbo: 'he', grc: 'grc', pes: 'fa', swh: 'sw', ben: 'bn', tam: 'ta', tel: 'te', mal: 'ml', mar: 'mr',
  kan: 'kn', guj: 'gu', pan: 'pa', urd: 'ur', npi: 'ne', hat: 'ht', hau: 'ha', ibo: 'ig', yor: 'yo', lin: 'ln', lug: 'lg',
  sna: 'sn', tsn: 'tn', run: 'rn', nya: 'ny', ewe: 'ee', twi: 'tw', isl: 'is', asm: 'as', ory: 'or', ydd: 'yi', ton: 'to',
  gaz: 'om', san: 'sa',
};

const old = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : { modules: [] };
const known = new Map(old.modules.map((m) => [m.online.api, m]));
// книги всех уже опрошенных переводов (и не попавших в каталог: без глав по номерам, второе издание)
for (const [id, books] of Object.entries(old.seen || {})) known.set(id, { books });
const seen = {};
const list = (await get('/bibles')).filter((b) => b.type === 'text' && !SKIP.has(b.id) && !SKIP_DBL.has(b.dblId) && (b.language.id !== 'san' || b.id === ONLY_SAN));
console.log('переводов в API (без дублей):', list.length);

const out = [];
let calls = 0;
for (const b of list) {
  let books = known.get(b.id)?.books;
  if (!books) {
    const raw = await get(`/bibles/${b.id}/books?include-chapters=true`);
    calls++;
    books = {};
    for (const x of raw) {
      const id = USFM[x.id];
      const n = (x.chapters || []).filter((c) => /^\d+$/.test(c.number)).length;
      if (id && n) books[id] = n;
    }
  }
  seen[b.id] = books;
  const ids = Object.keys(books);
  if (!ids.length) continue;
  const nt = ids.some((id) => ['Matt', 'Mark', 'Luke', 'John', 'Acts', 'Rom', 'Rev'].includes(id));
  const ot = ids.some((id) => ['Gen', 'Exod', 'Ps', 'Isa', 'Jer', 'Mal'].includes(id));
  const dc = ids.some((id) => ['Tob', 'Jdt', 'Wis', 'Sir', '1Macc', 'Bar'].includes(id));
  const lang = LANG[b.language.id] || b.language.id;
  out.push({
    id: `api-${b.id}`,
    type: 'bible',
    name: b.abbreviationLocal || b.abbreviation,
    title: b.nameLocal && b.nameLocal !== b.name ? `${b.nameLocal} (${b.name})` : b.name,
    description: b.descriptionLocal && b.descriptionLocal !== b.nameLocal ? b.descriptionLocal : b.description || '',
    language: lang,
    license: 'API.Bible',
    source: 'https://api.bible',
    online: { api: b.id, dbl: b.dblId },
    scope: [ot && 'ot', nt && 'nt', dc && 'dc'].filter(Boolean),
    books,
  });
}
// одно издание на перевод (dblId) — с наибольшим числом книг
const best = new Map();
for (const m of out) {
  const k = m.online.dbl;
  const cur = best.get(k);
  if (!cur || Object.keys(m.books).length > Object.keys(cur.books).length) best.set(k, m);
}
const modules = [...best.values()].sort((a, b) => a.language.localeCompare(b.language) || a.name.localeCompare(b.name));
fs.writeFileSync(OUT, JSON.stringify({ updated: new Date().toISOString().slice(0, 10), modules, seen: Object.fromEntries(Object.entries(seen).filter(([id]) => !modules.some((m) => m.online.api === id))) }, null, 1) + '\n');
console.log(`записано ${modules.length} переводов, новых запросов книг: ${calls}`);
