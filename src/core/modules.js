// Репозиторий модулей: установка, удаление, ленивая загрузка книг и словарей, каталог.
// Интерфейс не знает, где лежат данные: всё идёт через эти функции.
import { load, save } from './storage.js';
import * as db from './db.js';
import { normalize, bytesToJson, ModuleError } from './schema.js';
import { t, getLang } from './i18n.js';
import { REMOTE, MIRROR } from './native.js';

// Текст ошибки для человека: нехватку места браузер сообщает по-английски и непонятно — объясняем, что делать
export const errorText = (e) =>
  e?.name === 'QuotaExceededError' || /quota/i.test(e?.message || '')
    ? t('Не хватает места. Удалите лишние модули (Библиотека модулей → Установленные) или освободите память.')
    : !navigator.onLine
      ? t('Нужен интернет: этот модуль скачивается один раз, потом работает без сети.')
      : e?.message || String(e);

const bookCache = new Map(); // `${moduleId}|${bookId}` -> { chapters, headings, xrefs }
const payloadCache = new Map(); // moduleId -> Promise<payload>
const listeners = new Set();
let modulesCache = null;

export const CATALOG_URL = REMOTE + 'modules/catalog.json'; // в приложении из Google Play — с aobible.app

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
      onProgress?.(Math.min(1, (i + 8) / items.length), t('Сохранение книг: {done} из {total}', { done: Math.min(items.length, i + 8), total: items.length }));
    }
  } else {
    onProgress?.(0.5, t('Сохранение…'));
    await db.put(db.STORES.payload, data, meta.id);
  }
  await db.put(db.STORES.modules, record);
  // Текущий список, а не копия на начало установки — иначе одновременные установки затирают друг друга
  modulesCache = [...(await listModules()).filter((m) => m.id !== meta.id), record];
  emit();
  onProgress?.(1, t('Готово'));
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

// Книга без записи в кэш читалки (поиск и статистика проходят всю Библию и вытеснили бы книгу, которую читают)
export async function peekBook(moduleId, bookId) {
  const key = `${moduleId}|${bookId}`;
  return bookCache.get(key) || (await db.get(db.STORES.bookdata, key)) || null;
}

export async function getBook(moduleId, bookId) {
  const key = `${moduleId}|${bookId}`;
  if (bookCache.has(key)) {
    // Свежая книга — в конец очереди (вытесняется самая давно нужная, а не самая давно загруженная)
    const hit = bookCache.get(key);
    bookCache.delete(key);
    bookCache.set(key, hit);
    return hit;
  }
  // Книгу уже читают (ранний старт в main.jsx) — ждём то же чтение, а не начинаем второе
  if (bookLoading.has(key)) return bookLoading.get(key);
  const p = db.get(db.STORES.bookdata, key).then(
    (data) => {
      bookLoading.delete(key);
      if (data) {
        bookCache.set(key, data);
        if (bookCache.size > 24) bookCache.delete(bookCache.keys().next().value);
      }
      return data || null;
    },
    (e) => {
      bookLoading.delete(key);
      throw e;
    }
  );
  bookLoading.set(key, p);
  return p;
}
const bookLoading = new Map();

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

// Приложение из Google Play: aobible.app не отвечает (старый Android не принимает сертификат, сеть режет домен) —
// тот же файл с зеркала; дальше в этом сеансе — сразу с зеркала
let useMirror = false;
async function fetchRemote(url, opts) {
  if (!MIRROR || !url.startsWith(REMOTE)) return fetch(url, opts);
  const alt = MIRROR + url.slice(REMOTE.length);
  if (useMirror) return fetch(alt, opts);
  try {
    return await fetch(url, opts);
  } catch (e) {
    const res = await fetch(alt, opts);
    useMirror = true;
    return res;
  }
}

async function fetchWithProgress(url, onProgress, expected) {
  let res;
  try {
    res = await fetchRemote(url, { cache: 'no-cache' });
  } catch (e) {
    throw new ModuleError(
      t('Не удалось подключиться к {url}. Проверьте адрес и интернет.', { url })
    );
  }
  if (!res.ok) throw new ModuleError(t('Сервер ответил ошибкой {status} для {url}.', { status: res.status, url }));
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
    onProgress?.(total ? Math.min(0.99, loaded / total) : 0, total ? t('Загрузка: {done} МБ из {total}', { done: (loaded / 1048576).toFixed(1), total: (total / 1048576).toFixed(1) }) : t('Загрузка: {done} МБ', { done: (loaded / 1048576).toFixed(1) }));
  }
  const out = new Uint8Array(loaded);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out.buffer;
}

// Каталог помним 2 минуты: при первом запуске его просили 4–5 раз подряд (установка, аудиокниги, объединение модулей).
// fresh — «Обновить список» в библиотеке.
const catalogMemo = new Map(); // url -> { at, promise }
export function fetchCatalog(url = CATALOG_URL, { fresh = false } = {}) {
  const hit = catalogMemo.get(url);
  if (!fresh && hit && Date.now() - hit.at < 120000) return hit.promise;
  const promise = fetchCatalogNow(url).catch((e) => (catalogMemo.delete(url), Promise.reject(e)));
  catalogMemo.set(url, { at: Date.now(), promise });
  return promise;
}
async function fetchCatalogNow(url) {
  const buf = await fetchWithProgress(url);
  const json = await bytesToJson(buf);
  if (json?.format !== 'aob-catalog' || !Array.isArray(json.modules)) throw new ModuleError(t('По этому адресу нет каталога в формате aob-catalog.'));
  const base = new URL(url, location.href);
  return json.modules.map((m) => ({
    ...m,
    url: m.url ? new URL(m.url, base).href : null,
    urlGz: m.urlGz ? new URL(m.urlGz, base).href : null,
  }));
}

