// Проверка и нормализация модулей. Формат описан в docs/MODULE_SCHEMA.md.
// Принимает родной формат aob-module и несколько распространённых JSON-форматов,
// автоматически определяя тип модуля.
import { BOOKS, findBookId, bookMeta } from './books.js';

export const MODULE_TYPES = {
  bible: 'Перевод Библии',
  commentary: 'Комментарий',
  dictionary: 'Словарь',
  maps: 'Карты',
  crossrefs: 'Параллельные места',
};

// Разделы библиотеки (множественное число) в порядке показа
export const MODULE_SECTIONS = [
  ['bible', 'Переводы'],
  ['commentary', 'Комментарии'],
  ['dictionary', 'Словари'],
  ['maps', 'Карты'],
  ['crossrefs', 'Параллельные места'],
];

const OSIS_VERSE = /^[1-4]?[A-Za-z]+\.\d+\.\d+(-(\d+\.)?\d+)?$/;

// Порядок книг в западных (протестантских) изданиях — для форматов, где книга задана номером.
const WESTERN_ORDER = [
  'Gen', 'Exod', 'Lev', 'Num', 'Deut', 'Josh', 'Judg', 'Ruth', '1Sam', '2Sam', '1Kgs', '2Kgs', '1Chr', '2Chr',
  'Ezra', 'Neh', 'Esth', 'Job', 'Ps', 'Prov', 'Eccl', 'Song', 'Isa', 'Jer', 'Lam', 'Ezek', 'Dan', 'Hos', 'Joel',
  'Amos', 'Obad', 'Jonah', 'Mic', 'Nah', 'Hab', 'Zeph', 'Hag', 'Zech', 'Mal', 'Matt', 'Mark', 'Luke', 'John',
  'Acts', 'Rom', '1Cor', '2Cor', 'Gal', 'Eph', 'Phil', 'Col', '1Thess', '2Thess', '1Tim', '2Tim', 'Titus', 'Phlm',
  'Heb', 'Jas', '1Pet', '2Pet', '1John', '2John', '3John', 'Jude', 'Rev',
];

export class ModuleError extends Error {}

const isObj = (x) => x && typeof x === 'object' && !Array.isArray(x);
const slug = (s) =>
  String(s || 'module')
    .toLowerCase()
    .replace(/[^a-z0-9а-яё]+/gi, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48) || 'module';

function resolveBook(b, index) {
  if (typeof b === 'number') return WESTERN_ORDER[b - 1] || null;
  if (typeof b === 'string') {
    if (/^\d+$/.test(b)) return WESTERN_ORDER[+b - 1] || null;
    return BOOKS.some((x) => x.id === b) ? b : findBookId(b);
  }
  return index != null ? WESTERN_ORDER[index] : null;
}

function verseText(v) {
  if (typeof v === 'string') return v;
  if (isObj(v)) return String(v.text ?? v.t ?? '');
  return v == null ? '' : String(v);
}

// --- Определение формата ---------------------------------------------------------------

export function detect(json) {
  if (isObj(json) && json.format === 'aob-module') return { format: 'aob', type: json.type };
  if (isObj(json) && json.format === 'aob-catalog') return { format: 'catalog', type: null };
  if (Array.isArray(json) && json.length && isObj(json[0]) && Array.isArray(json[0].chapters))
    return { format: 'books-array', type: 'bible' };
  const flat = Array.isArray(json) ? json : isObj(json) && Array.isArray(json.verses) ? json.verses : null;
  if (flat && flat.length && isObj(flat[0]) && 'chapter' in flat[0] && 'verse' in flat[0] && 'text' in flat[0])
    return { format: 'flat-verses', type: 'bible' };
  if (isObj(json) && Array.isArray(json.books)) return { format: 'aob', type: 'bible' };
  if (isObj(json) && isObj(json.entries)) {
    const keys = Object.keys(json.entries).slice(0, 20);
    return { format: 'aob', type: keys.length && keys.every((k) => OSIS_VERSE.test(k)) ? 'commentary' : 'dictionary' };
  }
  if (isObj(json) && isObj(json.refs)) return { format: 'aob', type: 'crossrefs' };
  if (isObj(json) && (Array.isArray(json.maps) || Array.isArray(json.places))) return { format: 'aob', type: 'maps' };
  if (isObj(json)) {
    const keys = Object.keys(json).slice(0, 50);
    if (keys.length && keys.every((k) => /^[HG]\d+[a-z]?$/i.test(k))) return { format: 'strongs-map', type: 'dictionary' };
  }
  const arr = Array.isArray(json) ? json : null;
  if (arr && arr.length && isObj(arr[0]) && (arr[0].word || arr[0].term || arr[0].topic) && (arr[0].definition || arr[0].text || arr[0].description))
    return { format: 'word-list', type: 'dictionary' };
  return { format: null, type: null };
}

