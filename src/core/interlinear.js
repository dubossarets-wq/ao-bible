// Подстрочник: все слова синодального текста (RST+), под каждым — слово оригинала (Ветхий Завет — еврейский OSHB,
// Новый — греческий текст Робинсона — Пирпонта), сопоставленное по номерам Стронга.
// Оригинальные тексты ставятся сами при первом открытии подстрочника — добавлять их не нужно.
import { listModules, getVerse, getPayload, fetchCatalog, installFromCatalog } from './modules.js';
import { tokenize } from './verseMarkup.js';
import { testamentOf } from './books.js';
import { t } from './i18n.js';

const ORIGINAL = { OT: 'oshb', NT: 'byz-rp2018' };

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
  if (!entry) throw new Error(t('Оригинальный текст пока недоступен.'));
  await installFromCatalog(entry, onProgress);
  return id;
}

// Сопоставление слов стиха по номерам Стронга — одно на оба порядка: ru — все слова синодального текста с их
// оригиналом (как в модуле «Подстрочник», scripts/build_interlinear.py), orig — все слова оригинала с русским переводом.
const CANTILLATION = /[֑-ֽ֯׀]/g;

async function alignVerse(ref) {
  const id = originalFor(ref.book);
  if (!id) return null;
  const mods = await listModules();
  const tagged = mods.find((m) => m.type === 'bible' && m.features?.strongs && m.language === 'ru' && !m.features?.interlinear) || mods.find((m) => m.id === 'rst-plus');
  const [orig, ru] = await Promise.all([getVerse(id, ref), tagged ? getVerse(tagged.id, ref) : null]);
  const origWords = [];
  const queues = new Map();
  for (const t of tokenize(orig || '')) {
    if (t.kind !== 'w') continue;
    const k = t.strongs?.length ? strongKey(t.strongs[0]) : null;
    const w = { text: t.text.replace(CANTILLATION, ''), num: k, strongs: t.strongs || null, morph: t.morph?.[0] || null, gloss: [] };
    origWords.push(w);
    if (!k) continue;
    if (!queues.has(k)) queues.set(k, []);
    queues.get(k).push(w);
  }
  if (ru == null) return { ru: [], orig: origWords };
  const last = new Map();
  const take = (k) => {
    for (const n of ALIASES.get(k) || [k]) {
      const q = queues.get(n);
      if (q?.length) {
        const w = q.shift();
        last.set(k, w);
        return w;
      }
    }
    return null;
  };
  const out = [];
  let prevKey = null;
  let prevOrig = null; // оригинал предыдущего русского слова — для «будет говорить» (два слова на одно)
  let gap = false; // между словами был знак препинания
  let before = ''; // открывающие кавычки и скобки — к следующему слову
  for (const t of tokenize(ru)) {
    if (t.kind !== 'w') {
      const txt = t.text.trim();
      if (txt) {
        gap = true;
        const [, close, open] = /^(.*?)([«(„“‘[]*)$/.exec(txt);
        if (close && out.length) out[out.length - 1].after += close;
        else if (close) before += close;
        before += open;
      }
      continue;
    }
    const k = t.strongs?.length ? strongKey(t.strongs[0]) : null;
    let o = null;
    if (k && k === prevKey && !gap) prevOrig?.gloss.push(t.text);
    else if (k) {
      const fresh = take(k);
      if (fresh) fresh.gloss.push(t.text);
      o = fresh || last.get(k) || null;
      prevOrig = fresh;
    }
    for (const extra of (t.strongs || []).slice(1)) take(strongKey(extra));
    out.push({ text: before + t.text, after: '', orig: o?.text || '', origMorph: o?.morph || null, num: o ? k : null, strongs: t.strongs || null, morph: t.morph?.[0] || null, italic: t.italic });
    prevKey = k;
    gap = false;
    before = '';
  }
  return { ru: out, orig: origWords };
}

// Подстрочник в порядке синодального текста: все русские слова, под каждым — его оригинал (если есть)
export async function ruInterlinear(ref) {
  return (await alignVerse(ref))?.ru ?? null;
}

// Служебные слова без отдельного перевода: греческий артикль и еврейская частица прямого дополнения
const SILENT = new Set(['G3588', 'H853']);

// Подстрочник в порядке оригинала (Ветхий Завет — справа налево): под каждым словом — как оно передано
// в синодальном стихе; если в стихе его нет — обычный перевод из «Симфонии RST+» (guess — показывается бледнее)
export async function origInterlinear(ref) {
  const a = await alignVerse(ref);
  if (!a) return null;
  const sym = a.orig.some((w) => !w.gloss.length) ? await getPayload('rst-symphony').catch(() => null) : null;
  return a.orig.map((w) => {
    let gloss = w.gloss.join(' ');
    let guess = false;
    if (!gloss && w.num && !SILENT.has(w.num) && !ALIASES.has(w.num)) {
      gloss = sym?.entries?.[w.num]?.renderings?.[0]?.[0] || '';
      guess = !!gloss;
    }
    return { ...w, gloss, guess };
  });
}

// Подстрочник А. Винокурова (Новый Завет, с разрешения автора): слова в порядке греческого текста UBS,
// под каждым — русское слово Винокурова. Модуль ставится сам при первом открытии вкладки.
export const VIN = 'vin-interlinear';
export async function vinInterlinear(ref) {
  if (testamentOf(ref.book) !== 'NT') return null;
  if (!(await listModules()).some((m) => m.id === VIN)) {
    const entry = (await fetchCatalog()).find((c) => c.id === VIN);
    if (!entry) return null;
    await installFromCatalog(entry);
  }
  const raw = await getVerse(VIN, ref);
  if (raw == null) return [];
  return tokenize(raw)
    .filter((tk) => tk.kind === 'w')
    .map((tk) => ({ text: tk.orig || '', gloss: tk.text === '·' ? '' : tk.text, num: tk.strongs?.length ? strongKey(tk.strongs[0]) : null, strongs: tk.strongs || null, morph: null, guess: false }));
}
