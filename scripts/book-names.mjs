// Родные названия книг и слово «Глава» — в сами модули переводов (поля books[].nname и chapterWord / psalmWord).
// Приложение показывает над текстом название книги и «Глава N» из модуля: у греческого перевода — греческие, у английского —
// английские. Нет поля — показываются русские названия (name) и «Глава». Веб-версия новые поля не читает.
//
// Откуда названия: book-names.json — из открытых переводов bible.helloao.org на этом языке (собирает tool/book_names_helloao.py
// репозитория приложения); chapter-words.json — «Глава %d» / «Псалом %d» из переводов самого приложения (остальные —
// список _manual). Скрипт идемпотентен: у модуля, где поля уже есть и версия помечена, ничего не меняет.
// Файлы public/modules не лежат в git (это результат сборки), поэтому скрипт запускается при каждой сборке (build.mjs).
//
//   node scripts/book-names.mjs          — дописать в public/modules и обновить catalog.json
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
/** Метка в version каталога: приложения видят новую версию и предлагают «Обновить» */
export const NAMES_REV = '+names1';

/** Языки, названия которых не годятся для модуля (другая письменность или форма в источнике) */
const SKIP_LANG = new Set(['ru', 'cu', 'bg', 'la', 'syr', 'hy', 'sq', 'lv', 'ka']);
const SKIP_ID = new Set(['cornilescu-cyr']);
/** Язык модуля → язык таблицы (современный греческий — греческие названия) */
const LANG_ALIAS = { el: 'grc' };

/** backupDir — куда сложить прежние файлы перед перезаписью (модули не в git, вернуть их иначе нечем) */
export async function applyBookNames(modulesDir, backupDir = process.env.BOOK_NAMES_BACKUP) {
  const keep = async (name) => {
    if (!backupDir) return;
    await mkdir(backupDir, { recursive: true });
    await copyFile(path.join(modulesDir, name), path.join(backupDir, name)).catch(() => {});
  };
  const names = JSON.parse(await readFile(path.join(here, 'book-names.json'), 'utf8'));
  const words = JSON.parse(await readFile(path.join(here, 'chapter-words.json'), 'utf8'));
  const catPath = path.join(modulesDir, 'catalog.json');
  const cat = JSON.parse(await readFile(catPath, 'utf8'));
  let changed = 0;
  for (const e of cat.modules) {
    if (e.type !== 'bible' || !e.url || e.unavailable) continue;
    const lang = String(e.language || '').split('-')[0];
    const table = names[LANG_ALIAS[lang] || lang];
    if (SKIP_LANG.has(lang) || SKIP_ID.has(e.id) || !table) continue;
    const file = path.join(modulesDir, e.url);
    let raw;
    try { raw = await readFile(file, 'utf8'); } catch { continue; }
    const m = JSON.parse(raw);
    if (!Array.isArray(m.books)) continue;
    const w = words[LANG_ALIAS[lang] || lang] || words[lang];
    let n = 0;
    for (const b of m.books) {
      const nn = table[b.id];
      if (nn && b.nname !== nn) { b.nname = nn; n++; }
      else if (!nn && b.nname) { delete b.nname; n++; }
    }
    if (w && (m.chapterWord !== w[0] || m.psalmWord !== w[1])) { m.chapterWord = w[0]; m.psalmWord = w[1]; n++; }
    const marked = String(e.version || '').endsWith(NAMES_REV);
    if (!n && marked) continue;
    const out = JSON.stringify(m);
    const buf = Buffer.from(out, 'utf8');
    const gz = gzipSync(buf, { level: 9 });
    await keep(e.url);
    if (e.urlGz) await keep(e.urlGz);
    await writeFile(file, buf);
    if (e.urlGz) await writeFile(path.join(modulesDir, e.urlGz), gz);
    e.size = buf.length;
    if (e.urlGz) e.sizeGz = gz.length;
    if (!marked) e.version = String(e.version || '') + NAMES_REV;
    changed++;
  }
  if (changed) {
    await keep('catalog.json');
    await writeFile(catPath, JSON.stringify(cat, null, 1));
  }
  return changed;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dir = path.join(here, '..', 'public', 'modules');
  console.log(`book-names: изменено модулей ${await applyBookNames(dir)}`);
}
