// Заметка к стиху (или к выделенным стихам — хранится у первого из них)
import React, { useEffect, useRef, useState } from 'react';
import { Trash2, Save } from 'lucide-react';
import BottomSheet from './BottomSheet.jsx';
import { useApp } from '../App.jsx';
import { selectionLabel, selectionText } from './SelectionBar.jsx';
import { ConfirmButton } from './ui.jsx';
import LinkedText from './LinkedText.jsx';
import { hasRefs } from '../core/refLinks.js';
import { t, fmtDateTime } from '../core/i18n.js';

export default function NoteSheet({ pane, payload, onClose }) {
  const { notes, setNote, toast, openInOther } = useApp();
  const refs = payload.refs;
  const first = refs[0];
  const key = `${first.book}.${first.chapter}.${first.verse}`;
  const existing = notes[key];
  const label = existing?.label || selectionLabel(refs, true);
  const [text, setText] = useState(existing?.text || '');
  const [verse, setVerse] = useState('');
  const area = useRef(null);

  useEffect(() => {
    if (payload.moduleId) selectionText(payload.moduleId, refs).then(setVerse);
    setTimeout(() => area.current?.focus(), 250);
  }, []);

  const save = () => {
    setNote(first, text, label);
    toast(text.trim() ? t('Заметка сохранена') : t('Заметка удалена'));
    onClose();
  };

  return (
    <BottomSheet
      title={existing ? t('Заметка') : t('Новая заметка')}
      subtitle={label}
      onClose={onClose}
      initial={1}
      footer={
        <div className="row-actions note-actions">
          {existing && (
            <ConfirmButton className="btn" confirmText={t('Удалить')} onConfirm={() => (setNote(first, ''), toast(t('Заметка удалена')), onClose())}>
              <Trash2 size={16} /> {t('Удалить')}
            </ConfirmButton>
          )}
          <button className="btn primary push" onClick={save}>
            <Save size={16} /> {t('Сохранить')}
          </button>
        </div>
      }
    >
      {verse && <blockquote className="xref-source">{verse}</blockquote>}
      <label htmlFor="note-text" className="sr-only">
        {t('Текст заметки')}
      </label>
      <textarea
        id="note-text"
        ref={area}
        className="note-area"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={t('Ваши мысли, вопросы, ссылки…')}
        rows={7}
        onKeyDown={(e) => (e.metaKey || e.ctrlKey) && e.key === 'Enter' && save()}
      />
      {hasRefs(text) && (
        <p className="note-preview">
          <LinkedText
            text={text}
            onOpen={(r) => {
              setNote(first, text, label);
              onClose();
              openInOther(pane, r);
            }}
          />
        </p>
      )}
      {existing && <p className="field-hint">{t('Создана {date}', { date: fmtDateTime(existing.at, { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) })}</p>}
    </BottomSheet>
  );
}
