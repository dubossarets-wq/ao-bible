// Одна или несколько (до MAX_PANES) независимых панелей чтения, всегда поровну (размер панелей не меняется:
// перетаскивание разделителя убрано по решению владельца 04.11.2026; сохранённая splitRatio больше не используется).
// Расположение: на широком экране — рядом, на узком/вертикальном — одна над другой.
import React, { useEffect, useState } from 'react';
import { useApp } from '../App.jsx';
import BibleReader from './BibleReader.jsx';

function useOrientation(pref) {
  const calc = () => {
    if (pref === 'rows' || pref === 'columns') return pref;
    const w = window.innerWidth;
    const h = window.visualViewport?.height || window.innerHeight;
    return w >= 720 && w > h * 0.9 ? 'columns' : 'rows';
  };
  const [o, setO] = useState(calc);
  useEffect(() => {
    const on = () => setO(calc());
    on();
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, [pref]);
  return o;
}

export default function SplitScreenReader() {
  const { panes, settings } = useApp();
  const orientation = useOrientation(settings.splitLayout);
  const list = panes.filter(Boolean);
  const n = list.length;
  const split = n > 1;

  return (
    <div className={`split ${orientation} ${split ? 'is-split' : ''} ${n > 2 ? 'many' : ''}`} style={{ '--ratio': split ? 1 / n : 1 }}>
      {list.map((p, i) => (
        <React.Fragment key={i}>
          {/* разделитель — только линия: размер панелей не меняется (поровну), тянуть нечего */}
          {i > 0 && <div className="divider" role="separator" aria-orientation={orientation === 'columns' ? 'vertical' : 'horizontal'} />}
          {/* first / second — у второй и следующих одни правила оформления (шапка без отступа под вырез экрана) */}
          {/* друг над другом нижнюю панель снизу закрывают вкладки: их высота (--tabbar-h) — сверх её доли,
              чтобы видимая часть у всех панелей была поровну */}
          <div className={`pane-slot ${i === 0 ? 'first' : 'second'} p${i}`} style={split ? { flex: `1 1 ${orientation === 'rows' && i === n - 1 ? 'var(--tabbar-h)' : '0px'}` } : undefined}>
            <BibleReader index={i} />
          </div>
        </React.Fragment>
      ))}
    </div>
  );
}
