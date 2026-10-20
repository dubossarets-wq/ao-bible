// Проигрыватель «аудиокниги» с привязкой к стихам.
// Два источника: синтез речи браузера (любой перевод, офлайн) и аудиомодули — записи глав с разметкой
// времени начала стихов (type: 'audio'). Текущий стих сообщается подписчикам: панель чтения подсвечивает
// его и прокручивает текст. Состояние — отдельное хранилище, чтобы не перерисовывать всё приложение.
import { useSyncExternalStore } from 'react';
import { getBook, getPayload, listModules, getModule } from './modules.js';
import { plainText } from './verseMarkup.js';
import { load, save } from './storage.js';
import { playableUrl } from './offlineAudio.js';
import { t } from './i18n.js';

const LANG = { ru: 'ru-RU', en: 'en-US', uk: 'uk-UA', cu: 'ru-RU', he: 'he-IL', grc: 'el-GR' };

let state = {
  active: false, playing: false, pane: 0, moduleId: null, ref: null, source: 'tts', rate: load('audioRate', 1),
  sleep: null, // { kind: 'min', until } | { kind: 'chapter', chapter }
  error: null, loading: false,
  follow: true, // текст идёт за чтецом; человек ушёл читать другое место — false, запись играет дальше
};
const subs = new Set();
const set = (patch) => {
  state = { ...state, ...patch };
  subs.forEach((f) => f());
};
export const useAudio = () =>
  useSyncExternalStore(
    (f) => (subs.add(f), () => subs.delete(f)),
    () => state
  );
export const audioState = () => state;

let el = null; // HTMLAudioElement
let timing = null; // { key, verses } текущей главы аудиомодуля
let loadedUrl = null; // какая запись загружена в <audio> (исходный адрес)
let blobUrl = null; // скачанная запись играет из памяти через blob:
let sleepTimer = null;
let gen = 0; // поколение воспроизведения: старые колбэки синтеза игнорируются

// --- Источники ---------------------------------------------------------------------------

export async function audioSourcesFor(moduleId, ref) {
  const mods = (await listModules()).filter((m) => m.type === 'audio' && m.enabled !== false);
  const key = `${ref.book}.${ref.chapter}`;
  const fits = mods.filter((m) => (!m.translation || m.translation === moduleId || sameText(m.translation, moduleId)) && (m.chapterKeys || []).includes(key));
  const others = mods.filter((m) => !fits.includes(m) && (m.chapterKeys || []).includes(key));
  return { recorded: fits, otherRecorded: others, tts: typeof speechSynthesis !== 'undefined' };
}
// Подходит ли аудиокнига (её translation) к переводу bibleId
export const fitsTranslation = (translation, bibleId) => !translation || translation === bibleId || sameText(translation, bibleId);
// Синодальный с разметкой и без — один и тот же текст
const sameText = (a, b) => new Set(['rst', 'rst-plus', 'rst-dc']).has(a) && new Set(['rst', 'rst-plus', 'rst-dc']).has(b);

// --- Управление --------------------------------------------------------------------------

// offerTts — предложить ИИ-диктора (синтез речи), если записи нет
export function showAudioMessage({ pane, moduleId, ref, error, offerTts = false }) {
  stopEngines();
  set({ active: true, playing: false, pane, moduleId, ref: { ...ref }, source: 'none', error, offerTts });
}

// Человек сам перешёл в другое место: текст больше не тянем за чтецом
export function detachFollow(pane) {
  if (state.active && state.follow && state.pane === pane) set({ follow: false });
}
export function resumeFollow() {
  if (state.active && !state.follow) set({ follow: true });
}

export async function startAudio({ pane, moduleId, ref, source }) {
  stopEngines();
  const src = source || state.source || 'tts';
  set({ active: true, pane, moduleId, ref: { ...ref }, source: src, error: null, offerTts: false, playing: true, follow: true });
  await playFrom(ref);
}

export function pauseAudio() {
  gen++;
  if (state.source === 'tts') speechSynthesis.cancel();
  else el?.pause();
  set({ playing: false });
}

