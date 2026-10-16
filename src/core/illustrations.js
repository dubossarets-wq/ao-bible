// Иллюстрации к стихам: индекс «стих → картинки» из включённых модулей иллюстраций (не больше двух на стих).
// Сами картинки не хранятся в приложении — они загружаются с Wikimedia Commons при просмотре.
import { listModules, getPayload } from './modules.js';

let index = null;
let indexKey = '';
let indexGen = 0;
const MAX = 2;

export async function illustrationIndex() {
  const mods = (await listModules()).filter((m) => m.type === 'illustrations' && m.enabled !== false);
  const key = mods.map((m) => m.id + m.updatedAt).join(',');
  if (index && key === indexKey) return index;
  const my = ++indexGen;
  const map = new Map(); // «Книга.глава.стих» -> [картинка]
  for (const m of mods) {
    const p = await getPayload(m.id);
    for (const [k, items] of Object.entries(p?.entries || {})) {
      const list = map.get(k) || [];
      for (const it of items) if (list.length < MAX && !list.some((x) => x.img === it.img)) list.push(it);
      map.set(k, list);
    }
  }
  if (my === indexGen) {
    index = map;
    indexKey = key;
  }
  return map;
}
