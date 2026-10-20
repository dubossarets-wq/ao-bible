import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { bootVersionGate } from './core/updates.js';
import { bootBackup } from './core/backup.js';
import { i18nReady } from './core/i18n.js';
import './styles.css';
import { startFadeEnd } from './core/fadeEnd.js';

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
if (typeof __PWA__ !== 'undefined' && __PWA__ && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
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
