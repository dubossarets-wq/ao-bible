// Полноценная панель чтения: своя навигация, свой перевод, свои словари и параллельные места.
// Долгое нажатие на стих включает режим выделения: вместо верхней панели — панель действий.
import React, { useCallback, useEffect, useState } from 'react';
import { useApp } from '../App.jsx';
import ReaderToolbar from './ReaderToolbar.jsx';
import SelectionBar from './SelectionBar.jsx';
import ChapterView from './ChapterView.jsx';

export default function BibleReader({ index }) {
  const { panes, bibles, settings, sheet } = useApp();
  const pane = panes[index];
  const [barHidden, setBarHidden] = useState(false);
  const [selection, setSelection] = useState(() => new Set());
  const module = pane ? bibles.find((b) => b.id === pane.moduleId) || bibles[0] : null;

  // Переход в другое место или смена перевода снимает выделение
  useEffect(() => setSelection(new Set()), [pane?.nav, module?.id]);

  useEffect(() => {
    if (!selection.size || sheet) return;
    const onKey = (e) => e.key === 'Escape' && setSelection(new Set());
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selection.size, sheet]);

  const onSelect = useCallback((ref, mode) => {
    const key = `${ref.book}.${ref.chapter}.${ref.verse}`;
    setSelection((prev) => {
      if (mode === 'start') return new Set([key]);
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    setBarHidden(false);
  }, []);

  if (!pane) return null;
  return (
    <section className={`reader ${settings.focusMode && barHidden && !selection.size ? 'bar-hidden' : ''}`} aria-label={index === 0 ? 'Основная панель' : 'Вторая панель'}>
      {selection.size ? (
        <SelectionBar index={index} module={module} selection={selection} onDone={() => setSelection(new Set())} />
      ) : (
        <ReaderToolbar index={index} pane={pane} module={module} />
      )}
      <ChapterView
        index={index}
        pane={pane}
        module={module}
        selection={selection}
        onSelect={onSelect}
        onScrollDirection={(down) => settings.focusMode && setBarHidden(down)}
      />
    </section>
  );
}
