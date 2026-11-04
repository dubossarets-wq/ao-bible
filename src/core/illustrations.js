// Иллюстрации к стихам: индекс «стих → картинки» из включённых модулей иллюстраций (не больше двух на стих).
// Сами картинки не хранятся в приложении — они загружаются с Wikimedia Commons при просмотре.
import { listModules } from './modules.js';
import { bookEntries } from './bookParts.js';

const MAX = 2;

// Индекс книги: «Книга.глава.стих» -> [картинка]; читается только эта книга (bookParts.js)
const indexes = new Map(); // книга -> { key, map }
export async function illustrationIndex(book) {
  const mods = (await listModules()).filter((m) => m.type === 'illustrations' && m.enabled !== false);
  const key = mods.map((m) => m.id + m.updatedAt).join(',');
  const hit = indexes.get(book);
  if (hit && hit.key === key) return hit.map;
  const map = new Map();
  for (const m of mods) {
    for (const [k, items] of Object.entries(await bookEntries(m, book))) {
      const list = map.get(k) || [];
      for (const it of items) if (list.length < MAX && !list.some((x) => x.img === it.img)) list.push(it);
      map.set(k, list);
    }
  }
  indexes.set(book, { key, map });
  if (indexes.size > 12) indexes.delete(indexes.keys().next().value);
  return map;
}

// Индекс нескольких книг (план дня)
export async function illustrationIndexFor(books) {
  const out = new Map();
  for (const b of new Set(books)) for (const [k, v] of await illustrationIndex(b)) out.set(k, v);
  return out;
}
