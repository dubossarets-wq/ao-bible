// Подстрочник: слова оригинала (Ветхий Завет — еврейский OSHB, Новый — греческий текст Робинсона — Пирпонта),
// под каждым — как это слово передано в синодальном переводе стиха (по номерам Стронга в RST+).
// Если в синодальном тексте стиха такого слова нет — самый частый перевод из симфонии (показывается бледнее).
// Оригинальные тексты ставятся сами при первом открытии подстрочника — добавлять их не нужно.
import { listModules, getVerse, getPayload, fetchCatalog, installFromCatalog } from './modules.js';
import { tokenize } from './verseMarkup.js';
import { testamentOf } from './books.js';

const ORIGINAL = { OT: 'oshb', NT: 'byz-rp2018' };
// Служебные слова, у которых нет отдельного перевода: греческий артикль и еврейская частица прямого дополнения
const SILENT = new Set(['G3588', 'H853']);

// В греческом тексте у всех форм глагола один номер, а в RST+ у отдельных форм свои (ἦν «было» — G2258 и т.п.)
const SAME = [
  ['G1510', 'G2258', 'G2071', 'G2070', 'G2075', 'G2076', 'G2468', 'G5600', 'G1488', 'G1526', 'G2277'], // быть
  ['G3004', 'G2036', 'G2046', 'G4483'], // говорить, сказать
  ['G3708', 'G1492', 'G3700'], // видеть
  ['G2068', 'G5315'], // есть
  ['G5143', 'G1408'], // бежать
];
const ALIASES = new Map(SAME.flatMap((g) => g.map((n) => [n, g])));

export const strongKey = (s) => {
  const m = /^([HG])0*(\d+)([a-z]?)$/i.exec(s || '');
  return m ? `${m[1].toUpperCase()}${m[2]}` : s;
};

export const originalFor = (bookId) => ORIGINAL[testamentOf(bookId)] || null;

// Ставит оригинальный текст, если его ещё нет
export async function ensureOriginal(bookId, onProgress) {
  const id = originalFor(bookId);
  if (!id) return null;
  if ((await listModules()).some((m) => m.id === id)) return id;
  const entry = (await fetchCatalog()).find((c) => c.id === id);
  if (!entry) throw new Error('Оригинальный текст пока недоступен.');
  await installFromCatalog(entry, onProgress);
  return id;
}

// Как каждое слово оригинала (по номеру Стронга) передано в синодальном стихе: подряд идущие русские слова
// с одним номером — одна фраза («будет говорить»)
function renderings(raw) {
  const map = new Map();
  let prev = null;
  for (const t of tokenize(raw || '')) {
    if (t.kind !== 'w') {
      if (t.text.trim()) prev = null;
      continue;
    }
    const k = t.strongs?.length ? strongKey(t.strongs[0]) : null;
    if (!k) {
      prev = null;
      continue;
    }
    if (prev && prev.k === k) {
      prev.list[prev.list.length - 1] += ' ' + t.text;
      continue;
    }
    const list = map.get(k) || [];
    list.push(t.text);
    map.set(k, list);
    prev = { k, list };
  }
  return map;
}

// Слова стиха: [{ text, num, morph, gloss, guess }]; null — для этой книги нет оригинала
export async function interlinearVerse(ref) {
  const id = originalFor(ref.book);
  if (!id) return null;
  const mods = await listModules();
  const tagged = mods.find((m) => m.type === 'bible' && m.features?.strongs && m.language === 'ru');
  const symphony = mods.find((m) => m.id === 'rst-symphony' && m.enabled !== false);
  const [orig, ru, sym] = await Promise.all([getVerse(id, ref), tagged ? getVerse(tagged.id, ref) : null, symphony ? getPayload(symphony.id) : null]);
  if (orig == null) return [];
  const map = renderings(ru);
  const used = new Map();
  const words = [];
  for (const t of tokenize(orig)) {
    if (t.kind !== 'w') continue;
    const num = t.strongs?.length ? strongKey(t.strongs[0]) : null;
    let gloss = '';
    let guess = false;
    if (num && !SILENT.has(num)) {
      const i = used.get(num) || 0;
      used.set(num, i + 1);
      const list = (ALIASES.get(num) || [num]).map((n) => map.get(n)).find((l) => l?.length);
      if (list) gloss = list[Math.min(i, list.length - 1)];
      else if (!ALIASES.has(num)) {
        gloss = sym?.entries?.[num]?.renderings?.[0]?.[0] || '';
        guess = !!gloss;
      }
    }
    words.push({ text: t.text, num, morph: t.morph?.[0] || null, strongs: t.strongs || null, gloss, guess });
  }
  return words;
}
