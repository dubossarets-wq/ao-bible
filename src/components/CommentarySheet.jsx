// Комментарий к стиху: вкладки по модулям-комментариям, текст статьи на половину экрана.
import React, { useEffect, useState } from 'react';
import { Loader2, MessageSquareText } from 'lucide-react';
import BottomSheet from './BottomSheet.jsx';
import { commentaryFor } from '../core/commentary.js';
import { formatRef } from '../core/books.js';
import { Empty } from './ui.jsx';

export default function CommentarySheet({ payload, onClose }) {
  const { ref, moduleId } = payload;
  const [res, setRes] = useState(null);
  const [sel, setSel] = useState(moduleId || null);

  useEffect(() => {
    commentaryFor(ref).then((r) => {
      setRes(r);
      if (!r.some((x) => x.module.id === sel)) setSel(r[0]?.module.id || null);
    });
  }, []);

  const cur = res?.find((x) => x.module.id === sel);
  return (
    <BottomSheet title={`Комментарий · ${formatRef(ref)}`} subtitle={cur?.module.title || cur?.module.name} onClose={onClose} initial={0}>
      {!res && (
        <div className="loading">
          <Loader2 className="spin" size={20} /> Загрузка…
        </div>
      )}
      {res && !res.length && <Empty icon={MessageSquareText} title="Комментариев к этому стиху нет" />}
      {res && res.length > 1 && (
        <div className="tabs" role="tablist">
          {res.map((x) => (
            <button key={x.module.id} role="tab" aria-selected={x.module.id === sel} className={x.module.id === sel ? 'on' : ''} onClick={() => setSel(x.module.id)}>
              {x.module.name}
            </button>
          ))}
        </div>
      )}
      {cur?.items.map((it) => (
        <article key={it.key} className="entry">
          <h4>
            {formatRef(it.ref, { full: true })}
            {it.title ? ` · ${it.title}` : ''}
          </h4>
          <p className="prewrap commentary-text">{it.text}</p>
        </article>
      ))}
      {cur && <p className="source-note">{[cur.module.name, cur.module.author, cur.module.license].filter(Boolean).join(' · ')}</p>}
    </BottomSheet>
  );
}
