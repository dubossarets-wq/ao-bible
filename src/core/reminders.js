// Напоминание о плане чтения (только приложение из Google Play): локальные уведомления в выбранное время,
// без сервера. На 14 дней вперёд — с текстом дня («Вся Библия за 70 дн.: Суд 7–21»); при каждом запуске
// и изменении планов расписание пересобирается. Нажатие на уведомление открывает планы.
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

export const getReminder = () => ({ on: false, time: '08:00', ...load(KEY, {}) });

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
  const ours = Array.from({ length: DAYS }, (_, k) => ({ id: BASE_ID + k }));
  await LocalNotifications.cancel({ notifications: ours }).catch(() => {});
  const r = getReminder();
  const plans = getPlans();
  if (!r.on || !plans.length) return;
  const [h, m] = r.time.split(':').map(Number);
  const now = Date.now();
  const notifications = [];
  for (let k = 0; k < DAYS; k++) {
    const at = new Date();
    at.setDate(at.getDate() + k);
    at.setHours(h, m, 0, 0);
    if (at.getTime() < now + 60000) continue;
    const lines = plans
      .map((p) => {
        const d = planDay(p, at);
        if (d == null || p.done?.[d]) return null;
        const labels = (p.readings[d] || []).map((x) => parseReading(x).label);
        return labels.length ? `${t(p.name)}: ${labels.join(', ')}` : null;
      })
      .filter(Boolean);
    if (!lines.length) continue;
    notifications.push({
      id: BASE_ID + k,
      title: t('Чтение на сегодня'),
      body: lines.join('\n'),
      largeBody: lines.join('\n'),
      schedule: { at, allowWhileIdle: true },
      smallIcon: 'ic_stat_aob',
      extra: { open: 'plans' },
    });
  }
  if (notifications.length) await LocalNotifications.schedule({ notifications });
}

// Включить или выключить; при включении спрашиваем разрешение (Android 13+). false — разрешения не дали
export async function setReminder(next) {
  const r = { ...getReminder(), ...next };
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
