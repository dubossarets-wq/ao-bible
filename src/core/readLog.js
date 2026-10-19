// Учёт прочитанного: какие главы человек дочитал и когда (localStorage «readLog»).
// Глава засчитывается, если её дочитали до последнего стиха и провели на ней разумное время,
// чтобы быстрая прокрутка не считалась чтением.
import { load, save } from './storage.js';
import { localDate } from './plans.js';

// Сколько секунд нужно провести на отрывке из n стихов (быстрое чтение, с запасом)
export const minSeconds = (n) => Math.max(8, Math.min(120, n * 2.5));

// { days: { '2026-10-15': ['Gen.1', 'Matt.1'] } }
const get = () => {
  const v = load('readLog', null);
  return v && typeof v === 'object' && v.days ? v : { days: {} };
};

// Записать дочитанную главу. Возвращает true, если сегодня она записана впервые.
export function logChapter(book, chapter) {
  const log = get();
  const day = localDate();
  const key = `${book}.${chapter}`;
  const list = log.days[day] || [];
  if (list.includes(key)) return false;
  log.days[day] = [...list, key];
  save('readLog', log);
  return true;
}

export function readStats() {
  const { days } = get();
  const today = localDate();
  const weekAgo = localDate(new Date(Date.now() - 6 * 86400000));
  const all = new Set();
  let week = 0;
  const recent = [];
  for (const d of Object.keys(days).sort()) {
    for (const k of days[d]) {
      all.add(k);
      if (d >= weekAgo) week++;
      recent.push({ key: k, day: d });
    }
  }
  // Столбики за 7 дней (с самого раннего до сегодня) и серия дней подряд: сегодня ещё не читал — серия не обрывается
  const dayAgo = (i) => localDate(new Date(Date.now() - i * 86400000));
  const days7 = [6, 5, 4, 3, 2, 1, 0].map((i) => ({ day: dayAgo(i), n: (days[dayAgo(i)] || []).length }));
  let streak = 0;
  for (let i = days[today]?.length ? 0 : 1; (days[dayAgo(i)] || []).length; i++) streak++;
  return { today: (days[today] || []).length, week, total: all.size, recent: recent.reverse().slice(0, 30), daysActive: Object.keys(days).length, days7, streak };
}
