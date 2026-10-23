// Канонический справочник книг (OSIS-идентификаторы, русские названия) и разбор ссылок.
import BOOKS from './books.json';
import { getLang } from './i18n.js';

export { BOOKS };

const BY_ID = new Map(BOOKS.map((b, i) => [b.id, { ...b, order: i }]));

// Названия книг на языке интерфейса: для кириллических языков — русские (справочник), для остальных — английские
// (немцу или испанцу «John 3:16» понятнее, чем «Ин. 3:16»). [полное, краткое]
const EN = {
  Gen: ['Genesis', 'Gen'], Exod: ['Exodus', 'Exod'], Lev: ['Leviticus', 'Lev'], Num: ['Numbers', 'Num'], Deut: ['Deuteronomy', 'Deut'],
  Josh: ['Joshua', 'Josh'], Judg: ['Judges', 'Judg'], Ruth: ['Ruth', 'Ruth'], '1Sam': ['1 Samuel', '1 Sam'], '2Sam': ['2 Samuel', '2 Sam'],
  '1Kgs': ['1 Kings', '1 Kgs'], '2Kgs': ['2 Kings', '2 Kgs'], '1Chr': ['1 Chronicles', '1 Chr'], '2Chr': ['2 Chronicles', '2 Chr'],
  PrMan: ['Prayer of Manasseh', 'Pr Man'], Ezra: ['Ezra', 'Ezra'], Neh: ['Nehemiah', 'Neh'], '1Esd': ['1 Esdras', '1 Esd'], Tob: ['Tobit', 'Tob'],
  Jdt: ['Judith', 'Jdt'], Esth: ['Esther', 'Esth'], Job: ['Job', 'Job'], Ps: ['Psalms', 'Ps'], Prov: ['Proverbs', 'Prov'],
  Eccl: ['Ecclesiastes', 'Eccl'], Song: ['Song of Songs', 'Song'], Wis: ['Wisdom of Solomon', 'Wis'], Sir: ['Sirach', 'Sir'],
  Isa: ['Isaiah', 'Isa'], Jer: ['Jeremiah', 'Jer'], Lam: ['Lamentations', 'Lam'], EpJer: ['Letter of Jeremiah', 'Ep Jer'], Bar: ['Baruch', 'Bar'],
  Ezek: ['Ezekiel', 'Ezek'], Dan: ['Daniel', 'Dan'], Hos: ['Hosea', 'Hos'], Joel: ['Joel', 'Joel'], Amos: ['Amos', 'Amos'],
  Obad: ['Obadiah', 'Obad'], Jonah: ['Jonah', 'Jonah'], Mic: ['Micah', 'Mic'], Nah: ['Nahum', 'Nah'], Hab: ['Habakkuk', 'Hab'],
  Zeph: ['Zephaniah', 'Zeph'], Hag: ['Haggai', 'Hag'], Zech: ['Zechariah', 'Zech'], Mal: ['Malachi', 'Mal'],
  '1Macc': ['1 Maccabees', '1 Macc'], '2Macc': ['2 Maccabees', '2 Macc'], '3Macc': ['3 Maccabees', '3 Macc'], '2Esd': ['2 Esdras', '2 Esd'],
  Matt: ['Matthew', 'Matt'], Mark: ['Mark', 'Mark'], Luke: ['Luke', 'Luke'], John: ['John', 'John'], Acts: ['Acts', 'Acts'],
  Jas: ['James', 'Jas'], '1Pet': ['1 Peter', '1 Pet'], '2Pet': ['2 Peter', '2 Pet'], '1John': ['1 John', '1 John'], '2John': ['2 John', '2 John'],
  '3John': ['3 John', '3 John'], Jude: ['Jude', 'Jude'], Rom: ['Romans', 'Rom'], '1Cor': ['1 Corinthians', '1 Cor'], '2Cor': ['2 Corinthians', '2 Cor'],
  Gal: ['Galatians', 'Gal'], Eph: ['Ephesians', 'Eph'], Phil: ['Philippians', 'Phil'], Col: ['Colossians', 'Col'],
  '1Thess': ['1 Thessalonians', '1 Thess'], '2Thess': ['2 Thessalonians', '2 Thess'], '1Tim': ['1 Timothy', '1 Tim'], '2Tim': ['2 Timothy', '2 Tim'],
  Titus: ['Titus', 'Titus'], Phlm: ['Philemon', 'Phlm'], Heb: ['Hebrews', 'Heb'], Rev: ['Revelation', 'Rev'],
};
const CYRILLIC_UI = new Set(['ru', 'uk', 'be', 'bg', 'sr']);
export const latinBookNames = () => !CYRILLIC_UI.has(getLang());

