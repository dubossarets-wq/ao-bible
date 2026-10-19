// Карта одного места во второй половине экрана: только точка этого места, остальные скрыты.
// Карта — MapLibre GL (загружается с CDN при первом открытии), подложка OpenFreeMap, спутник Esri.
import React, { useEffect, useRef, useState } from 'react';
import { X, MapPin, Satellite, Map as MapIcon, Loader2, ChevronDown, ExternalLink, Layers } from 'lucide-react';
import { useApp } from '../App.jsx';
import { parseOsisRef, formatRef } from '../core/books.js';
import { t } from '../core/i18n.js';

const ML_VERSION = '4.7.1';
const STYLE = 'https://tiles.openfreemap.org/styles/liberty';
const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';

let mlPromise = null;
function loadMapLibre() {
  if (window.maplibregl) return Promise.resolve(window.maplibregl);
  if (!mlPromise) {
    mlPromise = new Promise((resolve, reject) => {
      const css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = `https://cdn.jsdelivr.net/npm/maplibre-gl@${ML_VERSION}/dist/maplibre-gl.css`;
      document.head.appendChild(css);
      const js = document.createElement('script');
      js.src = `https://cdn.jsdelivr.net/npm/maplibre-gl@${ML_VERSION}/dist/maplibre-gl.js`;
      js.onload = () => resolve(window.maplibregl);
      js.onerror = () => {
        mlPromise = null;
        reject(new Error(t('Карта не загрузилась. Проверьте интернет.')));
      };
      document.head.appendChild(js);
    });
  }
  return mlPromise;
}

// Масштаб по типу места: область видна целиком, город — с окрестностями
const zoomFor = (type = '') => (/область|район|народ/.test(type) ? 6.5 : /хребет|долина|река|водоём|пустын/.test(type) ? 8.5 : 11);

