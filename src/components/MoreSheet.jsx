// Лист «Ещё» (вкладка на нижней панели телефона): все пункты бывшего меню ⋮, кроме тех, у которых своя вкладка.
// Действие (закладка, «Слушать», переход) закрывает лист; переключатели («Режим чтения» и т. п.) — нет.
import React from 'react';
import BottomSheet from './BottomSheet.jsx';
import { useApp } from '../App.jsx';
import { moreItems, MoreItem } from './moreItems.jsx';
import { useLivePosition } from '../core/livePosition.js';
import { t } from '../core/i18n.js';

export default function MoreSheet({ pane, onClose }) {
  const app = useApp();
  const i = app.panes[pane] && app.panes[pane].kind !== 'map' ? pane : 0;
  const p = app.panes[i];
  const ref = useLivePosition(i, p.ref);
  const module = app.bibles.find((b) => b.id === p.moduleId) || app.bibles[0];
  const items = moreItems(app, { index: i, ref, module, sheet: true });
  return (
    <BottomSheet title={t('Ещё')} onClose={onClose}>
      <div className="more-list" role="menu" aria-label={t('Ещё')}>
        {items.map((it) => (
          <MoreItem key={it.key} item={it} onDone={(x) => !x.keep && onClose()} />
        ))}
      </div>
    </BottomSheet>
  );
}
