// Управление чтением с экрана блокировки и из шторки уведомлений: название главы, ▶/⏸, ⏮/⏭ по стихам.
// В приложении из Google Play — плагин (он же держит звук, когда экран выключен: служебное уведомление
// «воспроизведение»); на сайте — стандартный Media Session браузера.
import { MediaSession } from '@capgo/capacitor-media-session';
import { audioState, subscribeAudio, pauseAudio, resumeAudio, stepVerse, stopAudio } from './audio.js';
import { getModule } from './modules.js';
import { bookMeta } from './books.js';
import { NATIVE } from './native.js';

const web = typeof navigator !== 'undefined' && navigator.mediaSession;
const ms = NATIVE
  ? MediaSession
  : web
    ? {
        setMetadata: async (m) => (navigator.mediaSession.metadata = new MediaMetadata(m)),
        setPlaybackState: async ({ playbackState }) => (navigator.mediaSession.playbackState = playbackState),
        setActionHandler: async ({ action }, h) => {
          try {
            navigator.mediaSession.setActionHandler(action, h);
          } catch {
            /* действие не поддерживается браузером */
          }
        },
      }
    : null;

const icon = () => new URL('icons/icon-512.png', document.baseURI).href;

let last = { key: '', playback: '' };
async function sync() {
  const s = audioState();
  const playback = !s.active ? 'none' : s.playing ? 'playing' : 'paused';
  if (playback !== last.playback) {
    last.playback = playback;
    ms.setPlaybackState({ playbackState: playback }).catch(() => {});
  }
  if (!s.active || !s.ref) return;
  const key = `${s.source}|${s.ref.book}.${s.ref.chapter}`;
  if (key === last.key) return;
  last.key = key;
  const reader = s.source && s.source !== 'tts' ? (await getModule(s.source).catch(() => null))?.name : '';
  ms.setMetadata({ title: `${bookMeta(s.ref.book)?.name || s.ref.book} ${s.ref.chapter}`, artist: reader || 'AO Bible', album: 'AO Bible', artwork: [{ src: icon(), sizes: '512x512', type: 'image/png' }] }).catch(() => {});
}

export function startMediaControls() {
  if (!ms) return;
  const handlers = {
    play: () => resumeAudio(),
    pause: () => pauseAudio(),
    previoustrack: () => stepVerse(-1),
    nexttrack: () => stepVerse(1),
    stop: () => stopAudio(),
  };
  for (const [action, h] of Object.entries(handlers)) ms.setActionHandler({ action }, h).catch(() => {});
  subscribeAudio(() => sync().catch(() => {}));
}
