import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { bootVersionGate } from './core/updates.js';
import { bootBackup } from './core/backup.js';
import { load } from './core/storage.js';
import { i18nReady } from './core/i18n.js';
import './styles.css';
import { startFadeEnd } from './core/fadeEnd.js';
import { installNative } from './core/native.js';
import { startMediaControls } from './core/mediaControls.js';
import { installErrorLog } from './core/errorLog.js';
import { P } from './core/channel.js';
import { listModules, getBook } from './core/modules.js';

installErrorLog(); // последние ошибки — для письма «Сообщить о проблеме» (только на устройстве)
// Ранний старт: список модулей и книга последнего места читаются из памяти устройства,
// пока загружаются словари интерфейса и рисуется оболочка приложения
try {
  const p0 = load('panes', null)?.[0];
  listModules().catch(() => {});
  if (p0?.moduleId && p0.ref?.book) getBook(p0.moduleId, p0.ref.book).catch(() => {});
} catch {
  /* хранилище недоступно — всё загрузится обычным порядком */
}
try {
  localStorage.removeItem(P + 'snap'); // снимок экрана из версии 23.10 больше не используется
} catch {
  /* хранилище недоступно */
}
installNative(); // приложение из Google Play: системные «Поделиться» и буфер обмена
// Android: свой вид нижнего меню (сплошная полоса во всю ширину, styles.css → html.is-android)
if (/Android/i.test(navigator.userAgent)) document.documentElement.classList.add('is-android');
startMediaControls(); // ▶/⏸ и ⏮/⏭ на экране блокировки

// Динамическая высота мобильного браузера и клавиатура: --vvh = высота видимой области
// --kb = высота экранной клавиатуры (iOS не сжимает layout viewport, нижние панели уезжали бы под неё)
function syncViewport() {
  const vv = window.visualViewport;
  const h = vv?.height || window.innerHeight;
  const kb = vv ? Math.max(0, window.innerHeight - vv.height - vv.offsetTop) : 0;
  document.documentElement.style.setProperty('--vvh', `${h}px`);
  document.documentElement.style.setProperty('--kb', `${kb}px`);
  // Клавиатура открыта — нижние панели (проигрыватель, плавающие кнопки) прячутся, кнопки урока встают над ней
  const open = kb > 100;
  const was = document.documentElement.classList.contains('kb-open');
  document.documentElement.classList.toggle('kb-open', open);
  const el = document.activeElement;
  // Окно уменьшается плавно — подкручиваем сразу и ещё раз, когда оно встало на место
  if (open && !was && el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) for (const ms of [60, 350]) setTimeout(() => document.activeElement === el && el.scrollIntoView({ block: 'center' }), ms);
}
window.visualViewport?.addEventListener('scroll', syncViewport);
syncViewport();
window.visualViewport?.addEventListener('resize', syncViewport);
window.addEventListener('resize', syncViewport);

// В PWA-сборке регистрируем service worker (в Claude Artifact он недоступен — тихо пропускаем)
// Первый визит: service worker ставится, когда стартовые модули уже скачаны (событие от Bootstrap), — иначе
// его кэш (фото, планы) отнимал канал у перевода и Библия на медленной связи открывалась в полтора раза дольше.
if (typeof __PWA__ !== 'undefined' && __PWA__ && 'serviceWorker' in navigator) {
  const registerSW = () => navigator.serviceWorker.register('sw.js').catch(() => {});
  if (load('bootstrapped', false)) window.addEventListener('load', registerSW);
  else {
    let done = false;
    const once = () => !done && ((done = true), registerSW());
    window.addEventListener('aob-bootstrapped', once);
    setTimeout(once, 120000); // установка затянулась или прервалась — всё равно ставим
  }
}

// После «Обновить приложение» адрес содержит ?v=… (обход кэша) — убираем его из строки адреса
if (location.search.includes('v=')) {
  const u = new URL(location.href);
  u.searchParams.delete('v');
  history.replaceState(null, '', u.pathname + u.search + u.hash);
}

// Приложение не обновляется само: если выбрана другая версия, открываем её из архива версий
// Резервная копия данных пользователя при первом запуске новой версии — до того, как код их прочитает
bootBackup();
// Словарь выбранного языка — до первого показа, чтобы не мелькал русский; без сети ждём не больше 3 секунд
if (!bootVersionGate()) Promise.race([i18nReady, new Promise((r) => setTimeout(r, 3000))]).then(() => (createRoot(document.getElementById('root')).render(<App />), startFadeEnd()));
