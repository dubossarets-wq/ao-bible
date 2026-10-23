// Проповеди: заголовок, дата и блоки по порядку — стихи (с текстом на момент добавления) и свой текст.
// Хранятся в localStorage «sermons», общее хранилище для окна проповедей и выбора «В проповедь».
// { id, title, date, blocks: [{ id, type: 'verse', book, chapter, verse, to, text, texts?, moduleId } | { id, type: 'text', text }], createdAt, updatedAt }
// Несколько стихов подряд — один блок (verse…to): text — весь текст одной строкой (как раньше, его читают
// и старые версии приложения), texts — тот же текст по стихам, чтобы показать каждый стих с нового абзаца
// и убрать любой из середины. В старых проповедях texts нет — его достраивают из перевода (fillVerseTexts).
import { useSyncExternalStore } from 'react';
import { load, save } from './storage.js';
import { bookMeta, parseHumanRef } from './books.js';
import { getVerse } from './modules.js';
import { plainText } from './verseMarkup.js';
import { t } from './i18n.js';

const read = () => {
  const v = load('sermons', []);
  return Array.isArray(v) ? v : [];
};
let sermons = read();
const subs = new Set();
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

export const getSermons = () => sermons;
function setSermons(next) {
  sermons = typeof next === 'function' ? next(sermons) : next;
  save('sermons', sermons);
  subs.forEach((fn) => fn());
}
const subscribe = (fn) => {
  subs.add(fn);
  return () => subs.delete(fn);
};
export const useSermons = () => useSyncExternalStore(subscribe, getSermons);

const touch = (id, fn) => setSermons((list) => list.map((s) => (s.id === id ? { ...fn(s), updatedAt: Date.now() } : s)));

export function createSermon(title) {
  const s = { id: uid(), title: title.trim() || t('Новая проповедь'), date: '', blocks: [], createdAt: Date.now(), updatedAt: Date.now() };
  setSermons((list) => [s, ...list]);
  return s.id;
}
export const deleteSermon = (id) => setSermons((list) => list.filter((s) => s.id !== id));
// «Отменить» после удаления: проповедь возвращается на прежнее место
export function restoreSermon(sermon, index) {
  setSermons((list) => {
    if (list.some((s) => s.id === sermon.id)) return list;
    const next = [...list];
    next.splice(Math.min(Math.max(0, index), next.length), 0, sermon);
    return next;
  });
}
export const renameSermon = (id, title) => touch(id, (s) => ({ ...s, title }));
export const setSermonDate = (id, date) => touch(id, (s) => ({ ...s, date }));

// Выделенные стихи → блоки: стихи подряд одной главы складываются в один блок «Ин 3:16–18»
// (каждый стих — своим абзацем, см. texts)
// at — куда вставить (номер блока); без него — в конец
export function addVerses(id, items, moduleId, at = null) {
  const blocks = [];
  for (const it of items) {
    const last = blocks[blocks.length - 1];
    if (!it.part && last && !last.part && last.book === it.book && last.chapter === it.chapter && (last.to || last.verse) + 1 === it.verse) {
      last.to = it.verse;
      last.texts = [...(last.texts || [last.text]), it.text];
      last.text += ' ' + it.text;
    } else blocks.push({ id: uid(), type: 'verse', book: it.book, chapter: it.chapter, verse: it.verse, to: null, text: it.text, moduleId: it.moduleId || moduleId, ...(it.part ? { part: true } : {}) });
  }
  touch(id, (s) => {
    const all = [...s.blocks];
    all.splice(at == null ? all.length : Math.max(0, Math.min(all.length, at)), 0, ...blocks);
    return { ...s, blocks: all };
  });
  return blocks.map((b) => b.id);
}

// Текст блока по стихам: [текст 16, текст 17, …]; null — у старого блока-диапазона разбивки ещё нет
export function verseTexts(b) {
  if (b.type !== 'verse') return null;
  if (!b.to || b.to === b.verse) return [b.text];
  return Array.isArray(b.texts) && b.texts.length === b.to - b.verse + 1 ? b.texts : null;
}
const norm = (x) => String(x || '').replace(/\s+/g, ' ').trim();

// Старые проповеди: у диапазона хранился только общий текст. Берём стихи из того же перевода и,
// если вместе они дают ровно сохранённый текст, запоминаем разбивку. Сам текст не меняется,
// дата изменения проповеди — тоже (это не правка человека). Не совпало — блок остаётся одним абзацем.
const tried = new Set();
export async function fillVerseTexts(id, fallbackModuleId) {
  const s = sermons.find((x) => x.id === id);
  const need = s?.blocks.filter((b) => b.type === 'verse' && b.to && b.to > b.verse && !b.part && !verseTexts(b) && !tried.has(b.id)) || [];
  for (const b of need) {
    tried.add(b.id);
    for (const mid of [...new Set([b.moduleId, fallbackModuleId].filter(Boolean))]) {
      const texts = [];
      for (let v = b.verse; v <= b.to; v++) {
        const vt = await getVerse(mid, { book: b.book, chapter: b.chapter, verse: v }).catch(() => null);
        if (vt == null) break;
        texts.push(plainText(vt));
      }
      if (texts.length === b.to - b.verse + 1 && norm(texts.join(' ')) === norm(b.text)) {
        setSermons((list) => list.map((x) => (x.id === id ? { ...x, blocks: x.blocks.map((y) => (y.id === b.id && y.text === b.text ? { ...y, texts } : y)) } : x)));
        break;
      }
    }
  }
}

