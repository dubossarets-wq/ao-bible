// Полноценная панель чтения: своя навигация, свой перевод, свои словари и параллельные места.
// Долгое нажатие на стих включает режим выделения: вместо верхней панели — панель действий.
import React, { useCallback, useEffect, useState } from 'react';
import { useApp } from '../App.jsx';
import ReaderToolbar from './ReaderToolbar.jsx';
import SelectionBar from './SelectionBar.jsx';
import ChapterView from './ChapterView.jsx';
import MapPane from './MapPane.jsx';

// Полоса прогресса чтения книги под верхней панелью: доля стихов книги до текущего места
function ReadingProgress({ module, ref_ }) {
  const book = module?.books.find((b) => b.id === ref_.book);
  if (!book) return null;
  const total = book.verses.reduce((a, b) => a + b, 0) || 1;
  const before = book.verses.slice(0, ref_.chapter - 1).reduce((a, b) => a + b, 0);
  const pct = Math.min(100, Math.max(0, ((before + ref_.verse) / total) * 100));
  const label = `Прочитано книги «${book.name}»: ${Math.round(pct)}%`;
  return (
    <div className="read-progress" role="progressbar" aria-label={label} title={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}>
      <span style={{ width: `${pct}%` }} />
    </div>
  );
}

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
  if (pane.kind === 'map') return <MapPane pane={pane} />;
  return (
    <section className={`reader ${settings.focusMode && barHidden && !selection.size ? 'bar-hidden' : ''}`} aria-label={index === 0 ? 'Основная панель' : 'Вторая панель'}>
      {selection.size ? (
        <SelectionBar index={index} module={module} selection={selection} onDone={() => setSelection(new Set())} />
      ) : (
        <ReaderToolbar index={index} pane={pane} module={module} />
      )}
      <ReadingProgress module={module} ref_={pane.ref} />
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
