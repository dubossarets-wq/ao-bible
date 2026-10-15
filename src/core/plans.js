// Планы чтения: готовые (public/plans/*.json) и свои (книги + число дней). Прогресс — в localStorage.
// Чтение дня — список глав «Книга.Глава» или «Книга.Глава-Глава».
import { listModules } from './modules.js';
import { bookMeta, BOOKS } from './books.js';

export async function fetchPlanIndex() {
  const res = await fetch('plans/index.json', { cache: 'no-cache' });
  if (!res.ok) throw new Error('Список планов недоступен');
  return (await res.json()).plans || [];
}

export async function fetchPlan(file) {
  const res = await fetch(`plans/${file}`, { cache: 'no-cache' });
  if (!res.ok) throw new Error('План не загрузился');
  return res.json();
}

// Свой план: главы выбранных книг поровну по дням (по числу стихов — чтобы дни были ровными)
export async function makeCustomPlan(bookIds, days) {
  const mods = (await listModules()).filter((m) => m.type === 'bible');
  const mod = mods.find((m) => m.id === 'rst-plus') || mods[0];
  const chapters = [];
  for (const id of bookIds) {
    const b = mod?.books.find((x) => x.id === id);
    if (!b) continue;
    b.verses.forEach((n, i) => chapters.push({ ref: `${id}.${i + 1}`, n }));
  }
  const total = chapters.reduce((a, c) => a + c.n, 0);
  const per = total / days;
  const readings = Array.from({ length: days }, () => []);
  let acc = 0;
  for (const c of chapters) {
    const day = Math.min(days - 1, Math.floor((acc + c.n / 2) / per));
    readings[day].push(c.ref);
    acc += c.n;
  }
  return readings.filter((r) => r.length);
}

export const SCOPES = {
  all: { label: 'Вся Библия', books: () => BOOKS.filter((b) => !b.dc).map((b) => b.id) },
  ot: { label: 'Ветхий Завет', books: () => BOOKS.filter((b) => b.t === 'OT' && !b.dc).map((b) => b.id) },
  nt: { label: 'Новый Завет', books: () => BOOKS.filter((b) => b.t === 'NT').map((b) => b.id) },
  gospels: { label: 'Евангелия', books: () => ['Matt', 'Mark', 'Luke', 'John'] },
  ps: { label: 'Псалтирь', books: () => ['Ps'] },
};

// «Gen.1» — глава; «Ps.9.1-21» — стихи главы; «Zech.13.1» — стих; «Ps.119-120» — главы
export function parseReading(r) {
  const [book, ch, vs] = r.split('.');
  const name = bookMeta(book).short.replace(/\.$/, '');
  if (vs) {
    const [v1, v2] = vs.split('-').map(Number);
    return { book, chapter: +ch, verse: v1, label: `${name} ${ch}:${v1}${v2 ? `–${v2}` : ''}` };
  }
  const [a, b] = (ch || '1').split('-').map(Number);
  return { book, chapter: a, verse: 1, to: b || null, label: `${name} ${a}${b ? `–${b}` : ''}` };
}

// Календарный план (М'Чейн): день плана = день года, 29 февраля чтений нет (берём 28-е)
export function calendarIndex(date = new Date()) {
  const y = date.getFullYear();
  const start = new Date(y, 0, 1);
  let i = Math.floor((new Date(y, date.getMonth(), date.getDate()) - start) / 86400000);
  const leap = new Date(y, 1, 29).getMonth() === 1;
  if (leap && i >= 59) i -= 1; // после 28 февраля
  return Math.min(364, i);
}

const day0 = (d) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};
// Отрывки чтения: «Ps.119-120» — две главы, «Ps.9.1-21» — часть главы.
// to: null — до конца главы. key — по нему отмечаются прочитанные отрывки дня.
export function readingUnits(r) {
  const [book, ch, vs] = r.split('.');
  if (vs) {
    const [v1, v2] = vs.split('-').map(Number);
    return [{ book, chapter: +ch, from: v1, to: v2 || v1, key: r }];
  }
  const [a, b] = (ch || '1').split('-').map(Number);
  return Array.from({ length: (b || a) - a + 1 }, (_, i) => ({ book, chapter: a + i, from: 1, to: null, key: `${book}.${a + i}` }));
}

export const dayUnits = (plan, day) => (plan.readings[day] || []).flatMap(readingUnits);

// Прочитан ли отрывок: день отмечен целиком (вручную или сам) или отмечен этот отрывок
export const unitDone = (plan, day, key) => !!(plan.done?.[day] || plan.parts?.[day]?.[key]);
export const readingDone = (plan, day, r) => readingUnits(r).every((u) => unitDone(plan, day, u.key));

// День плана, который сейчас «сегодня»
export const planToday = (plan) => (plan.calendar ? calendarIndex() : todayIndex(plan.start, plan.readings.length));

// Пропущенные дни до сегодняшнего (с начала плана)
export function behindDays(plan) {
  const today = planToday(plan);
  const from = plan.calendar ? Math.min(today, calendarIndex(new Date(plan.start))) : 0;
  const out = [];
  for (let i = from; i < today; i++) if (!plan.done?.[i]) out.push(i);
  return out;
}

export const todayIndex = (start, days) => Math.max(0, Math.min(days - 1, Math.round((day0(Date.now()) - day0(start)) / 86400000)));
export const isoDate = (d = new Date()) => d.toISOString().slice(0, 10);
// Дата по местному времени (для учёта «прочитано сегодня»)
export const localDate = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