// Убрать один стих из блока-диапазона: блок распадается на части до и после, как если бы
// эти стихи добавляли отдельно. Одиночный стих — убирается весь блок.
export function removeVerse(id, blockId, verse) {
  touch(id, (s) => ({
    ...s,
    blocks: s.blocks.flatMap((b) => {
      if (b.id !== blockId) return [b];
      const texts = verseTexts(b);
      const to = b.to || b.verse;
      if (!texts || to === b.verse) return [];
      if (verse < b.verse || verse > to) return [b];
      const part = (from, end, keepId) => {
        if (from > end) return [];
        const tx = texts.slice(from - b.verse, end - b.verse + 1);
        const { texts: _, ...rest } = b;
        return [{ ...rest, id: keepId ? b.id : uid(), verse: from, to: end > from ? end : null, text: tx.join(' '), ...(end > from ? { texts: tx } : {}) }];
      };
      return [...part(b.verse, verse - 1, true), ...part(verse + 1, to, verse === b.verse)];
    }),
  }));
}
// «Отменить»: блоки проповеди — как были
export const restoreBlocks = (id, blocks) => touch(id, (s) => ({ ...s, blocks }));

export function addTextBlock(id, afterIndex = null) {
  const b = { id: uid(), type: 'text', text: '' };
  touch(id, (s) => {
    const blocks = [...s.blocks];
    blocks.splice(afterIndex == null ? blocks.length : Math.max(0, afterIndex + 1), 0, b);
    return { ...s, blocks };
  });
  return b.id;
}
export const updateBlock = (id, blockId, patch) => touch(id, (s) => ({ ...s, blocks: s.blocks.map((b) => (b.id === blockId ? { ...b, ...patch } : b)) }));
export const removeBlock = (id, blockId) => touch(id, (s) => ({ ...s, blocks: s.blocks.filter((b) => b.id !== blockId) }));
export function moveBlock(id, index, dir) {
  touch(id, (s) => {
    const j = index + dir;
    if (j < 0 || j >= s.blocks.length) return s;
    const blocks = [...s.blocks];
    [blocks[index], blocks[j]] = [blocks[j], blocks[index]];
    return { ...s, blocks };
  });
}

// Проповедь, в которой есть этот стих (самая недавно изменённая)
export function sermonWith(ref) {
  return [...sermons]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .find((s) => s.blocks.some((b) => b.type === 'verse' && b.book === ref.book && b.chapter === ref.chapter && ref.verse >= b.verse && ref.verse <= (b.to || b.verse)));
}

export const blockRef = (b) => `${bookMeta(b.book).short.replace(/\.$/, '')} ${b.chapter}:${b.verse}${b.to ? `–${b.to}` : ''}${b.part ? ` ${t('(часть)')}` : ''}`;
export const blockRefFull = (b) => `${bookMeta(b.book).name} ${b.chapter}:${b.verse}${b.to ? `–${b.to}` : ''}${b.part ? ` ${t('(часть)')}` : ''}`;

// Проповедь обычным текстом — чтобы отправить или распечатать
export function sermonText(s) {
  const parts = [s.title, s.date ? new Date(s.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }) : ''].filter(Boolean);
  for (const b of s.blocks) {
    if (b.type === 'verse') {
      // Диапазон — каждый стих с новой строки, с номером
      const tx = verseTexts(b);
      parts.push(`${blockRefFull(b)}\n«${tx && tx.length > 1 ? tx.map((x, i) => `${b.verse + i} ${x}`).join('\n') : b.text}»`);
    }
    else if (b.text.trim()) parts.push(b.text.trim());
  }
  return parts.join('\n\n');
}

// Ссылка из строки поиска → стихи для проповеди. «Ин 3» — вся глава; «Ин 3:16-18» — стихи
export const isWholeChapter = (q) => !/\d\s*[:.,]\s*\d|\d\s+\d/.test(String(q).replace(/^\s*\d\s*/, ''));
export function refRangeLabel(q, r) {
  const name = bookMeta(r.book).name;
  if (isWholeChapter(q)) return `${name} ${r.chapter}`;
  return `${name} ${r.chapter}:${r.verse}${r.verseEnd && r.verseEnd > r.verse ? `–${r.verseEnd}` : ''}`;
}
export async function versesForRef(moduleId, q) {
  const r = parseHumanRef(q);
  if (!r) return null;
  const endV = r.verseEnd || (isWholeChapter(q) ? 999 : r.verse);
  const items = [];
  for (let v = r.verse; v <= endV && items.length < 400; v++) {
    const vt = await getVerse(moduleId, { book: r.book, chapter: r.chapter, verse: v });
    if (vt == null) break;
    items.push({ book: r.book, chapter: r.chapter, verse: v, text: plainText(vt) });
  }
  return items;
}
