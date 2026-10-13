import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';

// Динамическая высота мобильного браузера и клавиатура: --vvh = высота видимой области
// --kb = высота экранной клавиатуры (iOS не сжимает layout viewport, нижние панели уезжали бы под неё)
function syncViewport() {
  const vv = window.visualViewport;
  const h = vv?.height || window.innerHeight;
  const kb = vv ? Math.max(0, window.innerHeight - vv.height - vv.offsetTop) : 0;
  document.documentElement.style.setProperty('--vvh', `${h}px`);
  document.documentElement.style.setProperty('--kb', `${kb}px`);
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

createRoot(document.getElementById('root')).render(<App />);
