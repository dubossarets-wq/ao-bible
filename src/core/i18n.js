// Язык интерфейса. Ключ перевода — сама русская строка: t('Закладка удалена') → «Bookmark removed».
// Словари — src/i18n/<код>.json { "русская строка": "перевод" }; чего нет в словаре, показывается по-русски.
// В сборке они лежат отдельными файлами i18n/<код>.json (scripts/build.mjs): грузится только выбранный язык,
// приложение не тяжелеет на все языки сразу. Загруженный словарь кладётся в кэш браузера — работает и без интернета.
// Подстановки: t('Закладка: {ref}', { ref }). Вместо {…} можно подставить и элемент React —
// тогда t() вернёт массив (для JSX), а не строку.
// Множественное число — формы через «|» в порядке русских правил «один | несколько | много»:
//   t('{n} глава|{n} главы|{n} глав', { n: 5 }) → «5 глав»; в словаре значение — объект по правилам языка
//   (Intl.PluralRules): { "one": "{n} chapter", "other": "{n} chapters" }.
// Строки вне компонентов (списки, подписи в константах) помечаются N_('…'), а переводятся при показе: t(x.label).
// Одно русское слово в разных смыслах — пояснение после «@@»: t('История@@формат картинки') показывает «История».
// Список ключей и проверка словарей: node scripts/i18n-check.mjs
import { createElement, Fragment, useSyncExternalStore } from 'react';
import { load, save } from './storage.js';
import { P } from './channel.js';

// Порядок — как в списке выбора: сначала языки нашего края, потом самые распространённые.
// name — название на самом языке; flag — код страны для круглого флажка (components/Flag.jsx);
// locale — для дат и чисел (Intl); rtl — письмо справа налево.
export const LANGS = [
  { code: 'ru', name: 'Русский', flag: 'ru', locale: 'ru-RU' },
  { code: 'uk', name: 'Українська', flag: 'ua', locale: 'uk-UA' },
  { code: 'ro', name: 'Română', flag: 'ro', locale: 'ro-RO' },
  { code: 'en', name: 'English', flag: 'gb', locale: 'en-GB' },
  { code: 'es', name: 'Español', flag: 'es', locale: 'es-ES' },
  { code: 'pt', name: 'Português', flag: 'br', locale: 'pt-BR' },
  { code: 'fr', name: 'Français', flag: 'fr', locale: 'fr-FR' },
  { code: 'de', name: 'Deutsch', flag: 'de', locale: 'de-DE' },
  { code: 'it', name: 'Italiano', flag: 'it', locale: 'it-IT' },
  { code: 'pl', name: 'Polski', flag: 'pl', locale: 'pl-PL' },
  { code: 'be', name: 'Беларуская', flag: 'by', locale: 'be-BY' },
  { code: 'bg', name: 'Български', flag: 'bg', locale: 'bg-BG' },
  { code: 'sr', name: 'Српски', flag: 'rs', locale: 'sr-Cyrl-RS' },
  { code: 'cs', name: 'Čeština', flag: 'cz', locale: 'cs-CZ' },
  { code: 'ka', name: 'ქართული', flag: 'ge', locale: 'ka-GE' },
  { code: 'hy', name: 'Հայերեն', flag: 'am', locale: 'hy-AM' },
  { code: 'ko', name: '한국어', flag: 'kr', locale: 'ko-KR' },
  { code: 'zh', name: '中文（简体）', flag: 'cn', locale: 'zh-CN' },
  { code: 'ja', name: '日本語', flag: 'jp', locale: 'ja-JP' },
  { code: 'id', name: 'Bahasa Indonesia', flag: 'id', locale: 'id-ID' },
  { code: 'hi', name: 'हिन्दी', flag: 'in', locale: 'hi-IN' },
  { code: 'sw', name: 'Kiswahili', flag: 'tz', locale: 'sw-TZ' },
];
const BY_CODE = new Map(LANGS.map((l) => [l.code, l]));

// Язык браузера, если он есть среди наших; иначе русский
export function browserLang() {
  const list = navigator.languages?.length ? navigator.languages : [navigator.language || ''];
  for (const tag of list) {
    const code = String(tag).toLowerCase().split(/[-_]/)[0];
    if (BY_CODE.has(code)) return code;
  }
  return 'ru';
}

// Первый запуск — язык браузера. Кто уже пользовался приложением до появления языков, остаётся на русском:
// обновление не должно менять привычный вид. Выбранный язык запоминается сразу.
function initialLang() {
  const saved = load('lang', null);
  if (BY_CODE.has(saved)) return saved;
  let used = false;
  try {
    for (let i = 0; i < localStorage.length; i++) if (localStorage.key(i)?.startsWith(P)) used = true;
  } catch {
    /* хранилище недоступно — считаем первым запуском */
  }
  const code = used ? 'ru' : browserLang();
  save('lang', code);
  return code;
}

