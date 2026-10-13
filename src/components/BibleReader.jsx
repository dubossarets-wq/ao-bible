// Полноценная панель чтения: своя навигация, свой перевод, свои словари и параллельные места.
import React, { useState } from 'react';
import { useApp } from '../App.jsx';
import ReaderToolbar from './ReaderToolbar.jsx';
import ChapterView from './ChapterView.jsx';

export default function BibleReader({ index }) {
  const { panes, bibles, settings } = useApp();
  const pane = panes[index];
  const [barHidden, setBarHidden] = useState(false);
  if (!pane) return null;
  const module = bibles.find((b) => b.id === pane.moduleId) || bibles[0];
  return (
    <section className={`reader ${settings.focusMode && barHidden ? 'bar-hidden' : ''}`} aria-label={index === 0 ? 'Основная панель' : 'Вторая панель'}>
      <ReaderToolbar index={index} pane={pane} module={module} />
      <ChapterView
        index={index}
        pane={pane}
        module={module}
        onScrollDirection={(down) => settings.focusMode && setBarHidden(down)}
      />
    </section>
  );
}
