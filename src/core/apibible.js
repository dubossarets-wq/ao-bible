// Переводы API.Bible: не скачиваются, а читаются по сети через наш посредник (aobible.app/bapi, ключ — на сервере).
// «Добавить» записывает модуль без текста (список книг); главы приходят по одной, когда их открывают,
// и помнятся на устройстве недолго — по условиям API.Bible не больше 500 стихов подряд и не дольше 14 дней.
// На сайте каждый показ главы отмечается в учёте API.Bible (FUMS) — в приложении для телефона он не нужен.
import * as db from './db.js';
import { bookMeta } from './books.js';
import { NATIVE } from './native.js';
import { synodalVerses, westernChaptersFor, placeSynodal } from './versification.js';

const BASES = ['https://aobible.app/bapi', 'https://aobible-apibible.apibible.workers.dev'];
const KEEP_VERSES = 480;
const KEEP_MS = 14 * 864e5;

// OSIS-код книги → код API (USFM)
export const USFM = {
  Gen: 'GEN', Exod: 'EXO', Lev: 'LEV', Num: 'NUM', Deut: 'DEU', Josh: 'JOS', Judg: 'JDG', Ruth: 'RUT', '1Sam': '1SA', '2Sam': '2SA',
  '1Kgs': '1KI', '2Kgs': '2KI', '1Chr': '1CH', '2Chr': '2CH', Ezra: 'EZR', Neh: 'NEH', Esth: 'EST', Job: 'JOB', Ps: 'PSA', Prov: 'PRO',
  Eccl: 'ECC', Song: 'SNG', Isa: 'ISA', Jer: 'JER', Lam: 'LAM', Ezek: 'EZK', Dan: 'DAN', Hos: 'HOS', Joel: 'JOL', Amos: 'AMO',
  Obad: 'OBA', Jonah: 'JON', Mic: 'MIC', Nah: 'NAM', Hab: 'HAB', Zeph: 'ZEP', Hag: 'HAG', Zech: 'ZEC', Mal: 'MAL',
  Matt: 'MAT', Mark: 'MRK', Luke: 'LUK', John: 'JHN', Acts: 'ACT', Rom: 'ROM', '1Cor': '1CO', '2Cor': '2CO', Gal: 'GAL', Eph: 'EPH',
  Phil: 'PHP', Col: 'COL', '1Thess': '1TH', '2Thess': '2TH', '1Tim': '1TI', '2Tim': '2TI', Titus: 'TIT', Phlm: 'PHM', Heb: 'HEB',
  Jas: 'JAS', '1Pet': '1PE', '2Pet': '2PE', '1John': '1JN', '2John': '2JN', '3John': '3JN', Jude: 'JUD', Rev: 'REV',
  Tob: 'TOB', Jdt: 'JDT', AddEsth: 'ESG', Wis: 'WIS', Sir: 'SIR', Bar: 'BAR', EpJer: 'LJE', PrAzar: 'S3Y', Sus: 'SUS', Bel: 'BEL',
  '1Macc': '1MA', '2Macc': '2MA', '3Macc': '3MA', '4Macc': '4MA', '1Esd': '1ES', '2Esd': '2ES', PrMan: 'MAN', Ps151: 'PS2',
};

export const isOnline = (m) => !!m?.online?.api;

export class OnlineError extends Error {}

// --- Добавление -------------------------------------------------------------------------

// Строка каталога → запись модуля (книги — из файла каталога api/<id>.json, число стихов — по западному счёту,
// уточняется, когда глава загружена)
export async function onlineModule(entry) {
  const r = await fetch(entry.url);
  if (!r.ok) throw new OnlineError(`HTTP ${r.status}`);
  const { books } = await r.json();
  const list = Object.entries(books)
    .map(([id, n]) => {
      const b = bookMeta(id);
      const v = synodalVerses(id);
      return { id, name: b.name, short: b.short, t: b.t, order: b.order, verses: Array.from({ length: n }, (_, i) => v[i] || 0) };
    })
    .sort((a, b) => a.order - b.order)
    .map(({ order, ...b }) => b);
  return {
    id: entry.id,
    type: 'bible',
    name: entry.name,
    title: entry.title,
    description: entry.description || '',
    language: entry.language,
    version: entry.version || '',
    author: entry.author || '',
    source: entry.source,
    license: entry.license,
    versification: 'synodal',
    features: {},
    online: entry.online,
    books: list,
    stats: { books: list.length, verses: list.reduce((n, b) => n + b.verses.reduce((a, x) => a + x, 0), 0) },
  };
}

