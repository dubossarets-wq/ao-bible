// Картинка со стихом: фон (фото в общественном достоянии или спокойный цвет), текст стиха и ссылка.
// Рисуется на холсте; «Поделиться» отправляет картинку в мессенджер, «Сохранить» — скачивает.
import React, { useEffect, useRef, useState } from 'react';
import { Share2, Download, Loader2, Minus, Plus } from 'lucide-react';
import BottomSheet from './BottomSheet.jsx';
import { useApp } from '../App.jsx';
import { Segmented } from './ui.jsx';
import { selectionLabel, selectionText } from './SelectionBar.jsx';
import { ensureFont } from '../core/settings.js';
import { t, N_ } from '../core/i18n.js';
import { saveBlob } from '../core/native.js';

// Цветные фоны — на случай, если фото не нужны или не загрузились
const GRADIENTS = [
  { id: 'g-dawn', title: N_('Рассвет'), stops: ['#3b2a4d', '#c0705a', '#f1c27d'], tone: 'dark' },
  { id: 'g-sea', title: N_('Море'), stops: ['#0f2f45', '#1f6d86', '#7fb7c4'], tone: 'dark' },
  { id: 'g-olive', title: N_('Олива'), stops: ['#2c3523', '#5d6b3c', '#a3a46b'], tone: 'dark' },
  { id: 'g-night', title: N_('Ночь'), stops: ['#0b1020', '#1d2440', '#3b3f66'], tone: 'dark' },
  { id: 'g-paper', title: N_('Бумага'), stops: ['#f6efe1', '#efe3c8', '#e5d3ad'], tone: 'paper' },
  { id: 'g-stone', title: N_('Камень'), stops: ['#2b2a28', '#4a4741', '#6d675c'], tone: 'dark' },
];
const SIZES = { square: [1080, 1080], post: [1080, 1350], story: [1080, 1920] };

