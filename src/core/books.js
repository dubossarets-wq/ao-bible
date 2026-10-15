// Канонический справочник книг (OSIS-идентификаторы, русские названия) и разбор ссылок.
import BOOKS from './books.json';

export { BOOKS };

const BY_ID = new Map(BOOKS.map((b, i) => [b.id, { ...b, order: i }]));

export function bookMeta(id) {
  return BY_ID.get(id) || { id, name: id, short: id, t: 'OT', order: 999 };
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