// Скачать файл модуля (без установки) — чтобы первая установка качала следующий, пока обрабатывается текущий
export function downloadModule(entry, onProgress) {
  if (entry.unavailable || !entry.url) return Promise.reject(new ModuleError(t('Этот модуль пока недоступен для загрузки.')));
  const useGz = entry.urlGz && typeof DecompressionStream !== 'undefined';
  return fetchWithProgress(useGz ? entry.urlGz : entry.url, onProgress, useGz ? entry.sizeGz : entry.size);
}

// prefetched — уже идущее скачивание (обещание буфера) из downloadModule
export async function installFromCatalog(entry, onProgress, prefetched = null) {
  if (entry.unavailable || !entry.url) throw new ModuleError(t('Этот модуль пока недоступен для загрузки.'));
  const buf = await (prefetched || downloadModule(entry, (p, l) => onProgress?.(p * 0.6, l)));
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
    r.onprogress = (e) => e.lengthComputable && onProgress?.((e.loaded / e.total) * 0.3, t('Чтение файла: {pct}%', { pct: Math.round((e.loaded / e.total) * 100) }));
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(new ModuleError(t('Не удалось прочитать файл: {error}', { error: r.error?.message || t('ошибка чтения') })));
    r.readAsArrayBuffer(file);
  });
  const json = await bytesToJson(buf, (l) => onProgress?.(0.35, l));
  onProgress?.(0.45, t('Проверка структуры…'));
  await new Promise((r) => setTimeout(r, 0));
  const norm = normalize(json, { fileName: file.name });
  norm.meta.size = file.size;
  return norm;
}

// Первый запуск: ставим базовый набор из каталога, сначала перевод — чтобы сразу можно было читать.
// Оригиналы для подстрочника (еврейский и греческий текст) — тоже сразу, чтобы подстрочник работал без интернета
export const ORIGINALS = ['oshb', 'byz-rp2018'];
// Словарь на языке интерфейса: русский — для русского, украинского и белорусского; на других языках в каталоге
// только английские словари
const LANG_DICTIONARY = { ru: 'nikifor', uk: 'nikifor', be: 'nikifor' };
export const langDictionary = () => LANG_DICTIONARY[getLang()] || 'easton';
// Для изучения — у каждого сразу: карты, толкования Лопухина, подстрочники (большой «Подстрочник» — последним)
export const STUDY = ['bible-maps', 'lopukhin', 'vin-interlinear', 'rst-interlinear'];
// Перевод на языке интерфейса — новому человеку первым и основным. Полной Библии на языке нет — для кириллических
// языков остаётся Синодальный, для остальных — английский BSB; Новый Завет на родном языке ставится дополнительно.
const FULL_BIBLE = { cs: 'kralicka', de: 'luther1912', en: 'bsb', es: 'rv1909', fr: 'segond1910', hi: 'hin-irv', it: 'riveduta', ja: 'bungo', ko: 'korrv', pl: 'gdanska', pt: 'biblia-livre', sr: 'dk-cyr', sw: 'swh-ulb', zh: 'cuv-s' };
const NT_BIBLE = { hy: 'arm-nt1853', id: 'alkitab-gratis', ro: 'ronbl', uk: 'ukr-kulish', be: 'be-nt1931' };
const CYRILLIC = new Set(['ru', 'uk', 'be', 'bg', 'sr']);
export const homeBible = () => FULL_BIBLE[getLang()] || (CYRILLIC.has(getLang()) ? 'rst-plus' : 'bsb');
const langExtras = () => [NT_BIBLE[getLang()], ...(CYRILLIC.has(getLang()) ? [] : ['strongs-hebrew', 'strongs-greek'])].filter(Boolean);
export const starter = () => [...new Set([homeBible(), 'rst-plus', 'xrefs-rst', 'rst-symphony', 'strongs-ru-hebrew', 'strongs-ru-greek', 'bible-places', 'bible-illustrations', ...ORIGINALS, langDictionary(), ...langExtras(), ...STUDY])];

// Модули, которые один раз доустанавливаются тем, кто начал пользоваться приложением до их появления
export const lateStarter = () => ['bible-places', 'bible-illustrations', 'strongs-ru-hebrew', 'strongs-ru-greek', ...ORIGINALS, langDictionary(), ...STUDY];

// Модули, собранные в один: многотомный комментарий одного автора стал одним модулем.
// У кого стоят старые части — ставится общий модуль, части удаляются (см. App.jsx).
export const MERGED = {
  'lopukhin-1': 'lopukhin',
  'lopukhin-2': 'lopukhin',
  'lopukhin-3': 'lopukhin',
  'barnes-1': 'barnes',
  'barnes-2': 'barnes',
};
