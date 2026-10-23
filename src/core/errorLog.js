// «Сообщить о проблеме»: последние ошибки приложения хранятся только на устройстве и попадают в письмо,
// которое человек сам видит и отправляет. Никуда автоматически ничего не уходит.
import { load, save } from './storage.js';
import { BUILD } from './updates.js';
import { NATIVE } from './native.js';
import { CHANNEL } from './channel.js';
import { getLang } from './i18n.js';

const KEY = 'errorLog';
const MAX = 12;
export const SUPPORT_EMAIL = 'dubossarets@gmail.com';

function remember(text) {
  const msg = String(text || '').replace(/\s+/g, ' ').slice(0, 220);
  if (!msg) return;
  const list = load(KEY, []);
  if (list.length && list[list.length - 1].m === msg) return; // одна и та же ошибка подряд — один раз
  list.push({ t: new Date().toISOString().slice(0, 16).replace('T', ' '), m: msg });
  save(KEY, list.slice(-MAX));
}

export function installErrorLog() {
  window.addEventListener('error', (e) => remember(e.error?.stack?.split('\n').slice(0, 2).join(' ') || e.message));
  window.addEventListener('unhandledrejection', (e) => remember(e.reason?.stack?.split('\n').slice(0, 2).join(' ') || e.reason?.message || e.reason));
}

function platform() {
  if (NATIVE) return 'Android (Google Play)';
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  return standalone ? 'установленное веб-приложение' : 'браузер'; // i18n-ignore: текст письма разработчику
}

// Письмо: тема и начало текста — на языке человека, служебные сведения — как есть
export function problemReportUrl({ subject, intro, modules = [] }) {
  const errors = load(KEY, []);
  const info = [
    `AO Bible ${BUILD} (${CHANNEL})`,
    `${platform()} · ${navigator.userAgent}`,
    `${screen.width}×${screen.height} · ${getLang()}`,
    `modules: ${modules.length} — ${modules.slice(0, 40).join(', ')}`,
    errors.length ? `errors:\n${errors.map((e) => `${e.t} ${e.m}`).join('\n')}` : 'errors: —',
  ].join('\n');
  const body = `${intro}\n\n\n\n— — —\n${info}`.slice(0, 1800); // длинные ссылки mailto обрезаются почтовыми программами
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
