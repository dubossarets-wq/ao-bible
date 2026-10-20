// Сборка двух вариантов из одного кода:
//   dist/artifact/ — страница для Claude Artifact (всё инлайн, без <html>/<head>: их добавляет платформа)
//   dist/pwa/      — устанавливаемое веб-приложение для iPhone/Android: манифест, иконки, service worker
// Модули (public/modules) копируются в оба варианта и загружаются относительным путём.
import { build } from 'esbuild';
import { cp, mkdir, readFile, writeFile, rm, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// Текст страницы политики конфиденциальности (privacy.html)
const PRIVACY_HTML = "<!doctype html><html lang=\"ru\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">\n<title>AO Bible — Политика конфиденциальности / Privacy Policy</title>\n<style>body{font:16px/1.55 -apple-system,Segoe UI,Roboto,sans-serif;max-width:720px;margin:0 auto;padding:24px 16px;color:#1d1c1a;background:#f6f5f2}h1{font-size:1.5rem}h2{font-size:1.15rem;margin-top:2em}li{margin:.3em 0}@media(prefers-color-scheme:dark){body{background:#161617;color:#dedbd4}a{color:#d9a35c}}</style></head><body>\n<h1>AO Bible — Политика конфиденциальности</h1>\n<p><b>Коротко: приложение ничего о вас не собирает.</b></p>\n<ul>\n<li>Нет регистрации, рекламы, счётчиков посещений и аналитики. Мы не получаем ваши данные и никому их не передаём.</li>\n<li>Закладки, заметки, выделения, проповеди, планы чтения и настройки хранятся только на вашем устройстве. Их можно сохранить в файл: Настройки → «Мои данные».</li>\n<li>Чтобы показать текст и материалы, приложение загружает файлы с нескольких сайтов. Как и при открытии любого сайта, они видят адрес подключения (IP) и тип браузера: GitHub Pages (приложение и модули), archive.org (записи чтения), Wikimedia Commons (иллюстрации), Google Fonts (шрифты), OpenFreeMap, Esri и jsDelivr (карты — только когда вы открываете карту). У каждого из этих сайтов своя политика конфиденциальности.</li>\n<li>Доступ к микрофону, камере, контактам и местоположению приложению не нужен и не запрашивается.</li>\n<li>Приложение бесплатное и некоммерческое, предназначено для всех возрастов.</li>\n</ul>\n<p>Вопросы: через страницу проекта на GitHub — <a href=\"https://github.com/dubossarets-wq\">github.com/dubossarets-wq</a>.</p>\n<h2>AO Bible — Privacy Policy</h2>\n<p><b>In short: the app does not collect any information about you.</b></p>\n<ul>\n<li>No accounts, no ads, no analytics or tracking. We do not receive your data and do not share it with anyone.</li>\n<li>Bookmarks, notes, highlights, sermons, reading plans and settings are stored only on your device. You can save them to a file: Settings → “My data”.</li>\n<li>To show texts and materials the app downloads files from several websites, which — as with any website — see your IP address and browser type: GitHub Pages (the app and modules), archive.org (audio readings), Wikimedia Commons (illustrations), Google Fonts (fonts), OpenFreeMap, Esri and jsDelivr (maps, only when you open a map). Each has its own privacy policy.</li>\n<li>The app does not need or request access to the microphone, camera, contacts or location.</li>\n<li>The app is free and non-commercial, suitable for all ages.</li>\n</ul>\n<p>Questions: via the project page on GitHub — <a href=\"https://github.com/dubossarets-wq\">github.com/dubossarets-wq</a>.</p>\n</body></html>\n";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dev = process.argv.includes('--dev');
// Канал: основное приложение или тестовое (AOB_CHANNEL=staging) — своё имя, иконка, папка и данные
const STAGING = process.env.AOB_CHANNEL === 'staging';
const CHANNEL = STAGING ? 'staging' : 'prod';
const APP_NAME = STAGING ? 'AO Bible Тест' : 'AO Bible';
const SHORT_NAME = STAGING ? 'AOB Тест' : 'AO Bible';
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
    define: { 'process.env.NODE_ENV': '"production"', __PWA__: String(pwa), __BUILD__: JSON.stringify(BUILD), __CHANNEL__: JSON.stringify(CHANNEL) },
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


// Публикуем только модули из каталога (и их файлы карт): заготовки и непроверенные модули на сайт не попадают
// Одобренные модули — scripts/approved-modules.json (добавлять туда после проверки лицензии и данных)
const approved = new Set(JSON.parse(await readFile(path.join(root, 'scripts/approved-modules.json'), 'utf8')).ids);
const fullCatalog = JSON.parse(await readFile(path.join(root, 'public/modules/catalog.json'), 'utf8'));
const catalogIds = new Set(fullCatalog.modules.map((m) => m.id).filter((id) => approved.has(id)));
const publishedCatalog = (dropGz) => JSON.stringify({ ...fullCatalog, modules: fullCatalog.modules.filter((m) => catalogIds.has(m.id)).map((m) => {
  if (!dropGz) return m;
  const { urlGz, sizeGz, ...rest } = m;
  return rest;
}) }, null, 1);
const isPublished = (src) => {
  const rel = path.relative(path.join(root, 'public/modules'), src).split(path.sep);
  if (rel.length === 1 && rel[0] === '') return true;
  if (rel[0] === 'catalog.json') return true;
  if (rel[0] === 'maps') return rel.length === 1 || catalogIds.has(rel[1]);
  return catalogIds.has(rel[0].replace(/\.json(\.gz)?$/, ''));
};
const out = path.join(root, 'dist');

// Словари языков интерфейса — отдельными файлами i18n/<код>.json: приложение грузит только выбранный язык
async function copyDicts(dir) {
  const src = path.join(root, 'src/i18n');
  await mkdir(path.join(dir, 'i18n'), { recursive: true });
  for (const f of (await readdir(src)).filter((f) => f.endsWith('.json'))) {
    await writeFile(path.join(dir, 'i18n', f), JSON.stringify(JSON.parse(await readFile(path.join(src, f), 'utf8'))));
  }
}
const PWA_DIR = STAGING ? 'pwa-staging' : 'pwa';
await rm(path.join(out, PWA_DIR), { recursive: true, force: true });
await rm(path.join(out, 'artifact'), { recursive: true, force: true });

// --- Artifact (Claude) — больше не публикуется; собрать можно явно: AOB_ARTIFACT=1 ---
if (process.env.AOB_ARTIFACT === '1' && !STAGING) {
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
  await cp(path.join(root, 'public/modules'), path.join(dir, 'modules'), { recursive: true, filter: (src) => !src.endsWith('.gz') && isPublished(src) });
  await writeFile(path.join(dir, 'modules/catalog.json'), publishedCatalog(true));
  await copyDicts(dir);
  console.log(`artifact: index.html ${(html.length / 1024).toFixed(0)} КБ`);
}

// --- PWA ---
{
  const { js, css } = await bundle(true);
  const dir = path.join(out, PWA_DIR);
  await mkdir(dir, { recursive: true });
  const html = `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${APP_NAME}</title>
<meta name="description" content="Чтение и изучение Библии: переводы, словари Стронга, параллельные места, две панели.">
<meta name="theme-color" content="#38363a">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<!-- Прозрачная строка состояния: тёмная верхняя панель уходит под часы, без чёрной полосы.
     Под часами — сплошной цвет панели (html и body::before), так что размытие iOS с ним сливается. -->
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="${SHORT_NAME}">
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
  await cp(path.join(root, 'public/modules'), path.join(dir, 'modules'), { recursive: true, filter: isPublished });
  await writeFile(path.join(dir, 'modules/catalog.json'), publishedCatalog(false));
  await copyDicts(dir);
  // Планы чтения (готовые) — рядом с приложением
  if (existsSync(path.join(root, 'public/plans'))) await cp(path.join(root, 'public/plans'), path.join(dir, 'plans'), { recursive: true });
  // Фоны для картинок со стихом (фото в общественном достоянии / CC0)
  if (existsSync(path.join(root, 'public/images'))) await cp(path.join(root, 'public/images'), path.join(dir, 'images'), { recursive: true });
  const iconsSrc = path.join(root, STAGING && existsSync(path.join(root, 'public/icons-staging')) ? 'public/icons-staging' : 'public/icons');
  if (existsSync(iconsSrc)) await cp(iconsSrc, path.join(dir, 'icons'), { recursive: true });
  await writeFile(
    path.join(dir, 'manifest.webmanifest'),
    JSON.stringify(
      {
        name: APP_NAME,
        short_name: SHORT_NAME,
        description: 'Чтение и изучение Библии: переводы, словари Стронга, параллельные места',
        lang: 'ru',
        start_url: './',
        scope: './',
        display: 'standalone',
        // orientation не задаём: с 'any' Android поворачивает установленное приложение по датчику,
        // даже когда автоповорот в телефоне выключен; без поля — как в системе
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
  // Без сети должно работать всё, кроме загрузки модулей: планы чтения и фотографии (для картинок со стихом,
  // обложек планов и фона) кладём в кэш сразу при установке
  const ownFiles = async (sub, re) => (await readdir(path.join(out, PWA_DIR, sub)).catch(() => [])).filter((f) => re.test(f)).map((f) => `${sub}/${f}`);
  const shell = [
    './', 'index.html', 'manifest.webmanifest', 'modules/catalog.json', 'icons/icon.svg', 'icons/icon-192.png', 'icons/apple-touch-icon.png',
    ...(await ownFiles('plans', /\.json$/)),
    ...(await ownFiles('images/verse-bg', /\.(json|jpg)$/)),
  ];
  await writeFile(path.join(dir, 'version.json'), JSON.stringify({ version: VERSION, build: BUILD, date: BUILT_AT.toISOString() }));
  // Политика конфиденциальности отдельной страницей (ссылка для App Store и Google Play): privacy.html
  await writeFile(path.join(dir, 'privacy.html'), PRIVACY_HTML);
  // Имя кэша оболочки — со своим префиксом канала: тест и основное приложение живут на одном домене
  const shellPrefix = STAGING ? 'aobs-shell-' : 'aob-shell-';
  // Просмотренные иллюстрации (upload.wikimedia.org) — в отдельном кэше, не больше ILLUS_MAX последних:
  // открываются без сети и не стираются обновлениями
  const sw = `const CACHE = '${shellPrefix}${BUILD}';
const PREFIX = '${shellPrefix}';
const ILLUS = '${STAGING ? 'aobs-illus' : 'aob-illus'}';
const ILLUS_MAX = 120;
const SHELL = ${JSON.stringify(shell)};
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  // Удаляем только свои прежние оболочки (и старые имена без префикса); скачанные аудиокниги (*-audio-*) не трогаем
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE && (k.startsWith(PREFIX) || /^aob-\\d{8}-\\d{6}$/.test(k))).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
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
    e.respondWith(fetch(e.request, { cache: 'no-store' }).then((r) => { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return r; }).catch(() => caches.match(e.request, { ignoreSearch: true })));
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
    e.respondWith(caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || fetch(e.request).then((r) => {
      if (r.ok) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
      return r;
    })));
  }
});
`;
  await writeFile(path.join(dir, 'sw.js'), sw);
  console.log(`${PWA_DIR} (${CHANNEL}): index.html ${(html.length / 1024).toFixed(0)} КБ`);
}

let total = 0;
for (const f of await readdir(path.join(out, PWA_DIR, 'modules'))) {
  const st = await stat(path.join(out, PWA_DIR, 'modules', f));
  if (st.isFile()) total += st.size;
}
console.log(`modules: ${(total / 1048576).toFixed(1)} МБ`);
