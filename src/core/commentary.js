// Комментарии к стихам: индекс «стих → модули с комментарием» для пометок в тексте и сами статьи.
// Ключ статьи — стих («Josh.13.33») или диапазон («Josh.13.1-5», «Gen.1.1-2.3»): пометка ставится у первого стиха.
import { listModules, getPayload } from './modules.js';
import { parseOsisRef } from './books.js';

let index = null;
let indexKey = '';

export async function commentaryIndex() {
  const mods = (await listModules()).filter((m) => m.type === 'commentary' && m.enabled !== false);
  const key = mods.map((m) => m.id + m.updatedAt).join(',');
  if (index && key === indexKey) return index;
  const map = new Map(); // `${book}.${c}.${v}` -> [{ id, name }]
  for (const m of mods) {
    const p = await getPayload(m.id);
    for (const k of Object.keys(p?.entries || {})) {
      const r = parseOsisRef(k);
      if (!r) continue;
      const vk = `${r.book}.${r.chapter}.${r.verse}`;
      const list = map.get(vk) || [];
      if (!list.some((x) => x.id === m.id)) list.push({ id: m.id, name: m.name });
      map.set(vk, list);
    }
  }
  index = map;
  indexKey = key;
  return map;
}

// Все статьи включённых комментариев, начинающиеся с этого стиха
export async function commentaryFor(ref) {
  const mods = (await listModules()).filter((m) => m.type === 'commentary' && m.enabled !== false);
  const out = [];
  for (const m of mods) {
    const p = await getPayload(m.id);
    const items = Object.entries(p?.entries || {})
      .map(([k, e]) => ({ key: k, ref: parseOsisRef(k), ...e }))
      .filter((e) => e.ref && e.ref.book === ref.book && e.ref.chapter === ref.chapter && e.ref.verse === ref.verse);
    if (items.length) out.push({ module: m, items });
  }
  return out;
}
