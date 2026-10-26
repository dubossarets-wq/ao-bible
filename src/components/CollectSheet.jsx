// «В подборку»: добавить выделенные стихи в существующую подборку или создать новую
import React, { useEffect, useState } from 'react';
import { FolderPlus, Folder, Check } from 'lucide-react';
import BottomSheet from './BottomSheet.jsx';
import { useApp } from '../App.jsx';
import { selectionLabel, selectionText } from './SelectionBar.jsx';
import { t } from '../core/i18n.js';

export default function CollectSheet({ payload, onClose }) {
  const { collections, addToCollection, toast } = useApp();
  const { refs, moduleId } = payload;
  const [name, setName] = useState('');
  const [items, setItems] = useState(null);

  useEffect(() => {
    Promise.all(refs.map(async (r) => ({ book: r.book, chapter: r.chapter, verse: r.verse, text: (await selectionText(moduleId, [r])).slice(0, 200) }))).then(setItems);
  }, []);

  const add = (id, newName) => {
    if (!items) return;
    addToCollection(id, items, newName);
    toast(t('Добавлено в подборку «{name}»', { name: newName || collections.find((c) => c.id === id)?.name }));
    onClose();
  };
  const has = (c) => refs.every((r) => c.items.some((x) => x.book === r.book && x.chapter === r.chapter && x.verse === r.verse));

  return (
    <BottomSheet title={t('В подборку')} subtitle={selectionLabel(refs, true)} onClose={onClose}>
      <form
        className="ref-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) add(null, name.trim());
        }}
      >
        <label htmlFor="collection-name" className="sr-only">
          {t('Название новой подборки')}
        </label>
        <input id="collection-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('Новая подборка: «К уроку», «Утешение»…')} autoComplete="off" />
        <button className="btn primary" type="submit" disabled={!name.trim() || !items} aria-label={t('Создать подборку')}>
          <FolderPlus size={18} />
        </button>
      </form>
      {collections.length > 0 && (
        <ul className="list">
          {collections.map((c) => (
            <li key={c.id} className="list-row">
              <button className="list-main" onClick={() => add(c.id)} disabled={!items}>
                <Folder size={16} className="accent" />
                <span className="list-title">{c.name}</span>
                <span className="list-meta">{has(c) ? <Check size={15} className="pop-in" /> : t('{n} ст.', { n: c.items.length })}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </BottomSheet>
  );
}