export async function resumeAudio() {
  if (!state.active || !state.ref) return;
  set({ playing: true });
  if (state.source !== 'tts' && el && el.src && timing?.key === `${state.ref.book}.${state.ref.chapter}`) {
    el.play().catch((e) => set({ playing: false, error: playError(e) }));
  } else await playFrom(state.ref);
}

export function stopAudio() {
  stopEngines();
  clearTimeout(sleepTimer);
  set({ active: false, playing: false, sleep: null, ref: null, error: null });
}

export async function stepVerse(dir) {
  resumeFollow();
  if (!state.ref) return;
  const next = await neighbourVerse(state.moduleId, state.ref, dir);
  if (!next) return;
  stopEngines();
  set({ ref: next, playing: true });
  await playFrom(next);
}

// Слушать с выбранного стиха (нажатие на стих в раскрытом проигрывателе) — так же, как ⏮/⏭:
// запись перематывается к началу стиха по разметке времени, ИИ-диктор начинает читать этот стих
export async function playVerse(ref) {
  resumeFollow();
  if (!state.active || !ref) return;
  stopEngines();
  set({ ref: { book: ref.book, chapter: ref.chapter, verse: ref.verse }, playing: true, error: null });
  await playFrom(state.ref);
}

// --- Время записи: отдельная подписка, обновляется несколько раз в секунду --------------------
// pos/len — секунды от начала главы и её длина (в общем файле на несколько глав — только своя глава)
const timeSubs = new Set();
let timeSnap = { pos: 0, len: 0 };
function chapterSpan() {
  if (!el || !timing || state.source === 'tts' || state.source === 'none') return null;
  const shared = timing.end != null;
  const start = shared ? timing.start ?? 0 : 0;
  const end = shared ? timing.end : Number.isFinite(el.duration) ? el.duration : 0;
  return { start, len: Math.max(0, end - start) };
}
function emitTime() {
  const s = chapterSpan();
  const next = s ? { pos: Math.max(0, Math.min(s.len || Infinity, el.currentTime - s.start)), len: s.len } : { pos: 0, len: 0 };
  if (next.pos === timeSnap.pos && next.len === timeSnap.len) return;
  timeSnap = next;
  timeSubs.forEach((f) => f());
}
export const useAudioTime = () =>
  useSyncExternalStore(
    (f) => (timeSubs.add(f), () => timeSubs.delete(f)),
    () => timeSnap
  );
// Перемотка внутри главы: sec — секунды от начала главы. Текущий стих обновится по разметке (onTime)
export function seekChapter(sec) {
  const s = chapterSpan();
  if (!s) return;
  resumeFollow();
  try {
    el.currentTime = s.start + Math.max(0, Math.min(s.len, sec));
  } catch {
    /* перемотка не удалась */
  }
  emitTime();
}

// --- Громкость ---------------------------------------------------------------------------
// На iOS громкость элемента <audio> меняется только кнопками телефона: свойство volume всегда 1
let volume = Math.max(0, Math.min(1, +load('audioVolume', 1) || 0));
let volumeOk = null;
export function canSetVolume() {
  if (volumeOk == null) {
    try {
      const probe = new Audio();
      probe.volume = 0.5;
      volumeOk = Math.abs(probe.volume - 0.5) < 0.01;
    } catch {
      volumeOk = false;
    }
  }
  return volumeOk;
}
export function setVolume(v) {
  volume = Math.max(0, Math.min(1, +v || 0));
  if (el) el.volume = volume;
}

export function setRate(rate) {
  save('audioRate', rate);
  set({ rate });
  if (el) el.playbackRate = rate;
  if (state.source === 'tts' && state.playing && state.ref) {
    stopEngines();
    playFrom(state.ref);
  }
}

export async function setSource(source) {
  save('audioSource', source); // выбор человека запоминается
  const ref = state.ref;
  stopEngines();
  set({ source, error: null });
  if (state.active && ref) {
    set({ playing: true });
    await playFrom(ref);
  }
}

export function setSleep(kind, minutes) {
  clearTimeout(sleepTimer);
  if (!kind) return set({ sleep: null });
  if (kind === 'min') {
    const until = Date.now() + minutes * 60000;
    sleepTimer = setTimeout(() => {
      pauseAudio();
      set({ sleep: null });
    }, minutes * 60000);
    set({ sleep: { kind, until, minutes } });
  } else set({ sleep: { kind: 'chapter', chapter: state.ref?.chapter, book: state.ref?.book } });
}

