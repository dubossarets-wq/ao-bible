// Аудиокниги без интернета: записи глав книги скачиваются в хранилище браузера (Cache Storage).
// Проигрыватель сначала ищет запись там и играет из памяти телефона, иначе — из сети.
// Список скачанного — в localStorage «offlineAudio»: { 'аудиомодуль|книга': { at, files, bytes } }.
import { getPayload } from './modules.js';
import { load, save } from './storage.js';
import { IS_STAGING } from './channel.js';
import { t } from './i18n.js';

const CACHE = IS_STAGING ? 'aobs-audio-v1' : 'aob-audio-v1';
const hasCache = () => typeof caches !== 'undefined';

export const listOffline = () => load('offlineAudio', {});
export const isBookOffline = (audioId, book) => !!listOffline()[`${audioId}|${book}`];

// Адрес для <audio>: скачанная запись — из памяти (blob:), иначе исходный адрес
export async function playableUrl(url) {
  if (!hasCache()) return url;
  try {
    const r = await (await caches.open(CACHE)).match(url);
    if (r) return URL.createObjectURL(await r.blob());
  } catch {
    /* хранилище недоступно — играем из сети */
  }
  return url;
}

const urlsOf = (payload, book) => [...new Set(Object.entries(payload?.chapters || {}).filter(([k]) => k.split('.')[0] === book).map(([, c]) => c.url))];

// Скачать все записи книги. onProgress(готово, всего, байт); signal — чтобы можно было остановить
export async function downloadBook(audioId, book, { onProgress, signal } = {}) {
  if (!hasCache()) throw new Error(t('Этот браузер не умеет хранить записи для прослушивания без интернета.'));
  const urls = urlsOf(await getPayload(audioId), book);
  if (!urls.length) throw new Error(t('К этой книге нет аудиозаписей.'));
  const cache = await caches.open(CACHE);
  let bytes = 0;
  for (let i = 0; i < urls.length; i++) {
    if (signal?.aborted) throw new DOMException(t('Остановлено'), 'AbortError');
    const have = await cache.match(urls[i]);
    if (have) bytes += +(have.headers.get('x-size') || 0);
    else {
      const res = await fetch(urls[i], { mode: 'cors', signal });
      if (!res.ok) throw new Error(t('Запись не скачалась (ошибка {status}). Проверьте интернет и попробуйте ещё раз.', { status: res.status }));
      const blob = await res.blob();
      bytes += blob.size;
      await cache.put(urls[i], new Response(blob, { headers: { 'content-type': res.headers.get('content-type') || 'audio/mpeg', 'x-size': String(blob.size) } }));
    }
    onProgress?.(i + 1, urls.length, bytes);
  }
  save('offlineAudio', { ...listOffline(), [`${audioId}|${book}`]: { at: Date.now(), files: urls.length, bytes } });
  return bytes;
}

// Удалить скачанную книгу (файлы, общие с другой скачанной книгой, остаются)
export async function removeBook(audioId, book) {
  const list = { ...listOffline() };
  delete list[`${audioId}|${book}`];
  save('offlineAudio', list);
  if (!hasCache()) return;
  const payload = await getPayload(audioId);
  const keep = new Set();
  for (const k of Object.keys(list)) {
    const [a, b] = k.split('|');
    const p = a === audioId ? payload : await getPayload(a);
    urlsOf(p, b).forEach((u) => keep.add(u));
  }
  const cache = await caches.open(CACHE);
  for (const u of urlsOf(payload, book)) if (!keep.has(u)) await cache.delete(u);
}
