// Переводы Free Use Bible API (bible.helloao.org): скачиваются целиком (complete.json) прямо с их сайта
// и перекладываются в формат модуля приложения — дальше работают без сети, как любой скачанный перевод.
import { USFM } from './apibible.js';
import { toSynodal, westernChaptersFor, placeSynodal } from './versification.js';

const OSIS = Object.fromEntries(Object.entries(USFM).map(([osis, usfm]) => [usfm, osis]));

// Содержимое стиха: строки и {text}; сноски ({noteId}) и разрывы строк пропускаем
const text = (items) =>
  (items || [])
    .map((x) => (typeof x === 'string' ? x : x && typeof x.text === 'string' ? x.text : x && x.heading ? '' : ''))
    .join(' ')
    .replace(/[{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const HEAD = new Set(['heading', 'hebrew_subtitle']);

// complete.json → модуль в формате aob-module (его разбирает schema.normalize); нумерация — синодальная, как у
// модулей каталога (versification.js)
export function fromHelloao(json, entry) {
  const books = [];
  for (const b of json.books || []) {
    const id = OSIS[b.id];
    if (!id) continue;
    // главы KJV: стихи, заголовки разделов, надписание псалма
    const kjv = new Map();
    for (const ch of b.chapters || []) {
      const c = ch.chapter;
      if (!c?.number) continue;
      const verses = [];
      const heads = {};
      let head = [];
      let title = '';
      for (const it of c.content || []) {
        if (it.type === 'hebrew_subtitle' && !verses.length) title = text(it.content);
        else if (HEAD.has(it.type)) {
          const s = text(it.content);
          if (s) head.push(s);
        } else if (it.type === 'verse' && it.number > 0) {
          if (head.length) {
            heads[it.number] = head.join(' ');
            head = [];
          }
          const s = text(it.content);
          verses[it.number - 1] = verses[it.number - 1] ? `${verses[it.number - 1]} ${s}` : s;
        }
      }
      kjv.set(c.number, { verses, heads, title });
    }
    // синодальные главы: каждая собирается из своих глав KJV
    const last = Math.max(0, ...[...kjv.keys()].map((kc) => toSynodal(id, kc, (kjv.get(kc).verses.length || 1))[0]), ...kjv.keys());
    const chapters = [];
    const headings = {};
    for (let c = 1; c <= last; c++) {
      const into = { v: [], h: {} };
      for (const kc of westernChaptersFor(id, c)) {
        const k = kjv.get(kc);
        if (k) placeSynodal(id, kc, k.verses, k.heads, c, into, k.title);
      }
      chapters.push(Array.from(into.v, (v) => v || ''));
      for (const [v, h] of Object.entries(into.h)) headings[`${c}:${v}`] = h;
    }
    while (chapters.length && !chapters[chapters.length - 1].length) chapters.pop();
    if (chapters.length) books.push({ id, chapters, headings });
  }
  return {
    format: 'aob-module',
    type: 'bible',
    id: entry.id,
    name: entry.name,
    title: entry.title,
    description: entry.description || '',
    language: entry.language,
    license: entry.license,
    source: entry.source,
    author: entry.author || '',
    version: entry.version || '',
    versification: 'synodal',
    books,
  };
}
