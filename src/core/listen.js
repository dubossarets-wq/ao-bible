// Чтение вслух: по умолчанию — настоящие аудиокниги (живой чтец) с привязкой к стихам.
// Запись выбирается сама — к текущему переводу; если её нет, показываем сообщение.
import { startAudio, audioSourcesFor, showAudioMessage } from './audio.js';
import { load } from './storage.js';

export async function listenFrom(pane, moduleId, ref) {
  const { recorded, otherRecorded } = await audioSourcesFor(moduleId, ref);
  // Если записей к переводу несколько — та, что слушали раньше
  const pref = load('audioSource', null);
  const source = recorded.some((m) => m.id === pref) ? pref : recorded[0]?.id || null;
  if (source) return startAudio({ pane, moduleId, ref, source });
  return showAudioMessage({
    pane,
    moduleId,
    ref,
    error: otherRecorded.length
      ? `Есть запись к другому переводу: ${otherRecorded[0].name}. Переключитесь на этот перевод, чтобы слушать.`
      : 'Для этой главы нет аудиозаписи. Аудиокниги — в библиотеке модулей, раздел «Аудиокниги».',
  });
}
