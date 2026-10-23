// Виджет «Стих дня» на главном экране Android (android/app/.../VerseWidget*.java). Приложение раз в день
// передаёт ему стихи на 30 дней вперёд — виджет сам берёт стих на сегодняшнюю дату, даже если приложение
// долго не открывали. Текст — из установленного перевода (без сети).
import { registerPlugin } from '@capacitor/core';
import { NATIVE } from './native.js';
import { verseOfDay } from './verseOfDay.js';
import { peekBook } from './modules.js';
import { formatRef } from './books.js';
import { plainText } from './verseMarkup.js';
import { localDate } from './plans.js';
import { load, save } from './storage.js';
import { t } from './i18n.js';

const Widget = NATIVE ? registerPlugin('VerseWidget') : null;
const DAYS = 30;

export async function updateWidget(moduleId) {
  if (!Widget || !moduleId) return;
  const today = localDate();
  const stamp = `${today}|${moduleId}`;
  if (load('widgetDay', null) === stamp) return; // уже передавали сегодня
  const items = [];
  for (let k = 0; k < DAYS; k++) {
    const date = new Date();
    date.setDate(date.getDate() + k);
    const ref = verseOfDay(date);
    const book = await peekBook(moduleId, ref.book);
    const raw = book?.chapters?.[ref.chapter - 1]?.[ref.verse - 1];
    if (!raw) continue;
    items.push({ d: localDate(date), text: plainText(raw).trim(), ref: formatRef(ref) });
  }
  if (!items.length) return;
  try {
    await Widget.setVerses({ items: JSON.stringify(items), title: t('Стих дня') });
    save('widgetDay', stamp);
  } catch {
    // старая сборка приложения без виджета — ничего не делаем
  }
}
