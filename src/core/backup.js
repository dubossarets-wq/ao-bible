// Резервные копии пользовательских данных (настройки, закладки, заметки, избранное, панели, история поиска).
// Копия делается при первом запуске новой версии (ещё до того, как новый код что-либо прочитает)
// и перед переходом на другую версию. Хранятся последние 5 копий; восстановить — в «Версиях приложения».
// Модули в IndexedDB при обновлениях не трогаются и в копию не входят.
import { P } from './channel.js';
import { BUILD } from './updates.js';

const K_BACKUPS = P + 'backups';
const K_LAST = P + 'lastBuild';
const MAX = 5;
// Служебные ключи версий — не копируем и не восстанавливаем, чтобы восстановление не откатывало приложение
export const SERVICE = new Set([K_BACKUPS, K_LAST, P + 'activeBuild', P + 'autoUpdate2', P + 'knownBuilds', P + 'notifiedBuild', P + 'lateStarter', P + 'bootstrapped']);

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

export function restoreBackup(at) {
  const b = read().find((x) => x.at === at);
  if (!b) return false;
  snapshot('перед восстановлением из копии');
  for (const k of Object.keys(localStorage)) if (k.startsWith(P) && !SERVICE.has(k)) localStorage.removeItem(k);
  for (const [k, v] of Object.entries(b.data)) localStorage.setItem(k, v);
  location.reload();
  return true;
}
