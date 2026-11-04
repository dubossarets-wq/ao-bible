// Комментарии к стихам: индекс «стих → модули с комментарием» для пометок в тексте и сами статьи.
// Ключ статьи — стих («Josh.13.33») или диапазон («Josh.13.1-5», «Gen.1.1-2.3»): пометка ставится у первого стиха.
// Читается только нужная книга (bookParts.js): весь Лопухин — 14 МБ, книга — сотни килобайт.
import { listModules } from './modules.js';
import { parseOsisRef } from './books.js';
import { bookEntries } from './bookParts.js';

const indexes = new Map(); // книга -> { key, map }

const commentaryModules = async () => (await listModules()).filter((m) => m.type === 'commentary' && m.enabled !== false);

// Индекс книги: `${book}.${c}.${v}` -> [{ id, name, title, lang, items }]
export async function commentaryIndex(book) {
  const mods = await commentaryModules();
  const key = mods.map((m) => m.id + m.updatedAt).join(',');
  const hit = indexes.get(book);
  if (hit && hit.key === key) return hit.map;
  const map = new Map();
  for (const m of mods) {
    const entries = await bookEntries(m, book);
    for (const k of Object.keys(entries)) {
      const r = parseOsisRef(k);
      if (!r) continue;
      const vk = `${r.book}.${r.chapter}.${r.verse}`;
      const list = map.get(vk) || [];
      let it = list.find((x) => x.id === m.id);
      if (!it) list.push((it = { id: m.id, name: m.name, title: m.title || m.name, lang: m.language || 'ru', items: [] }));
      // статьи — для показа текстом под стихом (ссылки на те же строки, что в данных модуля: память не растёт)
      const e = entries[k];
      it.items.push(typeof e === 'string' ? { title: '', text: e } : { title: e?.title || '', text: e?.text || '' });
      map.set(vk, list);
    }
  }
  indexes.set(book, { key, map });
  if (indexes.size > 12) indexes.delete(indexes.keys().next().value);
  return map;
}

// Индекс нескольких книг (план дня — отрывки из разных книг)
export async function commentaryIndexFor(books) {
  const out = new Map();
  for (const b of new Set(books)) for (const [k, v] of await commentaryIndex(b)) out.set(k, v);
  return out;
}

// Все статьи включённых комментариев, начинающиеся с этого стиха
export async function commentaryFor(ref) {
  const out = [];
  for (const m of await commentaryModules()) {
    const entries = await bookEntries(m, ref.book);
    const items = Object.entries(entries)
      .map(([k, e]) => ({ key: k, ref: parseOsisRef(k), ...e }))
      .filter((e) => e.ref && e.ref.book === ref.book && e.ref.chapter === ref.chapter && e.ref.verse === ref.verse);
    if (items.length) out.push({ module: m, items });
  }
  return out;
}
