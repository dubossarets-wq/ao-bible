// Библейские места: по стиху и нажатому слову находим место, упомянутое именно в этом стихе.
// Берутся только места, у которых этот стих есть в списке упоминаний, и только если слово
// начинается с основы названия («Хеврону» → «хевр» → Хеврон). Так «карта» не предлагается наугад.
import { listModules, getPayload } from './modules.js';
import { normalizeWord } from './verseMarkup.js';

let cache = null;
let cacheKey = '';
let cacheGen = 0;

async function index() {
  const mods = (await listModules()).filter((m) => m.type === 'maps' && m.enabled !== false);
  const key = mods.map((m) => m.id + m.updatedAt).join(',');
  if (cache && key === cacheKey) return cache;
  const my = ++cacheGen;
  const byVerse = new Map(); // «Josh.14.15» -> [place]
  for (const m of mods) {
    const p = await getPayload(m.id);
    for (const place of p?.places || []) {
      const item = { ...place, module: { id: m.id, name: m.name, title: m.title, license: m.license, author: m.author } };
      for (const r of place.refs || []) {
        const list = byVerse.get(r) || [];
        list.push(item);
        byVerse.set(r, list);
      }
    }
  }
  const result = { byVerse };
  if (my === cacheGen) {
    cache = result;
    cacheKey = key;
  }
  return result;
}

export async function placesForWord(token, ref) {
  const { byVerse } = await index();
  const list = byVerse.get(`${ref.book}.${ref.chapter}.${ref.verse}`) || [];
  if (!list.length) return [];
  const w = normalizeWord(token.text);
  const seen = new Set();
  return list.filter((p) => {
    if (seen.has(p.id) || !(p.stems || []).some((s) => w.startsWith(s))) return false;
    seen.add(p.id);
    return true;
  });
}

export async function placesInVerse(ref) {
  const { byVerse } = await index();
  return byVerse.get(`${ref.book}.${ref.chapter}.${ref.verse}`) || [];
}