function wrap(ctx, text, width) {
  const words = text.split(/\s+/);
  const lines = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (ctx.measureText(next).width > width && line) {
      lines.push(line);
      line = w;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

// pos — сдвиг текста от центра (в долях ширины и высоты), scale — размер текста относительно подобранного
function draw(canvas, { bg, img, text, ref, format, scale, pos }) {
  const [W, H] = SIZES[format];
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  // Фон
  if (img) {
    const k = Math.max(W / img.naturalWidth, H / img.naturalHeight);
    const w = img.naturalWidth * k;
    const h = img.naturalHeight * k;
    ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
    // Затемнение, чтобы белый текст читался
    const g = ctx.createLinearGradient(0, 0, 0, H);
    const a = bg.tone === 'light' ? 0.55 : 0.38;
    g.addColorStop(0, `rgba(0,0,0,${a - 0.1})`);
    g.addColorStop(0.5, `rgba(0,0,0,${a})`);
    g.addColorStop(1, `rgba(0,0,0,${a + 0.12})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  } else {
    const g = ctx.createLinearGradient(0, 0, W * 0.4, H);
    bg.stops.forEach((c, i) => g.addColorStop(i / (bg.stops.length - 1), c));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
  const paper = !img && bg.tone === 'paper';
  const color = paper ? '#2d2418' : '#ffffff';
  // Текст: подбираем размер, чтобы стих поместился, потом применяем размер, выбранный пальцами
  const pad = W * 0.11;
  const boxW = W - pad * 2;
  const boxH = H * (format === 'story' ? 0.55 : 0.62);
  let fs = 74;
  let lines;
  for (;;) {
    ctx.font = `400 ${fs}px "PT Serif", Georgia, serif`;
    lines = wrap(ctx, `«${text}»`, boxW);
    if (lines.length * fs * 1.38 <= boxH || fs <= 26) break;
    fs -= 2;
  }
  if (scale !== 1) {
    fs = Math.max(14, fs * scale);
    ctx.font = `400 ${fs}px "PT Serif", Georgia, serif`;
    lines = wrap(ctx, `«${text}»`, boxW);
  }
  const lh = fs * 1.38;
  const refSize = Math.max(18, fs * 0.6);
  const total = lines.length * lh + refSize * 2.2;
  const cx = W / 2 + (pos?.x || 0) * W;
  let y = (H - total) / 2 + fs + (pos?.y || 0) * H;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.shadowColor = paper ? 'transparent' : 'rgba(0,0,0,.35)';
  ctx.shadowBlur = paper ? 0 : 12;
  for (const l of lines) {
    ctx.fillText(l, cx, y);
    y += lh;
  }
  // Короткая черта и ссылка
  y += refSize * 0.5;
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 0.75;
  ctx.fillRect(cx - 40, y - refSize * 0.9, 80, 3);
  ctx.globalAlpha = 1;
  ctx.font = `700 ${refSize}px "PT Sans", "Segoe UI", sans-serif`;
  ctx.fillText(ref, cx, y + refSize * 0.5);
}

export default function VerseImageSheet({ payload, onClose }) {
  const { toast } = useApp();
  const { refs = [], moduleId } = payload;
  const canvas = useRef(null);
  const [photos, setPhotos] = useState([]);
  const [bgId, setBgId] = useState(null);
  const [img, setImg] = useState(null);
  const [text, setText] = useState(null);
  const [format, setFormat] = useState('post');
  const [scale, setScale] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  // Текст двигается одним пальцем, размер — двумя (разведите — крупнее, сведите — мельче)
  const touch = useRef({ pts: new Map(), base: null });
  const live = useRef({ scale: 1, pos: { x: 0, y: 0 } });
  live.current = { scale, pos };
  const onDown = (e) => {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    touch.current.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    touch.current.base = null;
  };
  const onMove = (e) => {
    const t = touch.current;
    if (!t.pts.has(e.pointerId)) return;
    t.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const r = e.currentTarget.getBoundingClientRect();
    const pts = [...t.pts.values()];
    const mid = pts.reduce((a, p) => ({ x: a.x + p.x / pts.length, y: a.y + p.y / pts.length }), { x: 0, y: 0 });
    const d = pts.length > 1 ? Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) : 0;
    if (!t.base || t.base.n !== pts.length) {
      t.base = { n: pts.length, mid, d, scale: live.current.scale, pos: live.current.pos };
      return;
    }
    const b = t.base;
    const clamp = (v, m) => Math.max(-m, Math.min(m, v));
    setPos({ x: clamp(b.pos.x + (mid.x - b.mid.x) / r.width, 0.45), y: clamp(b.pos.y + (mid.y - b.mid.y) / r.height, 0.45) });
    if (pts.length > 1 && b.d > 0) setScale(Math.max(0.4, Math.min(2.2, +(b.scale * (d / b.d)).toFixed(2))));
  };
  const onUp = (e) => {
    touch.current.pts.delete(e.pointerId);
    touch.current.base = null;
  };
  const [fontsReady, setReady] = useState(false);
  const ref = selectionLabel(refs, true);

  useEffect(() => {
    selectionText(moduleId, refs).then((t) => setText(t.replace(/^\d+ /gm, '').replace(/\n/g, ' ')));
    fetch('images/verse-bg/index.json')
      .then((r) => (r.ok ? r.json() : { images: [] }))
      .then((j) => {
        setPhotos(j.images || []);
        setBgId(j.images?.[0]?.id || GRADIENTS[0].id);
      })
      .catch(() => setBgId(GRADIENTS[0].id));
    // Шрифты для картинки
    ensureFont('PT Serif');
    ensureFont('PT Sans');
    Promise.all([document.fonts?.load('400 40px "PT Serif"'), document.fonts?.load('700 30px "PT Sans"')]).finally(() => setReady(true));
  }, []);

  const photo = photos.find((p) => p.id === bgId);
  const bg = photo || GRADIENTS.find((g) => g.id === bgId) || GRADIENTS[0];

  // Фото грузим заранее, чтобы холст рисовался сразу
  const [imgFailed, setImgFailed] = useState(false);
  useEffect(() => {
    setImg(null);
    setImgFailed(false);
    if (!photo) return;
    let alive = true;
    const im = new Image();
    im.onload = () => alive && setImg(im);
    im.onerror = () => alive && setImgFailed(true);
    im.src = `images/verse-bg/${photo.file}`;
    return () => {
      alive = false;
    };
  }, [photo?.id]);
  const ready = useRef(null); // готовая картинка (JPEG) для «Поделиться»

  useEffect(() => {
    if (!canvas.current || text == null || !bgId || (photo && !img && !imgFailed)) return;
    // Фото не загрузилось — тот же текст на спокойном градиенте
    draw(canvas.current, { bg: photo && imgFailed ? GRADIENTS[0] : bg, img: photo && !imgFailed ? img : null, text, ref, format, scale, pos });
    ready.current = null;
    const c = canvas.current;
    const timer = setTimeout(() => c.toBlob((b) => (ready.current = b), 'image/jpeg', 0.9), 150);
    return () => clearTimeout(timer);
  }, [text, bgId, img, imgFailed, format, scale, pos, fontsReady]);

  const blob = () => new Promise((res) => canvas.current.toBlob(res, 'image/jpeg', 0.9));
  const fileName = `${ref.replace(/[:\s]+/g, '_')}.jpg`;
  const share = async () => {
    const b = ready.current || (await blob());
    const file = new File([b], fileName, { type: 'image/jpeg' });
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: ref });
      } catch (e) {
        if (e?.name !== 'AbortError') save(b); // не вышло поделиться — хотя бы сохранить
      }
    } else save(b);
  };
  const save = async (b) => {
    const data = b || (await blob());
    await saveBlob(data, fileName).catch(() => {});
    toast(t('Картинка сохранена'));
  };

  return (
    <BottomSheet title={t('Картинка со стихом')} subtitle={ref} onClose={onClose} initial={2}>
      <div className={`vimg-preview ${format}`}>
        {text == null || !bgId ? <Loader2 className="spin" /> : <canvas ref={canvas} aria-label={t('Картинка: {ref}. Двигайте текст пальцем, размер — двумя пальцами', { ref })} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} />}
      </div>
      <div className="vimg-bgs" role="listbox" aria-label={t('Фон')}>
        {photos.map((p) => (
          <button key={p.id} className={`vimg-bg ${bgId === p.id ? 'on' : ''}`} onClick={() => setBgId(p.id)} title={t(p.title)} aria-label={t(p.title)} aria-selected={bgId === p.id}>
            <img src={`images/verse-bg/${p.thumb}`} alt="" loading="lazy" />
          </button>
        ))}
        {GRADIENTS.map((g) => (
          <button
            key={g.id}
            className={`vimg-bg ${bgId === g.id ? 'on' : ''}`}
            onClick={() => setBgId(g.id)}
            title={t(g.title)}
            aria-label={t(g.title)}
            aria-selected={bgId === g.id}
            style={{ background: `linear-gradient(160deg, ${g.stops.join(', ')})` }}
          />
        ))}
      </div>
      <Segmented
        id="vimg-format"
        value={format}
        onChange={setFormat}
        options={[
          ['square', t('Квадрат')],
          ['post', t('Пост')],
          ['story', t('История@@формат картинки: вертикальная, для «историй» в соцсетях')],
        ]}
      />
      <p className="vimg-tip">{t('Двигайте текст пальцем, размер — двумя пальцами.')}</p>
      <div className="vimg-size">
        <span className="field-label">{t('Размер текста')}</span>
        {(scale !== 1 || pos.x || pos.y) && (
          <button className="link-btn" onClick={() => (setScale(1), setPos({ x: 0, y: 0 }))}>
            {t('как было')}
          </button>
        )}
        <button className="icon-btn" onClick={() => setScale((v) => Math.max(0.4, +(v - 0.1).toFixed(2)))} aria-label={t('Мельче')}>
          <Minus size={18} />
        </button>
        <button className="icon-btn" onClick={() => setScale((v) => Math.min(2.2, +(v + 0.1).toFixed(2)))} aria-label={t('Крупнее')}>
          <Plus size={18} />
        </button>
      </div>
      <div className="pref-btns">
        <button className="btn primary" onClick={share} disabled={text == null}>
          <Share2 size={17} /> {t('Поделиться')}
        </button>
        <button className="btn" onClick={() => save()} disabled={text == null}>
          <Download size={17} /> {t('Сохранить')}
        </button>
      </div>
      {photo && (
        <p className="vimg-credit">
          {t('Фото: {title}', { title: t(photo.title) })}
          {photo.author ? ` — ${photo.author}` : ''} ({photo.license})
        </p>
      )}
    </BottomSheet>
  );
}
