// Проверка языков интерфейса в настоящем браузере (Chrome через playwright-core), телефон 390×844.
// Для каждого языка проходит основные экраны (меню ⋮, выделение стиха, настройки и выбор языка, планы, проповеди,
// инструкция с уроком, проигрыватель, оформление, закладки, поиск, книги, библиотека, словарь), снимает скриншоты
// и ищет: непереведённые русские строки (кириллицу вне текста Библии, названий книг и модулей) и подписи,
// которые не помещаются или вылезают за край экрана.
// Запуск (после npm run build): node scripts/i18n-test.mjs <папка-для-скриншотов> [коды языков через запятую]
import http from 'node:http';
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist/pwa');
const shots = path.resolve(process.argv[2] || path.join(root, 'dist/i18n-test'));
await mkdir(shots, { recursive: true });
const dictDir = path.join(root, 'src/i18n');
const all = ['ru', ...(await readdir(dictDir)).filter((f) => f.endsWith('.json')).map((f) => f.replace('.json', '')).sort()];
const langs = process.argv[3] ? process.argv[3].split(',') : all;

// Русские тексты, которые не переводятся: названия книг, модулей, планов, фото, языков на своём языке
const allow = new Set();
const addAllow = (s) => s && String(s).length > 1 && allow.add(String(s));
for (const b of JSON.parse(await readFile(path.join(root, 'src/core/books.json'), 'utf8'))) [b.name, b.short, b.short?.replace(/\.$/, '')].forEach(addAllow);
const catalog = JSON.parse(await readFile(path.join(dist, 'modules/catalog.json'), 'utf8'));
for (const m of catalog.modules) [m.name, m.title, m.description, m.author, m.source, m.license].forEach(addAllow);
for (const f of (await readdir(path.join(root, 'public/plans'))).filter((f) => f.endsWith('.json'))) {
  const j = JSON.parse(await readFile(path.join(root, 'public/plans', f), 'utf8'));
  [j.name, j.description, ...(j.plans || []).flatMap((p) => [p.name, p.description])].forEach(addAllow);
}
for (const im of JSON.parse(await readFile(path.join(root, 'public/images/verse-bg/index.json'), 'utf8')).images) [im.title, im.author].forEach(addAllow);
['Русский', 'Українська', 'Беларуская', 'Български', 'Српски', 'Тестовая заметка'].forEach(addAllow);
const allowList = [...allow].sort((a, b) => b.length - a.length);

// Русские буквы, которых нет в языке: для кириллических языков непереведённое видно по ним
const RUS = { uk: '[ыэъё]', be: '[ищъ]', bg: '[ыэё]', sr: '[йщъыьэюяё]' };

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.gz': 'application/gzip', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webmanifest': 'application/manifest+json' };
const server = http.createServer(async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  if (p.endsWith('/versions.json')) {
    const v = JSON.parse(await readFile(path.join(dist, 'version.json'), 'utf8'));
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ latest: v.build, versions: [{ ...v, notes: '' }] }));
  }
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

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
// Язык браузера — английский: первый запуск должен сам выбрать английский интерфейс
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, serviceWorkers: 'block', locale: 'en-US' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const report = [];
const log = (s) => (report.push(s), console.log(s));

const ready = async () => {
  await page.waitForSelector('.pane-slot.first .verse', { timeout: 60000 });
  await page.waitForTimeout(400);
};
const fresh = async () => {
  await page.goto(url);
  await ready();
};
const menu = async (icon) => {
  await page.click('.pane-slot.first .tb-more');
  await page.click(`.menu .menu-item:has(svg.lucide-${icon})`);
  await page.waitForSelector('.sheet', { timeout: 15000 });
  await page.waitForTimeout(450);
};
const prefs = async (icon) => {
  await menu('settings');
  if (icon) {
    await page.click(`.sheet .pref-row:has(svg.lucide-${icon})`);
    await page.waitForTimeout(450);
  }
};
const selectVerse = async () => {
  await page.evaluate(() => {
    const v = [...document.querySelectorAll('.pane-slot.first .verse')].find((e) => e.getBoundingClientRect().top > 120);
    const r = v.getBoundingClientRect();
    v.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + r.width / 2, clientY: r.top + 10 }));
  });
  await page.waitForSelector('.selection-bar', { timeout: 5000 });
  await page.waitForTimeout(300);
};

