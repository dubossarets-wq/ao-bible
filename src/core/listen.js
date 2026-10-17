// Чтение вслух: по умолчанию — настоящие аудиокниги (живой чтец) с привязкой к стихам.
// Если к главе записи нет — ИИ-диктор (синтез речи): сразу, если человек его включил, иначе предлагаем включить.
import { startAudio, audioSourcesFor, showAudioMessage } from './audio.js';
import { load } from './storage.js';
import { t } from './i18n.js';

export async function listenFrom(pane, moduleId, ref) {
  const { recorded, tts } = await audioSourcesFor(moduleId, ref);
  // Если записей к переводу несколько — та, что слушали раньше
  const pref = load('audioSource', null);
  const source = recorded.some((m) => m.id === pref) ? pref : recorded[0]?.id || null;
  if (source) return startAudio({ pane, moduleId, ref, source });
  if (tts && load('settings', {})?.ttsFallback) return startAudio({ pane, moduleId, ref, source: 'tts' });
  return showAudioMessage({
    pane,
    moduleId,
    ref,
    offerTts: tts,
    error: t('Для этой главы нет аудиозаписи.'),
  });
}
