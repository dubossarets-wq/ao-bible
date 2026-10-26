// Карты: список карт из установленных модулей и просмотр с увеличением.
import React, { useEffect, useState } from 'react';
import { Map as MapIcon, ZoomIn, ZoomOut, MapPin, Search, Maximize2, X } from 'lucide-react';
import BottomSheet from './BottomSheet.jsx';
import { useApp } from '../App.jsx';
import { getPayload } from '../core/modules.js';
import { parseOsisRef, formatRef } from '../core/books.js';
import { Empty } from './ui.jsx';
import { t } from '../core/i18n.js';

export default function MapsSheet({ pane, onClose }) {
  const { modules, openSheet, openInOther, openPlaceMap } = useApp();
  const mapMods = modules.filter((m) => m.type === 'maps' && m.enabled !== false);
  const [maps, setMaps] = useState(null);
  const [open, setOpen] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [full, setFull] = useState(false); // карта на весь экран (в окне она не увеличивается)
  const [places, setPlaces] = useState([]);
  const [q, setQ] = useState('');

  useEffect(() => {
    Promise.all(mapMods.map(async (m) => ((await getPayload(m.id))?.maps || []).map((x) => ({ ...x, module: m })))).then((l) => setMaps(l.flat()));
    Promise.all(mapMods.map(async (m) => ((await getPayload(m.id))?.places || []).map((x) => ({ ...x, module: m })))).then((l) => setPlaces(l.flat()));
  }, [modules]);

  const query = q.trim().toLowerCase().replace(/ё/g, 'е');
  const found = query.length >= 2 ? places.filter((p) => p.name.toLowerCase().replace(/ё/g, 'е').includes(query)).slice(0, 50) : [];

  if (open)
    return (
      <BottomSheet
        title={open.title}
        subtitle={open.module.name}
        onClose={onClose}
        onBack={() => (setOpen(null), setZoom(1))}
        variant="wide"
      >
        {/* в окне — просто картинка; нажатие — на весь экран с увеличением и ✕ */}
        <button type="button" className="map-view map-open" onClick={() => (setZoom(1), setFull(true))} aria-label={t('Увеличить')}>
          <img src={open.image} alt={open.title} />
          <span className="map-open-badge" aria-hidden="true">
            <Maximize2 size={16} />
          </span>
        </button>
        {full && (
          <div className="map-full" role="dialog" aria-label={open.title}>
            <div className="map-full-scroll">
              <img src={open.image} alt={open.title} style={{ width: `${zoom * 100}%` }} />
            </div>
            <div className="map-full-btns">
              <button className="map-full-btn" aria-label={t('Уменьшить')} onClick={() => setZoom((z) => Math.max(1, z / 1.5))}>
                <ZoomOut size={20} />
              </button>
              <button className="map-full-btn" aria-label={t('Увеличить')} onClick={() => setZoom((z) => Math.min(6, z * 1.5))}>
                <ZoomIn size={20} />
              </button>
              <button className="map-full-btn" aria-label={t('Закрыть')} onClick={() => setFull(false)}>
                <X size={20} />
              </button>
            </div>
          </div>
        )}
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
    <BottomSheet title={t('Карты')} onClose={onClose} initial={1}>
      {places.length > 0 && (
        <section className="nav-group">
          <h4>{t('Места')} · {places.length}</h4>
          <div className="input-wrap">
            <Search size={18} className="input-icon" />
            <label htmlFor="place-q" className="sr-only">
              {t('Найти место')}
            </label>
            <input id="place-q" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Найти место: Хеврон, Вифлеем…')} autoComplete="off" />
          </div>
          {found.length > 0 && (
            <ul className="list">
              {found.map((p) => (
                <li key={`${p.module.id}|${p.id}`} className="list-row">
                  <button className="list-main stacked" onClick={() => (onClose(), openPlaceMap(p))}>
                    <span className="list-title">
                      <MapPin size={14} className="accent" /> {p.name}
                    </span>
                    <span className="list-text">{[p.type, p.modern].filter(Boolean).join(' · ')}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {query.length >= 2 && !found.length && <p className="field-hint">{t('Ничего не найдено.')}</p>}
        </section>
      )}
      {maps && !maps.length && !places.length && (
        <Empty icon={MapIcon} title={t('Карты не установлены')}>
          {t('Установите карты из каталога.')}{' '}
          <button className="link-inline" onClick={() => openSheet('library', pane, { tab: 'catalog', section: 'maps' })}>
            {t('Открыть библиотеку')}
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
    </BottomSheet>
  );
}
