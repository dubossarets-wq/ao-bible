// Выпуск: npm run deploy:staging — в тестовое приложение (сначала всегда сюда);
//         npm run deploy          — в основное, после проверки в тестовом.
// Каждый канал собирается со своим именем, иконкой и хранилищем данных (см. src/core/channel.js).
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const channel = process.argv[2] === 'prod' ? 'prod' : 'staging';
const env = { ...process.env, AOB_CHANNEL: channel };
const run = (file) => execFileSync(process.execPath, [path.join(root, 'scripts', file)], { cwd: root, env, stdio: 'inherit' });

run('build.mjs');
run('deploy.mjs');
// Основная версия — ещё и на домен aobible.app (сайт приложения из Google Play)
if (channel === 'prod') execFileSync(process.execPath, [path.join(root, 'scripts', 'deploy.mjs')], { cwd: root, env: { ...env, AOB_SITE: 'app' }, stdio: 'inherit' });
