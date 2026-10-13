// Поиск словарных статей для слова, на которое нажал читатель.
//
// 1. Если перевод размечен номерами Стронга, берём именно их (точная привязка).
// 2. Иначе пытаемся сопоставить русскую словоформу с номерами Стронга по обратному индексу
//    симфонии (wordIndex) — это приблизительное соответствие, и интерфейс об этом предупреждает.
// 3. Словари «по словам» ищутся по самой словоформе, затем по основе слова.
import { getPayload, listModules } from './modules.js';
import { testamentOf } from './books.js';
import { normalizeWord } from './verseMarkup.js';

const ENDINGS = [
  'ениями', 'ениях', 'остями', 'ствами', 'иями', 'ями', 'ами', 'ого', 'его', 'ому', 'ему', 'ыми', 'ими', 'ешь', 'ете',
  'ите', 'ают', 'яют', 'ует', 'ует', 'ться', 'тся', 'ась', 'ось', 'ись', 'ыся', 'вши', 'ший', 'щий', 'ние', 'ния',
  'нию', 'ием', 'иях', 'ой', 'ей', 'ий', 'ый', 'ая', 'яя', 'ое', 'ее', 'ую', 'юю', 'ом', 'ем', 'ах', 'ях', 'ов',
  'ев', 'ам', 'ям', 'ть', 'ти', 'ет', 'ит', 'ут', 'ют', 'ат', 'ят', 'ил', 'ел', 'ла', 'ли', 'ло', 'ся', 'сь',
  'ы', 'и', 'а', 'я', 'о', 'е', 'у', 'ю', 'ь', 'й',
];

export function stem(word) {
  const w = normalizeWord(word);
  for (const e of ENDINGS) if (w.length - e.length >= 3 && w.endsWith(e)) return w.slice(0, -e.length);
  return w;
}

const sortedKeys = new Map(); // moduleId -> отсортированные ключи (для поиска по основе)

function keysFor(moduleId, entries) {
  if (!sortedKeys.has(moduleId)) sortedKeys.set(moduleId, Object.keys(entries).sort());
  return sortedKeys.get(moduleId);
}

function prefixMatches(keys, prefix, limit = 6) {
  let lo = 0;
  let hi = keys.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (keys[mid] < prefix) lo = mid + 1;
    else hi = mid;
  }
  const out = [];
  for (let i = lo; i < keys.length && keys[i].startsWith(prefix) && out.length < limit; i++) out.push(keys[i]);
  return out;
}

const strongKey = (s) => {
  const m = /^([HG])0*(\d+)([a-z]?)$/i.exec(s);
  return m ? `${m[1].toUpperCase()}${m[2]}${m[3] || ''}` : s;
};

export async function lookupWord({ token, ref }) {
  const modules = (await listModules()).filter((m) => m.type === 'dictionary' && m.enabled !== false);
  const testament = testamentOf(ref.book);
  const prefix = testament === 'NT' ? 'G' : 'H';
  const lower = token.text.toLowerCase();
  const norm = normalizeWord(token.text);

  let mapping;
  if (token.strongs?.length) {
    mapping = { mode: 'exact', strongs: token.strongs.map(strongKey), morph: token.morph || [] };
  } else {
    const candidates = new Map();
    for (const m of modules) {
      const p = await getPayload(m.id);
      const idx = p?.wordIndex;
      if (!idx) continue;
      for (const [s, n] of idx[lower] || idx[norm] || []) {
        if (!s.startsWith(prefix)) continue;
        candidates.set(strongKey(s), (candidates.get(strongKey(s)) || 0) + n);
      }
    }
    const list = [...candidates.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
    const total = list.reduce((n, [, c]) => n + c, 0);
    mapping = list.length
      ? { mode: 'approx', strongs: list.map(([s]) => s), weights: Object.fromEntries(list.map(([s, c]) => [s, c / total])), morph: [] }
      : { mode: 'none', strongs: [], morph: [] };
  }

  const results = [];
  for (const m of modules) {
    const p = await getPayload(m.id);
    if (!p?.entries) continue;
    const found = [];
    if (m.dictionaryKind === 'strongs') {
      for (const s of mapping.strongs) {
        const e = p.entries[s] || p.entries[s.replace(/^([HG])(\d+)$/, (_, a, b) => a + b.padStart(4, '0'))];
        if (e) found.push({ key: s, entry: e, match: mapping.mode });
      }
    } else {
      const direct = p.entries[norm] || p.entries[lower];
      if (direct) found.push({ key: norm, entry: direct, match: 'form' });
      else {
        const st = stem(token.text);
        for (const k of prefixMatches(keysFor(m.id, p.entries), st, 4)) found.push({ key: k, entry: p.entries[k], match: 'stem' });
      }
    }
    if (found.length) results.push({ module: m, found });
  }
  return { word: token.text, ref, testament, mapping, results, dictionaryCount: modules.length };
}

// Статья по номеру Стронга (переход по ссылке «от H24» внутри статьи)
export async function lookupStrong(num) {
  const modules = (await listModules()).filter((m) => m.type === 'dictionary' && m.enabled !== false && m.dictionaryKind === 'strongs');
  const results = [];
  for (const m of modules) {
    const p = await getPayload(m.id);
    const e = p?.entries?.[num];
    if (e) results.push({ module: m, found: [{ key: num, entry: e, match: 'exact' }] });
  }
  return results;
}