// Осмотр экрана: непереведённое и вылезающее
async function inspect(code) {
  return page.evaluate(
    ({ allowList, rus, code }) => {
      const RE = new RegExp(rus || '[А-Яа-яЁё]', 'i');
      // Текст Библии и словарных статей — не интерфейс
      const SKIP = '.vt, .xref-text, .xref-source, .list-text, .compare-text, .sermon-verse-text, .pulpit-verse, .renderings, .entry .prewrap, .entry-word, .dict-desc, .gw-ru, .orig, .wp-key, .version-notes, .tb-place-name, .place-card-title b, .preview-card, textarea, input, .sermon-text-input, .lang-row, .copy-area, .code';
      const strip = (s) => {
        let x = ` ${s} `;
        for (const a of allowList) if (x.includes(a)) x = x.split(a).join(' ');
        return x;
      };
      const visible = (el) => {
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height) return false;
        const st = getComputedStyle(el);
        return st.visibility !== 'hidden' && st.display !== 'none' && +st.opacity !== 0;
      };
      const ru = new Set();
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const t = n.textContent.trim();
        const el = n.parentElement;
        if (!t || !el || el.closest(SKIP) || !visible(el)) continue;
        if (RE.test(strip(t))) ru.add(`«${t.slice(0, 80)}» <${el.className || el.tagName}>`);
      }
      for (const el of document.querySelectorAll('[aria-label], [title], [placeholder]')) {
        if (el.closest(SKIP.replace(', input', '').replace(', textarea', '')) || !visible(el)) continue;
        for (const a of ['aria-label', 'title', 'placeholder']) {
          const v = el.getAttribute(a);
          if (v && RE.test(strip(v))) ru.add(`${a}=«${v.slice(0, 80)}» <${el.className || el.tagName}>`);
        }
      }
      // Вылезает за край экрана или не помещается в кнопку
      const W = innerWidth;
      const over = new Set();
      const SCROLLS = '.tabs, .chips, .plan-strip-chips, .vimg-bgs, .menu, .sheet-body, .scroller';
      for (const el of document.querySelectorAll('button, .menu-item, .chip, .btn, .pref-row, [role=tab], .badge, .sheet-title, .tour-bubble, .tour-ctrl, .audio-bar, .selection-bar, .topbar, .field-label, h4, .segmented, .lang-row')) {
        if (!visible(el)) continue;
        const r = el.getBoundingClientRect();
        const label = (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 50);
        const inScroller = el.parentElement?.closest(SCROLLS);
        if (!inScroller && (r.right > W + 1 || r.left < -1)) over.add(`за краем (${Math.round(r.left)}…${Math.round(r.right)}): «${label}» <${el.className}>`);
        const st = getComputedStyle(el);
        if (el.scrollWidth > el.clientWidth + 2 && st.overflowX !== 'auto' && st.overflowX !== 'scroll' && el.children.length < 4) over.add(`не помещается (${el.scrollWidth}>${el.clientWidth}): «${label}» <${el.className}>`);
        if (el.matches('.segmented button, .menu-item, .tb, .chip') && r.height > 64) over.add(`слишком высокая (${Math.round(r.height)}px): «${label}» <${el.className}>`);
      }
      if (document.documentElement.scrollWidth > W) over.add(`горизонтальная прокрутка страницы: ${document.documentElement.scrollWidth}px`);
      return { ru: [...ru], over: [...over], lang: document.documentElement.lang };
    },
    { allowList, rus: RUS[code], code }
  );
}

const summary = {};
async function screen(code, name, fn) {
  try {
    await fn();
    await page.screenshot({ path: `${shots}/${code}-${name}.png` });
    const r = await inspect(code);
    const s = (summary[code] ||= { ru: new Set(), over: new Set(), screens: 0 });
    s.screens++;
    if (code !== 'ru') r.ru.forEach((x) => s.ru.add(`${name}: ${x}`));
    r.over.forEach((x) => s.over.add(`${name}: ${x}`));
  } catch (e) {
    (summary[code] ||= { ru: new Set(), over: new Set(), screens: 0 }).over.add(`${name}: ОШИБКА ${e.message.split('\n')[0]}`);
  }
}

