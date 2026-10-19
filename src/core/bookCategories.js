// Разделы Библии с цветами — для выбора книги. Цвета спокойные, приглушённые, хорошо различимые
// и в светлой, и в тёмной теме; на плитке — только тонкая полоска и лёгкий оттенок.
import { bookMeta } from './books.js';
import { N_ } from './i18n.js';

// Названия разделов помечены N_() и переводятся при показе: t(cat.name)

export const CATEGORIES = [
  { id: 'law', name: N_('Пятикнижие'), color: '#b07a2e', books: ['Gen', 'Exod', 'Lev', 'Num', 'Deut'] },
  { id: 'hist', name: N_('Исторические книги'), color: '#6b8e4e', books: ['Josh', 'Judg', 'Ruth', '1Sam', '2Sam', '1Kgs', '2Kgs', '1Chr', '2Chr', 'Ezra', 'Neh', 'Esth'] },
  { id: 'wis', name: N_('Поэтические книги'), color: '#3f7fa6', books: ['Job', 'Ps', 'Prov', 'Eccl', 'Song'] },
  { id: 'major', name: N_('Большие пророки'), color: '#8b4a7d', books: ['Isa', 'Jer', 'Lam', 'Ezek', 'Dan'] },
  { id: 'minor', name: N_('Малые пророки'), color: '#b0688f', books: ['Hos', 'Joel', 'Amos', 'Obad', 'Jonah', 'Mic', 'Nah', 'Hab', 'Zeph', 'Hag', 'Zech', 'Mal'] },
  { id: 'dc', name: N_('Неканонические книги'), color: '#8a8172', books: [] }, // книги с пометкой dc
  { id: 'gosp', name: N_('Евангелия'), color: '#c0533a', books: ['Matt', 'Mark', 'Luke', 'John'] },
  { id: 'acts', name: N_('Деяния и соборные послания'), color: '#2f8f83', books: ['Acts', 'Jas', '1Pet', '2Pet', '1John', '2John', '3John', 'Jude'] },
  { id: 'paul', name: N_('Послания апостола Павла'), color: '#4a68ad', books: ['Rom', '1Cor', '2Cor', 'Gal', 'Eph', 'Phil', 'Col', '1Thess', '2Thess', '1Tim', '2Tim', 'Titus', 'Phlm', 'Heb'] },
  { id: 'rev', name: N_('Откровение'), color: '#7a55a8', books: ['Rev'] },
];
const OTHER = { id: 'other', name: N_('Другие книги'), color: '#8a8172', books: [] };

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
