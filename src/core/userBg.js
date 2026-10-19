// Своя фоновая картинка под текстом: хранится только на устройстве (IndexedDB, хранилище payload, ключ «user:bg»).
// Перед сохранением уменьшается до 1600 px по большей стороне — чтобы не занимать лишнее место.
import * as db from './db.js';

const KEY = 'user:bg';
const MAX = 1600;

async function shrink(file) {
  const bmp = await createImageBitmap(file).catch(() => null);
  if (!bmp) throw new Error('bad-image');
  const k = Math.min(1, MAX / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * k);
  const h = Math.round(bmp.height * k);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d').drawImage(bmp, 0, 0, w, h);
  bmp.close?.();
  return new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('bad-image'))), 'image/jpeg', 0.85));
}

export async function saveBg(file) {
  const blob = await shrink(file);
  await db.put(db.STORES.payload, blob, KEY);
  return blob.size;
}

export const loadBg = () => db.get(db.STORES.payload, KEY).catch(() => null);
export const clearBg = () => db.del(db.STORES.payload, KEY).catch(() => {});