let lang = initialLang();
let info = BY_CODE.get(lang);
const dicts = new Map(); // код → словарь (уже загруженные)

const BUILD = typeof __BUILD__ !== 'undefined' ? __BUILD__ : 'dev';
const CACHE = `${P}i18n`; // 'aob.i18n' — свой кэш, service worker его не чистит и сам отдаёт оттуда
// Словарь языка: из кэша браузера (офлайн) или из сети; ?v= — своя версия словаря у каждой сборки
async function fetchDict(code) {
  const url = new URL(`i18n/${code}.json?v=${BUILD}`, document.baseURI).href;
  let cache = null;
  try {
    cache = await caches.open(CACHE);
    const hit = await cache.match(url);
    if (hit) return await hit.json();
  } catch {
    /* Cache API недоступен (не https) — просто из сети */
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`i18n ${code}: ${res.status}`);
  const dict = await res.clone().json();
  try {
    if (cache) {
      // Словари прежних сборок больше не нужны
      for (const req of await cache.keys()) if (!req.url.includes(`?v=${BUILD}`)) await cache.delete(req);
      await cache.put(url, res);
    }
  } catch {
    /* не сохранилось — в следующий раз загрузится снова */
  }
  return dict;
}

async function loadDict(code) {
  if (code === 'ru' || dicts.has(code)) return;
  try {
    dicts.set(code, await fetchDict(code));
  } catch {
    // Нет сети и нет кэша: показываем по-русски, словарь попробуем загрузить в следующий раз
  }
}

// Словарь текущего языка — до первого показа приложения (main.jsx ждёт, но не дольше нескольких секунд)
export const i18nReady = loadDict(lang);
const listeners = new Set();
const plurals = new Map();
const pluralRule = (code) => {
  if (!plurals.has(code)) plurals.set(code, new Intl.PluralRules(BY_CODE.get(code)?.locale || code));
  return plurals.get(code);
};

function applyDocument() {
  const root = document.documentElement;
  root.lang = info.locale; // полный тег: для китайского и японского браузер берёт нужные начертания иероглифов
  root.dir = info.rtl ? 'rtl' : 'ltr';
}
applyDocument();

export const getLang = () => lang;
export const langInfo = (code = lang) => BY_CODE.get(code);
// Локаль для Intl: даты, числа, сравнение строк
export const locale = () => info.locale;

export async function setLang(code) {
  if (!BY_CODE.has(code) || code === lang) return;
  await loadDict(code);
  lang = code;
  info = BY_CODE.get(code);
  save('lang', code);
  applyDocument();
  listeners.forEach((fn) => fn());
}

const subscribe = (fn) => (listeners.add(fn), () => listeners.delete(fn));
// Компонент перерисуется при смене языка. App подписан сам, так что обычным компонентам хук не нужен —
// только тем, что завёрнуты в memo, и тем, что кэшируют подписи в useMemo (тогда lang — в зависимостях).
export const useLang = () => useSyncExternalStore(subscribe, getLang);

// Только пометка для словаря: строка переводится позже, при показе — t(x)
export const N_ = (s) => s;

function pick(key, params) {
  const val = dicts.get(lang)?.[key];
  // «История@@формат картинки» — после @@ пояснение для переводчика (одно русское слово — разные смыслы)
  const at = key.indexOf('@@');
  if (at >= 0) key = key.slice(0, at);
  if (!key.includes('|')) return typeof val === 'string' && val ? val : key;
  // Множественное число: число — в params.n
  const n = Math.abs(Number(params?.n) || 0);
  if (val && typeof val === 'object') {
    const cat = pluralRule(lang).select(n);
    const s = val[cat] ?? val.other ?? val.many ?? val.one;
    if (s) return s;
  }
  const forms = key.split('|');
  const cat = pluralRule('ru').select(n);
  return forms[cat === 'one' ? 0 : cat === 'many' ? 2 : 1] ?? forms[forms.length - 1];
}

export function t(key, params) {
  const s = pick(key, params);
  if (!params) return s;
  let rich = false;
  for (const k in params) if (params[k] != null && typeof params[k] === 'object') rich = true;
  if (!rich) return s.replace(/\{(\w+)\}/g, (m, k) => (params[k] != null ? String(params[k]) : m));
  // Есть элементы React: возвращаем кусочки текста и элементы вперемешку
  return s.split(/(\{\w+\})/).map((part, i) => {
    const k = /^\{(\w+)\}$/.exec(part)?.[1];
    return k && k in params ? createElement(Fragment, { key: i }, params[k]) : part;
  });
}

// Даты и числа — в формате текущего языка
export const fmtDate = (d, opts) => new Date(d).toLocaleDateString(info.locale, opts);
export const fmtDateTime = (d, opts) => new Date(d).toLocaleString(info.locale, opts);
export const fmtNum = (n) => (n == null ? '' : Number(n).toLocaleString(info.locale));