// --- Нормализация ----------------------------------------------------------------------

export function normalize(json, { fileName = '' } = {}) {
  const { format, type } = detect(json);
  if (format === 'catalog') throw new ModuleError('Это файл каталога, а не модуль. Откройте его во вкладке «Онлайн-каталог».');
  if (!format || !type) {
    throw new ModuleError(
      'Не удалось определить тип модуля. Нужен JSON в формате aob-module (поле "format": "aob-module") ' +
        'или один из поддерживаемых форматов: массив книг с "chapters", список стихов {book, chapter, verse, text}, ' +
        'словарь {"H1": {...}} или список статей [{word, definition}].'
    );
  }
  const baseName = fileName.replace(/\.(json|gz)+$/i, '');
  const src = isObj(json) ? json : {};
  const meta = {
    id: slug(src.id || baseName || src.name),
    type,
    name: String(src.name || src.abbreviation || baseName || 'Без названия').slice(0, 40),
    title: src.title || src.name || baseName || '',
    description: src.description || '',
    language: src.language || src.lang || 'ru',
    version: src.version ? String(src.version) : '',
    author: src.author || '',
    source: src.source || (fileName ? `Файл ${fileName}` : ''),
    license: src.license || 'не указана',
    versification: src.versification || 'synodal',
    features: isObj(src.features) ? src.features : {},
  };
  if (type === 'dictionary') meta.dictionaryKind = src.dictionaryKind || (format === 'strongs-map' ? 'strongs' : 'words');

  const warnings = [];
  let data;
  if (type === 'bible') data = normalizeBible(json, format, warnings);
  else if (type === 'dictionary') data = normalizeDictionary(json, format, meta, warnings);
  else if (type === 'crossrefs') data = normalizeCrossrefs(json, warnings);
  else if (type === 'commentary') data = normalizeCommentary(json, warnings);
  else if (type === 'maps') data = normalizeMaps(json, warnings);
  else throw new ModuleError(`Неизвестный тип модуля «${type}». Допустимы: bible, commentary, dictionary, maps, crossrefs.`);

  if (type === 'bible') {
    meta.books = data.books.map((b) => ({
      id: b.id,
      name: b.name,
      short: b.short,
      t: b.t,
      verses: b.chapters.map((c) => c.length),
    }));
    if (meta.features.strongs == null) meta.features.strongs = data.books.some((b) => b.chapters.some((c) => c.some((v) => v.includes('{'))));
    meta.stats = { books: data.books.length, verses: data.books.reduce((n, b) => n + b.chapters.reduce((m, c) => m + c.length, 0), 0) };
  }
  if (type === 'dictionary') meta.stats = { entries: Object.keys(data.entries).length };
  if (type === 'crossrefs') meta.stats = { verses: Object.keys(data.refs).length };
  if (type === 'commentary') meta.stats = { entries: Object.keys(data.entries).length };
  if (type === 'maps') meta.stats = { maps: data.maps.length, places: data.places.length };
  return { meta, data, warnings };
}

