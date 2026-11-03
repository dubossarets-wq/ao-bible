// Каталог переводов Free Use Bible API (bible.helloao.org — свободное зеркало eBible.org и др.): node scripts/helloao-catalog.mjs
// Переводы скачиваются в приложение целиком прямо с bible.helloao.org (complete.json) и работают без сети.
// Лицензии — общественное достояние и Creative Commons (у каждого перевода своя, указана в каталоге).
// Пишет scripts/helloao-catalog.json: строки каталога и список переводов API.Bible, которые этим заменяются (apiDup).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { USFM } from './usfm.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT = path.join(ROOT, 'scripts', 'helloao-catalog.json');
const BASE = 'https://bible.helloao.org';
const get = async (p) => {
  for (let i = 0; ; i++) {
    const r = await fetch(BASE + p).catch((e) => ({ ok: false, status: e.message }));
    if (r.ok) return r.json();
    if (i >= 2) throw new Error(`${p}: ${r.status}`);
    await new Promise((res) => setTimeout(res, 1500));
  }
};

// Уже есть в каталоге приложения (источник не eBible или тот же текст в другом издании)
const SKIP = new Set([
  'rus_syn', 'BSB', 'hbo_wlc', 'heb_wlc', 'HBOMAS', 'grc_byz', 'grc_sbl', 'grc_gtr', 'grc_tis', 'grc_f35', 'grc_bre', 'jpn_bun',
  'eng_kja', 'lat_clv', 'srp_dkl', 'srp_865', 'eng_web', 'eng_webc', 'eng_webpb', 'eng_webu', 'eng_weu', 'eng_wmu', 'eng_cpb',
  'eng_boy', 'eng_lxu', 'eng_wyc2018', 'deu_l12', 'deu_sch', 'ces_bkr',
]);
// санскрит — одной записью (деванагари), как и в API.Bible
const SAN_KEEP = /devanagari/i;

const LANG = {
  eng: 'en', deu: 'de', fra: 'fr', spa: 'es', por: 'pt', ita: 'it', pol: 'pl', ces: 'cs', srp: 'sr', ukr: 'uk', cmn: 'zh',
  hin: 'hi', arb: 'ar', ind: 'id', vie: 'vi', tha: 'th', tur: 'tr', nld: 'nl', fin: 'fi', est: 'et', hrv: 'hr', slk: 'sk',
  nob: 'nb', heb: 'he', hbo: 'he', grc: 'grc', pes: 'fa', swh: 'sw', ben: 'bn', tam: 'ta', tel: 'te', mal: 'ml', mar: 'mr',
  kan: 'kn', guj: 'gu', pan: 'pa', urd: 'ur', npi: 'ne', hat: 'ht', hau: 'ha', ibo: 'ig', yor: 'yo', lin: 'ln', lug: 'lg',
  sna: 'sn', tsn: 'tn', run: 'rn', nya: 'ny', ewe: 'ee', twi: 'tw', isl: 'is', asm: 'as', ory: 'or', ydd: 'yi', ton: 'to',
  gaz: 'om', san: 'sa', rus: 'ru', bel: 'be', jpn: 'ja', kor: 'ko', lat: 'la', ron: 'ro', bul: 'bg', hun: 'hu', dan: 'da',
  swe: 'sv', lit: 'lt', lav: 'lv', kat: 'ka', hye: 'hy', ell: 'el', sqi: 'sq', slv: 'sl', mkd: 'mk', tgl: 'tl', zul: 'zu',
  xho: 'xh', afr: 'af', amh: 'am', som: 'so', kin: 'rw', mlg: 'mg', khm: 'km', lao: 'lo', mya: 'my', msa: 'ms', zsm: 'ms',
  uzb: 'uz', kaz: 'kk', kir: 'ky', tgk: 'tg', aze: 'az', tuk: 'tk', mon: 'mn', nep: 'ne', sin: 'si', epo: 'eo', cym: 'cy',
};
const BOOK_KIND = new Map(JSON.parse(fs.readFileSync(path.join(ROOT, 'src/core/books.json'), 'utf8')).map((b) => [b.id, b.dc ? 'dc' : b.t === 'NT' ? 'nt' : 'ot']));

// номер eBible из адреса лицензии / сайта
const ebibleId = (t) => (/details\.php\?id=([\w-]+)/.exec(`${t.licenseUrl || ''} ${t.website || ''}`) || [])[1]?.toLowerCase() || null;
const licenseName = (t) => {
  const l = t.license;
  const u = t.licenseUrl || '';
  const cc = /creativecommons\.org\/licenses\/([a-z-]+)\/([\d.]+)/.exec(u);
  if (cc) return `CC ${cc[1].toUpperCase()} ${cc[2]}`;
  if (/publicdomain|public-domain/i.test(u) || l?.publicDomain) return 'Public Domain';
  if (l && l.commercialUse === 'not-allowed' && l.derivatives === 'not-allowed') return 'CC BY-NC-ND 4.0';
  if (l && l.copyleft) return 'CC BY-SA 4.0';
  if (l && l.attribution === 'required') return 'CC BY 4.0';
  return 'Свободная лицензия';
};

