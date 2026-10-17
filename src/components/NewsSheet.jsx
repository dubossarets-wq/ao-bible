// «Что нового»: изменения после обновления — простым списком, крупным понятным текстом.
import React, { useEffect } from 'react';
import BottomSheet from './BottomSheet.jsx';
import { NEWS, markNewsSeen } from '../core/whatsNew.js';
import { t, fmtDate } from '../core/i18n.js';

const fmt = (id) => fmtDate(`${id}T12:00`, { day: 'numeric', month: 'long' });

export default function NewsSheet({ payload, onClose }) {
  const list = payload.items?.length ? payload.items : NEWS.slice(0, 1);
  useEffect(() => markNewsSeen(), []);
  return (
    <BottomSheet title={t('Что нового')} subtitle={t('Обновление от {date}', { date: fmt(list[0].id) })} onClose={onClose} initial={2}>
      <div className="news">
        {list.map((n) => (
          <ul key={n.id} className="news-list">
            {n.items.map((text) => (
              <li key={text}>{t(text)}</li>
            ))}
          </ul>
        ))}
        <button className="btn primary news-ok" onClick={onClose}>
          {t('Понятно')}
        </button>
      </div>
    </BottomSheet>
  );
}
