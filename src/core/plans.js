// Планы чтения: готовые (public/plans/*.json) и свои (книги + число дней). Прогресс — в localStorage.
// Чтение дня — список глав «Книга.Глава» или «Книга.Глава-Глава».
import { listModules } from './modules.js';
import { bookMeta, BOOKS } from './books.js';
import { t, N_ } from './i18n.js';

// Список планов — один раз за сеанс (раньше качался при каждом открытии, и сетка появлялась кадром позже)
let planIndex = null;
export function fetchPlanIndex() {
  planIndex ||= fetch('plans/index.json', { cache: 'no-cache' })
    .then((res) => {
      if (!res.ok) throw new Error(t('Список планов недоступен'));
      return res.json();
    })
    .then((j) => j.plans || [])
    .catch((e) => {
      planIndex = null; // не вышло — попробуем при следующем открытии
      throw e;
    });
  return planIndex;
}

export async function fetchPlan(file) {
  const res = await fetch(`plans/${file}`, { cache: 'no-cache' });
  if (!res.ok) throw new Error(t('План не загрузился'));
  return res.json();
}

// Главы книг по порядку: [{ ref: 'Isa.1', n: стихов }] — по основному переводу
export async function chapterList(bookIds) {
  const mods = (await listModules()).filter((m) => m.type === 'bible');
  const mod = mods.find((m) => m.id === 'rst-plus') || mods[0];
  const chapters = [];
  for (const id of bookIds) {
    const b = mod?.books.find((x) => x.id === id);
    if (!b) continue;
    b.verses.forEach((n, i) => chapters.push({ ref: `${id}.${i + 1}`, n }));
  }
  return chapters;
}

// Свой план: главы выбранных книг поровну по дням (по числу стихов — чтобы дни были ровными)
export async function makeCustomPlan(bookIds, days) {
  const chapters = await chapterList(bookIds);
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
  all: { label: N_('Вся Библия'), books: () => BOOKS.filter((b) => !b.dc).map((b) => b.id) },
  ot: { label: N_('Ветхий Завет'), books: () => BOOKS.filter((b) => b.t === 'OT' && !b.dc).map((b) => b.id) },
  nt: { label: N_('Новый Завет'), books: () => BOOKS.filter((b) => b.t === 'NT').map((b) => b.id) },
  gospels: { label: N_('Евангелия'), books: () => ['Matt', 'Mark', 'Luke', 'John'] },
  ps: { label: N_('Псалтирь'), books: () => ['Ps'] },
};

// Параллельное чтение: каждый день — из каждого раздела своё число глав. Короткий раздел (Псалтирь) начинается
// заново, пока не кончится самый длинный. Разделы: ВЗ, НЗ — широкие; остальные — узкие.
export const STREAMS = {
  ot: { label: N_('Ветхий Завет'), short: N_('ВЗ'), books: () => SCOPES.ot.books() },
  nt: { label: N_('Новый Завет'), short: N_('НЗ'), books: () => SCOPES.nt.books() },
  ps: { label: N_('Псалтирь'), short: N_('Псалтирь'), books: () => ['Ps'] },
  prov: { label: N_('Притчи'), short: N_('Притчи'), books: () => ['Prov'] },
  gospels: { label: N_('Евангелия'), short: N_('Евангелия'), books: () => SCOPES.gospels.books() },
  own: { label: N_('Свои книги'), short: N_('Свои книги'), books: (own) => own || [] },
};
const WIDE = ['ot', 'nt'];

// Книги разделов без повторов: книги включённых узких разделов (Псалтирь, Евангелия, свои) не читаются ещё раз в ВЗ/НЗ.
// on — { ключ: глав в день }
export function streamList(on, own) {
  const keys = Object.keys(STREAMS).filter((k) => on[k] != null);
  const narrow = new Set(keys.filter((k) => !WIDE.includes(k)).flatMap((k) => STREAMS[k].books(own)));
  return keys.map((k) => ({
    key: k,
    perDay: on[k],
    books: WIDE.includes(k) ? STREAMS[k].books().filter((b) => !narrow.has(b)) : STREAMS[k].books(own),
  }));
}

// Дни параллельного плана: [['Gen.1', 'Matt.1', 'Ps.1'], …]; длина — по самому длинному разделу
export async function makeParallelPlan(streams) {
  const lists = await Promise.all(streams.map((x) => chapterList(x.books)));
  const ok = streams.map((x, i) => ({ per: x.perDay, ch: lists[i] })).filter((x) => x.ch.length && x.per > 0);
  if (!ok.length) return [];
  const days = Math.min(3650, Math.max(...ok.map((x) => Math.ceil(x.ch.length / x.per))));
  return Array.from({ length: days }, (_, d) => [
    ...new Set(ok.flatMap((x) => Array.from({ length: Math.min(x.per, x.ch.length) }, (_, k) => x.ch[(d * x.per + k) % x.ch.length].ref))),
  ]);
}

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
  if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
    const [y, m, dd] = d.split('-').map(Number);
    return new Date(y, m - 1, dd);
  }
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
  const from = plan.calendar ? Math.min(today, calendarIndex(day0(plan.start))) : 0;
  const out = [];
  for (let i = from; i < today; i++) if (!plan.done?.[i]) out.push(i);
  return out;
}

export const todayIndex = (start, days) => Math.max(0, Math.min(days - 1, Math.round((day0(Date.now()) - day0(start)) / 86400000)));
export const isoDate = (d = new Date()) => d.toISOString().slice(0, 10);
// Дата по местному времени (для учёта «прочитано сегодня»)
export const localDate = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
