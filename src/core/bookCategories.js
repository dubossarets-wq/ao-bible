// Разделы Библии с цветами — для выбора книги. Цвета спокойные, приглушённые, хорошо различимые
// и в светлой, и в тёмной теме; на плитке — только тонкая полоска и лёгкий оттенок.
import { bookMeta } from './books.js';

export const CATEGORIES = [
  { id: 'law', name: 'Пятикнижие', color: '#b07a2e', books: ['Gen', 'Exod', 'Lev', 'Num', 'Deut'] },
  { id: 'hist', name: 'Исторические книги', color: '#6b8e4e', books: ['Josh', 'Judg', 'Ruth', '1Sam', '2Sam', '1Kgs', '2Kgs', '1Chr', '2Chr', 'Ezra', 'Neh', 'Esth'] },
  { id: 'wis', name: 'Учительные книги', color: '#3f7fa6', books: ['Job', 'Ps', 'Prov', 'Eccl', 'Song'] },
  { id: 'major', name: 'Большие пророки', color: '#8b4a7d', books: ['Isa', 'Jer', 'Lam', 'Ezek', 'Dan'] },
  { id: 'minor', name: 'Малые пророки', color: '#b0688f', books: ['Hos', 'Joel', 'Amos', 'Obad', 'Jonah', 'Mic', 'Nah', 'Hab', 'Zeph', 'Hag', 'Zech', 'Mal'] },
  { id: 'dc', name: 'Неканонические книги', color: '#8a8172', books: [] }, // книги с пометкой dc
  { id: 'gosp', name: 'Евангелия', color: '#c0533a', books: ['Matt', 'Mark', 'Luke', 'John'] },
  { id: 'acts', name: 'Деяния и соборные послания', color: '#2f8f83', books: ['Acts', 'Jas', '1Pet', '2Pet', '1John', '2John', '3John', 'Jude'] },
  { id: 'paul', name: 'Послания апостола Павла', color: '#4a68ad', books: ['Rom', '1Cor', '2Cor', 'Gal', 'Eph', 'Phil', 'Col', '1Thess', '2Thess', '1Tim', '2Tim', 'Titus', 'Phlm', 'Heb'] },
  { id: 'rev', name: 'Откровение', color: '#7a55a8', books: ['Rev'] },
];
const OTHER = { id: 'other', name: 'Другие книги', color: '#8a8172', books: [] };

const byBook = new Map(CATEGORIES.flatMap((c) => c.books.map((b) => [b, c])));

export function categoryOf(bookId) {
  if (bookMeta(bookId).dc) return CATEGORIES.find((c) => c.id === 'dc');
  return byBook.get(bookId) || OTHER;
}

// Книги перевода по разделам (в порядке разделов, внутри — в порядке перевода)
export function groupByCategory(books) {
  const groups = new Map();
  for (const b of books) {
    const c = categoryOf(b.id);
    if (!groups.has(c)) groups.set(c, []);
    groups.get(c).push(b);
  }
  return [...CATEGORIES, OTHER].filter((c) => groups.has(c)).map((c) => ({ ...c, list: groups.get(c) }));
}
