// Поиск словарных статей для слова, на которое нажал читатель.
//
// 1. Если перевод размечен номерами Стронга, берём именно их (точная привязка).
// 2. Иначе пытаемся сопоставить русскую словоформу с номерами Стронга по обратному индексу
//    симфонии (wordIndex) — это приблизительное соответствие, и интерфейс об этом предупреждает.
// 3. Словари «по словам» ищутся по самой словоформе, затем по начальной форме (благодати → благодать,
//    агнца → агнец), затем без приставки (возлюбил → любить), и лишь потом — ближайшие слова с той же основой.
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

// Ключ для словаря: без ударений и титл, дореформенные буквы — в современные (для ЦСЯ, Макария)
export function dictKey(word) {
  return normalizeWord(word)
    .normalize('NFD')
    .replace(/[\u0300\u0301\u0483-\u0489]/g, '')
    .normalize('NFC')
    .replace(/ѣ/g, 'е')
    .replace(/[іѵ]/g, 'и')
    .replace(/ѳ/g, 'ф')
    .replace(/ъ$/, '');
}

const LEMMA_ENDINGS = ['', 'ь', 'а', 'я', 'о', 'е', 'й', 'ий', 'ый', 'ой', 'ть', 'ти', 'ться', 'ие', 'ия'];
const VERB_ENDINGS = ['ить', 'еть', 'ать', 'ять', 'ть', 'ти', 'ться', 'иться'];
// Похоже на глагол («любил», «говорит», «сказали») — начальную форму ищем сначала среди глагольных
const VERBAL = /(ил|ел|ал|ял|ла|ли|ло|ет|ит|ут|ют|ат|ят|ешь|ишь|ете|ите|ем|им|вши|ться|тся|лся|лась|лись)$/;
const VOWELS = /[аеёиоуыэюяй]/;
// Возможные начальные формы по основе: «благодат» → благодать…, «агнц» → агнец (беглая гласная)
function lemmaGuesses(st, verbal) {
  const out = (verbal ? [...VERB_ENDINGS, ...LEMMA_ENDINGS] : [...LEMMA_ENDINGS, ...VERB_ENDINGS]).map((e) => st + e);
  const last = st.slice(-1);
  const prev = st.slice(-2, -1);
  if (st.length >= 3 && !VOWELS.test(last) && prev && !VOWELS.test(prev))
    for (const v of ['е', 'о']) for (const e of ['', 'ь']) out.push(st.slice(0, -1) + v + last + e);
  return out;
}
const PREFIXES = ['пред', 'пере', 'воз', 'вос', 'раз', 'рас', 'при', 'про', 'под', 'пре', 'вы', 'из', 'ис', 'на', 'за', 'от', 'об', 'до', 'со', 'по', 'у', 'с', 'о'];

function findWord(entries, keys, text) {
  const key = dictKey(text);
  const exact = entries[key] || entries[text.toLowerCase()];
  if (exact) return [{ key, entry: exact, match: 'form' }];
  const byLemma = (w) => {
    const st = stem(w);
    return [...new Set(lemmaGuesses(st, VERBAL.test(w)))].filter((k) => k !== w && entries[k]);
  };
  // Начальная форма слова
  let hits = byLemma(key);
  if (hits.length) return hits.slice(0, 3).map((k) => ({ key: k, entry: entries[k], match: 'lemma' }));
  // Без приставки: «возлюбил» → «любить»
  for (const pre of PREFIXES) {
    if (!key.startsWith(pre) || key.length - pre.length < 4) continue;
    const rest = key.slice(pre.length);
    hits = entries[rest] ? [rest] : byLemma(rest);
    if (hits.length) return hits.slice(0, 2).map((k) => ({ key: k, entry: entries[k], match: 'root' }));
  }
  // Ближайшие слова с той же основой: сначала с той же основой целиком, потом по близости длины
  const st = stem(key);
  return prefixMatches(keys, st, 50)
    .sort((a, b) => (stem(a) === st ? 0 : 1) - (stem(b) === st ? 0 : 1) || Math.abs(a.length - key.length) - Math.abs(b.length - key.length))
    .slice(0, 4)
    .map((k) => ({ key: k, entry: entries[k], match: 'stem' }));
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
      found.push(...findWord(p.entries, keysFor(m.id, p.entries), token.text));
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
