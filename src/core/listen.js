// Запуск чтения вслух с подходящим источником: если для главы есть запись — она (или та, что выбирали
// раньше); синтез речи — когда записи нет или человек сам выбрал синтез.
import { startAudio, audioSourcesFor } from './audio.js';
import { load } from './storage.js';

export async function listenFrom(pane, moduleId, ref) {
  const { recorded } = await audioSourcesFor(moduleId, ref);
  const pref = load('audioSource', null);
  const source = pref === 'tts' ? 'tts' : recorded.some((m) => m.id === pref) ? pref : recorded[0]?.id || 'tts';
  return startAudio({ pane, moduleId, ref, source });
}
