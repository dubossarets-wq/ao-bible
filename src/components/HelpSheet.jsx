// Инструкция: список уроков. Нажатие на урок закрывает окно и показывает прямо в приложении,
// куда нажимать: нужное место подсвечено, остальной экран затемнён, внизу — шаги.
import React, { useMemo, useState } from 'react';
import { ChevronRight, Hand } from 'lucide-react';
import BottomSheet from './BottomSheet.jsx';
import { startTour } from '../core/tour.js';
import { TOURS } from './tours.js';
import { t } from '../core/i18n.js';

export default function HelpSheet({ onClose }) {
  const [q, setQ] = useState('');
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? TOURS.filter((x) => (t(x.title) + ' ' + x.steps.map((st) => t(st.text)).join(' ')).toLowerCase().includes(s)) : TOURS;
  }, [q]);
  const groups = [...new Set(list.map((x) => x.group))];
  const start = (id) => {
    onClose();
    setTimeout(() => startTour(id), 200);
  };

  return (
    <BottomSheet title={t('Инструкция')} onClose={onClose} initial={2}>
      <p className="help-intro">
        <Hand size={18} /> {t('Выберите тему — покажем, куда нажимать.')}
      </p>
      <div className="input-wrap">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Например: проповедь, слушать, шрифт')} aria-label={t('Поиск по инструкции')} autoComplete="off" />
      </div>
      {groups.map((g) => (
        <section key={g} className="nav-group">
          <h4>{t(g)}</h4>
          <div className="pref-list-main">
            {list
              .filter((x) => x.group === g)
              .map((x) => (
                <button key={x.id} className="pref-row" onClick={() => start(x.id)}>
                  <x.icon size={19} />
                  <span className="pref-row-text">
                    {t(x.title)}
                    <small>{t('{n} шаг|{n} шага|{n} шагов', { n: x.steps.length })}</small>
                  </span>
                  <ChevronRight size={17} className="pref-chev" />
                </button>
              ))}
          </div>
        </section>
      ))}
      {!list.length && <p className="pref-note">{t('Ничего не нашлось. Попробуйте другое слово.')}</p>}
    </BottomSheet>
  );
}