function normalizeBible(json, format, warnings) {
  const books = [];
  const push = (id, src, chapters) => {
    const m = bookMeta(id);
    books.push({
      id,
      name: (src && src.name) || m.name,
      short: (src && src.short) || m.short,
      t: (src && ['OT', 'NT', 'AP'].includes(src.t) && src.t) || (m.order < 999 ? m.t : 'AP'),
      chapters,
      headings: (src && isObj(src.headings) && src.headings) || {},
      xrefs: (src && isObj(src.xrefs) && src.xrefs) || {},
    });
  };

  if (format === 'aob' || format === 'books-array') {
    const list = format === 'aob' ? json.books : json;
    if (!Array.isArray(list) || !list.length) throw new ModuleError('В модуле нет книг (поле "books" пустое).');
    list.forEach((b, i) => {
      const raw = b.id ?? b.osis;
      let id = resolveBook(raw ?? b.name ?? b.abbrev, raw || b.name ? null : i);
      // Книга вне справочника (апокрифы): берём её код как есть, если у неё есть название
      if (!id && typeof raw === 'string' && /^[0-9A-Za-z]{2,12}$/.test(raw) && b.name) id = raw;
      // Совсем без опознаваемого кода — по порядку протестантского канона (форматы вида [{abbrev:"gn", chapters}])
      if (!id && !raw && !b.name) id = resolveBook(null, i);
      if (!id && format === 'books-array' && !raw) id = resolveBook(null, i);
      if (!id) return warnings.push(`Книга №${i + 1} («${b.name || b.id || b.abbrev || '?'}») не распознана и пропущена.`);
      if (!Array.isArray(b.chapters)) return warnings.push(`У книги ${id} нет массива "chapters" — пропущена.`);
      push(id, b, b.chapters.map((c) => (Array.isArray(c) ? c.map(verseText) : [])));
    });
  } else if (format === 'flat-verses') {
    const list = Array.isArray(json) ? json : json.verses;
    const map = new Map();
    let skipped = 0;
    for (const v of list) {
      const id = resolveBook(v.book ?? v.book_id ?? v.bookId ?? v.book_name);
      if (!id || !(v.chapter > 0) || !(v.verse > 0)) {
        skipped++;
        continue;
      }
      if (!map.has(id)) map.set(id, []);
      const chs = map.get(id);
      while (chs.length < v.chapter) chs.push([]);
      const ch = chs[v.chapter - 1];
      while (ch.length < v.verse) ch.push('');
      ch[v.verse - 1] = String(v.text);
    }
    if (skipped) warnings.push(`Пропущено записей без распознанной книги/главы/стиха: ${skipped}.`);
    const order = BOOKS.map((b) => b.id);
    [...map.keys()].sort((a, b) => order.indexOf(a) - order.indexOf(b)).forEach((id) => push(id, null, map.get(id)));
  }
  if (!books.length) throw new ModuleError('Не найдено ни одной распознанной книги.');
  const seen = new Set();
  for (const b of books) {
    if (seen.has(b.id)) throw new ModuleError(`Книга ${b.id} встречается в модуле дважды.`);
    seen.add(b.id);
    if (!b.chapters.length) warnings.push(`В книге ${b.name} нет глав.`);
  }
  return { books };
}

function normalizeDictionary(json, format, meta, warnings) {
  let entries = {};
  if (format === 'strongs-map') entries = json;
  else if (format === 'word-list') {
    for (const e of json) {
      const word = String(e.word || e.term || e.topic || '').trim();
      if (!word) continue;
      const key = word.toLowerCase().replace(/ё/g, 'е');
      entries[key] = { word, text: String(e.definition || e.text || e.description || ''), refs: Array.isArray(e.refs) ? e.refs : [] };
    }
  } else entries = json.entries;
  if (!isObj(entries) || !Object.keys(entries).length) throw new ModuleError('В словаре нет статей (поле "entries" пустое).');

  if (meta.dictionaryKind === 'strongs') {
    const bad = Object.keys(entries).filter((k) => !/^[HG]\d+[a-z]?$/i.test(k));
    if (bad.length) warnings.push(`Ключи не похожи на номера Стронга и не будут найдены: ${bad.slice(0, 5).join(', ')}${bad.length > 5 ? '…' : ''}`);
  } else {
    // Ключи словаря по словам приводим к нижнему регистру для поиска.
    const norm = {};
    for (const [k, v] of Object.entries(entries)) {
      const e = isObj(v) ? v : { text: String(v) };
      norm[k.toLowerCase().replace(/ё/g, 'е')] = { word: e.word || k, ...e };
    }
    entries = norm;
  }
  const out = { entries };
  if (isObj(json.wordIndex)) out.wordIndex = json.wordIndex;
  return out;
}

