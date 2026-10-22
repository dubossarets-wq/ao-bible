// Статистика слова оригинала по номеру Стронга: сколько раз встречается, в каких книгах, как переведено.
// Считается по установленному переводу с разметкой Стронга (RST+) один раз и запоминается.
import { listModules, peekBook } from './modules.js';
import { testamentOf } from './books.js';

// Кэшируем обещание: два одновременных запроса (статья и симфония) считают один раз
const cache = new Map();
export function strongStats(num) {
  // Перевода с номерами ещё нет (null) — не запоминаем: посчитаем, когда он установится
  if (!cache.has(num)) cache.set(num, countStats(num).then((r) => (r || cache.delete(num), r), (e) => (cache.delete(num), Promise.reject(e))));
  return cache.get(num);
}

async function countStats(num) {
  const mods = (await listModules()).filter((m) => m.type === 'bible' && m.features?.strongs);
  const mod = mods.find((m) => m.id === 'rst-plus') || mods.find((m) => m.language === 'ru') || mods[0];
  if (!mod) return null;
  const esc = num.replace(/[^A-Za-z0-9]/g, '');
  // {слово|H1254 H853|TH8804} — номер среди номеров второго поля
  const re = new RegExp(`\\{([^|}]*)\\|(?:[^|}]*\\s)?${esc}(?=[\\s|}])[^}]*\\}`, 'g');
  const byBook = [];
  const renderings = new Map();
  const refs = [];
  let total = 0;
  // В RST+ еврейские номера только в ВЗ, греческие — только в НЗ: другой Завет не читаем (на 60% меньше чтений).
  // Книги — мимо кэша читалки, чтобы не вытеснять книгу, которую сейчас читают.
  const only = mod.id === 'rst-plus' ? (/^G/i.test(esc) ? 'NT' : /^H/i.test(esc) ? 'OT' : null) : null;
  for (const b of mod.books) {
    if (only && testamentOf(b.id) !== only) continue;
    const data = await peekBook(mod.id, b.id);
    if (!data) continue;
    let n = 0;
    data.chapters.forEach((verses, ci) =>
      verses.forEach((v, vi) => {
        if (!v || !v.includes(esc)) return;
        re.lastIndex = 0;
        let m;
        const words = [];
        while ((m = re.exec(v))) {
          n++;
          const w = m[1].trim().toLowerCase();
          words.push(w);
          renderings.set(w, (renderings.get(w) || 0) + 1);
        }
        if (words.length) refs.push({ book: b.id, chapter: ci + 1, verse: vi + 1, words });
      })
    );
    if (n) byBook.push({ book: b.id, name: b.name, short: b.short, n });
    total += n;
  }
  const res = {
    module: mod.name,
    moduleId: mod.id,
    total,
    verses: refs.length,
    byBook,
    renderings: [...renderings.entries()].sort((a, b) => b[1] - a[1]),
    refs,
  };
  return res;
}
