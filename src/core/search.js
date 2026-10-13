// Полнотекстовый поиск по установленному переводу. Идёт по книгам и уступает поток интерфейсу,
// чтобы на телефоне экран не замирал; поддерживает отмену.
import { getBook, getModule } from './modules.js';
import { testamentOf } from './books.js';
import { plainText } from './verseMarkup.js';

const plainCache = new Map(); // `${moduleId}|${bookId}` -> string[][]

async function plainBook(moduleId, bookId) {
  const key = `${moduleId}|${bookId}`;
  if (plainCache.has(key)) return plainCache.get(key);
  const b = await getBook(moduleId, bookId);
  const out = b ? b.chapters.map((c) => c.map((v) => plainText(v))) : [];
  plainCache.set(key, out);
  if (plainCache.size > 80) plainCache.delete(plainCache.keys().next().value);
  return out;
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Регулярное выражение для запроса: все слова фразы по порядку; «ё» = «е».
export function queryRegex(query, { wholeWord = false, flags = 'giu' } = {}) {
  const q = query.trim().replace(/\s+/g, ' ');
  if (!q) return null;
  const body = escapeRe(q).replace(/[её]/gi, '[её]').replace(/ /g, '[\\s\\p{P}]+');
  const pat = wholeWord ? `(?<![\\p{L}])${body}(?![\\p{L}])` : body;
  return new RegExp(pat, flags);
}

export async function search({ moduleId, query, scope = 'all', currentBook, wholeWord, onResult, onProgress, signal }) {
  const mod = await getModule(moduleId);
  if (!mod) throw new Error('Перевод не установлен');
  const re = queryRegex(query, { wholeWord, flags: 'iu' });
  if (!re) return { total: 0 };
  let books = mod.books;
  if (scope === 'book') books = books.filter((b) => b.id === currentBook);
  else if (scope === 'OT' || scope === 'NT') books = books.filter((b) => testamentOf(b.id) === scope);
  let total = 0;
  for (let i = 0; i < books.length; i++) {
    if (signal?.aborted) return { total, aborted: true };
    const chapters = await plainBook(moduleId, books[i].id);
    const batch = [];
    chapters.forEach((verses, ci) =>
      verses.forEach((text, vi) => {
        if (text && re.test(text)) batch.push({ book: books[i].id, chapter: ci + 1, verse: vi + 1, text });
      })
    );
    total += batch.length;
    if (batch.length) onResult?.(batch);
    onProgress?.((i + 1) / books.length, books[i]);
    await new Promise((r) => setTimeout(r, 0));
  }
  return { total };
}
