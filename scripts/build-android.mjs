// Сборка приложения для Google Play (Capacitor): node scripts/build-android.mjs [versionName]
// 1) основная сборка + версия для приложения (dist/app); 2) cap sync; 3) Gradle: .aab (в Play) и .apk (на телефон).
// Инструменты и ключ — в G:\android-build (Java 21, Android SDK, keys/); результат — G:\android-build\out\.
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TOOLS = process.env.AOB_ANDROID_TOOLS || 'G:/android-build';
const JDK = `${TOOLS}/jdk21/jdk-21.0.12.1+1`;
const SDK = `${TOOLS}/sdk`;
const KEY = `${TOOLS}/keys/aobible-upload.jks`;
const versionName = process.argv[2] || '1.0';
// Номер версии для Play растёт каждую минуту: 30 000 000 + минуты с 1.1.2026 (UTC).
// Больше прежних номеров вида ГГММДДЧЧ (26102210) и не повторяется, даже если собирать дважды за час.
const versionCode = String(process.env.AOB_VERSION_CODE || 30000000 + Math.floor((Date.now() - Date.UTC(2026, 0, 1)) / 60000));
const env = {
  ...process.env,
  AOB_CHANNEL: 'prod',
  AOB_APP: '1',
  JAVA_HOME: JDK,
  ANDROID_HOME: SDK,
  ANDROID_SDK_ROOT: SDK,
  GRADLE_USER_HOME: `${TOOLS}/gradle-home`, // кэш Gradle — на диске E (на C мало места)
  AOB_KEYSTORE: KEY,
  AOB_KEY_PASS: readFileSync(`${TOOLS}/keys/password.txt`, 'utf8').trim(),
  AOB_VERSION_CODE: versionCode,
  AOB_VERSION_NAME: versionName,
};
const run = (cmd, args, cwd = root) => execFileSync(cmd, args, { cwd, env, stdio: 'inherit' });
// .bat и npx на Windows — через cmd /c из нужной папки (в путях есть пробелы)
const sh = (args, cwd = root) => (process.platform === 'win32' ? run('cmd.exe', ['/c', ...args], cwd) : run(args[0], args.slice(1), cwd));

run(process.execPath, [path.join(root, 'scripts/build.mjs')]);
writeFileSync(path.join(root, 'android/local.properties'), `sdk.dir=${SDK.split(path.sep).join('/')}\n`);
sh(['npx', 'cap', 'sync', 'android']);
sh([process.platform === 'win32' ? '.' + path.sep + 'gradlew.bat' : './gradlew', 'bundleRelease', 'assembleRelease', '--no-daemon'], path.join(root, 'android'));

const out = `${TOOLS}/out`;
mkdirSync(out, { recursive: true });
const name = `aobible-${versionName}-${versionCode}`;
copyFileSync(path.join(root, 'android/app/build/outputs/bundle/release/app-release.aab'), `${out}/${name}.aab`);
copyFileSync(path.join(root, 'android/app/build/outputs/apk/release/app-release.apk'), `${out}/${name}.apk`);
console.log(`ГОТОВО: ${out}/${name}.aab (в Google Play) и .apk (поставить на телефон), versionCode ${versionCode}`);
