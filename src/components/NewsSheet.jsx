// «Что нового»: короткий список изменений после обновления — крупно, с понятными значками.
import React, { useEffect } from 'react';
import { ScrollText, Headphones, Keyboard, BookOpen, CalendarCheck, Bell, Sparkles } from 'lucide-react';
import BottomSheet from './BottomSheet.jsx';
import { NEWS, markNewsSeen } from '../core/whatsNew.js';

const ICONS = { ScrollText, Headphones, Keyboard, BookOpen, CalendarCheck, Bell };
const fmt = (id) => new Date(`${id}T12:00`).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });

export default function NewsSheet({ payload, onClose }) {
  const list = payload.items?.length ? payload.items : NEWS.slice(0, 1);
  useEffect(() => markNewsSeen(), []);
  return (
    <BottomSheet title="Что нового" subtitle={`Обновление от ${fmt(list[0].id)}`} onClose={onClose} initial={2}>
      <div className="news">
        {list.map((n) => (
          <ul key={n.id} className="news-list">
            {n.items.map((it) => {
              const Icon = ICONS[it.icon] || Sparkles;
              return (
                <li key={it.title}>
                  <span className="news-icon" aria-hidden="true">
                    <Icon size={20} />
                  </span>
                  <span>
                    <strong>{it.title}</strong>
                    {it.text}
                  </span>
                </li>
              );
            })}
          </ul>
        ))}
        <button className="btn primary news-ok" onClick={onClose}>
          Понятно
        </button>
      </div>
    </BottomSheet>
  );
}
