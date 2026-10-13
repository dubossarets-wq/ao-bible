// Карты: список карт из установленных модулей и просмотр с увеличением.
import React, { useEffect, useState } from 'react';
import { Map as MapIcon, ZoomIn, ZoomOut, Library } from 'lucide-react';
import BottomSheet from './BottomSheet.jsx';
import { useApp } from '../App.jsx';
import { getPayload } from '../core/modules.js';
import { parseOsisRef, formatRef } from '../core/books.js';
import { Empty } from './ui.jsx';

export default function MapsSheet({ pane, onClose }) {
  const { modules, openSheet, openInOther } = useApp();
  const mapMods = modules.filter((m) => m.type === 'maps' && m.enabled !== false);
  const [maps, setMaps] = useState(null);
  const [open, setOpen] = useState(null);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    Promise.all(mapMods.map(async (m) => ((await getPayload(m.id))?.maps || []).map((x) => ({ ...x, module: m })))).then((l) => setMaps(l.flat()));
  }, [modules]);

  if (open)
    return (
      <BottomSheet
        title={open.title}
        subtitle={open.module.name}
        onClose={onClose}
        onBack={() => (setOpen(null), setZoom(1))}
        variant="wide"
        headerExtra={
          <>
            <button className="icon-btn" aria-label="Уменьшить" onClick={() => setZoom((z) => Math.max(1, z / 1.5))}>
              <ZoomOut size={20} />
            </button>
            <button className="icon-btn" aria-label="Увеличить" onClick={() => setZoom((z) => Math.min(6, z * 1.5))}>
              <ZoomIn size={20} />
            </button>
          </>
        }
      >
        <div className="map-view">
          <img src={open.image} alt={open.title} style={{ width: `${zoom * 100}%` }} />
        </div>
        {open.description && <p className="prewrap">{open.description}</p>}
        {open.refs.length > 0 && (
          <div className="chips">
            {open.refs.map((r) => {
              const p = parseOsisRef(r);
              return p ? (
                <button key={r} className="chip" onClick={() => (onClose(), openInOther(pane, p))}>
                  {formatRef(p)}
                </button>
              ) : null;
            })}
          </div>
        )}
      </BottomSheet>
    );

  return (
    <BottomSheet title="Карты" onClose={onClose} initial={1}>
      {maps && !maps.length && (
        <Empty icon={MapIcon} title="Карты не установлены">
          Модули карт можно установить из каталога или импортировать из JSON.{' '}
          <button className="link-inline" onClick={() => openSheet('library', pane, { tab: 'catalog', section: 'maps' })}>
            Открыть библиотеку
          </button>
        </Empty>
      )}
      {maps?.length > 0 && (
        <ul className="map-list">
          {maps.map((m) => (
            <li key={`${m.module.id}|${m.id}`}>
              <button className="map-row" onClick={() => setOpen(m)}>
                <img src={m.image} alt="" loading="lazy" />
                <span className="map-text">
                  <span className="map-title">{m.title}</span>
                  <span className="map-desc">{m.description || m.module.name}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {!maps && null}
      {maps && !maps.length ? null : (
        <p className="sheet-hint">
          <Library size={14} /> Модули карт подключаются в библиотеке модулей.
        </p>
      )}
    </BottomSheet>
  );
}
