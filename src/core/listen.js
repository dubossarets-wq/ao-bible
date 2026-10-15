// Чтение вслух: по умолчанию — настоящие аудиокниги (живой чтец) с привязкой к стихам.
// Синтез речи включается только если человек сам выбрал его в настройках проигрывателя.
import { startAudio, audioSourcesFor, showAudioMessage } from './audio.js';
import { load } from './storage.js';

export async function listenFrom(pane, moduleId, ref) {
  const { recorded, otherRecorded } = await audioSourcesFor(moduleId, ref);
  const pref = load('audioSource', null);
  if (pref === 'tts') return startAudio({ pane, moduleId, ref, source: 'tts' });
  const all = [...recorded, ...otherRecorded];
  const source = all.some((m) => m.id === pref) ? pref : recorded[0]?.id || null;
  if (source) return startAudio({ pane, moduleId, ref, source });
  return showAudioMessage({
    pane,
    moduleId,
    ref,
    error: otherRecorded.length
      ? `Есть запись к другому переводу: ${otherRecorded[0].name}. Выберите её в настройках проигрывателя.`
      : 'Для этой главы нет аудиозаписи. Аудиокниги — в библиотеке модулей, раздел «Аудиокниги».',
  });
}
