// Западная нумерация стихов (KJV) → синодальная. Модули каталога приведены к синодальной при сборке, а переводы
// bible.helloao.org и API.Bible приходят в западной — без перевода «Параллельно» и синхронная прокрутка открывали бы
// в соседней панели другое место (в Псалтири — соседний псалом). Таблица — versification.json:
// k2s — отрезки, где номера расходятся: {книга: {глава KJV: [[с, по, сдвиг главы, сдвиг стиха], …]}} (из таблицы SWORD,
// scripts/extra_lib.kjv2syn); syn — число стихов в главах синодальной нумерации (по RST+).
import V from './versification.json';
import WESTERN from './versesWestern.json';

// стих KJV → [глава, стих] синодальной нумерации
export function toSynodal(book, c, v) {
  for (const [a, b, dc, dv] of V.k2s[book]?.[c] || []) if (v >= a && v <= b) return [c + dc, v + dv];
  return [c, v];
}

// Какие главы KJV нужны, чтобы собрать синодальную главу c (обычно одна; на стыках псалмов — две)
export function westernChaptersFor(book, c) {
  const runs = V.k2s[book];
  if (!runs) return [c];
  const out = new Set();
  for (const [kc, list] of Object.entries(runs)) if (list.some(([, , dc]) => +kc + dc === c)) out.add(+kc);
  // своя глава KJV — если хоть один её стих остаётся в этой главе
  const n = WESTERN[book]?.[c - 1] || 0;
  for (let v = 1; v <= n; v++)
    if (toSynodal(book, c, v)[0] === c) {
      out.add(c);
      break;
    }
  return [...out].sort((a, b) => a - b);
}

// Глава KJV → стихи и заголовки синодальной главы target (что ушло в соседнюю главу — пропускается).
// title — надписание псалма: в синодальной нумерации это стих 1 (в западной — заголовок над стихом 1)
export function placeSynodal(book, kc, verses, heads, target, into = { v: [], h: {} }, title = '') {
  if (title && book === 'Ps' && toSynodal(book, kc, 1)[0] === target && toSynodal(book, kc, 1)[1] === 2 && !into.v[0]) into.v[0] = title;
  verses.forEach((text, i) => {
    if (!text) return;
    const [c, v] = toSynodal(book, kc, i + 1);
    if (c !== target) return;
    into.v[v - 1] = into.v[v - 1] ? `${into.v[v - 1]} ${text}` : text;
    const h = heads?.[i + 1];
    if (h && !into.h[v]) into.h[v] = h;
  });
  return into;
}

// Число стихов в синодальных главах книги (нет в таблице — по западному счёту)
export const synodalVerses = (book) => V.syn[book] || WESTERN[book] || [];
