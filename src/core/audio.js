// Проигрыватель «аудиокниги» с привязкой к стихам.
// Два источника: синтез речи браузера (любой перевод, офлайн) и аудиомодули — записи глав с разметкой
// времени начала стихов (type: 'audio'). Текущий стих сообщается подписчикам: панель чтения подсвечивает
// его и прокручивает текст. Состояние — отдельное хранилище, чтобы не перерисовывать всё приложение.
import { useSyncExternalStore } from 'react';
import { getBook, getPayload, listModules, getModule } from './modules.js';
import { plainText } from './verseMarkup.js';
import { load, save } from './storage.js';

const LANG = { ru: 'ru-RU', en: 'en-US', uk: 'uk-UA', cu: 'ru-RU', he: 'he-IL', grc: 'el-GR' };

let state = {
  active: false, playing: false, pane: 0, moduleId: null, ref: null, source: 'tts', rate: load('audioRate', 1),
  sleep: null, // { kind: 'min', until } | { kind: 'chapter', chapter }
  error: null, loading: false,
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
// Синодальный с разметкой и без — один и тот же текст
const sameText = (a, b) => new Set(['rst', 'rst-plus', 'rst-dc']).has(a) && new Set(['rst', 'rst-plus', 'rst-dc']).has(b);

// --- Управление --------------------------------------------------------------------------

export async function startAudio({ pane, moduleId, ref, source }) {
  stopEngines();
  const src = source || state.source || 'tts';
  set({ active: true, pane, moduleId, ref: { ...ref }, source: src, error: null, playing: true });
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
  if (!state.ref) return;
  const next = await neighbourVerse(state.moduleId, state.ref, dir);
  if (!next) return;
  stopEngines();
  set({ ref: next, playing: true });
  await playFrom(next);
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

const playError = (e) => (e?.name === 'NotAllowedError' ? 'Нажмите ▶, чтобы начать воспроизведение' : 'Не удалось воспроизвести запись');

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
  return playRecorded(ref);
}

async function speakVerse(ref) {
  if (typeof speechSynthesis === 'undefined') return set({ playing: false, error: 'Браузер не поддерживает синтез речи' });
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
    set({ playing: false, error: 'Синтез речи недоступен на этом устройстве' });
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
      set({ loading: false, playing: false, error: 'Для этой главы нет записи в выбранной аудиокниге. Можно переключиться на синтез речи.' });
      return;
    }
    timing = { key, module: state.source, verses: ch.verses, url: ch.url };
    if (!el) {
      el = new Audio();
      el.preload = 'auto';
      el.addEventListener('timeupdate', onTime);
      el.addEventListener('ended', onEnded);
      el.addEventListener('waiting', () => set({ loading: true }));
      el.addEventListener('playing', () => set({ loading: false }));
      el.addEventListener('error', () => set({ loading: false, playing: false, error: 'Запись не загрузилась. Проверьте интернет.' }));
    }
    if (el.src !== ch.url) el.src = ch.url;
  }
  const start = timing.verses.find((x) => x[0] === ref.verse)?.[1] ?? 0;
  el.playbackRate = state.rate;
  try {
    el.currentTime = start;
  } catch {
    /* метаданные ещё не загружены — выставим после загрузки */
    el.addEventListener('loadedmetadata', () => (el.currentTime = start), { once: true });
  }
  el.play().then(
    () => set({ loading: false }),
    (e) => set({ loading: false, playing: false, error: playError(e) })
  );
}

function onTime() {
  if (!timing || !el || state.source === 'tts') return;
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

async function onEnded() {
  if (!state.playing || !state.ref) return;
  const book = await getBook(state.moduleId, state.ref.book);
  const lastVerse = (book?.chapters?.[state.ref.chapter - 1] || []).length;
  const next = await neighbourVerse(state.moduleId, { ...state.ref, verse: lastVerse }, 1);
  if (!next) return set({ playing: false });
  playFrom(next);
}
