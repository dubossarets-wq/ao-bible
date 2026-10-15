// Статистика слова оригинала по номеру Стронга: сколько раз встречается, в каких книгах, как переведено.
// Считается по установленному переводу с разметкой Стронга (RST+) один раз и запоминается.
import { listModules, getBook } from './modules.js';

const cache = new Map();

export async function strongStats(num) {
  if (cache.has(num)) return cache.get(num);
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
  for (const b of mod.books) {
    const data = await getBook(mod.id, b.id);
    if (!data) continue;
    let n = 0;
    data.chapters.forEach((verses, ci) =>
      verses.forEach((v, vi) => {
        if (!v || !v.includes(esc)) return;
        re.lastIndex = 0;
        let m;
        let found = false;
        while ((m = re.exec(v))) {
          n++;
          found = true;
          const w = m[1].trim().toLowerCase();
          renderings.set(w, (renderings.get(w) || 0) + 1);
        }
        if (found) refs.push({ book: b.id, chapter: ci + 1, verse: vi + 1 });
      })
    );
    if (n) byBook.push({ book: b.id, name: b.name, short: b.short, n });
    total += n;
  }
  const res = {
    module: mod.name,
    total,
    verses: refs.length,
    byBook,
    renderings: [...renderings.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12),
    refs,
  };
  cache.set(num, res);
  return res;
}