export default function MapPane({ pane }) {
  const { closePlaceMap, navigate, settings } = useApp();
  const place = pane.place;
  const box = useRef(null);
  const map = useRef(null);
  const marker = useRef(null);
  const card = useRef(null);
  const [state, setState] = useState('loading');
  const [error, setError] = useState('');
  const [sat, setSat] = useState(true); // по умолчанию — спутник
  // На низкой половине экрана (телефон, панели друг над другом) карточка сначала свёрнута — видна карта
  const [cardOpen, setCardOpen] = useState(() => window.innerHeight > 700 && window.innerWidth >= 720);
  // «Только карта и точка»: скрыты подписи, дороги, границы, карточка и кнопки — остаются подложка и точка
  const [clean, setClean] = useState(false);

  // Создание карты
  useEffect(() => {
    let alive = true;
    loadMapLibre()
      .then((ml) => {
        if (!alive || !box.current) return;
        const m = new ml.Map({
          container: box.current,
          style: STYLE,
          center: [place.lng, place.lat],
          zoom: zoomFor(place.type),
          attributionControl: { compact: true },
          cooperativeGestures: false,
        });
        m.addControl(new ml.NavigationControl({ showCompass: false }), 'top-right');
        m.addControl(new ml.ScaleControl({ unit: 'metric' }), 'bottom-left');
        m.on('load', () => {
          const first = m.getStyle().layers[1]?.id;
          m.addSource('satellite', { type: 'raster', tiles: [ESRI], tileSize: 256, maxzoom: 18, attribution: t('Снимки © Esri') });
          m.addLayer({ id: 'satellite', type: 'raster', source: 'satellite', layout: { visibility: 'none' } }, first);
          alive && setState('ready');
        });
        m.on('error', (e) => console.warn('Карта:', e?.error?.message || e)); // i18n-ignore: для разработчика
        marker.current = new ml.Marker({ color: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#8c5e28' })
          .setLngLat([place.lng, place.lat])
          .addTo(m);
        map.current = m;
        const ro = new ResizeObserver(() => m.resize());
        ro.observe(box.current);
        m._aobRo = ro;
      })
      .catch((e) => {
        if (!alive) return;
        setError(e.message);
        setState('error');
      });
    return () => {
      alive = false;
      map.current?._aobRo?.disconnect();
      map.current?.remove();
      map.current = null;
    };
  }, []);

  // Другое место — переносим единственную точку и камеру
  useEffect(() => {
    if (!map.current || !marker.current) return;
    marker.current.setLngLat([place.lng, place.lat]);
    map.current.flyTo({ center: [place.lng, place.lat], zoom: zoomFor(place.type), essential: true, duration: settings.animations ? 900 : 0 });
  }, [place.id]);

  useEffect(() => {
    const m = map.current;
    if (state !== 'ready' || !m) return;
    m.setLayoutProperty('satellite', 'visibility', sat ? 'visible' : 'none');
    // В чистом режиме на спутнике видны только снимки; на обычной карте — только фон, суша и вода без подписей и линий
    for (const layer of m.getStyle().layers) {
      if (layer.id === 'satellite') continue;
      const keep = !clean || (!sat && (layer.type === 'background' || layer.type === 'fill') && !/building|aeroway|boundary/.test(layer.id));
      m.setLayoutProperty(layer.id, 'visibility', keep ? 'visible' : 'none');
    }
  }, [sat, clean, state]);

  // Точка не должна прятаться под карточкой: сдвигаем «центр» карты на свободную часть
  useEffect(() => {
    const m = map.current;
    const c = card.current;
    if (!m || !c || !box.current) return;
    const fit = () => {
      const area = box.current.getBoundingClientRect();
      const r = c.getBoundingClientRect();
      const side = r.width < area.width * 0.7; // карточка слева (широкая панель) или внизу (узкая)
      const padding = side ? { left: r.width + 20, bottom: 0, top: 0, right: 0 } : { bottom: r.height + 20, left: 0, top: 0, right: 0 };
      m.easeTo({ center: [place.lng, place.lat], padding, duration: settings.animations ? 300 : 0 });
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(c);
    return () => ro.disconnect();
  }, [state, cardOpen, place.id]);

  const refs = (place.refs || []).map(parseOsisRef).filter(Boolean);

  return (
    <section className={`reader map-pane ${clean ? 'clean' : ''}`} aria-label={t('Карта: {name}', { name: place.name })}>
      <header className="toolbar">
        <div className="tb tb-place">
          <MapPin size={18} />
          <span className="tb-place-name">{place.name}</span>
        </div>
        <button
          className={`tb tb-icon ${clean ? 'on' : ''}`}
          onClick={() => {
            // Включая «только карту», сворачиваем карточку до строки с названием — она остаётся внизу
            if (!clean) setCardOpen(false);
            setClean((v) => !v);
          }}
          aria-pressed={clean}
          aria-label={clean ? t('Показать подписи, дороги и кнопки') : t('Только карта и точка')}
          title={clean ? t('Показать все наложения') : t('Только карта и точка')}
          disabled={state !== 'ready'}
        >
          <Layers size={21} />
        </button>
        <button className={`tb tb-icon ${sat ? 'on' : ''}`} onClick={() => setSat((v) => !v)} aria-pressed={sat} aria-label={sat ? t('Обычная карта') : t('Спутник')} title={sat ? t('Обычная карта') : t('Спутник')} disabled={state !== 'ready'}>
          {sat ? <MapIcon size={21} /> : <Satellite size={21} />}
        </button>
        <button className="tb tb-icon" onClick={closePlaceMap} aria-label={t('Закрыть карту')} title={t('Закрыть карту')}>
          <X size={22} />
        </button>
      </header>
      <div className="map-body">
        <div ref={box} className="map-canvas" />
        {state === 'loading' && (
          <div className="map-status">
            <Loader2 className="spin" size={20} /> {t('Загружаю карту…')}
          </div>
        )}
        {state === 'error' && (
          <div className="map-status error-text">
            {error} {t('Координаты: {lat}, {lng}.', { lat: place.lat.toFixed(4), lng: place.lng.toFixed(4) })}
          </div>
        )}
        <div ref={card} className={`place-card ${cardOpen ? 'open' : ''}`}>
          <button className="place-card-head" onClick={() => setCardOpen((v) => !v)} aria-expanded={cardOpen}>
            <span className="place-card-title">
              <b>{place.name}</b>
              {place.type && <span className="muted"> · {place.type}</span>}
            </span>
            <ChevronDown size={18} className="place-chev" />
          </button>
          {cardOpen && (
            <div className="place-card-body">
              {place.modern && (
                <p>
                  <span className="muted">{t('Сейчас:')} </span>
                  {place.modern}
                </p>
              )}
              {place.confidence != null && (
                <div className="conf">
                  <span className="muted">{t('Достоверность: {pct}%', { pct: place.confidence })}</span>
                  <span className="conf-bar">
                    <i style={{ width: `${place.confidence}%` }} />
                  </span>
                </div>
              )}
              {place.description && <p>{place.description}</p>}
              {refs.length > 0 && (
                <div className="chips">
                  {refs.slice(0, 40).map((r) => (
                    <button key={`${r.book}.${r.chapter}.${r.verse}`} className="chip" onClick={() => navigate(0, r)}>
                      {formatRef(r)}
                    </button>
                  ))}
                  {refs.length > 40 && <span className="muted small">{t('и ещё {n}', { n: refs.length - 40 })}</span>}
                </div>
              )}
              <p className="source-note">
                <a href={`https://www.google.com/maps/@${place.lat},${place.lng},2000m/data=!3m1!1e3`} target="_blank" rel="noopener">
                  {t('Спутник Google')} <ExternalLink size={12} />
                </a>
                {' · '}
                {place.license || 'OpenBible.info, CC BY 4.0'}
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
