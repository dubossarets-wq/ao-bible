const CACHE = 'aob-shell-20261025-063939';
const PREFIX = 'aob-shell-';
const ILLUS = 'aob-illus';
const ILLUS_MAX = 120;
const SHELL = ["./","index.html","manifest.webmanifest","modules/catalog.json","icons/icon.svg","icons/icon-192.png","icons/apple-touch-icon.png","plans/bible-year.json","plans/gospels-30.json","plans/index.json","plans/mcheyne.json","plans/nt-90.json","plans/ps-prov-31.json","images/verse-bg/01-t.jpg","images/verse-bg/01.jpg","images/verse-bg/02-t.jpg","images/verse-bg/02.jpg","images/verse-bg/03-t.jpg","images/verse-bg/03.jpg","images/verse-bg/04-t.jpg","images/verse-bg/04.jpg","images/verse-bg/05-t.jpg","images/verse-bg/05.jpg","images/verse-bg/06-t.jpg","images/verse-bg/06.jpg","images/verse-bg/07-t.jpg","images/verse-bg/07.jpg","images/verse-bg/08-t.jpg","images/verse-bg/08.jpg","images/verse-bg/09-t.jpg","images/verse-bg/09.jpg","images/verse-bg/10-t.jpg","images/verse-bg/10.jpg","images/verse-bg/11-t.jpg","images/verse-bg/11.jpg","images/verse-bg/12-t.jpg","images/verse-bg/12.jpg","images/verse-bg/index.json"];
self.addEventListener('install', (e) => {
  // './' и 'index.html' — одна страница: качаем один раз и кладём под оба адреса
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL.filter((u) => u !== './')).then(() => c.match('index.html')).then((r) => r && c.put(new URL('./', self.registration.scope).href, r))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  // Удаляем только свои прежние оболочки (и старые имена без префикса); скачанные аудиокниги (*-audio-*) не трогаем
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE && (k.startsWith(PREFIX) || /^aob-\d{8}-\d{6}$/.test(k))).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  // Каталог и страница: сначала сеть (чтобы видеть обновления), при офлайне — кэш
  // version.json — всегда из сети (по нему приложение узнаёт об обновлении)
  if (url.pathname.endsWith('version.json')) return;
  // Манифест — тоже сначала из сети: по нему Android обновляет установленное приложение (например, поворот экрана)
  // Страница и каталог: сначала сеть мимо HTTP-кэша (GitHub Pages кэширует на 10 минут), при офлайне — кэш
  if (url.origin === location.origin && (url.pathname.endsWith('/') || url.pathname.endsWith('.html') || url.pathname.endsWith('catalog.json') || url.pathname.endsWith('manifest.webmanifest'))) {
    // Сеть не ответила за 2,5 с (слабая связь, «сеть есть, а ответа нет») — показываем сохранённое, а свежее докачается
    // в кэш к следующему запуску. Переход «Обновить приложение» (?v=…) ждёт сеть: там нужна именно новая версия.
    const net = fetch(e.request, { cache: 'no-store' }).then((r) => { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return r; });
    const cached = () => caches.match(e.request, { ignoreSearch: true });
    if (url.searchParams.has('v')) return void e.respondWith(net.catch(cached));
    e.waitUntil(net.catch(() => {}));
    e.respondWith(new Promise((resolve) => {
      let done = false;
      const finish = (r) => r && !done && ((done = true), resolve(r));
      const timer = setTimeout(() => cached().then(finish), 2500);
      net.then((r) => (clearTimeout(timer), finish(r))).catch(() => cached().then((h) => (finish(h), !done && finish(Response.error()))));
    }));
    return;
  }
  // Иллюстрации: из кэша, иначе из сети с сохранением; самые старые вытесняются
  if (url.host === 'upload.wikimedia.org') {
    e.respondWith(caches.open(ILLUS).then((c) => c.match(e.request).then((hit) => hit || fetch(e.request).then((r) => {
      if (r.ok && r.type !== 'opaque') c.put(e.request, r.clone()).then(() => c.keys()).then((keys) => Promise.all(keys.slice(0, Math.max(0, keys.length - ILLUS_MAX)).map((k) => c.delete(k))));
      return r;
    }))));
    return;
  }
  // Модули — только из сети: приложение само хранит их в IndexedDB, второй копии в кэше не нужно
  if (url.origin === location.origin && url.pathname.includes('/modules/')) return;
  // Остальное (иконки, шрифты, планы, фотографии) — из кэша, иначе из сети с сохранением
  if (url.origin === location.origin || url.host.endsWith('gstatic.com') || url.host.endsWith('googleapis.com') || url.host === 'cdn.jsdelivr.net') {
    // У Google Fonts разные шрифты — один адрес с разными параметрами, поэтому для них параметры учитываем
    e.respondWith(caches.match(e.request, { ignoreSearch: url.origin === location.origin }).then((hit) => hit || fetch(e.request).then((r) => {
      if (r.ok) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
      return r;
    })));
  }
});
