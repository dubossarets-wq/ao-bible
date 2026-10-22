// Живое чтение оригинала для подстрочника: Ветхий Завет — Авраам Шмуэлоф (иврит), Новый — Марилин Фемистер
// (греческий, эразмово произношение). Модули разметки маленькие и ставятся сами при первом нажатии «Слушать»;
// сами записи проигрываются с archive.org.
import { listModules, getPayload, fetchCatalog, installFromCatalog } from './modules.js';
import { testamentOf } from './books.js';

const AUDIO = { OT: 'audio-hbo-shmuelof', NT: 'audio-grc-phemister' };

// Озвучка слов оригинала (подстрочник, словарь Стронга) выключена до выхода приложения в Google Play — включить: true
export const ORIG_AUDIO = false;
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

// Отрезок записи с одним словом стиха (i — номер слова в порядке оригинала)
export async function wordSegment(ref, i, words) {
  const seg = await verseAudio(ref);
  if (!seg) return null;
  const st = wordStarts(seg, words);
  return { url: seg.url, start: Math.max(seg.start, st[i] - 0.04), end: i + 1 < st.length ? st[i + 1] : seg.end };
}

// Слово по номеру Стронга живым голосом: сначала в этом стихе, иначе — первое место, где оно есть в записи
export async function playStrongWord(num, ref, opts) {
  const { origInterlinear, ensureOriginal } = await import('./interlinear.js');
  const { strongStats } = await import('./wordstats.js');
  const key = num.replace(/^([HG])0*/, '$1');
  // Для поиска слова в стихе нужен текст оригинала — ставится сам (как в подстрочнике)
  await ensureOriginal(key.startsWith('H') ? 'Gen' : 'Matt').catch(() => null);
  const tryRef = async (r) => {
    const ws = await origInterlinear(r).catch(() => null);
    const i = ws ? ws.findIndex((w) => w.num === key) : -1;
    if (i < 0) return false;
    const s = await wordSegment(r, i, ws.map((w) => w.text));
    if (!s) return false;
    playSegment(s, opts);
    return true;
  };
  if (ref && (await tryRef(ref))) return true;
  const st = await strongStats(key).catch(() => null);
  for (const r of (st?.refs || []).slice(0, 6)) if (await tryRef(r)) return true;
  return false;
}