// --- Внутреннее ----------------------------------------------------------------------------

function stopEngines() {
  gen++;
  try {
    speechSynthesis?.cancel();
  } catch {
    /* нет синтеза */
  }
  if (el) el.pause();
}

const playError = (e) =>
  e?.name === 'NotAllowedError'
    ? t('Нажмите ▶')
    : !navigator.onLine
      ? t('Нет интернета. Чтобы слушать без сети, скачайте книгу заранее: Настройки → «Аудио».')
      : t('Не удалось воспроизвести запись');

async function neighbourVerse(moduleId, ref, dir) {
  const mod = await getModule(moduleId);
  const book = await getBook(moduleId, ref.book);
  if (!mod || !book) return null;
  let { chapter: c, verse: v } = ref;
  for (let guard = 0; guard < 400; guard++) {
    v += dir;
    const ch = book.chapters[c - 1] || [];
    if (v >= 1 && v <= ch.length) {
      if (ch[v - 1]) return { book: ref.book, chapter: c, verse: v };
      continue;
    }
    c += dir;
    if (c < 1 || c > book.chapters.length) {
      // Соседняя книга
      const i = mod.books.findIndex((b) => b.id === ref.book) + dir;
      const nb = mod.books[i];
      if (!nb) return null;
      const nbData = await getBook(moduleId, nb.id);
      const nc = dir > 0 ? 1 : nbData.chapters.length;
      const nv = dir > 0 ? 1 : nbData.chapters[nc - 1].length;
      return { book: nb.id, chapter: nc, verse: nv };
    }
    v = dir > 0 ? 0 : (book.chapters[c - 1] || []).length + 1;
  }
  return null;
}

async function playFrom(ref) {
  // Таймер «до конца главы»: остановиться, когда началась другая глава
  if (state.sleep?.kind === 'chapter' && (ref.chapter !== state.sleep.chapter || ref.book !== state.sleep.book)) {
    set({ sleep: null, playing: false });
    return;
  }
  set({ ref: { ...ref } });
  if (state.source === 'tts') return speakVerse(ref);
  if (state.source === 'none') return set({ playing: false });
  return playRecorded(ref);
}

async function speakVerse(ref) {
  if (typeof speechSynthesis === 'undefined') return set({ playing: false, error: t('Браузер не поддерживает синтез речи') });
  const my = ++gen;
  const mod = await getModule(state.moduleId);
  const book = await getBook(state.moduleId, ref.book);
  const raw = book?.chapters?.[ref.chapter - 1]?.[ref.verse - 1];
  if (raw == null) return set({ playing: false });
  const u = new SpeechSynthesisUtterance(plainText(raw));
  const lang = LANG[mod?.language] || 'ru-RU';
  u.lang = lang;
  const voice = speechSynthesis.getVoices().find((v) => v.lang?.replace('_', '-').startsWith(lang.slice(0, 2)));
  if (voice) u.voice = voice;
  u.rate = state.rate;
  u.onend = async () => {
    if (my !== gen || !state.playing) return;
    const next = await neighbourVerse(state.moduleId, ref, 1);
    if (!next) return set({ playing: false });
    playFrom(next);
  };
  u.onerror = (e) => {
    if (my !== gen || e.error === 'interrupted' || e.error === 'canceled') return;
    set({ playing: false, error: t('Синтез речи недоступен на этом устройстве') });
  };
  speechSynthesis.speak(u);
}

