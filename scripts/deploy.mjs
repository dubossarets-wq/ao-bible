// Публикация dist/pwa на GitHub Pages (ветка gh-pages) с архивом версий.
//
// Корень сайта — последняя версия. Каждая сборка дополнительно сохраняется в versions/<метка>/index.html
// (с <base href="../../">, чтобы модули, иконки и service worker брались из корня), а versions.json
// хранит список: метка, дата, описание (тема последнего коммита). Приложение по этому списку
// показывает «Версии приложения» и умеет откатываться. Старые версии не удаляются.
//
// Запуск: npm run deploy  (сначала закоммитьте изменения — их описание попадёт в список версий)
import { execFileSync } from 'node:child_process';
import { cp, mkdir, readFile, writeFile, rm, readdir, mkdtemp } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// AOB_CHANNEL=staging — тестовое приложение: своя сборка и свой репозиторий/сайт
const STAGING = process.env.AOB_CHANNEL === 'staging';
const dist = path.join(root, STAGING ? 'dist/pwa-staging' : 'dist/pwa');
const git = (args, cwd = root) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

const remote = STAGING ? 'https://github.com/dubossarets-wq/ao-bible-staging.git' : git(['remote', 'get-url', 'origin']);
const name = git(['config', 'user.name']);
const email = git(['config', 'user.email']);
// В основном приложении пометка «Тест:» из темы коммита людям не нужна
const notes = process.env.DEPLOY_NOTES || git(['log', '-1', '--format=%s']).replace(STAGING ? /^$/ : /^Тест:\s*/, '');
const { build, date, version } = JSON.parse(await readFile(path.join(dist, 'version.json'), 'utf8'));

const tmp = await mkdtemp(path.join(os.tmpdir(), 'aob-pages-'));
let fresh = false;
try {
  git(['clone', '-q', '--depth', '1', '--branch', 'gh-pages', remote, tmp]);
} catch {
  fresh = true;
  git(['init', '-q', '-b', 'gh-pages'], tmp);
}
for (const [k, v] of [['core.autocrlf', 'false'], ['user.name', name], ['user.email', email]]) git(['config', k, v], tmp);

// Корень: убираем всё, кроме архива версий и .git, и кладём новую сборку
for (const f of await readdir(tmp)) if (!['.git', 'versions', 'versions.json'].includes(f)) await rm(path.join(tmp, f), { recursive: true, force: true });
await cp(dist, tmp, { recursive: true });
await writeFile(path.join(tmp, '.nojekyll'), '');

// Архив этой версии
const html = await readFile(path.join(dist, 'index.html'), 'utf8');
const vdir = path.join(tmp, 'versions', build);
await mkdir(vdir, { recursive: true });
await writeFile(path.join(vdir, 'index.html'), html.replace('<head>', '<head>\n<base href="../../">'));

// Список версий (новые сверху)
const listPath = path.join(tmp, 'versions.json');
const list = existsSync(listPath) ? JSON.parse(await readFile(listPath, 'utf8')) : { versions: [] };
list.versions = [{ build, date, version, notes }, ...list.versions.filter((v) => v.build !== build)];
list.latest = build;
// Экстренное обновление: EMERGENCY=1 npm run deploy — все версии ниже этой обновятся принудительно
if (process.env.EMERGENCY === '1') list.minBuild = build;
await writeFile(listPath, JSON.stringify(list, null, 1));

git(['add', '-A'], tmp);
git(['commit', '-q', '-m', `Версия ${build}: ${notes}`], tmp);
git(['push', '-q', ...(fresh ? ['-f'] : []), remote, 'gh-pages'], tmp);
await rm(tmp, { recursive: true, force: true });
console.log(`${STAGING ? 'ТЕСТ' : 'ОСНОВНОЕ'} — опубликовано: ${build} — ${notes} (всего версий: ${list.versions.length})${list.minBuild === build ? ' · ЭКСТРЕННОЕ' : ''}`);
