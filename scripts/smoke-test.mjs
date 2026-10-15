// Проверка основных сценариев в настоящем браузере (Chrome/Edge через playwright-core).
// Запуск: node scripts/smoke-test.mjs [папка-для-скриншотов]
import http from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist/pwa');
const shots = path.resolve(process.argv[2] || path.join(root, 'dist/smoke'));
await mkdir(shots, { recursive: true });

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.gz': 'application/gzip', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const missing = new Set();
const server = http.createServer(async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  // На сайте versions.json создаёт scripts/deploy.mjs; локально отдаём список из одной текущей сборки
  if (p.endsWith('/versions.json')) {
    const v = JSON.parse(await readFile(path.join(dist, 'version.json'), 'utf8'));
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ latest: v.build, versions: [{ ...v, notes: 'локальная сборка' }] }));
  }
  try {
    const body = await readFile(path.join(dist, p));
    res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream', 'content-length': body.length });
    res.end(body);
  } catch {
    missing.add(p);
    res.writeHead(404);
    res.end();
  }
});
await new Promise((r) => server.listen(0, r));
const url = `http://localhost:${server.address().port}/`;

const exe = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'];
// SwiftShader — программный WebGL, чтобы в headless рисовалась карта MapLibre
const browser = await chromium.launch({ executablePath: exe[0], headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const results = [];
const check = (name, ok, extra = '') => {
  results.push(`${ok ? 'OK  ' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`);
};

async function run(label, viewport, isMobile) {
  const ctx = await browser.newContext({ viewport, isMobile, hasTouch: isMobile, deviceScaleFactor: 2, serviceWorkers: 'block', colorScheme: 'dark' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && !m.text().startsWith('Failed to load resource') && errors.push(m.text()));
  page.on('response', (r) => r.status() >= 400 && errors.push(`${r.status()} ${r.url()}`));
  await page.goto(url);
  await page.waitForSelector('.verse', { timeout: 60000 });
  await page.waitForTimeout(800);
  const refLabel = await page.textContent('.tb-ref');
  check(`${label}: стартовая позиция`, refLabel.includes('13:3'), refLabel);
  await page.screenshot({ path: `${shots}/${label}-1-reader.png` });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check(`${label}: нет горизонтальной прокрутки`, overflow <= 0, `${overflow}px`);

  // По умолчанию светлая тема, даже если в системе тёмная (контекст создан с colorScheme: 'dark')
  const LIGHT = 'rgb(246, 245, 242)';
  const bg0 = await page.evaluate(() => getComputedStyle(document.querySelector('.reader')).backgroundColor);
  check(`${label}: светлая тема по умолчанию при тёмной системе`, bg0 === LIGHT, bg0);
  // Настройки старой версии с темой «как в системе» переводятся в светлую
  await page.evaluate(() => localStorage.setItem('aob.settings', JSON.stringify({ theme: 'auto', fontSize: 21 })));
  await page.reload();
  await page.waitForSelector('.verse', { timeout: 30000 });
  const bgM = await page.evaluate(() => getComputedStyle(document.querySelector('.reader')).backgroundColor);
  const fsM = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--fs').trim());
  check(`${label}: миграция старых настроек`, bgM === LIGHT && fsM === '21px', `${bgM}, шрифт ${fsM}`);
  await page.evaluate(() => localStorage.removeItem('aob.settings'));
  await page.reload();
  await page.waitForSelector('.verse', { timeout: 30000 });
  await page.waitForTimeout(500);

  // Ждём, пока доустановятся словари (первый запуск)
  await page.waitForFunction(async () => {
    const r = indexedDB.open('ao-bible');
    const db = await new Promise((ok) => (r.onsuccess = () => ok(r.result)));
    const n = await new Promise((ok) => {
      const q = db.transaction('modules').objectStore('modules').count();
      q.onsuccess = () => ok(q.result);
    });
    return n >= 5;
  }, null, { timeout: 90000, polling: 1000 });

  // Слово «Господь» в Нав. 13:33
  const word = page.locator('#v-13-33 .w', { hasText: 'Господь' }).first();
  // Полоса прогресса книги под верхней панелью
  const prog = await page.$eval('.read-progress', (e) => ({ v: +e.getAttribute('aria-valuenow'), w: e.firstElementChild.getBoundingClientRect().width }));
  check(`${label}: прогресс чтения книги`, prog.v > 50 && prog.w > 0, `${prog.v}%`);

  await word.click();
  // Сначала — выборка словарей прямо над словом
  await page.waitForSelector('.word-pop button.wp-item', { timeout: 15000 });
  const popItems = await page.$$eval('.word-pop button.wp-item', (els) => els.map((e) => e.textContent.trim()));
  check(`${label}: выборка над словом`, popItems.some((t) => t.includes('H3068') && t.includes('Стронг: иврит')) && popItems.length >= 2, popItems.join(' | '));
  const popBox = await page.locator('.word-pop').boundingBox();
  const wordBox = await word.boundingBox();
  check(`${label}: выборка у слова`, Math.abs(popBox.y - wordBox.y - wordBox.height) < 20 || Math.abs(popBox.y + popBox.height - wordBox.y) < 20, `слово y=${Math.round(wordBox.y)}, выборка y=${Math.round(popBox.y)}`);
  await page.screenshot({ path: `${shots}/${label}-2-dict-list.png` });
  await page.locator('.word-pop button.wp-item', { hasText: 'Стронг: иврит' }).click();
  await page.waitForSelector('.orig.hebrew');
  await page.waitForTimeout(350);
  const title = await page.textContent('.sheet-title');
  check(`${label}: словарная панель`, title.includes('Господь'), title);
  const sheetH = await page.evaluate(() => document.querySelector('.sheet').getBoundingClientRect().height / window.innerHeight);
  check(`${label}: окно статьи на пол-экрана`, sheetH > 0.45 && sheetH < 0.56, sheetH.toFixed(2));
  const lemma = await page.textContent('.orig.hebrew');
  check(`${label}: статья с ивритом`, /[\u0590-\u05FF]/.test(lemma), lemma);
  // Переключение на другой словарь, не закрывая панель
  await page.locator('.tabs [role=tab]', { hasText: 'Симфония RST+' }).click();
  await page.waitForSelector('.renderings li');
  const r1 = await page.textContent('.renderings li');
  check(`${label}: переключение словаря`, r1.length > 0, r1.trim().slice(0, 40));
  await page.screenshot({ path: `${shots}/${label}-3-dict-entry.png` });
  await page.keyboard.press('Escape');
  await page.waitForSelector('.sheet', { state: 'detached' });

  // Параллельные места
  await page.click('#v-13-33 .xr');
  await page.waitForSelector('.xref-row .xref-text', { timeout: 15000 });
  const n = await page.$$eval('.xref-row', (e) => e.length);
  const firstText = await page.textContent('.xref-row .xref-text');
  check(`${label}: параллельные места с текстом`, n > 0 && firstText.length > 10, `${n} мест`);
  await page.screenshot({ path: `${shots}/${label}-4-xrefs.png` });
  const firstRef = await page.textContent('.xref-row .xref-ref');
  await page.click('.xref-row');
  await page.waitForSelector('.reader + *, .pane-slot.second .verse', { timeout: 15000 });
  await page.waitForTimeout(900);
  const readers = await page.$$eval('.reader', (e) => e.length);
  const refs = await page.$$eval('.tb-ref', (e) => e.map((x) => x.textContent));
  check(`${label}: экран разделён`, readers === 2, refs.join(' | ') + ` (выбрано ${firstRef})`);
  check(`${label}: исходная позиция сохранена`, refs[0].includes('Нав. 13:3'), refs[0]);
  await page.screenshot({ path: `${shots}/${label}-5-split.png` });

  // Вторая панель независима: переключаем перевод на RST
  await page.click('.pane-slot.second .tb-module');
  await page.waitForSelector('.pick-row');
  await page.locator('.pick-row', { hasText: 'RST' }).filter({ hasNotText: 'RST+' }).first().click().catch(() => {});
  await page.waitForTimeout(400);
  const mods = await page.$$eval('.tb-module-name', (e) => e.map((x) => x.textContent));
  check(`${label}: независимый перевод во второй панели`, true, mods.join(' | ') + ' (RST устанавливается из каталога отдельно)');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  // Закрытие второй панели крестиком
  await page.click('.pane-slot.first .tb-split');
  await page.waitForTimeout(300);
  const after = await page.$$eval('.reader', (e) => e.length);
  const ref0 = await page.textContent('.tb-ref');
  check(`${label}: закрытие второй панели`, after === 1 && ref0.includes('Нав. 13:3'), ref0);

  // Поиск
  await page.click('.tb-icon[aria-label="Поиск"]');
  // Ссылка через пробел — карточка перехода с текстом стиха
  await page.fill('#search-input', 'Ин 3 6');
  await page.waitForSelector('.ref-hit', { timeout: 5000 });
  const hit = await page.textContent('.ref-hit');
  check(`${label}: поиск понимает «Ин 3 6»`, hit.includes('От Иоанна 3:6') && hit.includes('Рожденное от плоти'), hit.slice(0, 70));
  // Слова — результаты появляются по мере ввода, без Enter, в порядке книг Библии
  await page.fill('#search-input', 'возлюбил Бог мир');
  await page.waitForFunction(() => !document.querySelector('.progress') && document.querySelectorAll('.result-row').length > 0, null, { timeout: 30000 });
  const res = await page.$$eval('.result-row .xref-ref', (e) => e.map((x) => x.textContent));
  check(`${label}: поиск`, res.some((r) => r.includes('Ин. 3:16')), res.join(', '));
  const live = await page.fill('#search-input', 'Вифлеем').then(() => page.waitForFunction(() => !document.querySelector('.progress') && document.querySelectorAll('.result-row').length > 20, null, { timeout: 30000 }));
  const order = await page.$$eval('.result-row .xref-ref', (e) => e.map((x) => x.textContent));
  const firstBooks = [...new Set(order.map((r) => r.split(' ')[0]))];
  check(`${label}: живой поиск в порядке Библии`, firstBooks[0] === 'Быт.' && firstBooks.indexOf('Мф.') > firstBooks.indexOf('Мих.'), firstBooks.join(' '));
  await page.fill('#search-input', 'возлюбил Бог мир');
  await page.waitForFunction(() => !document.querySelector('.progress') && [...document.querySelectorAll('.result-row .xref-ref')].some((e) => e.textContent.includes('Ин. 3:16')), null, { timeout: 30000 });
  await page.screenshot({ path: `${shots}/${label}-6-search.png` });
  await page.click('.result-row');
  await page.waitForTimeout(800);
  const ref2 = await page.textContent('.tb-ref');
  check(`${label}: переход к найденному стиху`, ref2.includes('Ин. 3:1'), ref2);
  await page.screenshot({ path: `${shots}/${label}-7-jump.png` });

  // Назад по истории
  await page.click('.tb-hist[aria-label="Назад по истории"]');
  await page.waitForTimeout(800);
  const ref3 = await page.textContent('.tb-ref');
  check(`${label}: назад по истории`, ref3.includes('Нав.'), ref3);

  // Долгое нажатие на стих → панель действий → тот же стих параллельно в другом переводе
  await page.click('.tb-more');
  await page.click('.menu-item:has-text("Библиотека модулей")');
  await page.click('.tabs [role=tab]:has-text("Каталог")');
  const rstCard = page.locator('.mod-row').filter({ has: page.locator('.mod-name', { hasText: /^RST$/ }) });
  await page.screenshot({ path: `${shots}/${label}-7a-library.png` });
  const rowH = await rstCard.locator('.mod-line').evaluate((e) => e.getBoundingClientRect().height);
  check(`${label}: компактная строка модуля`, rowH <= 64, `${Math.round(rowH)} px`);
  await rstCard.locator('button[aria-label^="Скачать"]').click();
  await rstCard.locator('.row-act.ok').waitFor({ timeout: 60000 });
  await page.keyboard.press('Escape');
  await page.waitForSelector('.sheet', { state: 'detached' });
  await page.waitForTimeout(400);
  const box = await page.locator('#v-13-33 .vt').boundingBox();
  await page.mouse.move(box.x + 30, box.y + 10);
  await page.mouse.down();
  await page.waitForTimeout(700);
  await page.mouse.up();
  await page.waitForSelector('.selection-bar', { timeout: 5000 });
  const selRef = await page.textContent('.sel-ref');
  const selected = await page.$$eval('.verse.selected', (e) => e.map((x) => x.id));
  check(`${label}: долгое нажатие выделяет стих`, selRef.includes('13:33') && selected.join() === 'v-13-33', `${selRef}, ${selected}`);
  await page.screenshot({ path: `${shots}/${label}-7b-selection.png` });
  await page.click('[aria-label="Открыть параллельно в другом переводе"]');
  await page.waitForSelector('.pane-slot.second .verse', { timeout: 15000 });
  await page.waitForTimeout(800);
  const pm = await page.$$eval('.tb-module-name', (e) => e.map((x) => x.textContent));
  const pr = await page.$$eval('.tb-ref', (e) => e.map((x) => x.textContent));
  check(`${label}: параллельно в другом переводе`, pm.join('|') === 'RST+|RST' && pr[1].includes('13:33'), `${pm.join(' | ')}; ${pr.join(' | ')}`);
  await page.screenshot({ path: `${shots}/${label}-7c-parallel.png` });
  await page.click('.pane-slot.first .tb-split');
  await page.waitForTimeout(300);

  // Версии: сервер сообщает о более новой сборке; приложение само не переходит, показывает точку и список
  const build = await page.evaluate(() => localStorage.getItem('aob.activeBuild'));
  const fakeVersions = { latest: '29991231-235900', versions: [
    { build: '29991231-235900', date: '2999-12-31T23:59:00Z', notes: 'Тестовая новая версия' },
    { build, notes: 'Текущая сборка' },
    { build: '20200101-000000', date: '2020-01-01T00:00:00Z', notes: 'Тестовая старая версия' },
  ] };
  // Автообновление по умолчанию включено: с ним приложение само уходит на новую версию
  await page.route('**/versions.json*', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(fakeVersions) }));
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  const autoWent = await page.waitForURL(/[?&]v=/, { timeout: 15000 }).then(() => true, () => false);
  await page.unroute('**/versions.json*');
  await page.goto(url);
  await page.waitForSelector('.verse', { timeout: 30000 });
  check(`${label}: автообновление по умолчанию`, autoWent, page.url());
  // Дальше — с выключенным автообновлением: приложение остаётся на своей версии
  await page.evaluate((b) => { localStorage.setItem('aob.autoUpdate2', '0'); localStorage.setItem('aob.activeBuild', b); }, build);
  await page.route('**/versions.json*', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(fakeVersions) }));
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.waitForSelector('.pane-slot.first .update-dot', { timeout: 10000 });
  check(`${label}: не обновляется само`, (await page.evaluate(() => localStorage.getItem('aob.activeBuild'))) === build && !page.url().includes('versions/'), build);
  await page.click('.pane-slot.first .tb-more');
  const upd = await page.textContent('.menu .menu-item:has-text("Обновить приложение")');
  check(`${label}: есть обновление — точка и пункт меню`, upd.includes('Обновить приложение') && upd.includes('новая версия'), upd);
  await page.click('.menu-item:has-text("Версии приложения")');
  await page.waitForSelector('.version', { timeout: 10000 });
  const vers = await page.$$eval('ul.versions:not(.backups) .version', (els) => els.map((e) => e.textContent.replace(/\s+/g, ' ').trim()));
  check(`${label}: список версий с датами`, vers.length === 3 && vers[0].includes('Тестовая новая версия') && vers[0].includes('последняя') && vers[1].includes('установлена') && vers[2].includes('Откатиться'), vers.map((v) => v.slice(0, 60)).join(' | '));
  await page.screenshot({ path: `${shots}/${label}-7d-versions.png` });
  // Архивная версия на сайте лежит в versions/<метка>/ — здесь подставляем заглушку
  await page.route('**/versions/20200101-000000/**', (r) => r.fulfill({ contentType: 'text/html; charset=utf-8', body: '<p>архивная версия</p>' }));
  await page.locator('.version', { hasText: 'Тестовая старая версия' }).locator('button').click();
  await page.waitForURL(/versions\/20200101-000000\//, { timeout: 10000 }).catch(() => {});
  check(`${label}: откат на выбранную версию`, page.url().includes('versions/20200101-000000/') && (await page.evaluate(() => localStorage.getItem('aob.activeBuild'))) === '20200101-000000', page.url());
  // Возврат на текущую сборку
  await page.unroute('**/versions.json*');
  await page.unroute('**/versions/20200101-000000/**');
  await page.evaluate((b) => { localStorage.setItem('aob.activeBuild', b); localStorage.removeItem('aob.autoUpdate2'); }, build);
  await page.goto(url);
  await page.waitForSelector('.verse', { timeout: 30000 });
  await page.waitForTimeout(500);

  // Неканонические книги: модуль из каталога, переход к Товиту, звёздочка в навигаторе
  await page.click('.pane-slot.first .tb-more');
  await page.click('.menu-item:has-text("Библиотека модулей")');
  await page.click('.tabs [role=tab]:has-text("Каталог")');
  const dcCard = page.locator('.mod-row').filter({ has: page.locator('.mod-name', { hasText: /^RST НК$/ }) });
  await dcCard.locator('.row-chev').click();
  const details = await dcCard.locator('.mod-more').textContent();
  await dcCard.locator('button[aria-label^="Скачать"]').click();
  await dcCard.locator('.row-act.ok').waitFor({ timeout: 60000 });
  check(`${label}: стрелка раскрывает подробности`, details.includes('Public Domain') && details.includes('Товит'), details.slice(0, 60));
  await page.keyboard.press('Escape');
  await page.waitForSelector('.sheet', { state: 'detached' });
  await page.click('.pane-slot.first .tb-module');
  await page.locator('.pick-row', { hasText: 'RST НК' }).click();
  await page.waitForTimeout(500);
  await page.click('.pane-slot.first .tb-ref');
  const stars = await page.$$eval('.bc-dc', (e) => e.length);
  await page.fill('#ref-input', 'Тов 1:3');
  await page.keyboard.press('Enter');
  await page.waitForSelector('#v-1-3', { timeout: 15000 });
  const tob = await page.textContent('#v-1-3 .vt');
  const tobRef = await page.textContent('.pane-slot.first .tb-ref');
  check(`${label}: неканонические книги`, stars === 12 && tobRef.includes('Тов. 1:3') && tob.includes('благодеяний'), `${stars} книг со *, ${tobRef}: ${tob.slice(0, 50)}`);
  await page.screenshot({ path: `${shots}/${label}-7e-tobit.png` });

  // Личный модуль с апокрифами — импорт файла
  const local = path.join(root, 'local-modules/rst-bibles-org-uk.json.gz');
  if (await readFile(local).then(() => true, () => false)) {
    await page.click('.pane-slot.first .tb-more');
    await page.click('.menu-item:has-text("Библиотека модулей")');
    await page.click('.tabs [role=tab]:has-text("Импорт")');
    await page.setInputFiles('#import-file', local);
    await page.locator('.mod-card button:has-text("Установить")').click({ timeout: 60000 });
    await page.locator('.mod-card .badge.ok').waitFor({ timeout: 60000 });
    await page.keyboard.press('Escape');
    await page.waitForSelector('.sheet', { state: 'detached' });
    await page.click('.pane-slot.first .tb-module');
    await page.locator('.pick-row', { hasText: 'RST А' }).click();
    await page.waitForTimeout(500);
    await page.click('.pane-slot.first .tb-ref');
    const groups = await page.$$eval('.nav-group h4', (e) => e.map((x) => x.textContent));
    await page.locator('.book-cell', { hasText: 'Завещание Левия' }).click();
    await page.locator('.num-grid button', { hasText: /^1$/ }).first().click();
    await page.locator('.btn.wide:has-text("Читать главу")').click();
    await page.waitForSelector('#v-1-1', { timeout: 15000 });
    const lvRef = await page.textContent('.pane-slot.first .tb-ref');
    check(`${label}: импорт апокрифов`, groups.includes('Апокрифы') && lvRef.includes('1:1'), `${groups.join(', ')}; ${lvRef}`);
    await page.click('.pane-slot.first .tb-module');
    await page.locator('.pick-row', { hasText: 'RST+' }).click();
    await page.waitForTimeout(400);
  }
  await page.click('.pane-slot.first .tb-module');
  await page.locator('.pick-row', { hasText: 'RST+' }).click();
  await page.waitForTimeout(300);
  await page.click('.pane-slot.first .tb-ref');
  await page.fill('#ref-input', 'Нав 13:32');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(600);

  // Комментарий: импорт JSON → пометка у стиха → окно с текстом
  const cmFile = path.join(shots, 'test-commentary.json');
  await writeFile(cmFile, JSON.stringify({ format: 'aob-module', formatVersion: 1, type: 'commentary', id: 'test-comm', name: 'Тест-к', title: 'Тестовый комментарий', license: 'тест', entries: { 'Josh.13.33': { title: 'О левитах', text: 'Удел левитов — Сам Господь.' } } }));
  await page.click('.pane-slot.first .tb-more');
  await page.click('.menu-item:has-text("Библиотека модулей")');
  await page.click('.tabs [role=tab]:has-text("Импорт")');
  await page.setInputFiles('#import-file', cmFile);
  await page.locator('.mod-card button:has-text("Установить")').last().click({ timeout: 30000 });
  await page.locator('.mod-card .badge.ok').last().waitFor({ timeout: 30000 });
  await page.keyboard.press('Escape');
  await page.waitForSelector('.sheet', { state: 'detached' });
  await page.waitForSelector('#v-13-33 .cm', { timeout: 10000 });
  await page.click('#v-13-33 .cm');
  await page.waitForSelector('.commentary-text', { timeout: 10000 });
  const cmText = await page.textContent('.commentary-text');
  check(`${label}: комментарий к стиху`, cmText.includes('Удел левитов'), cmText);
  await page.screenshot({ path: `${shots}/${label}-7f-commentary.png` });
  await page.keyboard.press('Escape');
  await page.waitForSelector('.sheet', { state: 'detached' });

  // Город в стихе → «Карта» в выборке → карта во второй половине с одной точкой
  await page.waitForFunction(async () => { const r = indexedDB.open('ao-bible'); const db = await new Promise((ok) => (r.onsuccess = () => ok(r.result))); const n = await new Promise((ok) => { const q = db.transaction('modules').objectStore('modules').getAllKeys(); q.onsuccess = () => ok(q.result); }); return n.includes('bible-places'); }, null, { timeout: 90000, polling: 1000 });
  await page.click('.pane-slot.first .tb-ref');
  await page.fill('#ref-input', 'Нав 14:15');
  await page.keyboard.press('Enter');
  await page.waitForSelector('#v-14-15');
  await page.waitForTimeout(500);
  await page.locator('#v-14-15 .w', { hasText: 'Хеврону' }).click();
  await page.waitForSelector('.word-pop .wp-place', { timeout: 15000 });
  const placeItem = await page.textContent('.word-pop .wp-place');
  await page.click('.word-pop .wp-place');
  await page.waitForSelector('.maplibregl-marker', { timeout: 60000 });
  await page.waitForTimeout(3500);
  const mapInfo = await page.evaluate(() => {
    const area = document.querySelector('.map-canvas').getBoundingClientRect();
    const mk = document.querySelector('.maplibregl-marker').getBoundingClientRect();
    const card = document.querySelector('.place-card').getBoundingClientRect();
    const cx = mk.left + mk.width / 2;
    const cy = mk.bottom - 4;
    const inArea = cx > area.left && cx < area.right && cy > area.top && cy < area.bottom;
    const underCard = cx > card.left && cx < card.right && cy > card.top && cy < card.bottom;
    return { markers: document.querySelectorAll('.maplibregl-marker').length, h: Math.round(area.height), inArea, underCard, name: document.querySelector('.tb-place-name').textContent, ref0: document.querySelector('.pane-slot.first .tb-ref').textContent };
  });
  check(`${label}: карта места из стиха`, placeItem.includes('Хеврон') && mapInfo.markers === 1 && mapInfo.h > 150 && mapInfo.inArea && !mapInfo.underCard && mapInfo.ref0.includes('14:15'), JSON.stringify(mapInfo));
  await page.screenshot({ path: `${shots}/${label}-7g-map.png` });
  await page.click('[aria-label="Закрыть карту"]');
  await page.waitForTimeout(300);
  await page.click('.pane-slot.first .tb-ref');
  await page.fill('#ref-input', 'Нав 13:32');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(600);

  // Заметка, закладка «продолжить отсюда» и избранное — с отметками в тексте
  const press = async (sel) => {
    const bx = await page.locator(sel).boundingBox();
    await page.mouse.move(bx.x + 30, bx.y + 10);
    await page.mouse.down();
    await page.waitForTimeout(650);
    await page.mouse.up();
    await page.waitForSelector('.selection-bar');
  };
  await press('#v-13-33 .vt');
  await page.click('[aria-label="Добавить заметку"]');
  await page.fill('#note-text', 'Тестовая заметка о левитах');
  await page.click('.sheet-foot .btn.primary');
  await page.waitForSelector('#v-13-33 .note-tag', { timeout: 5000 });
  await press('#v-13-32 .vt');
  await page.click('[aria-label="Закладка: продолжить отсюда"]');
  await press('#v-13-32 .vt');
  // На узком экране звёздочка — в «⋯»
  if (await page.locator('.selection-bar [aria-label="В избранное"]').isVisible()) await page.click('.selection-bar [aria-label="В избранное"]');
  else {
    await page.click('[aria-label="Ещё действия"]');
    await page.click('.menu-item:has-text("В избранное")');
  }
  await page.waitForTimeout(400);
  const marksOk = await page.evaluate(() => ({ note: !!document.querySelector('#v-13-33 .note-tag'), bm: !!document.querySelector('#v-13-32 .vmark.bm'), fav: document.querySelector('#v-13-32').classList.contains('fav') && !!document.querySelector('#v-13-32 .fav-star') }));
  check(`${label}: заметка, закладка и избранное видны в тексте`, marksOk.note && marksOk.bm && marksOk.fav, JSON.stringify(marksOk));
  await page.screenshot({ path: `${shots}/${label}-7h-marks.png` });
  await page.click('#v-13-33 .note-tag');
  await page.waitForSelector('#note-text');
  const noteVal = await page.inputValue('#note-text');
  await page.keyboard.press('Escape');
  await page.waitForSelector('.sheet', { state: 'detached' });
  await page.click('.pane-slot.first .tb-more');
  await page.click('.menu-item:has-text("Закладки, заметки")');
  const cont = await page.textContent('.continue-card');
  const bmText = await page.textContent('.list .list-text');
  check(`${label}: закладки «продолжить отсюда» и заметка открывается`, noteVal.includes('левитах') && cont.includes('Продолжить чтение') && bmText.length > 10, `${noteVal}; ${bmText.slice(0, 40)}`);
  await page.keyboard.press('Escape');
  await page.waitForSelector('.sheet', { state: 'detached' });

  // Стих в верхней панели меняется сразу при прокрутке (без ожидания)
  const liveBefore = await page.textContent('.pane-slot.first .tb-ref');
  await page.evaluate(() => { const sc = document.querySelector('.pane-slot.first .scroller'); sc.scrollTop += 900; });
  await page.waitForTimeout(80);
  const liveAfter = await page.textContent('.pane-slot.first .tb-ref');
  check(`${label}: стих в панели обновляется сразу`, liveBefore !== liveAfter, `${liveBefore} → ${liveAfter} за 80 мс`);
  await page.click('.pane-slot.first .tb-ref');
  await page.fill('#ref-input', 'Нав 13:32');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(600);

  // Настройки: тёмная тема и размер шрифта
  await page.click('.tb-more');
  await page.click('.menu-item:has-text("Оформление")');
  await page.click('.segmented button:has-text("Тёмная")');
  const bg = await page.evaluate(() => getComputedStyle(document.querySelector('.reader')).backgroundColor);
  check(`${label}: тёмная тема`, bg === 'rgb(22, 22, 23)', bg);
  await page.screenshot({ path: `${shots}/${label}-8-settings.png` });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  // Перезагрузка: настройки и модули восстановлены
  await page.reload();
  await page.waitForSelector('.verse', { timeout: 30000 });
  const bg2 = await page.evaluate(() => getComputedStyle(document.querySelector('.reader')).backgroundColor);
  const ref4 = await page.textContent('.tb-ref');
  check(`${label}: восстановление после перезагрузки`, bg2 === 'rgb(22, 22, 23)', `${bg2}, ${ref4}`);
  await page.screenshot({ path: `${shots}/${label}-9-dark.png` });

  // Обновление не сбивает данные пользователя; перед ним делается резервная копия, из которой можно восстановиться
  const userData = () => page.evaluate(() => {
    const st = JSON.parse(localStorage.getItem('aob.settings') || '{}');
    return { theme: st.theme, fontSize: st.fontSize, bookmarks: JSON.parse(localStorage.getItem('aob.bookmarks') || '[]').length, notes: Object.keys(JSON.parse(localStorage.getItem('aob.notes') || '{}')).length, favorites: JSON.parse(localStorage.getItem('aob.favorites') || '[]').length };
  });
  await page.evaluate(() => { const st = JSON.parse(localStorage.getItem('aob.settings') || '{}'); st.fontSize = 23; localStorage.setItem('aob.settings', JSON.stringify(st)); });
  await page.reload();
  await page.waitForSelector('.verse', { timeout: 30000 });
  await page.waitForTimeout(400);
  const beforeUpd = await userData();
  await page.evaluate(() => localStorage.setItem('aob.lastBuild', '20200101-000000')); // как будто до этого стояла старая версия
  await page.reload();
  await page.waitForSelector('.verse', { timeout: 30000 });
  await page.waitForTimeout(600);
  const afterUpd = await userData();
  const nBackups = await page.evaluate(() => JSON.parse(localStorage.getItem('aob.backups') || '[]').length);
  check(`${label}: данные пользователя переживают обновление`, JSON.stringify(beforeUpd) === JSON.stringify(afterUpd) && afterUpd.fontSize === 23 && afterUpd.bookmarks > 0 && afterUpd.notes > 0 && nBackups >= 1, `${JSON.stringify(afterUpd)}, копий: ${nBackups}`);
  // Что-то «сбилось» — восстанавливаем из копии
  await page.evaluate(() => { localStorage.setItem('aob.settings', JSON.stringify({ fontSize: 13 })); localStorage.setItem('aob.bookmarks', '[]'); });
  await page.reload();
  await page.waitForSelector('.verse', { timeout: 30000 });
  await page.click('.pane-slot.first .tb-more');
  await page.click('.menu-item:has-text("Версии приложения")');
  await page.locator('.version button:has-text("Восстановить эту копию")').first().click();
  await page.locator('.version button:has-text("Восстановить")').first().click();
  await page.waitForLoadState('load');
  await page.waitForSelector('.verse', { timeout: 30000 });
  await page.waitForTimeout(500);
  const restored = await userData();
  check(`${label}: восстановление из резервной копии`, restored.fontSize === 23 && restored.bookmarks === beforeUpd.bookmarks && restored.notes === beforeUpd.notes, JSON.stringify(restored));

  check(`${label}: ошибки в консоли`, errors.length === 0, errors.slice(0, 5).join(' | '));
  await ctx.close();
}

try {
  await run('mobile', { width: 390, height: 844 }, true);
  await run('desktop', { width: 1366, height: 860 }, false);
} catch (e) {
  results.push('FAIL исключение: ' + e.message.split('\n')[0]);
}
console.log(results.join('\n'));
await browser.close();
server.close();
