// Напоминания о плане чтения (только приложение из Google Play): локальные уведомления, без сервера.
// Напоминаний сколько угодно: каждое — в своё время или промежутком («с 8:00 до 20:00 каждые 2 ч»), в выбранные
// дни недели. На 14 дней вперёд (не больше MAX уведомлений) — с текстом дня («Вся Библия за 70 дн.: Суд 7–21»);
// при каждом запуске и изменении планов расписание пересобирается. Нажатие на уведомление открывает планы.
// Хранится { on, time, list: [{ id, time, every, until, days }] }: every — минуты (0 — один раз), days — дни недели
// 1…7 (пн…вс; пусто — каждый день); time — время первого (его читают прежние версии приложения).
import { LocalNotifications } from '@capacitor/local-notifications';
import { NATIVE } from './native.js';
import { getPlans } from './planStore.js';
import { parseReading, calendarIndex } from './plans.js';
import { load, save } from './storage.js';
import { t } from './i18n.js';

export const REMINDERS = NATIVE;
const KEY = 'planReminder';
const BASE_ID = 7000;
const DAYS = 14;
const MAX = 200; // будильников у приложения в Android не больше 500 — с запасом

export const REPEATS = [0, 30, 60, 120, 180, 240, 360]; // минуты; 0 — один раз
export const newReminder = (time = '08:00') => ({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5), time, every: 0, until: '20:00', days: [] });
// Прежний формат ({ on, time }) — одно напоминание в это время
export function getReminder() {
  const r = { on: false, time: '08:00', ...load(KEY, {}) };
  const list = Array.isArray(r.list) && r.list.length ? r.list : [{ ...newReminder(r.time), id: 'r1' }];
  return { ...r, list, time: list[0].time };
}
const mins = (hm) => {
  const [h, m] = String(hm || '0:0').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};
// Минуты дня, когда звенит напоминание: одно время или промежуток с шагом
export function reminderTimes(x) {
  const a = mins(x.time);
  if (!(x.every > 0)) return [a];
  const z = mins(x.until);
  const out = [];
  for (let m = a; m <= Math.max(a, z) && out.length < 48; m += x.every) out.push(m);
  return out;
}

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
function startDate(s) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(s || '')) {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  return startOfDay(new Date(s || Date.now()));
}
// День плана на дату; null — план ещё не начался или уже кончился
function planDay(plan, date) {
  const i = plan.calendar ? calendarIndex(date) : Math.round((startOfDay(date) - startDate(plan.start)) / 86400000);
  return i >= 0 && i < plan.readings.length ? i : null;
}

let busy = Promise.resolve();
export function scheduleReminders() {
  if (!NATIVE) return Promise.resolve();
  busy = busy.then(schedule, schedule);
  return busy;
}
async function schedule() {
  const ours = Array.from({ length: MAX }, (_, k) => ({ id: BASE_ID + k }));
  await LocalNotifications.cancel({ notifications: ours }).catch(() => {});
  const r = getReminder();
  const plans = getPlans();
  if (!r.on || !plans.length) return;
  const now = Date.now();
  const notifications = [];
  for (let k = 0; k < DAYS && notifications.length < MAX; k++) {
    const day = new Date();
    day.setDate(day.getDate() + k);
    const wd = day.getDay() || 7;
    // все моменты этого дня по всем напоминаниям — по порядку, без повторов
    const times = [...new Set(r.list.filter((x) => !x.days?.length || x.days.includes(wd)).flatMap(reminderTimes))].sort((a, b) => a - b);
    const ats = times.map((m) => new Date(day.getFullYear(), day.getMonth(), day.getDate(), Math.floor(m / 60), m % 60)).filter((at) => at.getTime() >= now + 60000);
    if (!ats.length) continue;
    const lines = plans
      .map((p) => {
        const d = planDay(p, day);
        if (d == null || p.done?.[d]) return null;
        const labels = (p.readings[d] || []).map((x) => parseReading(x).label);
        return labels.length ? `${t(p.name)}: ${labels.join(', ')}` : null;
      })
      .filter(Boolean);
    if (!lines.length) continue;
    for (const at of ats) {
      if (notifications.length >= MAX) break;
      notifications.push({
        id: BASE_ID + notifications.length,
        title: t('Чтение на сегодня'),
        body: lines.join('\n'),
        largeBody: lines.join('\n'),
        schedule: { at, allowWhileIdle: true },
        smallIcon: 'ic_stat_aob',
        extra: { open: 'plans' },
      });
    }
  }
  if (notifications.length) await LocalNotifications.schedule({ notifications });
}

// «Будильники и напоминания» (Android 12+): без него уведомление приходит с опозданием или не приходит вовсе
export async function exactAllowed() {
  if (!NATIVE) return true;
  const r = await LocalNotifications.checkExactNotificationSetting().catch(() => null);
  return !r || r.exact_alarm === 'granted';
}
// Открыть системную страницу «Будильники и напоминания» этого приложения
export const askExact = () => LocalNotifications.changeExactNotificationSetting().catch(() => {});

// Включить или выключить; при включении спрашиваем разрешение (Android 13+). false — разрешения не дали
export async function setReminder(next) {
  const r = { ...getReminder(), ...next };
  r.time = r.list[0]?.time || r.time;
  if (r.on && NATIVE) {
    const p = await LocalNotifications.requestPermissions().catch(() => ({ display: 'denied' }));
    if (p.display !== 'granted') return false;
  }
  save(KEY, r);
  await scheduleReminders();
  return true;
}

// Запуск приложения: пересобрать расписание и слушать нажатия на уведомление
export function startReminders(openPlans) {
  if (!NATIVE) return;
  LocalNotifications.addListener('localNotificationActionPerformed', (a) => a.notification?.extra?.open === 'plans' && openPlans());
  scheduleReminders();
}
