// «Добавить в проповедь»: выбор проповеди или новая проповедь; выделенные стихи добавляются сами.
import React, { useEffect, useState } from 'react';
import { Check, Plus, ScrollText } from 'lucide-react';
import BottomSheet from './BottomSheet.jsx';
import { useApp } from '../App.jsx';
import { getVerse } from '../core/modules.js';
import { plainText } from '../core/verseMarkup.js';
import { useSermons, createSermon, addVerses } from '../core/sermons.js';
import { selectionLabel } from './SelectionBar.jsx';
import { places } from './SermonsSheet.jsx';

export default function SermonAddSheet({ pane, payload, onClose }) {
  const { openSheet } = useApp();
  const sermons = useSermons();
  const { refs = [], moduleId } = payload;
  const [title, setTitle] = useState('');
  const [done, setDone] = useState(null); // { id, title }
  const [texts, setTexts] = useState(null);
  const label = selectionLabel(refs, true) + (payload.fragment ? ' (часть)' : '');

  // Часть стиха (payload.fragment) — берём выбранные слова, а не весь стих
  const fragment = payload.fragment || null;
  useEffect(() => {
    if (fragment) return setTexts([fragment.text]);
    Promise.all(refs.map((r) => getVerse(moduleId, r))).then((vs) => setTexts(vs.map((v) => (v ? plainText(v) : ''))));
  }, []);

  const add = (id, name) => {
    addVerses(
      id,
      refs.map((r, i) => ({ ...r, text: texts?.[i] || '', ...(fragment ? { part: true } : {}) })),
      moduleId
    );
    setDone({ id, title: name });
  };
  const createAndAdd = (e) => {
    e?.preventDefault();
    const name = title.trim() || 'Новая проповедь';
    add(createSermon(name), name);
  };

  if (done)
    return (
      <BottomSheet title="Добавлено" onClose={onClose} initial={1}>
        <div className="sermon-done">
          {/* Галочка — по центру свободного места, надпись и кнопки — внизу окна */}
          <div className="sermon-done-top">
            <span className="sermon-done-mark" aria-hidden="true">
              <Check size={34} strokeWidth={2.6} />
            </span>
          </div>
          <p>
            <strong>{label}</strong> — в проповеди «{done.title}».
          </p>
          <div className="pref-btns">
            <button className="btn primary" onClick={() => openSheet('sermons', pane, { open: done.id })}>
              <ScrollText size={17} /> Открыть проповедь
            </button>
            <button className="btn" onClick={onClose}>
              Читать дальше
            </button>
          </div>
        </div>
      </BottomSheet>
    );

  return (
    <BottomSheet title="Добавить в проповедь" subtitle={label} onClose={onClose} initial={1}>
      <form className="sermon-new" onSubmit={createAndAdd}>
        <label htmlFor="sermon-title" className="field-label">
          {sermons.length ? 'Новая проповедь' : 'Назовите проповедь'}
        </label>
        <div className="ref-form">
          <input id="sermon-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Например: Благодать Божья" autoComplete="off" autoFocus={!sermons.length} enterKeyHint="done" />
          <button className="btn primary" type="submit" disabled={!texts}>
            <Plus size={17} /> Создать
          </button>
        </div>
      </form>
      {sermons.length > 0 && (
        <section className="nav-group">
          <h4>Или выберите проповедь</h4>
          <div className="sermon-pick">
            {sermons.map((s) => (
              <button key={s.id} className="sermon-pick-row" disabled={!texts} onClick={() => add(s.id, s.title)}>
                <ScrollText size={18} />
                <span>
                  {s.title}
                  <small>
                    {places(s.blocks.filter((b) => b.type === 'verse').length)}
                    {s.date ? ` · ${new Date(s.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}` : ''}
                  </small>
                </span>
                <Plus size={18} className="sermon-pick-add" />
              </button>
            ))}
          </div>
        </section>
      )}
    </BottomSheet>
  );
}