// Первый запуск: язык из браузера (en-US → английский), установка модулей
await page.goto(url);
await ready();
const first = await page.evaluate(() => ({ lang: document.documentElement.lang, saved: localStorage.getItem('aob.lang') }));
log(`первый запуск с браузером en-US: <html lang=${first.lang}>, сохранён язык ${first.saved}`);
await page.waitForFunction(async () => {
  const r = indexedDB.open('ao-bible');
  const db = await new Promise((ok) => (r.onsuccess = () => ok(r.result)));
  const n = await new Promise((ok) => {
    const q = db.transaction('modules').objectStore('modules').count();
    q.onsuccess = () => ok(q.result);
  });
  return n >= 5;
}, null, { timeout: 120000, polling: 1000 });

// Смена языка в настройках — сразу, без перезагрузки: строка «Язык» → список → Deutsch
await prefs();
await page.click('.sheet .pref-row:has(.flag)');
await page.waitForSelector('.lang-row');
const nav0 = await page.evaluate(() => performance.getEntriesByType('navigation')[0]?.startTime ?? 0);
const marker = await page.evaluate(() => (window.__noReload = Math.random()));
await page.click('.lang-row[lang="de-DE"]');
await page.waitForTimeout(400);
const sw = await page.evaluate(() => ({ lang: document.documentElement.lang, title: document.querySelector('.sheet-title')?.textContent, kept: window.__noReload }));
log(`смена языка без перезагрузки: <html lang=${sw.lang}>, заголовок «${sw.title}», страница та же: ${sw.kept === marker}`);
await page.screenshot({ path: `${shots}/_switch-de.png` });

// Данные для экранов: проповедь со стихом, начатый план (один раз, дальше они видны во всех языках)
await page.evaluate(() => localStorage.setItem('aob.lang', JSON.stringify('ru')));
await fresh();
await selectVerse();
await page.click('.pane-slot.first .sel-inline .btn:not(.primary)');
await page.waitForSelector('#sermon-title');
await page.fill('#sermon-title', 'Test sermon');
await page.click('.sermon-new button[type=submit]');
await page.waitForSelector('.sermon-done');
await fresh();
await menu('calendar-check');
await page.waitForSelector('.plan-offer button', { timeout: 15000 });
await page.click('.plan-offer button');
await page.waitForTimeout(500);

