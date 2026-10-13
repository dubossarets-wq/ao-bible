const CACHE = 'aob-20261013-191600';
const SHELL = ["./","index.html","manifest.webmanifest","modules/catalog.json","icons/icon.svg","icons/icon-192.png","icons/apple-touch-icon.png"];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  // Каталог и страница: сначала сеть (чтобы видеть обновления), при офлайне — кэш
  // version.json — всегда из сети (по нему приложение узнаёт об обновлении)
  if (url.pathname.endsWith('version.json')) return;
  // Страница и каталог: сначала сеть мимо HTTP-кэша (GitHub Pages кэширует на 10 минут), при офлайне — кэш
  if (url.origin === location.origin && (url.pathname.endsWith('/') || url.pathname.endsWith('.html') || url.pathname.endsWith('catalog.json'))) {
    e.respondWith(fetch(e.request, { cache: 'no-store' }).then((r) => { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return r; }).catch(() => caches.match(e.request, { ignoreSearch: true })));
    return;
  }
  // Остальное (иконки, шрифты, модули) — из кэша, иначе из сети с сохранением
  if (url.origin === location.origin || url.host.endsWith('gstatic.com') || url.host.endsWith('googleapis.com') || url.host === 'cdn.jsdelivr.net') {
    e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request).then((r) => {
      if (r.ok && !url.pathname.endsWith('.json')) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
      return r;
    })));
  }
});
