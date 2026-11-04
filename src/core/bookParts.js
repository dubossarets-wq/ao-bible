// Большие модули с записями по стихам (толкования — Лопухин 14 МБ, иллюстрации — 2 МБ) — по книгам.
// Раньше пометки у стихов при каждом запуске читали модуль целиком (до 0,4 с на телефоне и память под весь текст);
// теперь модуль один раз раскладывается по книгам в отдельные записи, а читается только открытая книга.
// Ключи: `bk|<модуль>|<updatedAt>|<книга>` и отметка `bk|<модуль>|<updatedAt>|` — модуль разложен.
import * as db from './db.js';
import { getPayload, dropPayload } from './modules.js';
import { parseOsisRef } from './books.js';

const parts = new Map(); // `${id}|${book}` -> Promise<entries книги>
const splitting = new Map(); // id -> Promise разложения
const prefix = (m) => `bk|${m.id}|${m.updatedAt || 0}|`;

// Книга записи: «Gen.1.1», «Gen.1.1-5», «Gen.1.1-2.3», вступление «Gen» — у всех книга до первой точки
const bookOf = (key) => parseOsisRef(key)?.book || String(key).split('.')[0];

// Записи модуля m (entries) только для книги book: { ключ: запись }
export function bookEntries(m, book) {
  const key = `${m.id}|${m.updatedAt || 0}|${book}`;
  if (!parts.has(key)) {
    const p = load(m, book).catch(() => ({}));
    parts.set(key, p);
    // помним последние книги (переход туда-обратно, параллельные панели), остальное отпускаем
    if (parts.size > 24) parts.delete(parts.keys().next().value);
  }
  return parts.get(key);
}

async function load(m, book) {
  const pre = prefix(m);
  const rec = await db.get(db.STORES.payload, pre + book);
  if (rec) return rec;
  if (!(await db.get(db.STORES.payload, pre))) await split(m);
  return (await db.get(db.STORES.payload, pre + book)) || {};
}

function split(m) {
  if (!splitting.has(m.id)) {
    splitting.set(
      m.id,
      (async () => {
        const p = await getPayload(m.id);
        const byBook = {};
        for (const [k, e] of Object.entries(p?.entries || {})) (byBook[bookOf(k)] ||= {})[k] = e;
        // прежние версии разложения (модуль обновили) — убираем
        await db.delPrefix(db.STORES.payload, `bk|${m.id}|`);
        const pre = prefix(m);
        await db.putMany(db.STORES.payload, Object.entries(byBook).map(([b, e]) => [pre + b, e]));
        await db.put(db.STORES.payload, { at: Date.now() }, pre);
        dropPayload(m.id); // весь модуль в памяти больше не нужен
      })().finally(() => splitting.delete(m.id))
    );
  }
  return splitting.get(m.id);
}

// Модуль удалён или переустановлен — разложение и память о книгах убираются
export async function forgetBookParts(id) {
  for (const k of [...parts.keys()]) if (k.startsWith(`${id}|`)) parts.delete(k);
  await db.delPrefix(db.STORES.payload, `bk|${id}|`).catch(() => {});
}
