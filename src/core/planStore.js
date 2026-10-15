// Активные планы чтения — общее хранилище для окна планов, страницы «план на день» и учёта прочитанного.
// Формат прежний (localStorage «plans»): { uid, planId, name, readings, calendar, start, done: { день: ts } },
// добавлено parts: { день: { отрывок: ts } } — какие отрывки дня уже прочитаны.
import { useSyncExternalStore } from 'react';
import { load, save } from './storage.js';
import { dayUnits, planToday, behindDays } from './plans.js';

// Календарный план (день плана = день года) в новом году начинается заново: отметки прошлого года
// не должны считаться прочитанными в этом. Год плана хранится в plan.year.
function newYear(list) {
  const y = new Date().getFullYear();
  let changed = false;
  const out = list.map((p) => {
    if (!p.calendar) return p;
    const py = p.year || +String(p.start || '').slice(0, 4) || y;
    if (py === y) return p.year ? p : ((changed = true), { ...p, year: y });
    changed = true;
    return { ...p, year: y, start: `${y}-01-01`, done: {}, parts: {}, history: { ...p.history, [py]: Object.keys(p.done || {}).length } };
  });
  return changed ? out : list;
}
const read = () => {
  const v = load('plans', []);
  const list = Array.isArray(v) ? newYear(v) : [];
  if (Array.isArray(v) && list !== v) save('plans', list);
  return list;
};
let plans = read();
const subs = new Set();

export const getPlans = () => plans;
export const getPlan = (uid) => plans.find((p) => p.uid === uid) || null;

export function setPlans(next) {
  plans = typeof next === 'function' ? next(plans) : next;
  save('plans', plans);
  subs.forEach((fn) => fn());
}

const subscribe = (fn) => {
  subs.add(fn);
  return () => subs.delete(fn);
};
export const usePlans = () => [useSyncExternalStore(subscribe, getPlans), setPlans];
export const usePlan = (uid) => useSyncExternalStore(subscribe, () => getPlan(uid));

// Отметить отрывки дня прочитанными. Возвращает true, если этим день плана завершён.
export function markUnits(uid, day, keys) {
  let finished = false;
  setPlans((ps) =>
    ps.map((p) => {
      if (p.uid !== uid || p.done?.[day]) return p;
      const have = p.parts?.[day] || {};
      const add = keys.filter((k) => !have[k]);
      if (!add.length) return p;
      const now = Date.now();
      const dayParts = { ...have, ...Object.fromEntries(add.map((k) => [k, now])) };
      const all = dayUnits(p, day).every((u) => dayParts[u.key]);
      finished = all;
      return { ...p, parts: { ...p.parts, [day]: dayParts }, done: all ? { ...p.done, [day]: now } : p.done };
    })
  );
  return finished;
}

// Глава дочитана в обычном чтении: засчитываем её в планы — сначала в сегодняшний день, потом в пропущенные.
// Возвращает названия планов, куда глава засчитана, и тех, у которых этим завершён день.
export function creditChapter(book, chapter) {
  const credited = [];
  const finished = [];
  for (const p of plans) {
    const days = [planToday(p), ...behindDays(p)];
    for (const d of days) {
      if (p.done?.[d]) continue;
      const keys = dayUnits(p, d)
        .filter((u) => u.book === book && u.chapter === chapter && !p.parts?.[d]?.[u.key])
        .map((u) => u.key);
      if (!keys.length) continue;
      credited.push(p.name);
      if (markUnits(p.uid, d, keys)) finished.push(p.name);
      break;
    }
  }
  return { credited, finished };
}
