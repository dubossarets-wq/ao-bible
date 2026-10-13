// Сборка двух вариантов из одного кода:
//   dist/artifact/ — страница для Claude Artifact (всё инлайн, без <html>/<head>: их добавляет платформа)
//   dist/pwa/      — устанавливаемое веб-приложение для iPhone/Android: манифест, иконки, service worker
// Модули (public/modules) копируются в оба варианта и загружаются относительным путём.
import { build } from 'esbuild';
import { cp, mkdir, readFile, writeFile, rm, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dev = process.argv.includes('--dev');
const VERSION = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8')).version;
// Метка сборки: приложение сравнивает её с version.json на сервере, чтобы показать «есть обновление»
// Метка сборки = дата и время по UTC (20261013-181500); по ней же называется папка версии versions/<метка>/
const BUILT_AT = new Date();
const BUILD = BUILT_AT.toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);

async function bundle(pwa) {
  const res = await build({
    entryPoints: [path.join(root, 'src/main.jsx')],
    bundle: true,
    minify: !dev,
    write: false,
    outdir: 'out',
    format: 'iife',
    target: ['es2020', 'safari15'],
    jsx: 'automatic',
    loader: { '.json': 'json' },
    define: { 'process.env.NODE_ENV': '"production"', __PWA__: String(pwa), __BUILD__: JSON.stringify(BUILD) },
    legalComments: 'none',
  });
  const js = res.outputFiles.find((f) => f.path.endsWith('.js')).text.replace(/<\/script/gi, '<\\/script');
  const css = res.outputFiles.find((f) => f.path.endsWith('.css')).text;
  return { js, css };
}

const FONTS =
  '<link rel="preconnect" href="https://fonts.googleapis.com">\n' +
  '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n' +
  '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Serif+Hebrew:wght@400;600&family=Noto+Serif:wght@400;600&display=swap">';

const out = path.join(root, 'dist');
await rm(out, { recursive: true, force: true });

// --- Artifact ---
{
  const { js, css } = await bundle(false);
  const dir = path.join(out, 'artifact');
  await mkdir(dir, { recursive: true });
  const html = `<title>AO Bible</title>
<meta name="theme-color" content="#38363a">
${FONTS}
<style>${css}</style>
<div id="root"></div>
<script>${js}</script>
`;
  await writeFile(path.join(dir, 'index.html'), html);
  // Хостинг артефактов не отдаёт .gz — публикуем только .json и убираем gz-ссылки из каталога
  await cp(path.join(root, 'public/modules'), path.join(dir, 'modules'), { recursive: true, filter: (src) => !src.endsWith('.gz') });
  const catPath = path.join(dir, 'modules/catalog.json');
  const cat = JSON.parse(await readFile(catPath, 'utf8'));
  cat.modules.forEach((m) => {
    delete m.urlGz;
    delete m.sizeGz;
  });
  await writeFile(catPath, JSON.stringify(cat, null, 1));
  console.log(`artifact: index.html ${(html.length / 1024).toFixed(0)} КБ`);
}

// --- PWA ---
{
  const { js, css } = await bundle(true);
  const dir = path.join(out, 'pwa');
  await mkdir(dir, { recursive: true });
  const html = `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>AO Bible</title>
<meta name="description" content="Чтение и изучение Библии: переводы, словари Стронга, параллельные места, две панели.">
<meta name="theme-color" content="#38363a">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<!-- Сплошная чёрная строка состояния: без прозрачности iOS не размывает панель под часами -->
<meta name="apple-mobile-web-app-status-bar-style" content="black">
<meta name="apple-mobile-web-app-title" content="AO Bible">
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" href="icons/icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">
${FONTS}
<style>html:root{--sat:env(safe-area-inset-top,0px)}html,body{height:100%}/* iOS: приложение прибито ко всем краям экрана, текст доходит до нижнего края */html:root .app{position:fixed;inset:0;height:auto}/* iOS 26 размывает верх экрана: под строкой состояния — сплошной цвет верхней панели, размытие сливается с ним */html:root,html:root body{background:var(--bar)}html:root body::before{content:"";position:fixed;left:0;right:0;top:0;height:calc(env(safe-area-inset-top,0px) + 2px);background:var(--bar);z-index:100;pointer-events:none}</style>
<style>${css}</style>
</head>
<body>
<div id="root"></div>
<script>${js}</script>
</body>
</html>
`;
  await writeFile(path.join(dir, 'index.html'), html);
  await cp(path.join(root, 'public/modules'), path.join(dir, 'modules'), { recursive: true });
  if (existsSync(path.join(root, 'public/icons'))) await cp(path.join(root, 'public/icons'), path.join(dir, 'icons'), { recursive: true });
  await writeFile(
    path.join(dir, 'manifest.webmanifest'),
    JSON.stringify(
      {
        name: 'AO Bible',
        short_name: 'AO Bible',
        description: 'Чтение и изучение Библии: переводы, словари Стронга, параллельные места',
        lang: 'ru',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'any',
        background_color: '#f6f5f2',
        theme_color: '#38363a',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      null,
      2
    )
  );
  // Service worker: оболочка приложения кэшируется при установке; модули — при первом скачивании
  // (gz-версии, которые и загружает приложение). Тексты уже лежат в IndexedDB, так что офлайн работает.
  const shell = ['./', 'index.html', 'manifest.webmanifest', 'modules/catalog.json', 'icons/icon.svg', 'icons/icon-192.png', 'icons/apple-touch-icon.png'];
  await writeFile(path.join(dir, 'version.json'), JSON.stringify({ version: VERSION, build: BUILD, date: BUILT_AT.toISOString() }));
  const sw = `const CACHE = 'aob-${BUILD}';
const SHELL = ${JSON.stringify(shell)};
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
  if (url.origin === location.origin || url.host.endsWith('gstatic.com') || url.host.endsWith('googleapis.com')) {
    e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request).then((r) => {
      if (r.ok && !url.pathname.endsWith('.json')) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
      return r;
    })));
  }
});
`;
  await writeFile(path.join(dir, 'sw.js'), sw);
  console.log(`pwa: index.html ${(html.length / 1024).toFixed(0)} КБ`);
}

let total = 0;
for (const f of await readdir(path.join(out, 'artifact/modules'))) total += (await stat(path.join(out, 'artifact/modules', f))).size;
console.log(`modules: ${(total / 1048576).toFixed(1)} МБ`);
