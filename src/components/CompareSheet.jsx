// Сравнение выделенных стихов во всех установленных переводах.
// У каждого перевода — кнопка «Параллельно»: экран делится, в другой панели открывается этот перевод на том же месте.
import React, { useEffect, useState } from 'react';
import { Columns2, Library, Loader2 } from 'lucide-react';
import BottomSheet from './BottomSheet.jsx';
import { useApp } from '../App.jsx';
import { selectionLabel, selectionText } from './SelectionBar.jsx';
import { Empty } from './ui.jsx';

export default function CompareSheet({ pane, payload, onClose }) {
  const { bibles, openParallel, openSheet } = useApp();
  const { refs, moduleId, pick, copyFallback } = payload;
  const [texts, setTexts] = useState(null);
  const others = bibles.filter((b) => b.id !== moduleId);
  const current = bibles.find((b) => b.id === moduleId);
  const ordered = [current, ...others].filter(Boolean);

  useEffect(() => {
    let alive = true;
    Promise.all(ordered.map(async (b) => [b.id, await selectionText(b.id, refs)])).then((list) => alive && setTexts(Object.fromEntries(list)));
    return () => {
      alive = false;
    };
  }, []);

  const open = (id) => {
    onClose();
    openParallel(pane, refs[0], id);
  };

  if (copyFallback)
    return (
      <BottomSheet title="Скопируйте текст" subtitle="Браузер не дал скопировать автоматически" onClose={onClose} initial={0}>
        <textarea className="copy-area" readOnly value={copyFallback} onFocus={(e) => e.target.select()} autoFocus rows={6} />
      </BottomSheet>
    );

  return (
    <BottomSheet
      title={pick ? 'Параллельно в другом переводе' : 'Сравнение переводов'}
      subtitle={selectionLabel(refs, true)}
      onClose={onClose}
      initial={pick ? 1 : 2}
    >
      {others.length === 0 && (
        <Empty icon={Library} title="Другой перевод не установлен">
          Чтобы читать параллельно, установите ещё один перевод из каталога или импортируйте свой JSON.{' '}
          <button className="link-inline" onClick={() => openSheet('library', pane, { tab: 'catalog' })}>
            Открыть каталог
          </button>
        </Empty>
      )}
      {!texts && (
        <div className="loading">
          <Loader2 className="spin" size={20} /> Загружаю переводы…
        </div>
      )}
      {texts && (
        <ul className="compare-list">
          {ordered.map((b) => (
            <li key={b.id} className={`compare-item ${b.id === moduleId ? 'current' : ''}`}>
              <div className="compare-head">
                <span className="compare-name">{b.name}</span>
                <span className="compare-title">{b.id === moduleId ? 'открыт сейчас' : b.title}</span>
                {b.id !== moduleId && (
                  <button className="btn small primary" onClick={() => open(b.id)}>
                    <Columns2 size={14} /> Параллельно
                  </button>
                )}
              </div>
              <p className="compare-text">{texts[b.id] || <span className="muted">В этом переводе нет такого места.</span>}</p>
            </li>
          ))}
        </ul>
      )}
    </BottomSheet>
  );
}
