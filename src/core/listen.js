// Чтение вслух: настоящие аудиокниги (живой чтец) с привязкой к стихам. Записи к главе нет — сообщение об этом
// (синтез речи браузера убран по решению владельца 25.10.2026).
import { startAudio, audioSourcesFor, showAudioMessage } from './audio.js';
import { load } from './storage.js';
import { t } from './i18n.js';

export async function listenFrom(pane, moduleId, ref) {
  const { recorded } = await audioSourcesFor(moduleId, ref);
  // Если записей к переводу несколько — та, что слушали раньше
  const pref = load('audioSource', null);
  const source = recorded.some((m) => m.id === pref) ? pref : recorded[0]?.id || null;
  if (source) return startAudio({ pane, moduleId, ref, source });
  return showAudioMessage({
    pane,
    moduleId,
    ref,
    error: t('Для этой главы нет аудиозаписи.'),
  });
}
