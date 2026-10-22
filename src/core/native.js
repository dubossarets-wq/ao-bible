// Приложение из Google Play (Capacitor): сайт упакован внутрь, модули скачиваются с aobible.app.
// Здесь — то, чего нет во встроенном браузере Android (WebView): «Поделиться» и буфер обмена
// подменяются системными, а сохранение файла идёт через то же окно «Поделиться» → «Сохранить».
// В обычной сборке сайта NATIVE = false, и этот файл ничего не меняет.
import { Share } from '@capacitor/share';
import { Clipboard } from '@capacitor/clipboard';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { SystemBars, SystemBarsStyle, SystemBarType, registerPlugin } from '@capacitor/core';

export const NATIVE = typeof __NATIVE__ !== 'undefined' && __NATIVE__;
// Откуда приложение берёт каталог и модули (у сайта — со своего адреса)
export const REMOTE = NATIVE ? 'https://aobible.app/' : '';
// Свой модуль Android (android/app/.../AppBarsPlugin.java): цвет полос под системными полосами
const AppBars = NATIVE ? registerPlugin('AppBars') : null;

const aborted = () => new DOMException('Share canceled', 'AbortError');
const isCancel = (e) => /cancel/i.test(String(e?.message || e));

const toBase64 = (blob) =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] || '');
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });

// Файл → во временную папку приложения → ссылка, которую понимает системное окно «Поделиться»
async function cacheFile(file) {
  const name = (file.name || 'file').replace(/[\\/:*?"<>|]+/g, '_');
  const { uri } = await Filesystem.writeFile({ path: name, data: await toBase64(file), directory: Directory.Cache });
  return uri;
}

async function nativeShare({ title, text, url, files } = {}) {
  try {
    if (files?.length) {
      const uris = [];
      for (const f of files) uris.push(await cacheFile(f));
      await Share.share({ title, dialogTitle: title, files: uris });
    } else await Share.share({ title, dialogTitle: title, text, url });
  } catch (e) {
    throw isCancel(e) ? aborted() : e;
  }
}

// Сохранить файл: на сайте — скачиванием, в приложении — через «Поделиться» (там есть «Сохранить», «Файлы», облако)
export async function saveBlob(blob, name) {
  if (NATIVE) return nativeShare({ title: name, files: [new File([blob], name, { type: blob.type })] });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// Значки строки состояния и полосы навигации — светлые на тёмном фоне, тёмные на светлом
const isDark = (hex) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
  if (!m) return false;
  const n = parseInt(m[1], 16);
  return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255 < 0.55;
};
export function syncSystemBars(bar, bg) {
  if (!NATIVE) return;
  const style = (c) => (isDark(c) ? SystemBarsStyle.Dark : SystemBarsStyle.Light);
  // setStyle сбрасывает фон окна на белый — поэтому цвета полос ставим после него
  Promise.all([
    SystemBars.setStyle({ style: style(bar), bar: SystemBarType.StatusBar }).catch(() => {}),
    SystemBars.setStyle({ style: style(bg), bar: SystemBarType.NavigationBar }).catch(() => {}),
  ]).then(() => AppBars.setColors({ top: bar, bottom: bg }).catch(() => {}));
}

export function installNative() {
  if (!NATIVE) return;
  document.documentElement.classList.add('native-app');
  try {
    navigator.share = nativeShare;
    navigator.canShare = () => true;
  } catch {
    /* свойство нельзя заменить — остаётся копирование */
  }
  const writeText = (text) => Clipboard.write({ string: String(text) });
  try {
    if (navigator.clipboard) Object.defineProperty(navigator.clipboard, 'writeText', { value: writeText, configurable: true });
    else Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  } catch {
    /* остаётся встроенный буфер обмена */
  }
}