for (const code of langs) {
  // Каждый язык — с начального места (Нав. 13:32), не в режиме плана
  await page.evaluate((c) => (localStorage.setItem('aob.lang', JSON.stringify(c)), localStorage.removeItem('aob.panes')), code);
  await screen(code, '01-reader', fresh);
  await screen(code, '02-menu', async () => {
    await fresh();
    await page.click('.pane-slot.first .tb-more');
    await page.waitForSelector('.menu');
  });
  await screen(code, '03-selection', async () => {
    await fresh();
    await selectVerse();
  });
  await screen(code, '04-selection-more', async () => {
    await page.click('.pane-slot.first .selection-bar .tb-more');
    await page.waitForSelector('.menu');
  });
  await screen(code, '05-palette', async () => {
    await page.keyboard.press('Escape');
    await fresh();
    await selectVerse();
    await page.click('.pane-slot.first .hl-wrap .tb');
    await page.waitForSelector('.hl-palette');
  });
  await screen(code, '06-prefs', async () => {
    await fresh();
    await prefs();
  });
  await screen(code, '07-languages', async () => {
    await page.click('.sheet .pref-row:has(.flag)');
    await page.waitForSelector('.lang-row');
  });
  await screen(code, '08-plans', async () => {
    await fresh();
    await menu('calendar-check');
    await page.waitForSelector('.plan-card');
  });
  await screen(code, '09-plan-day', async () => {
    await page.click('.plan-card .plan-read');
    await page.waitForSelector('.plan-strip', { timeout: 15000 });
    await page.waitForTimeout(600);
  });
  await screen(code, '10-sermons', async () => {
    await page.evaluate(() => localStorage.removeItem('aob.panes'));
    await fresh();
    await menu('scroll-text');
    await page.waitForSelector('.sermon-pick-row');
  });
  await screen(code, '11-sermon', async () => {
    await page.click('.sermon-pick-row');
    await page.waitForSelector('.sermon-blocks');
  });
  await screen(code, '12-help', async () => {
    await fresh();
    await menu('book-open-check');
  });
  await screen(code, '13-tour', async () => {
    await page.click('.sheet .pref-row');
    await page.waitForSelector('.tour-bubble', { timeout: 5000 });
    await page.waitForTimeout(900);
  });
  await screen(code, '14-tour-verse', async () => {
    await fresh();
    await menu('book-open-check');
    await page.click('.sheet .pref-row:has(svg.lucide-highlighter)');
    await page.waitForSelector('.tour-bubble');
    await page.click('.tour-btns .btn.primary');
    await page.waitForTimeout(1200);
  });
  await screen(code, '15-audio', async () => {
    await fresh();
    await page.click('.pane-slot.first .listen-fab');
    await page.waitForSelector('.audio-bar');
    await page.click('.audio-bar .audio-btn:has(svg.lucide-sliders-horizontal)');
    await page.waitForSelector('.audio-opts');
    await page.waitForTimeout(400);
  });
  await screen(code, '16-appearance', async () => {
    await page.click('.audio-bar .audio-btn:has(svg.lucide-x)');
    await fresh();
    await menu('palette');
  });
  await screen(code, '17-appearance-2', async () => {
    await page.evaluate(() => document.querySelector('.sheet-body')?.scrollBy(0, 700));
    await page.waitForTimeout(300);
  });
  await screen(code, '18-bookmarks', async () => {
    await fresh();
    await menu('heart');
  });
  await screen(code, '19-search', async () => {
    await fresh();
    await page.click('.pane-slot.first .tb-icon:has(svg.lucide-search)');
    await page.waitForSelector('#search-input');
    await page.fill('#search-input', 'свет');
    await page.waitForTimeout(1500);
  });
  await screen(code, '20-books', async () => {
    await fresh();
    await page.click('.pane-slot.first .tb-ref');
    await page.waitForSelector('.book-cat');
  });
  await screen(code, '21-library', async () => {
    await fresh();
    await prefs('library');
    await page.waitForSelector('.mod-row');
  });
  await screen(code, '22-word', async () => {
    await fresh();
    await page.locator('#v-13-33 .w', { hasText: 'Господь' }).first().click();
    await page.waitForSelector('.word-pop button.wp-item', { timeout: 15000 });
  });
  await screen(code, '23-strong', async () => {
    await page.locator('.word-pop button.wp-item', { hasText: 'H' }).first().click();
    await page.waitForSelector('.entry', { timeout: 15000 });
    await page.waitForTimeout(400);
  });
  await screen(code, '24-verse-image', async () => {
    await fresh();
    await selectVerse();
    await page.click('.pane-slot.first .selection-bar .tb-more');
    await page.click('.menu .menu-item:has(svg.lucide-image)');
    await page.waitForSelector('.vimg-bgs');
    await page.waitForTimeout(800);
  });
  await screen(code, '25-versions', async () => {
    await fresh();
    await prefs('refresh-cw');
    await page.click('.sheet .pref-row:has(svg.lucide-history)');
    await page.waitForSelector('.versions', { timeout: 15000 });
  });
  const s = summary[code];
  log(`\n== ${code}: экранов ${s?.screens || 0}, русских строк: ${s?.ru.size || 0}, проблем с местом: ${s?.over.size || 0}`);
  for (const x of s?.ru || []) log(`   RU   ${x}`);
  for (const x of s?.over || []) log(`   МЕСТО ${x}`);
}
log(`\nошибки страницы: ${errors.length ? errors.slice(0, 10).join(' | ') : 'нет'}`);
await writeFile(path.join(shots, '_report.txt'), report.join('\n'));
await browser.close();
server.close();
