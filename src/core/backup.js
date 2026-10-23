// Резервные копии пользовательских данных (настройки, закладки, заметки, избранное, панели, история поиска).
// Копия делается при первом запуске новой версии (ещё до того, как новый код что-либо прочитает)
// и перед переходом на другую версию. Хранятся последние 5 копий; восстановить — в «Версиях приложения».
// Модули в IndexedDB при обновлениях не трогаются и в копию не входят.
import { P } from './channel.js';
import { BUILD } from './updates.js';
import { freezeStorage } from './storage.js';
import { t, N_ } from './i18n.js';

const K_BACKUPS = P + 'backups';
const K_LAST = P + 'lastBuild';
const MAX = 5;
// Копии не должны съедать место под сами данные: все вместе — не больше ~1,5 млн символов
const BUDGET = 1_500_000;
// Служебные ключи версий — не копируем и не восстанавливаем, чтобы восстановление не откатывало приложение
export const SERVICE = new Set([K_BACKUPS, K_LAST, P + 'activeBuild', P + 'autoUpdate2', P + 'knownBuilds', P + 'notifiedBuild', P + 'lateStarter', P + 'bootstrapped', P + 'errorLog']);

function read() {
  try {
    return JSON.parse(localStorage.getItem(K_BACKUPS) || '[]');
  } catch {
    return [];
  }
}

export function snapshot(reason) {
  try {
    const data = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(P) && !SERVICE.has(k)) data[k] = localStorage.getItem(k);
    }
    if (!Object.keys(data).length) return;
    let list = [{ at: Date.now(), build: BUILD, reason, data }, ...read()].slice(0, MAX);
    while (list.length > 1 && JSON.stringify(list).length > BUDGET) list = list.slice(0, list.length - 1);
    // Если места мало — оставляем меньше копий, но хотя бы одну
    while (list.length) {
      try {
        localStorage.setItem(K_BACKUPS, JSON.stringify(list));
        return;
      } catch {
        list = list.slice(0, list.length - 1);
      }
    }
  } catch {
    /* хранилище недоступно */
  }
}

// При запуске: если это первая загрузка новой версии — сохраняем данные, какими их оставила прежняя
export function bootBackup() {
  try {
    const last = localStorage.getItem(K_LAST);
    if (last && last !== BUILD) snapshot(`до обновления с версии ${last}`);
    if (last !== BUILD) localStorage.setItem(K_LAST, BUILD);
  } catch {
    /* без хранилища нечего сохранять */
  }
}

export function listBackups() {
  return read().map((b) => {
    const count = (key) => {
      try {
        const v = JSON.parse(b.data[key] || 'null');
        return Array.isArray(v) ? v.length : v && typeof v === 'object' ? Object.keys(v).length : 0;
      } catch {
        return 0;
      }
    };
    return { at: b.at, build: b.build, reason: b.reason, bookmarks: count(P + 'bookmarks'), notes: count(P + 'notes'), favorites: count(P + 'favorites') };
  });
}

// Причина копии хранится по-русски (так записывали и прежние версии) — переводим при показе
N_('перед восстановлением из копии');
N_('перед восстановлением из файла');
export function reasonLabel(reason) {
  const m = /^(до обновления с версии|перед переходом на версию) (.+)$/.exec(reason || '');
  if (m) return m[1] === 'до обновления с версии' ? t('до обновления с версии {v}', { v: m[2] }) : t('перед переходом на версию {v}', { v: m[2] });
  return reason ? t(reason) : '';
}

export function restoreBackup(at) {
  const b = read().find((x) => x.at === at);
  if (!b) return false;
  snapshot('перед восстановлением из копии');
  return replaceAll(Object.entries(b.data));
}

// Заменить данные человека целиком; если запись оборвалась (нет места) — вернуть, как было
export function replaceAll(entries) {
  const before = {};
  for (const k of Object.keys(localStorage)) if (k.startsWith(P) && !SERVICE.has(k)) before[k] = localStorage.getItem(k);
  freezeStorage();
  try {
    for (const k of Object.keys(before)) localStorage.removeItem(k);
    for (const [k, v] of entries) localStorage.setItem(k, v);
  } catch {
    for (const k of Object.keys(localStorage)) if (k.startsWith(P) && !SERVICE.has(k)) localStorage.removeItem(k);
    for (const [k, v] of Object.entries(before)) {
      try {
        localStorage.setItem(k, v);
      } catch {
        /* вернули, что смогли */
      }
    }
    location.reload();
    return false;
  }
  location.reload();
  return true;
}
