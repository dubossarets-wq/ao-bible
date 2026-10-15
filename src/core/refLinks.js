// Ссылки на стихи в обычном тексте (заметки, комментарии, статьи словарей): «Ин 3:16», «1 Кор 13:4–7»,
// «Быт. 23:19; 49:29–31» (во второй ссылке книга та же), «Пс 22». Возвращает части текста и ссылки.
import { findBookId } from './books.js';

const RE = /((?:[1-4]\s?)?[А-ЯЁA-Z][а-яёa-z]{1,14}\.?)\s?(\d{1,3})(?:\s?[:,]\s?(\d{1,3})(?:\s?[-–]\s?(\d{1,3}))?)?/g;
const CONT = /^(\s*[;,]\s*)(\d{1,3})(?:\s?:\s?(\d{1,3}))(?:\s?[-–]\s?(\d{1,3}))?/;

export function splitRefs(text) {
  const out = [];
  let last = 0;
  RE.lastIndex = 0;
  let m;
  while ((m = RE.exec(text))) {
    const book = findBookId(m[1]);
    // Ссылка на целую главу — только для сокращений («Пс 22», «Мф. 5»), не для обычных слов
    if (!book || (!m[3] && !/\.$/.test(m[1]) && m[1].replace(/\s/g, '').length > 5)) continue;
    if (m.index > last) out.push({ text: text.slice(last, m.index) });
    out.push({ text: m[0], ref: { book, chapter: +m[2], verse: m[3] ? +m[3] : 1 } });
    last = m.index + m[0].length;
    // «; 49:29–31» — та же книга
    let rest = text.slice(last);
    let c;
    while ((c = CONT.exec(rest))) {
      out.push({ text: c[1] });
      out.push({ text: c[0].slice(c[1].length), ref: { book, chapter: +c[2], verse: +c[3] } });
      last += c[0].length;
      rest = text.slice(last);
    }
    RE.lastIndex = last;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}

export const hasRefs = (text) => splitRefs(text || '').some((p) => p.ref);
