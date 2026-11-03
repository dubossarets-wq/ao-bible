// Переводы Free Use Bible API (bible.helloao.org): скачиваются целиком (complete.json) прямо с их сайта
// и перекладываются в формат модуля приложения — дальше работают без сети, как любой скачанный перевод.
import { USFM } from './apibible.js';

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

// complete.json → модуль в формате aob-module (его разбирает schema.normalize)
export function fromHelloao(json, entry) {
  const books = [];
  for (const b of json.books || []) {
    const id = OSIS[b.id];
    if (!id) continue;
    const chapters = [];
    const headings = {};
    for (const ch of b.chapters || []) {
      const c = ch.chapter;
      if (!c?.number) continue;
      const verses = [];
      let head = [];
      for (const it of c.content || []) {
        if (HEAD.has(it.type)) {
          const s = text(it.content);
          if (s) head.push(s);
        } else if (it.type === 'verse' && it.number > 0) {
          if (head.length) {
            headings[`${c.number}:${it.number}`] = head.join(' ');
            head = [];
          }
          const s = text(it.content);
          verses[it.number - 1] = verses[it.number - 1] ? `${verses[it.number - 1]} ${s}` : s;
        }
      }
      chapters[c.number - 1] = Array.from(verses, (v) => v || '');
    }
    if (chapters.length) books.push({ id, chapters: Array.from(chapters, (c) => c || []), headings });
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
    versification: 'kjv',
    books,
  };
}
