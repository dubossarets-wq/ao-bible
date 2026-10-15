// Мои данные в файл и обратно: закладки, заметки, любимые стихи, выделения, подборки, планы, проповеди,
// настройки. Нужен, чтобы перенести всё на другой телефон или сохранить на всякий случай.
// Модули (переводы, словари) в файл не входят — их можно заново скачать в библиотеке.
import { P } from './channel.js';
import { SERVICE, snapshot } from './backup.js';

const FORMAT = 'aob-userdata';
// Резервные копии внутри приложения в файл не кладём — они только раздувают его
const SKIP = new Set([...SERVICE, P + 'backups']);

export function exportData() {
  const data = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(P) && !SKIP.has(k)) data[k.slice(P.length)] = localStorage.getItem(k);
  }
  return { format: FORMAT, version: 1, exportedAt: new Date().toISOString(), data };
}

const count = (raw) => {
  try {
    const v = JSON.parse(raw || 'null');
    return Array.isArray(v) ? v.length : v && typeof v === 'object' ? Object.keys(v).length : 0;
  } catch {
    return 0;
  }
};

// Что лежит в файле — показать перед восстановлением
export function describeData(file) {
  const d = file.data || {};
  return {
    at: file.exportedAt ? new Date(file.exportedAt) : null,
    bookmarks: count(d.bookmarks),
    notes: count(d.notes),
    favorites: count(d.favorites),
    highlights: count(d.highlights),
    plans: count(d.plans),
    sermons: count(d.sermons),
  };
}

export async function readDataFile(file) {
  const text = await file.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error('Это не файл с данными AO Bible.');
  }
  if (json?.format !== FORMAT || !json.data || typeof json.data !== 'object') throw new Error('Это не файл с данными AO Bible.');
  return json;
}

// Восстановление: сначала копия текущих данных (её можно вернуть в «Версиях приложения»), потом замена
export function importData(json) {
  snapshot('перед восстановлением из файла');
  for (const k of Object.keys(localStorage)) if (k.startsWith(P) && !SKIP.has(k)) localStorage.removeItem(k);
  for (const [k, v] of Object.entries(json.data)) if (typeof v === 'string' && !SKIP.has(P + k)) localStorage.setItem(P + k, v);
  location.reload();
}

// Сохранить файл: на телефоне — через «Поделиться» (Файлы, облако, мессенджер), на компьютере — скачиванием
export async function saveDataFile() {
  const json = exportData();
  const name = `AO Bible — мои данные ${new Date().toLocaleDateString('ru-RU').replace(/\./g, '-')}.json`;
  const blob = new Blob([JSON.stringify(json)], { type: 'application/json' });
  const file = new File([blob], name, { type: 'application/json' });
  if (navigator.canShare?.({ files: [file] }) && matchMedia('(pointer: coarse)').matches) {
    try {
      await navigator.share({ files: [file], title: 'AO Bible — мои данные' });
      return 'shared';
    } catch (e) {
      if (e?.name === 'AbortError') return 'cancelled';
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return 'downloaded';
}
