// Параллельные места стиха: ссылка + текст из перевода текущей панели.
// Нажатие открывает место во второй панели (экран делится автоматически).
import React, { useEffect, useState } from 'react';
import { Loader2, Columns2, Link2 } from 'lucide-react';
import BottomSheet from './BottomSheet.jsx';
import { useApp } from '../App.jsx';
import { refsForVerse, textForRef } from '../core/crossrefs.js';
import { formatRef, bookMeta } from '../core/books.js';
import { getVerse } from '../core/modules.js';
import { plainText } from '../core/verseMarkup.js';
import { Empty, Hint } from './ui.jsx';
import { t } from '../core/i18n.js';

export default function CrossReferencesSheet({ pane, payload, onClose }) {
  const { openInOther, panes, bibles } = useApp();
  const moduleId = panes[pane]?.moduleId || payload.moduleId;
  const module = bibles.find((b) => b.id === moduleId);
  const { ref } = payload;
  const [items, setItems] = useState(null);
  const [source, setSource] = useState('');

  useEffect(() => {
    let alive = true;
    (async () => {
      const v = await getVerse(moduleId, ref);
      if (alive) setSource(v ? plainText(v) : '');
      const refs = await refsForVerse(moduleId, ref);
      const out = [];
      // Подгружаем тексты по мере готовности, чтобы список появлялся сразу
      for (let i = 0; i < refs.length; i++) {
        const t = await textForRef(moduleId, refs[i].ref);
        out.push({ ...refs[i], ...t });
        if (alive && (i % 6 === 5 || i === refs.length - 1)) setItems([...out]);
      }
      if (alive && !refs.length) setItems([]);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const open = (r) => {
    onClose();
    openInOther(pane, { book: r.book, chapter: r.chapter, verse: r.verse });
  };

  return (
    <BottomSheet title={t('Параллельные места · {ref}', { ref: formatRef(ref) })} subtitle={module ? module.name : null} onClose={onClose} initial={1}>
      {source && <blockquote className="xref-source">{source}</blockquote>}
      {!items && (
        <div className="loading">
          <Loader2 className="spin" size={20} /> {t('Загрузка…')}
        </div>
      )}
      {items && items.length === 0 && <Empty icon={Link2} title={t('Параллельных мест нет')} />}
      {items && items.length > 0 && (
        <>
          <h4 className="sheet-h4">
            {t('Места')} · {items.length}
            <Hint>{pane === 0 ? t('Место откроется во второй панели.') : t('Место откроется здесь; вернуться — кнопкой «назад».')}</Hint>
          </h4>
          <ul className="xref-list">
            {items.map((it) => (
              <li key={it.osis}>
                <button className="xref-row" onClick={() => open(it.ref)}>
                  <span className="xref-ref">{formatRef(it.ref, { full: true })}</span>
                  {it.parts.length ? (
                    <span className="xref-text">
                      {it.parts.map((p, i) => (
                        <React.Fragment key={i}>
                          {it.parts.length > 1 && <sup className="xref-vn">{p.verse}</sup>}
                          {p.text}{' '}
                        </React.Fragment>
                      ))}
                      {it.truncated && <span className="muted">…</span>}
                    </span>
                  ) : (
                    <span className="xref-text muted">{t('В переводе {module} нет этой книги.', { module: module?.name, book: bookMeta(it.ref.book).name })}</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </BottomSheet>
  );
}
