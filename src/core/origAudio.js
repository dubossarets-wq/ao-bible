// Живое чтение оригинала для подстрочника: Ветхий Завет — Авраам Шмуэлоф (иврит), Новый — Марилин Фемистер
// (греческий, эразмово произношение). Модули разметки маленькие и ставятся сами при первом нажатии «Слушать»;
// сами записи проигрываются с archive.org.
import { listModules, getPayload, fetchCatalog, installFromCatalog } from './modules.js';
import { testamentOf } from './books.js';

const AUDIO = { OT: 'audio-hbo-shmuelof', NT: 'audio-grc-phemister' };

export const origAudioFor = (bookId) => AUDIO[testamentOf(bookId)] || null;

async function ensure(id) {
  if ((await listModules()).some((m) => m.id === id)) return true;
  const entry = (await fetchCatalog()).find((c) => c.id === id);
  if (!entry) return false;
  await installFromCatalog(entry);
  return true;
}

// Запись стиха: { url, start, end, words: [начала слов] | null } или null — записи нет
export async function verseAudio(ref) {
  const id = origAudioFor(ref.book);
  if (!id || !(await ensure(id))) return null;
  const p = await getPayload(id);
  const s = p?.segments?.[`${ref.book}.${ref.chapter}.${ref.verse}`];
  if (!s) return null;
  return { url: p.files[s[0]], start: s[1], end: s[2], words: Array.isArray(s[3]) ? s[3] : null };
}

// Проигрыватель одного отрезка записи: play(seg, onWord) — onWord(i) получает номер звучащего слова
let audio = null;
let stopAt = 0;
let tick = null;

export function stopVerse() {
  if (audio) audio.pause();
  clearInterval(tick);
  tick = null;
}

export function playSegment(seg, { onTime, onEnd } = {}) {
  stopVerse();
  if (!audio) audio = new Audio();
  stopAt = seg.end;
  const start = () => {
    audio.currentTime = seg.start;
    audio.play().catch(() => onEnd?.());
    tick = setInterval(() => {
      if (audio.currentTime >= stopAt - 0.03 || audio.ended) {
        stopVerse();
        onEnd?.();
      } else onTime?.(audio.currentTime);
    }, 60);
  };
  if (audio.src === seg.url && audio.readyState >= 1) return start();
  audio.src = seg.url;
  audio.addEventListener('loadedmetadata', start, { once: true });
}

// Начала слов: по разметке записи, а без неё — примерно, пропорционально длине слова (без огласовок)
export function wordStarts(seg, words) {
  if (seg.words?.length === words.length) return seg.words;
  const len = words.map((w) => Math.max(1, w.replace(/[֑-ׇ̀-ͯ]/g, '').normalize('NFD').replace(/[̀-ͯ]/g, '').length + 1));
  const total = len.reduce((a, b) => a + b, 0);
  const out = [];
  let t = seg.start;
  for (const l of len) {
    out.push(t);
    t += ((seg.end - seg.start) * l) / total;
  }
  return out;
}
