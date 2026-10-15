// Всплывающая выборка над словом: «H7887 · Стронг: иврит», «H7887 · Симфония RST+» …
// Выбор пункта открывает статью в нижнем окне на половину экрана.
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Loader2, MapPin } from 'lucide-react';
import { useApp } from '../App.jsx';
import { lookupWord } from '../core/lexicon.js';
import { markClosedOnWord } from '../core/tapState.js';
import { placesForWord } from '../core/places.js';

const GAP = 10;

export default function WordPopover() {
  const { popover, closePopover, openSheet, openPlaceMap } = useApp();
  const [res, setRes] = useState(null);
  const [pos, setPos] = useState(null);
  const box = useRef(null);

  useEffect(() => {
    setRes(null);
    if (!popover) return;
    let alive = true;
    Promise.all([lookupWord({ token: popover.token, ref: popover.ref }), placesForWord(popover.token, popover.ref).catch(() => [])]).then(
      ([r, places]) => alive && setRes({ ...r, places })
    );
    return () => {
      alive = false;
    };
  }, [popover?.id]);

  // Позиция: под словом, а если внизу мало места — над ним; по горизонтали — в пределах экрана
  useLayoutEffect(() => {
    if (!popover || !box.current) return;
    const a = popover.rect;
    const w = box.current.offsetWidth;
    const h = box.current.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.visualViewport?.height || window.innerHeight;
    const below = a.bottom + GAP + h < vh - 8 || a.top - GAP - h < 8;
    const left = Math.max(8, Math.min(vw - w - 8, a.left + a.width / 2 - w / 2));
    const arrow = Math.max(16, Math.min(w - 16, a.left + a.width / 2 - left));
    setPos({ left, top: below ? a.bottom + GAP : a.top - GAP - h, below, arrow });
  }, [popover?.id, res]);

  useEffect(() => {
    if (!popover) return;
    const onKey = (e) => e.key === 'Escape' && closePopover();
    const onDown = (e) => {
      if (box.current?.contains(e.target)) return;
      const w = e.target.closest?.('.w.active');
      if (w) markClosedOnWord(w);
      closePopover();
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('scroll', closePopover, true);
    window.addEventListener('resize', closePopover);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('scroll', closePopover, true);
      window.removeEventListener('resize', closePopover);
    };
  }, [popover?.id]);

  if (!popover) return null;

  const items = res ? res.results.flatMap((r) => r.found.map((f) => ({ module: r.module, key: f.key, label: f.entry.lemma || f.entry.word || '' }))) : [];
  const approx = res?.mapping.mode === 'approx';
  const places = res?.places || [];

  const choose = (it) => {
    closePopover({ keepWord: true });
    openSheet('dict', popover.pane, { ...popover.payload, preselect: { moduleId: it.module.id, key: it.key }, initial: 0 });
  };

  return (
    <div
      ref={box}
      className={`word-pop ${pos ? (pos.below ? 'below' : 'above') : 'measuring'}`}
      style={pos ? { left: pos.left, top: pos.top, '--arrow': `${pos.arrow}px` } : undefined}
      role="menu"
      aria-label={`Словари для слова «${popover.token.text}»`}
    >
      {!res && (
        <div className="wp-item wp-muted">
          <Loader2 className="spin" size={16} /> Поиск…
        </div>
      )}
      {res && approx && <div className="wp-note">≈ приблизительно: перевод без номеров Стронга</div>}
      {places.map((pl) => (
        <button
          key={`place|${pl.id}`}
          role="menuitem"
          className="wp-item wp-place"
          onClick={() => {
            closePopover();
            openPlaceMap(pl);
          }}
        >
          <MapPin size={17} className="wp-pin" />
          <span className="wp-key">{pl.name}</span>
          <span className="wp-sep">·</span>
          <span className="wp-dict">Карта</span>
        </button>
      ))}
      {res &&
        items.map((it) => (
          <button key={`${it.module.id}|${it.key}`} role="menuitem" className="wp-item" onClick={() => choose(it)}>
            <span className="wp-key">{it.key.startsWith('H') || it.key.startsWith('G') ? it.key : it.label || it.key}</span>
            <span className="wp-sep">·</span>
            <span className="wp-dict">{it.module.name}</span>
          </button>
        ))}
      {res && !items.length && !places.length && (
        <>
          <div className="wp-item wp-muted">Статей для «{popover.token.text}» нет</div>
          <button
            role="menuitem"
            className="wp-item"
            onClick={() => {
              closePopover();
              openSheet('library', popover.pane, { tab: 'installed' });
            }}
          >
            Словари в библиотеке
          </button>
        </>
      )}
    </div>
  );
}
