// Полнотекстовый поиск по установленному переводу. Идёт по книгам и уступает поток интерфейсу,
// чтобы на телефоне экран не замирал; поддерживает отмену.
import { getModule, peekBook } from './modules.js';
import { testamentOf } from './books.js';
import { plainText } from './verseMarkup.js';
import { t } from './i18n.js';

// Книга без разметки — одной строкой, стихи разделены  (не пробел, не знак и не буква: границы фраз
// и «целых слов» те же), и ищется одним проходом регулярки; номер стиха — по смещениям.
// Кэш ограничен объёмом текста (~10 млн символов — около трёх переводов), а не числом книг.
const SEP = '';
const plainCache = new Map(); // `${moduleId}|${bookId}` -> { text, offs, ch, vs }
let cachedChars = 0;
const CACHE_CHARS = 10e6;

async function plainBook(moduleId, bookId) {
  const key = `${moduleId}|${bookId}`;
  const hit = plainCache.get(key);
  if (hit) return hit;
  const b = await peekBook(moduleId, bookId);
  const parts = [];
  const offs = [];
  const ch = [];
  const vs = [];
  let pos = 0;
  if (b)
    b.chapters.forEach((c, ci) =>
      c.forEach((v, vi) => {
        const text = v ? plainText(v) : '';
        offs.push(pos);
        ch.push(ci + 1);
        vs.push(vi + 1);
        parts.push(text);
        pos += text.length + 1;
      })
    );
  const out = { text: parts.join(SEP), offs: Int32Array.from(offs), ch: Uint16Array.from(ch), vs: Uint16Array.from(vs) };
  plainCache.set(key, out);
  cachedChars += out.text.length;
  while (cachedChars > CACHE_CHARS && plainCache.size > 1) {
    const [k, old] = plainCache.entries().next().value;
    plainCache.delete(k);
    cachedChars -= old.text.length;
  }
  return out;
}

// Уступить поток интерфейсу: без задержки таймера (setTimeout(0) после каждой из 66 книг стоил почти секунду)
const yieldNow = () =>
  globalThis.scheduler?.yield
    ? globalThis.scheduler.yield()
    : new Promise((r) => {
        const c = new MessageChannel();
        c.port1.onmessage = () => r();
        c.port2.postMessage(0);
      });

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Регулярное выражение для запроса: все слова фразы по порядку; «ё» = «е»; знак ударения в тексте
// (Синодальный с ударениями: «возлюби́л») не мешает — после каждой буквы он допускается.
export function queryRegex(query, { wholeWord = false, flags = 'giu' } = {}) {
  const q = query.trim().replace(/\s+/g, ' ').replace(/́/g, '');
  if (!q) return null;
  const body = [...q].map((ch) => {
    if (ch === ' ') return '[\\s\\p{P}]+';
    if (/[её]/i.test(ch)) return '[её]\\u0301?';
    return /\p{L}/u.test(ch) ? escapeRe(ch) + '\\u0301?' : escapeRe(ch);
  }).join('');
  const pat = wholeWord ? `(?<![\\p{L}])${body}(?![\\p{L}])` : body;
  return new RegExp(pat, flags);
}

export async function search({ moduleId, query, scope = 'all', currentBook, wholeWord, onResult, onProgress, signal }) {
  const mod = await getModule(moduleId);
  if (!mod) throw new Error(t('Перевод не установлен'));
  const re = queryRegex(query, { wholeWord, flags: 'giu' });
  if (!re) return { total: 0 };
  let books = mod.books;
  if (scope === 'book') books = books.filter((b) => b.id === currentBook);
  else if (scope === 'OT' || scope === 'NT') books = books.filter((b) => testamentOf(b.id) === scope);
  let total = 0;
  let batch = [];
  let t0 = performance.now();
  for (let i = 0; i < books.length; i++) {
    if (signal?.aborted) return { total, aborted: true };
    const pb = await plainBook(moduleId, books[i].id);
    const { text, offs } = pb;
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text))) {
      let lo = 0;
      let hi = offs.length - 1;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (offs[mid] <= m.index) lo = mid;
        else hi = mid - 1;
      }
      const end = lo + 1 < offs.length ? offs[lo + 1] - 1 : text.length;
      batch.push({ book: books[i].id, chapter: pb.ch[lo], verse: pb.vs[lo], text: text.slice(offs[lo], end) });
      re.lastIndex = end + 1; // один стих — один результат
    }
    // Отдаём найденное и уступаем поток не после каждой книги, а когда набралось ~8 мс работы
    if (performance.now() - t0 > 8 || i === books.length - 1) {
      total += batch.length;
      if (batch.length) onResult?.(batch);
      batch = [];
      onProgress?.((i + 1) / books.length, books[i]);
      await yieldNow();
      t0 = performance.now();
    }
  }
  return { total };
}