async function playRecorded(ref) {
  const my = ++gen;
  const key = `${ref.book}.${ref.chapter}`;
  if (timing?.key !== key || timing.module !== state.source) {
    set({ loading: true });
    const p = await getPayload(state.source);
    const ch = p?.chapters?.[key];
    if (my !== gen) return;
    if (!ch) {
      set({ loading: false, playing: false, error: t('Для этой главы нет аудиозаписи.'), offerTts: true });
      return;
    }
    const next = { key, module: state.source, verses: ch.verses, url: ch.url, start: ch.start ?? null, end: ch.end ?? null };
    if (!el) {
      el = new Audio();
      el.preload = 'auto';
      el.volume = volume;
      el.addEventListener('durationchange', emitTime);
      el.addEventListener('loadedmetadata', emitTime);
      el.addEventListener('timeupdate', onTime);
      el.addEventListener('ended', onEnded);
      el.addEventListener('waiting', () => set({ loading: true }));
      el.addEventListener('playing', () => set({ loading: false }));
      el.addEventListener('error', () => set({ loading: false, playing: false, error: t('Запись не загрузилась. Проверьте интернет.') }));
    }
    if (loadedUrl !== ch.url) {
      const src = await playableUrl(ch.url); // скачанная книга — из памяти телефона
      if (my !== gen) {
        if (src.startsWith('blob:')) URL.revokeObjectURL(src);
        return; // пока ждали, нажали другое — эту запись не ставим
      }
      if (blobUrl) URL.revokeObjectURL(blobUrl);
      blobUrl = src.startsWith('blob:') ? src : null;
      el.src = src;
      loadedUrl = ch.url;
    }
    timing = next;
    emitTime();
  }
  // С первого стиха — с начала главы (объявление «Глава …»), иначе — с начала стиха
  const start = ref.verse === 1 && timing.start != null ? timing.start : timing.verses.find((x) => x[0] === ref.verse)?.[1] ?? timing.start ?? 0;
  el.playbackRate = state.rate;
  // Пока длительность файла неизвестна, перемотка может не сработать (Safari) — ставим место после загрузки
  if (el.readyState >= 1) {
    try {
      el.currentTime = start;
    } catch {
      /* перемотка не удалась */
    }
  } else el.addEventListener('loadedmetadata', () => my === gen && (el.currentTime = start), { once: true });
  el.play().then(
    () => set({ loading: false }),
    (e) => set({ loading: false, playing: false, error: playError(e) })
  );
}

function onTime() {
  if (!timing || !el || state.source === 'tts') return;
  emitTime();
  // Глава кончилась внутри общего файла — переходим к следующей
  if (timing.end != null && el.currentTime >= timing.end - 0.05) return chapterEnded();
  const t = el.currentTime + 0.05;
  let cur = null;
  for (const [v, s] of timing.verses) {
    if (s <= t) cur = v;
    else break;
  }
  if (cur && state.ref && cur !== state.ref.verse) {
    const [book, c] = timing.key.split('.');
    set({ ref: { book, chapter: +c, verse: cur } });
  }
}

let advancing = false;
async function chapterEnded() {
  if (advancing || !state.playing || !state.ref) return;
  advancing = true;
  try {
    const [b, c] = timing.key.split('.');
    const book = await getBook(state.moduleId, b);
    const lastVerse = (book?.chapters?.[+c - 1] || []).length;
    const next = await neighbourVerse(state.moduleId, { book: b, chapter: +c, verse: lastVerse }, 1);
    if (!next) return set({ playing: false });
    if (state.sleep?.kind === 'chapter') {
      el.pause();
      return set({ playing: false, sleep: null });
    }
    // Следующая глава в том же файле и сразу за этой — просто продолжаем, без перемотки
    const p = await getPayload(state.source);
    const ch = p?.chapters?.[`${next.book}.${next.chapter}`];
    if (ch && ch.url === timing.url && ch.start != null && Math.abs(ch.start - (timing.end ?? -9)) < 1) {
      timing = { key: `${next.book}.${next.chapter}`, module: state.source, verses: ch.verses, url: ch.url, start: ch.start, end: ch.end ?? null };
      set({ ref: next });
      emitTime();
      return;
    }
    el.pause();
    await playFrom(next);
  } finally {
    advancing = false;
  }
}

async function onEnded() {
  if (timing?.end != null) return chapterEnded();
  if (!state.playing || !state.ref) return;
  const book = await getBook(state.moduleId, state.ref.book);
  const lastVerse = (book?.chapters?.[state.ref.chapter - 1] || []).length;
  const next = await neighbourVerse(state.moduleId, { ...state.ref, verse: lastVerse }, 1);
  if (!next) return set({ playing: false });
  playFrom(next);
}
