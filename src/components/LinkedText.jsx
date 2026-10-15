// Текст, в котором ссылки на стихи («Ин 3:16») — кнопки; нажатие открывает место (обычно во второй панели)
import React, { useMemo } from 'react';
import { splitRefs } from '../core/refLinks.js';

export default function LinkedText({ text, onOpen, className = '' }) {
  const parts = useMemo(() => splitRefs(text || ''), [text]);
  return (
    <span className={className}>
      {parts.map((p, i) =>
        p.ref ? (
          <button key={i} type="button" className="ref-link" onClick={() => onOpen(p.ref)}>
            {p.text}
          </button>
        ) : (
          <React.Fragment key={i}>{p.text}</React.Fragment>
        )
      )}
    </span>
  );
}