// Книга (из справочника или из модуля) с названиями на языке интерфейса
const LOCAL = new Map();
let localLang = null;
export function localBook(b) {
  if (!b || !latinBookNames()) return b;
  const en = EN[b.id];
  if (!en) return b;
  if (localLang !== getLang()) (LOCAL.clear(), (localLang = getLang()));
  let x = LOCAL.get(b);
  if (!x) LOCAL.set(b, (x = { ...b, name: en[0], short: en[1] }));
  return x;
}
// Перевод для показа: список книг — с названиями на языке интерфейса (в базе остаются прежние)
export const localizeModuleBooks = (m) => (m.type === 'bible' && m.books && latinBookNames() ? { ...m, books: m.books.map(localBook) } : m);

export function bookMeta(id) {
  return localBook(BY_ID.get(id)) || { id, name: id, short: id, t: 'OT', order: 999 };
}

// Книги, которых нет в справочнике (апокрифы и т. п.), берут название из установленного модуля.
// t: 'OT' | 'NT' | 'AP' (апокрифы).
export function registerModuleBooks(modules) {
  let order = 1000;
  for (const m of modules || []) {
    if (m.type !== 'bible') continue;
    for (const b of m.books || []) {
      if (BY_ID.has(b.id) && !BY_ID.get(b.id).dynamic) continue;
      BY_ID.set(b.id, { id: b.id, name: b.name || b.id, short: b.short || b.id, t: b.t || 'AP', order: order++, dynamic: true });
    }
  }
}

export function testamentOf(bookId) {
  return bookMeta(bookId).t;
}

// Сокращения для ввода ссылок: «Ин 3:16», «1 Кор 13», «Быт. 1:1-5», «John 3:16».
const ALIASES = (() => {
  const map = new Map();
  const add = (key, id) => map.set(key.toLowerCase().replace(/[\s.]/g, ''), id);
  for (const b of BOOKS) {
    add(b.id, b.id);
    add(b.name, b.id);
    add(b.short, b.id);
    for (const n of EN[b.id] || []) add(n, b.id);
  }
  const extra = {
    Gen: ['бт', 'бытия'], Exod: ['исход'], Num: ['чисел', 'числ'], Deut: ['вт', 'второзак'],
    Josh: ['иисуснавин', 'навин', 'ииснав'], Judg: ['судей'], '1Sam': ['1царств', '1цар', '1sam'],
    '2Sam': ['2царств', '2цар'], '1Kgs': ['3царств', '3цар'], '2Kgs': ['4царств', '4цар'],
    '1Chr': ['1пар', '1паралипоменон'], '2Chr': ['2пар', '2паралипоменон'], Ezra: ['ездр', 'ездры'],
    Neh: ['неемии'], Esth: ['есфири'], Ps: ['псалом', 'псалмы', 'псалтирь', 'пс'], Prov: ['притч', 'пр'],
    Eccl: ['екл', 'еккл', 'екклесиаста'], Song: ['песн', 'песнь', 'песньпесней'], Isa: ['исаии', 'исаия'],
    Jer: ['иеремии'], Lam: ['плачиеремии'], Ezek: ['иезекииля', 'иез'], Dan: ['даниила'],
    Hos: ['осии'], Joel: ['иоиля'], Jonah: ['ионы'], Mic: ['михея'], Hab: ['аввакума'], Zeph: ['софонии'],
    Hag: ['аггея'], Zech: ['захарии'], Mal: ['малахии'],
    Matt: ['мф', 'мтф', 'матф', 'матфея', 'отматфея', 'мт'], Mark: ['мк', 'мар', 'марк', 'марка', 'отмарка'],
    Luke: ['лк', 'лук', 'луки', 'отлуки'], John: ['ин', 'иоан', 'иоанна', 'отиоанна'],
    Acts: ['деян', 'деяния'], Jas: ['иак', 'иакова'], '1Pet': ['1пет', '1петра'], '2Pet': ['2пет', '2петра'],
    '1John': ['1ин', '1иоан', '1иоанна'], '2John': ['2ин', '2иоан'], '3John': ['3ин', '3иоан'],
    Jude: ['иуд', 'иуды'], Rom: ['рим', 'римлянам'], '1Cor': ['1кор'], '2Cor': ['2кор'], Gal: ['гал'],
    Eph: ['еф', 'ефес'], Phil: ['флп', 'фил', 'филип'], Col: ['кол'], '1Thess': ['1фес', '1фесс'],
    '2Thess': ['2фес', '2фесс'], '1Tim': ['1тим'], '2Tim': ['2тим'], Titus: ['тит'], Phlm: ['флм', 'филим'],
    Heb: ['евр'], Rev: ['откр', 'апок', 'откровение', 'апокалипсис'],
  };
  for (const [id, keys] of Object.entries(extra)) keys.forEach((k) => add(k, id));
  return map;
})();

