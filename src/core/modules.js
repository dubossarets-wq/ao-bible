// Репозиторий модулей: установка, удаление, ленивая загрузка книг и словарей, каталог.
// Интерфейс не знает, где лежат данные: всё идёт через эти функции.
import { load, save } from './storage.js';
import * as db from './db.js';
import { normalize, bytesToJson, ModuleError } from './schema.js';

const bookCache = new Map(); // `${moduleId}|${bookId}` -> { chapters, headings, xrefs }
const payloadCache = new Map(); // moduleId -> Promise<payload>
const listeners = new Set();
let modulesCache = null;

export const CATALOG_URL = 'modules/catalog.json';

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function emit() {
  listeners.forEach((fn) => fn(modulesCache));
}

// Список читается из базы один раз: одновременные первые вызовы ждут одно и то же чтение.
// Иначе позднее завершившееся чтение могло затереть уже обновлённый список (модуль «пропадал» до перезапуска).
let modulesLoading = null;
export async function listModules() {
  if (modulesCache) return modulesCache;
  if (!modulesLoading) {
    modulesLoading = db
      .getAll(db.STORES.modules)
      .catch(() => [])
      .then((list) => {
        if (!modulesCache) modulesCache = [...list].sort((a, b) => (a.installedAt || 0) - (b.installedAt || 0));
        return modulesCache;
      });
  }
  return modulesLoading;
}

export async function getModule(id) {
  return (await listModules()).find((m) => m.id === id) || null;
}

export async function updateModuleMeta(id, patch) {
  const list = await listModules();
  const m = list.find((x) => x.id === id);
  if (!m) return;
  const updated = { ...m, ...patch };
  await db.put(db.STORES.modules, updated);
  // Берём текущий список (а не копию до await): параллельная установка могла его изменить
  modulesCache = (await listModules()).map((x) => (x.id === id ? updated : x));
  emit();
}

// Установка нормализованного модуля. onProgress(доля 0..1, подпись)
export async function installNormalized({ meta, data }, { origin = 'file', catalogVersion, onProgress } = {}) {
  const list = await listModules();
  const prev = list.find((m) => m.id === meta.id);
  const record = {
    ...meta,
    origin,
    catalogVersion: catalogVersion ?? null,
    enabled: prev ? prev.enabled !== false : true,
    installedAt: prev?.installedAt || Date.now(),
    updatedAt: Date.now(),
  };
  if (prev) await removeData(prev.id);

  if (meta.type === 'bible') {
    const items = data.books.map((b) => [`${meta.id}|${b.id}`, { chapters: b.chapters, headings: b.headings, xrefs: b.xrefs }]);
    // Пишем пачками, чтобы показывать прогресс и не блокировать интерфейс.
    for (let i = 0; i < items.length; i += 8) {
      await db.putMany(db.STORES.bookdata, items.slice(i, i + 8));
      onProgress?.(Math.min(1, (i + 8) / items.length), `Сохранение книг: ${Math.min(items.length, i + 8)} из ${items.length}`);
    }
  } else {
    onProgress?.(0.5, 'Сохранение…');
    await db.put(db.STORES.payload, data, meta.id);
  }
  await db.put(db.STORES.modules, record);
  // Текущий список, а не копия на начало установки — иначе одновременные установки затирают друг друга
  modulesCache = [...(await listModules()).filter((m) => m.id !== meta.id), record];
  emit();
  onProgress?.(1, 'Готово');
  return record;
}

async function removeData(id) {
  await db.delPrefix(db.STORES.bookdata, `${id}|`);
  await db.del(db.STORES.payload, id);
  for (const k of [...bookCache.keys()]) if (k.startsWith(`${id}|`)) bookCache.delete(k);
  payloadCache.delete(id);
}

export async function removeModule(id) {
  const meta = (await listModules()).find((m) => m.id === id);
  if (meta?.type === 'audio') {
    const tried = load('autoAudio', []);
    if (!tried.includes(id)) save('autoAudio', [...tried, id]);
    const { listOffline, removeBook } = await import('./offlineAudio.js');
    for (const k of Object.keys(listOffline())) if (k.startsWith(`${id}|`)) await removeBook(id, k.split('|')[1]).catch(() => {});
  }
  await removeData(id);
  await db.del(db.STORES.modules, id);
  modulesCache = (await listModules()).filter((m) => m.id !== id);
  emit();
}

export async function getBook(moduleId, bookId) {
  const key = `${moduleId}|${bookId}`;
  if (bookCache.has(key)) return bookCache.get(key);
  const data = await db.get(db.STORES.bookdata, key);
  if (data) {
    bookCache.set(key, data);
    if (bookCache.size > 24) bookCache.delete(bookCache.keys().next().value);
  }
  return data || null;
}