// --- Главы ------------------------------------------------------------------------------

const books = new Map(); // `${moduleId}|${bookId}` -> { chapters, headings, xrefs, online, loaded:Set, copyright }
const stores = new Map(); // moduleId -> Promise<{ items: { 'John.3': { v, h, at, cr, tok } } }>
const loading = new Map(); // `${moduleId}|${bookId}|${c}` -> Promise

// api2 — главы в синодальной нумерации (в api| лежали западные — их не читаем)
const storeKey = (id) => `api2|${id}`;
function store(id) {
  if (!stores.has(id)) {
    stores.set(
      id,
      db.get(db.STORES.payload, storeKey(id)).then(
        (s) => {
          const items = s?.items || {};
          const now = Date.now();
          for (const k of Object.keys(items)) if (now - items[k].at > KEEP_MS) delete items[k];
          return { items };
        },
        () => ({ items: {} })
      )
    );
  }
  return stores.get(id);
}

// Книга перевода по сети: главы, которые ещё не пришли, — пустые (loaded их не содержит)
export async function onlineBook(m, bookId) {
  const key = `${m.id}|${bookId}`;
  let b = books.get(key);
  if (!b) {
    const meta = m.books.find((x) => x.id === bookId);
    if (!meta) return null;
    b = { chapters: meta.verses.map(() => []), headings: {}, xrefs: {}, online: true, loaded: new Set(), copyright: '' };
    books.set(key, b);
    const s = await store(m.id);
    for (const [k, it] of Object.entries(s.items)) {
      const [bk, c] = k.split('.');
      if (bk === bookId && b.chapters[c - 1]) fill(b, +c, it);
    }
  }
  return b;
}

function fill(b, c, it) {
  b.chapters[c - 1] = it.v;
  for (const [v, h] of Object.entries(it.h || {})) b.headings[`${c}:${v}`] = h;
  b.loaded.add(c);
  if (it.cr) b.copyright = it.cr;
  track(it.tok);
}

// Загрузить главу (если её ещё нет). Ошибка — OnlineError с понятным текстом
export function loadChapter(m, bookId, c) {
  const key = `${m.id}|${bookId}|${c}`;
  if (!loading.has(key)) {
    const p = (async () => {
      const b = await onlineBook(m, bookId);
      if (!b || !b.chapters[c - 1]) throw new OnlineError('chapter');
      if (b.loaded.has(c)) return b;
      // глава в синодальной нумерации — из одной или двух глав API (в нём западная нумерация, versification.js)
      const parts = [];
      for (const kc of westernChaptersFor(bookId, c)) parts.push([kc, await fetchChapter(m.online.api, bookId, kc)]);
      const into = { v: [], h: {} };
      for (const [kc, p] of parts) placeSynodal(bookId, kc, p.v, p.h, c, into, p.t);
      const it = { v: Array.from(into.v, (x) => x || ''), h: into.h, at: Date.now(), cr: parts[0]?.[1].cr || '', tok: parts.map(([, p]) => p.tok).filter(Boolean).join(' ') };
      fill(b, c, it);
      remember(m.id, `${bookId}.${c}`, it);
      return b;
    })();
    loading.set(key, p);
    p.catch(() => {}).finally(() => loading.delete(key));
  }
  return loading.get(key);
}

export const isLoaded = (b, c) => !b?.online || b.loaded.has(c);

