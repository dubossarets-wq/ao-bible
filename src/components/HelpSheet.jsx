// Инструкция: список уроков. Нажатие на урок закрывает окно и показывает прямо в приложении,
// куда нажимать: нужное место подсвечено, остальной экран затемнён, внизу — шаги.
import React, { useMemo, useState } from 'react';
import { ChevronRight, Hand } from 'lucide-react';
import BottomSheet from './BottomSheet.jsx';
import { startTour } from '../core/tour.js';
import { TOURS } from './tours.js';

export default function HelpSheet({ onClose }) {
  const [q, setQ] = useState('');
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? TOURS.filter((t) => (t.title + ' ' + t.steps.map((x) => x.text).join(' ')).toLowerCase().includes(s)) : TOURS;
  }, [q]);
  const groups = [...new Set(list.map((t) => t.group))];
  const start = (id) => {
    onClose();
    setTimeout(() => startTour(id), 200);
  };

  return (
    <BottomSheet title="Инструкция" onClose={onClose} initial={2}>
      <p className="help-intro">
        <Hand size={18} /> Выберите, что хотите сделать, — приложение покажет, куда нажимать.
      </p>
      <div className="input-wrap">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Например: проповедь, слушать, шрифт" aria-label="Поиск по инструкции" autoComplete="off" />
      </div>
      {groups.map((g) => (
        <section key={g} className="nav-group">
          <h4>{g}</h4>
          <div className="pref-list-main">
            {list
              .filter((t) => t.group === g)
              .map((t) => (
                <button key={t.id} className="pref-row" onClick={() => start(t.id)}>
                  <t.icon size={19} />
                  <span className="pref-row-text">
                    {t.title}
                    <small>{t.steps.length} {t.steps.length < 5 ? 'шага' : 'шагов'} · показать на экране</small>
                  </span>
                  <ChevronRight size={17} className="pref-chev" />
                </button>
              ))}
          </div>
        </section>
      ))}
      {!list.length && <p className="pref-note">Ничего не нашлось. Попробуйте другое слово.</p>}
    </BottomSheet>
  );
}