export function getPayload(moduleId) {
  if (!payloadCache.has(moduleId)) {
    payloadCache.set(
      moduleId,
      db.get(db.STORES.payload, moduleId).then((p) => {
        if (!p) payloadCache.delete(moduleId);
        return p || null;
      })
    );
  }
  return payloadCache.get(moduleId);
}

// Текст одного стиха (с разметкой модуля) или null
export async function getVerse(moduleId, ref) {
  const b = await getBook(moduleId, ref.book);
  return b?.chapters?.[ref.chapter - 1]?.[ref.verse - 1] ?? null;
}

// --- Загрузка из сети -------------------------------------------------------------------

async function fetchWithProgress(url, onProgress, expected) {
  let res;
  try {
    res = await fetch(url, { cache: 'no-cache' });
  } catch (e) {
    throw new ModuleError(
      `Не удалось подключиться к ${url}. Возможно, адрес недоступен или браузер заблокировал запрос ` +
        `(внутри Claude Artifact разрешены только файлы, опубликованные вместе с приложением).`
    );
  }
  if (!res.ok) throw new ModuleError(`Сервер ответил ошибкой ${res.status} для ${url}.`);
  const total = +res.headers.get('content-length') || expected || 0;
  if (!res.body || !res.body.getReader) return res.arrayBuffer();
  const reader = res.body.getReader();
  const chunks = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    onProgress?.(total ? Math.min(0.99, loaded / total) : 0, `Загрузка: ${(loaded / 1048576).toFixed(1)} МБ${total ? ` из ${(total / 1048576).toFixed(1)}` : ''}`);
  }
  const out = new Uint8Array(loaded);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out.buffer;
}

export async function fetchCatalog(url = CATALOG_URL) {
  const buf = await fetchWithProgress(url);
  const json = await bytesToJson(buf);
  if (json?.format !== 'aob-catalog' || !Array.isArray(json.modules)) throw new ModuleError('По этому адресу нет каталога в формате aob-catalog.');
  const base = new URL(url, location.href);
  return json.modules.map((m) => ({
    ...m,
    url: m.url ? new URL(m.url, base).href : null,
    urlGz: m.urlGz ? new URL(m.urlGz, base).href : null,
  }));
}

export async function installFromCatalog(entry, onProgress) {
  if (entry.unavailable || !entry.url) throw new ModuleError('Этот модуль пока недоступен для загрузки.');
  const useGz = entry.urlGz && typeof DecompressionStream !== 'undefined';
  const buf = await fetchWithProgress(useGz ? entry.urlGz : entry.url, (p, l) => onProgress?.(p * 0.6, l), useGz ? entry.sizeGz : entry.size);
  const json = await bytesToJson(buf, (l) => onProgress?.(0.65, l));
  const norm = normalize(json, { fileName: entry.id });
  norm.meta.id = entry.id;
  norm.meta.size = entry.size || buf.byteLength;
  norm.meta.sizeGz = entry.sizeGz || null;
  return installNormalized(norm, {
    origin: 'catalog',
    catalogVersion: entry.version,
    onProgress: (p, l) => onProgress?.(0.7 + p * 0.3, l),
  });
}

export async function importFile(file, onProgress) {
  const buf = await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onprogress = (e) => e.lengthComputable && onProgress?.((e.loaded / e.total) * 0.3, `Чтение файла: ${Math.round((e.loaded / e.total) * 100)}%`);
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(new ModuleError(`Не удалось прочитать файл: ${r.error?.message || 'ошибка чтения'}`));
    r.readAsArrayBuffer(file);
  });
  const json = await bytesToJson(buf, (l) => onProgress?.(0.35, l));
  onProgress?.(0.45, 'Проверка структуры…');
  await new Promise((r) => setTimeout(r, 0));
  const norm = normalize(json, { fileName: file.name });
  norm.meta.size = file.size;
  return norm;
}

// Первый запуск: ставим базовый набор из каталога, сначала перевод — чтобы сразу можно было читать.
export const STARTER = ['rst-plus', 'xrefs-rst', 'rst-symphony', 'strongs-hebrew', 'strongs-greek', 'bible-places'];

// Модули, которые один раз доустанавливаются тем, кто начал пользоваться приложением до их появления
export const LATE_STARTER = ['bible-places'];

// Модули, собранные в один: многотомный комментарий одного автора стал одним модулем.
// У кого стоят старые части — ставится общий модуль, части удаляются (см. App.jsx).
export const MERGED = {
  'lopukhin-1': 'lopukhin',
  'lopukhin-2': 'lopukhin',
  'lopukhin-3': 'lopukhin',
  'barnes-1': 'barnes',
  'barnes-2': 'barnes',
};