export function findBookId(text) {
  const key = text.toLowerCase().replace(/[\s.]/g, '').replace(/ё/g, 'е');
  if (ALIASES.has(key)) return ALIASES.get(key);
  // Префиксное совпадение по полному названию: «быти» → Бытие
  for (const [alias, id] of ALIASES) if (key.length >= 3 && alias.startsWith(key)) return id;
  return null;
}

// «Ин 3:16», «1 Кор 13:4-7», «Пс 22» → { book, chapter, verse, verseEnd }
export function parseHumanRef(input) {
  // Глава и стих через двоеточие, точку, запятую или просто пробел: «Ин 3:6», «Ин 3 6», «Быт 1.1»
  const m = input.trim().match(/^((?:[1-4]\s*)?[^\d\s:.,][^\d:,]*?)\.?\s*(\d+)(?:(?:\s*[:.,]\s*|\s+)(\d+)(?:\s*[-–]\s*(\d+))?)?\s*$/i);
  if (!m) return null;
  const book = findBookId(m[1]);
  if (!book) return null;
  return { book, chapter: +m[2], verse: m[3] ? +m[3] : 1, verseEnd: m[4] ? +m[4] : null };
}

// OSIS-ссылки модулей: «Job.38.4», «Job.38.4-7», «Gen.1.1-2.3», «Luke.3.23-Luke.3.38»
export function parseOsisRef(ref) {
  const [a, b] = ref.split('-');
  const pa = a.split('.');
  if (pa.length < 2) return null;
  const start = { book: pa[0], chapter: +pa[1], verse: pa[2] ? +pa[2] : 1 };
  let end = null;
  if (b) {
    const pb = b.split('.');
    if (pb.length === 1) end = { book: start.book, chapter: start.chapter, verse: +pb[0] };
    else if (pb.length === 2) end = { book: start.book, chapter: +pb[0], verse: +pb[1] };
    else end = { book: pb[0], chapter: +pb[1], verse: +pb[2] };
  }
  return { ...start, end };
}

export function formatRef(ref, { full = false } = {}) {
  if (!ref) return '';
  const meta = bookMeta(ref.book);
  const name = full ? meta.name : meta.short;
  let s = `${name} ${ref.chapter}:${ref.verse}`;
  if (ref.end) {
    if (ref.end.chapter !== ref.chapter) s += `–${ref.end.chapter}:${ref.end.verse}`;
    else if (ref.end.verse !== ref.verse) s += `–${ref.end.verse}`;
  }
  return s;
}

export const refKey = (r) => `${r.book}.${r.chapter}.${r.verse}`;
