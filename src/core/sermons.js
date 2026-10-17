// Проповеди: заголовок, дата и блоки по порядку — стихи (с текстом на момент добавления) и свой текст.
// Хранятся в localStorage «sermons», общее хранилище для окна проповедей и выбора «В проповедь».
// { id, title, date, blocks: [{ id, type: 'verse', book, chapter, verse, to, text, moduleId } | { id, type: 'text', text }], createdAt, updatedAt }
import { useSyncExternalStore } from 'react';
import { load, save } from './storage.js';
import { bookMeta } from './books.js';
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
export const renameSermon = (id, title) => touch(id, (s) => ({ ...s, title }));
export const setSermonDate = (id, date) => touch(id, (s) => ({ ...s, date }));

// Выделенные стихи → блоки: стихи подряд одной главы складываются в один блок «Ин 3:16–18»
export function addVerses(id, items, moduleId) {
  const blocks = [];
  for (const it of items) {
    const last = blocks[blocks.length - 1];
    if (!it.part && last && !last.part && last.book === it.book && last.chapter === it.chapter && (last.to || last.verse) + 1 === it.verse) {
      last.to = it.verse;
      last.text += ' ' + it.text;
    } else blocks.push({ id: uid(), type: 'verse', book: it.book, chapter: it.chapter, verse: it.verse, to: null, text: it.text, moduleId, ...(it.part ? { part: true } : {}) });
  }
  touch(id, (s) => ({ ...s, blocks: [...s.blocks, ...blocks] }));
  return blocks.length;
}

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
    if (b.type === 'verse') parts.push(`${blockRefFull(b)}\n«${b.text}»`);
    else if (b.text.trim()) parts.push(b.text.trim());
  }
  return parts.join('\n\n');
}
