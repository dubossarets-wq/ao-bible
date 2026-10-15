// Параллельные места: собираем ссылки из включённых модулей crossrefs и из самого перевода,
// затем подтягиваем текст стихов из перевода, открытого в панели.
import { listModules, getPayload, getBook } from './modules.js';
import { parseOsisRef } from './books.js';
import { plainText } from './verseMarkup.js';

let countIndex = null; // Map `${book}.${c}.${v}` -> число ссылок (для бейджа у стиха)
let countIndexKey = '';
let countGen = 0; // запоминаем только результат самого свежего запроса

export async function crossrefCounts() {
  const mods = (await listModules()).filter((m) => m.type === 'crossrefs' && m.enabled !== false);
  const key = mods.map((m) => m.id + m.updatedAt).join(',');
  if (countIndex && key === countIndexKey) return countIndex;
  const my = ++countGen;
  const map = new Map();
  for (const m of mods) {
    const p = await getPayload(m.id);
    if (!p?.refs) continue;
    for (const [k, v] of Object.entries(p.refs)) map.set(k, (map.get(k) || 0) + v.length);
  }
  if (my === countGen) {
    countIndex = map;
    countIndexKey = key;
  }
  return map;
}

export async function refsForVerse(moduleId, ref) {
  const key = `${ref.book}.${ref.chapter}.${ref.verse}`;
  const seen = new Set();
  const out = [];
  const add = (r, source) => {
    if (seen.has(r)) return;
    seen.add(r);
    const parsed = parseOsisRef(r);
    if (parsed) out.push({ osis: r, ref: parsed, source });
  };
  const book = await getBook(moduleId, ref.book);
  for (const r of book?.xrefs?.[`${ref.chapter}:${ref.verse}`] || []) add(r, 'перевод');
  const mods = (await listModules()).filter((m) => m.type === 'crossrefs' && m.enabled !== false);
  for (const m of mods) {
    const p = await getPayload(m.id);
    for (const r of p?.refs?.[key] || []) add(r, m.name);
  }
  return out;
}

// Текст ссылки (до maxVerses стихов диапазона) из указанного перевода
export async function textForRef(moduleId, ref, maxVerses = 4) {
  const parts = [];
  let { book, chapter, verse } = ref;
  const end = ref.end || ref;
  let count = 0;
  while (count < maxVerses) {
    const b = await getBook(moduleId, book);
    const v = b?.chapters?.[chapter - 1]?.[verse - 1];
    if (v == null) {
      if (chapter < end.chapter && b?.chapters?.[chapter]) {
        chapter++;
        verse = 1;
        continue;
      }
      break;
    }
    parts.push({ verse, chapter, text: plainText(v) });
    count++;
    if (chapter === end.chapter && verse >= end.verse) break;
    if (chapter > end.chapter) break;
    verse++;
  }
  const totalInRange = ref.end && ref.end.chapter === ref.chapter ? ref.end.verse - ref.verse + 1 : null;
  return { parts, truncated: totalInRange ? totalInRange > parts.length : !!ref.end && count >= maxVerses };
}