const ours = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/modules/catalog.json'), 'utf8')).modules;
const ourEbible = new Set(ours.flatMap((m) => [...String(m.source || '').matchAll(/details\.php\?id=([\w-]+)/g)].map((x) => x[1].toLowerCase())));

const old = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : {};
const scopeCache = old.scopes || {};
const all = (await get('/api/available_translations.json')).translations;
const list = all.filter((t) => {
  if (SKIP.has(t.id)) return false;
  if (t.language === 'san' && !SAN_KEEP.test(`${t.englishName} ${t.name}`)) return false;
  const eb = ebibleId(t);
  return !(eb && ourEbible.has(eb));
});
console.log('helloao:', all.length, 'без дублей:', list.length);

// что в переводе (ВЗ, НЗ, неканонические): по книгам; ответ хранится по sha256 перевода
let calls = 0;
const queue = list.filter((t) => scopeCache[t.id]?.sha !== t.sha256);
const work = async () => {
  for (let t; (t = queue.shift()); ) {
    try {
      const { books } = await get(`/api/${t.id}/books.json`);
      calls++;
      const kinds = new Set(books.map((b) => BOOK_KIND.get(USFM[b.id]) || (USFM[b.id] ? 'dc' : null)).filter(Boolean));
      scopeCache[t.id] = { sha: t.sha256, scope: ['ot', 'nt', 'dc'].filter((k) => kinds.has(k)), known: books.filter((b) => USFM[b.id]).length };
    } catch (e) {
      console.log('  нет книг:', t.id, e.message);
    }
  }
};
await Promise.all(Array.from({ length: 12 }, work));

const modules = list
  .filter((t) => scopeCache[t.id]?.known)
  .map((t) => ({
    id: `hao-${t.id.toLowerCase()}`,
    type: 'bible',
    name: (t.shortName || t.id).slice(0, 24),
    title: t.name !== t.englishName && t.englishName ? `${t.name} (${t.englishName})` : t.name,
    description: '',
    language: LANG[t.language] || t.language,
    license: licenseName(t),
    source: t.website && t.website !== 'https://helloao.org/' ? t.website : t.licenseUrl || 'https://bible.helloao.org',
    url: `${BASE}/api/${t.id}/complete.json`,
    helloao: { id: t.id, sha: t.sha256, verses: t.totalNumberOfVerses },
    rtl: t.textDirection === 'rtl' || undefined,
    scope: scopeCache[t.id].scope,
  }))
  .sort((a, b) => a.language.localeCompare(b.language) || a.name.localeCompare(b.name));

// те же тексты под другими сокращениями (сверено вручную)
const API_SAME = new Set(['en:TOJB2011', 'en:RV', 'grc:SRGNT', 'zh:OCCB', 'sr:OНСП', 'sr:ONSPL', 'he:HDZP', 'pt:TfTP']);
// переводы API.Bible, которые есть и здесь: их убираем из «по сети» (скачанный лучше и не тратит лимит API)
const api = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/apibible-catalog.json'), 'utf8')).modules;
// ключи: «язык|номер eBible» и «язык:сокращение» — номер eBible без языка совпадал с чужим (AMP — язык аламблак)
const haoKeys = new Set(list.flatMap((t) => [ebibleId(t) && `${t.language}|${ebibleId(t)}`, `${t.language}:${(t.shortName || '').toLowerCase()}`].filter(Boolean)));
// открытые переводы API.Bible — те же тексты eBible, что и здесь (сверено по названиям: почти все совпали),
// поэтому по сети остаются только лицензированные (AMP, NASB, NIrV) и переводы на языках, которых здесь нет
const LICENSED = new Set(['en:AMP', 'en:NASB 1995', 'en:NIrV']);
const haoLangs = new Set(modules.map((m) => m.language));
const apiDup = api
  .filter((m) => {
    if (LICENSED.has(`${m.language}:${m.name}`)) return false;
    if (haoLangs.has(m.language)) return true;
    const ab = m.name.toLowerCase().replace(/\s+/g, '');
    const l3 = Object.entries(LANG).find(([, v]) => v === m.language)?.[0] || m.language;
    return API_SAME.has(`${m.language}:${m.name}`) || haoKeys.has(`${l3}|${ab}`) || haoKeys.has(`${l3}|${l3}${ab}`) || haoKeys.has(`${l3}:${ab}`);
  })
  .map((m) => m.id);

fs.writeFileSync(OUT, JSON.stringify({ updated: new Date().toISOString().slice(0, 10), modules, apiDup, scopes: scopeCache }, null, 1) + '\n');
console.log(`записано ${modules.length} переводов; из API.Bible заменяются: ${apiDup.length}; запросов книг: ${calls}`);