// Комментарий: entries {"Josh.13.33": "текст" | {title, text}}, ключ — стих или диапазон «Josh.13.1-5»
function normalizeCommentary(json, warnings) {
  if (!isObj(json.entries)) throw new ModuleError('В комментарии нет поля "entries" вида {"Gen.1.1": "текст"}.');
  const entries = {};
  let bad = 0;
  for (const [k, v] of Object.entries(json.entries)) {
    if (!OSIS_VERSE.test(k)) {
      bad++;
      continue;
    }
    const e = isObj(v) ? { title: v.title ? String(v.title) : '', text: String(v.text ?? '') } : { text: String(v) };
    if (e.text.trim()) entries[k] = e;
  }
  if (bad) warnings.push(`Пропущено статей с ключом не в формате "Книга.глава.стих": ${bad}.`);
  if (!Object.keys(entries).length) throw new ModuleError('В комментарии нет ни одной статьи с ключом вида "Gen.1.1".');
  return { entries };
}

// Карты: maps [{id, title, description, image (https:// или data:), refs}]
// Карты: maps [{id, title, description, image, refs}] — изображения (https://, data:image/ или путь на сайте),
// и/или places [{id, name, lat, lng, refs, stems, …}] — места с координатами для карты одного места.
function normalizeMaps(json, warnings) {
  const maps = [];
  (Array.isArray(json.maps) ? json.maps : []).forEach((m, i) => {
    const img = isObj(m) && typeof m.image === 'string' ? m.image.trim() : '';
    const ok = /^(https?:|data:image\/)/.test(img) || (/^[\w./-]+\.(jpe?g|png|webp|gif|svg)$/i.test(img) && !img.includes('..'));
    if (!ok) {
      warnings.push(`Карта №${i + 1} пропущена: нет поля "image" (адрес, data:image или путь к картинке).`);
      return;
    }
    maps.push({ id: String(m.id || i + 1), title: String(m.title || `Карта ${i + 1}`), description: String(m.description || ''), image: img, refs: Array.isArray(m.refs) ? m.refs.map(String) : [] });
  });
  const places = [];
  let bad = 0;
  (Array.isArray(json.places) ? json.places : []).forEach((p) => {
    const lat = Number(p?.lat);
    const lng = Number(p?.lng ?? p?.lon);
    if (!isObj(p) || !p.name || !isFinite(lat) || !isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      bad++;
      return;
    }
    places.push({
      ...p,
      id: String(p.id || p.name),
      name: String(p.name),
      lat,
      lng,
      refs: Array.isArray(p.refs) ? p.refs.map(String) : [],
      stems: Array.isArray(p.stems) && p.stems.length ? p.stems.map(String) : placeStems(String(p.name)),
    });
  });
  if (bad) warnings.push(`Пропущено мест без названия или координат: ${bad}.`);
  if (!maps.length && !places.length) throw new ModuleError('В модуле карт нет ни карт с изображением, ни мест с координатами.');
  return { maps, places };
}

// Основы названия места для поиска в стихе: «Вифлеем» → «вифл», «Гора Мориа» → «мор»
export function placeStems(name) {
  const skip = ['гора', 'река', 'море', 'поток', 'долина', 'пустыня', 'земля', 'город', 'страна'];
  let words = name.toLowerCase().replace(/ё/g, 'е').split(/[\s\-–(),]+/).filter((w) => w.length >= 3);
  words = words.filter((w) => !skip.includes(w)).length ? words.filter((w) => !skip.includes(w)) : words;
  return [...new Set(words.map((w) => w.slice(0, Math.max(3, Math.min(w.length - 2, 5)))))];
}

function normalizeCrossrefs(json) {
  const refs = {};
  for (const [k, v] of Object.entries(json.refs)) {
    if (Array.isArray(v) && /^[1-3]?[A-Za-z]+\.\d+\.\d+$/.test(k)) refs[k] = v.map(String);
  }
  if (!Object.keys(refs).length) throw new ModuleError('В модуле нет ссылок вида "Gen.1.1": ["John.1.1", …].');
  return { refs };
}

// --- Распаковка ------------------------------------------------------------------------

export async function bytesToJson(buffer, onStage) {
  let bytes = new Uint8Array(buffer);
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
    if (typeof DecompressionStream === 'undefined') throw new ModuleError('Браузер не умеет распаковывать .gz. Загрузите несжатый .json.');
    onStage?.('Распаковка…');
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  }
  onStage?.('Разбор JSON…');
  await new Promise((r) => setTimeout(r, 0));
  const text = new TextDecoder('utf-8').decode(bytes);
  try {
    return JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
  } catch (e) {
    throw new ModuleError(`Файл не является корректным JSON: ${e.message}`);
  }
}