async function fetchChapter(api, bookId, c) {
  const code = USFM[bookId];
  if (!code) throw new OnlineError('book');
  const q = 'content-type=json&include-notes=false&include-titles=true&include-chapter-numbers=false&include-verse-numbers=true&include-verse-spans=false';
  let last;
  for (const base of BASES) {
    try {
      const r = await fetch(`${base}/bibles/${api}/chapters/${code}.${c}?${q}`);
      if (r.status === 429 || r.status === 403) throw new OnlineError('limit');
      if (!r.ok) throw new OnlineError(`HTTP ${r.status}`);
      const j = await r.json();
      return { ...parse(j.data.content), at: Date.now(), cr: j.data.copyright || '', tok: j.meta?.fumsToken || '' };
    } catch (e) {
      last = e;
      if (e instanceof OnlineError) break; // сервер ответил — второй адрес не поможет
    }
  }
  throw last instanceof OnlineError ? last : new OnlineError('net');
}

// Хранить на устройстве не больше KEEP_VERSES стихов перевода: самые давние главы уходят первыми
async function remember(id, k, it) {
  const s = await store(id);
  s.items[k] = it;
  const keys = Object.keys(s.items).sort((a, b) => s.items[b].at - s.items[a].at);
  let n = 0;
  for (const key of keys) {
    n += s.items[key].v.length;
    if (n > KEEP_VERSES && key !== k) delete s.items[key];
  }
  db.put(db.STORES.payload, { items: s.items }, storeKey(id)).catch(() => {});
}

export async function forgetOnline(id) {
  for (const k of [...books.keys()]) if (k.startsWith(`${id}|`)) books.delete(k);
  stores.delete(id);
  await db.del(db.STORES.payload, storeKey(id)).catch(() => {});
  await db.del(db.STORES.payload, `api|${id}`).catch(() => {});
}

// --- Разбор главы (JSON API.Bible) → стихи с разметкой приложения ---------------------------

const HEAD = /^(s\d?|ms\d?|mr|sr|d|sp|qa|r)$/; // заголовки разделов, надписания псалмов
const ADDED = new Set(['add', 'it']); // слова, добавленные переводчиками (курсив) → ‹…›

export function parse(content) {
  const v = [];
  const h = {};
  let head = [];
  let title = ''; // надписание псалма (стиль d до первого стиха)
  const text = (n) => (n.type === 'text' ? n.text : (n.items || []).map(text).join(''));
  const walk = (n, added) => {
    if (n.type === 'text') {
      const id = n.attrs?.verseId;
      if (!id) return;
      const num = +id.split('.')[2];
      if (!num) return;
      const s = n.text.replace(/[{}]/g, '');
      v[num - 1] = (v[num - 1] || '') + (added ? `‹${s}›` : s);
      return;
    }
    if (n.name === 'verse') {
      const num = parseInt(n.attrs?.number, 10);
      if (num && head.length) {
        h[num] = head.join(' ');
        head = [];
      }
      return;
    }
    if (n.name === 'note') return;
    const style = n.attrs?.style || '';
    if (n.name === 'para' && HEAD.test(style)) {
      const s = text(n).trim();
      if (s && style === 'd' && !v.length) title = s;
      else if (s) head.push(s);
      return;
    }
    for (const x of n.items || []) walk(x, added || (n.name === 'char' && ADDED.has(style)));
  };
  for (const n of content || []) walk(n, false);
  for (let i = 0; i < v.length; i++) v[i] = (v[i] || '').replace(/\s+/g, ' ').replace(/›\s*‹/g, ' ').trim();
  return { v, h, t: title };
}

// --- Учёт показов (FUMS) — только на сайте -------------------------------------------------

const tracked = new Set();
function track(toks) {
  for (const tok of String(toks || '').split(' ')) trackOne(tok);
}
function trackOne(tok) {
  if (NATIVE || !tok || tracked.has(tok) || typeof document === 'undefined') return;
  tracked.add(tok);
  if (!window.fums) {
    window.fumsData = window.fumsData || [];
    window.fums = function () {
      window.fumsData.push(arguments);
    };
    const s = document.createElement('script');
    s.src = 'https://pkg.api.bible/fumsV3.min.js';
    s.async = true;
    document.head.appendChild(s);
  }
  window.fums('trackView', tok);
}
