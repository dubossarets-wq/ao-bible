// Действия со стихом (нажатие на номер стиха)
import React from 'react';
import { Bookmark, BookmarkCheck, Star, Copy, Link2, Columns2, NotebookPen } from 'lucide-react';
import BottomSheet from './BottomSheet.jsx';
import { useApp } from '../App.jsx';
import { formatRef } from '../core/books.js';

export default function VerseActions({ pane, payload, onClose }) {
  const { isBookmarked, toggleBookmark, isFavorite, toggleFavorite, openSheet, openInOther, toast, bibles, panes, notes } = useApp();
  const { ref, text } = payload;
  const mod = bibles.find((b) => b.id === panes[pane]?.moduleId);
  const label = `${formatRef(ref, { full: true })} (${mod?.name || ''})`;

  const copy = async () => {
    const s = `${text}\n— ${label}`;
    try {
      await navigator.clipboard.writeText(s);
      toast('Стих скопирован');
    } catch {
      const sel = window.getSelection();
      const el = document.getElementById('verse-copy-text');
      if (el && sel) {
        const r = document.createRange();
        r.selectNodeContents(el);
        sel.removeAllRanges();
        sel.addRange(r);
      }
      toast('Текст выделен — скопируйте его вручную');
    }
  };

  const row = (Icon, label, fn, on) => (
    <button className={`action-row ${on ? 'on' : ''}`} onClick={fn}>
      <Icon size={20} />
      <span>{label}</span>
    </button>
  );

  return (
    <BottomSheet title={formatRef(ref, { full: true })} onClose={onClose} initial={0}>
      <blockquote className="xref-source" id="verse-copy-text">
        {text}
      </blockquote>
      <div className="actions">
        {row(isBookmarked(ref) ? BookmarkCheck : Bookmark, isBookmarked(ref) ? 'Убрать закладку' : 'Закладка', () => toggleBookmark(ref, text.slice(0, 160)), isBookmarked(ref))}
        {row(NotebookPen, notes[`${ref.book}.${ref.chapter}.${ref.verse}`] ? 'Заметка' : 'Добавить заметку', () => openSheet('note', pane, { refs: [ref], moduleId: mod?.id }))}
        {row(Star, isFavorite(ref) ? 'Убрать из избранного' : 'В избранное', () => toggleFavorite(ref, text), isFavorite(ref))}
        {row(Copy, 'Копировать', copy)}
        {row(Link2, 'Параллельные места', () => openSheet('xrefs', pane, { ref }))}
        {pane === 0 && row(Columns2, 'Открыть во второй панели', () => (onClose(), openInOther(0, ref)))}
      </div>
    </BottomSheet>
  );
}
