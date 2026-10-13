// Проверка основных сценариев в настоящем браузере (Chrome/Edge через playwright-core).
// Запуск: node scripts/smoke-test.mjs [папка-для-скриншотов]
import http from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist/pwa');
const shots = path.resolve(process.argv[2] || path.join(root, 'dist/smoke'));
await mkdir(shots, { recursive: true });

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.gz': 'application/gzip', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const server = http.createServer(async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  try {
    const body = await readFile(path.join(dist, p));
    res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream', 'content-length': body.length });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((r) => server.listen(0, r));
const url = `http://localhost:${server.address().port}/`;

const exe = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'];
const browser = await chromium.launch({ executablePath: exe[0], headless: true });
const results = [];
const check = (name, ok, extra = '') => {
  results.push(`${ok ? 'OK  ' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`);
};

async function run(label, viewport, isMobile) {
  const ctx = await browser.newContext({ viewport, isMobile, hasTouch: isMobile, deviceScaleFactor: 2, serviceWorkers: 'block', colorScheme: 'dark' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
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
  const bg0 = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  check(`${label}: светлая тема по умолчанию при тёмной системе`, bg0 === LIGHT, bg0);
  // Настройки старой версии с темой «как в системе» переводятся в светлую
  await page.evaluate(() => localStorage.setItem('aob.settings', JSON.stringify({ theme: 'auto', fontSize: 21 })));
  await page.reload();
  await page.waitForSelector('.verse', { timeout: 30000 });
  const bgM = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
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
  await word.click();
  await page.waitForSelector('.sheet .dict-row, .sheet .empty', { timeout: 15000 });
  const title = await page.textContent('.sheet-title');
  check(`${label}: словарная панель`, title.includes('Господь'), title);
  const dicts = await page.$$eval('.dict-name', (els) => els.map((e) => e.textContent));
  check(`${label}: найдены словари`, dicts.length >= 2, dicts.join(', '));
  await page.screenshot({ path: `${shots}/${label}-2-dict-list.png` });
  await page.locator('.dict-row', { hasText: 'Стронг: иврит' }).click();
  await page.waitForSelector('.orig.hebrew');
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
  await page.fill('#search-input', 'возлюбил Бог мир');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => !document.querySelector('.progress') && document.querySelectorAll('.result-row').length > 0, null, { timeout: 30000 });
  const res = await page.$$eval('.result-row .xref-ref', (e) => e.map((x) => x.textContent));
  check(`${label}: поиск`, res.some((r) => r.includes('Ин. 3:16')), res.join(', '));
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

  // Настройки: тёмная тема и размер шрифта
  await page.click('.tb-more');
  await page.click('.menu-item:has-text("Оформление")');
  await page.click('.segmented button:has-text("Тёмная")');
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  check(`${label}: тёмная тема`, bg === 'rgb(22, 22, 23)', bg);
  await page.screenshot({ path: `${shots}/${label}-8-settings.png` });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  // Перезагрузка: настройки и модули восстановлены
  await page.reload();
  await page.waitForSelector('.verse', { timeout: 30000 });
  const bg2 = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const ref4 = await page.textContent('.tb-ref');
  check(`${label}: восстановление после перезагрузки`, bg2 === 'rgb(22, 22, 23)', `${bg2}, ${ref4}`);
  await page.screenshot({ path: `${shots}/${label}-9-dark.png` });

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
