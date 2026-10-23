// Выпуск: npm run deploy:staging — в тестовое приложение (сначала всегда сюда);
//         npm run deploy          — в основное, после проверки в тестовом.
// Каждый канал собирается со своим именем, иконкой и хранилищем данных (см. src/core/channel.js).
import { execFileSync, spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const channel = process.argv[2] === 'prod' ? 'prod' : 'staging';
const env = { ...process.env, AOB_CHANNEL: channel };
const run = (file) => execFileSync(process.execPath, [path.join(root, 'scripts', file)], { cwd: root, env, stdio: 'inherit' });

// Сначала smoke-тест на свежей сборке (он проверяет основной канал): при любой ошибке выкладки нет
const MIN_OK = 97;
execFileSync(process.execPath, [path.join(root, 'scripts', 'build.mjs')], { cwd: root, env: { ...process.env, AOB_CHANNEL: 'prod' }, stdio: 'inherit' });
console.log('smoke-тест…');
const smoke = spawnSync(process.execPath, [path.join(root, 'scripts', 'smoke-test.mjs')], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const report = `${smoke.stdout || ''}${smoke.stderr || ''}`;
writeFileSync(path.join(root, 'smoke.txt'), report);
const ok = (report.match(/^OK/gm) || []).length;
const fails = report.split(/\r?\n/).filter((l) => l.startsWith('FAIL'));
if (smoke.status !== 0 || fails.length || ok < MIN_OK) {
  console.error(`ВЫКЛАДКА ОТМЕНЕНА: smoke — OK ${ok} из ${MIN_OK}, ошибок ${fails.length}`);
  for (const l of fails.slice(0, 10)) console.error(l);
  process.exit(1);
}
console.log(`smoke: OK ${ok}, ошибок нет`);

run('build.mjs');
run('deploy.mjs');
// Основная версия — ещё и на домен aobible.app (сайт приложения из Google Play)
if (channel === 'prod') execFileSync(process.execPath, [path.join(root, 'scripts', 'deploy.mjs')], { cwd: root, env: { ...env, AOB_SITE: 'app' }, stdio: 'inherit' });
