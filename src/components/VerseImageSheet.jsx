// Картинка со стихом: фон (фото в общественном достоянии или спокойный цвет), текст стиха и ссылка.
// Рисуется на холсте; «Поделиться» отправляет картинку в мессенджер, «Сохранить» — скачивает.
import React, { useEffect, useRef, useState } from 'react';
import { Share2, Download, Loader2, Minus, Plus } from 'lucide-react';
import BottomSheet from './BottomSheet.jsx';
import { useApp } from '../App.jsx';
import { Segmented } from './ui.jsx';
import { selectionLabel, selectionText } from './SelectionBar.jsx';
import { ensureFont } from '../core/settings.js';

// Цветные фоны — на случай, если фото не нужны или не загрузились
const GRADIENTS = [
  { id: 'g-dawn', title: 'Рассвет', stops: ['#3b2a4d', '#c0705a', '#f1c27d'], tone: 'dark' },
  { id: 'g-sea', title: 'Море', stops: ['#0f2f45', '#1f6d86', '#7fb7c4'], tone: 'dark' },
  { id: 'g-olive', title: 'Олива', stops: ['#2c3523', '#5d6b3c', '#a3a46b'], tone: 'dark' },
  { id: 'g-night', title: 'Ночь', stops: ['#0b1020', '#1d2440', '#3b3f66'], tone: 'dark' },
  { id: 'g-paper', title: 'Бумага', stops: ['#f6efe1', '#efe3c8', '#e5d3ad'], tone: 'paper' },
  { id: 'g-stone', title: 'Камень', stops: ['#2b2a28', '#4a4741', '#6d675c'], tone: 'dark' },
];
const SIZES = { square: [1080, 1080], post: [1080, 1350], story: [1080, 1920] };

function wrap(ctx, text, width) {
  const words = text.split(/\s+/);
  const lines = [];
  let line = '';
  for (const w of words) {
    const t = line ? `${line} ${w}` : w;
    if (ctx.measureText(t).width > width && line) {
      lines.push(line);
      line = w;
    } else line = t;
  }
  if (line) lines.push(line);
  return lines;
}

function draw(canvas, { bg, img, text, ref, format, scale }) {
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
  // Текст: подбираем размер, чтобы стих поместился
  const pad = W * 0.11;
  const boxW = W - pad * 2;
  const boxH = H * (format === 'story' ? 0.55 : 0.62);
  let fs = 74 * scale;
  let lines;
  for (;;) {
    ctx.font = `400 ${fs}px "PT Serif", Georgia, serif`;
    lines = wrap(ctx, `«${text}»`, boxW);
    if (lines.length * fs * 1.38 <= boxH || fs <= 26) break;
    fs -= 2;
  }
  const lh = fs * 1.38;
  const refSize = Math.max(30, fs * 0.6);
  const total = lines.length * lh + refSize * 2.2;
  let y = (H - total) / 2 + fs;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.shadowColor = paper ? 'transparent' : 'rgba(0,0,0,.35)';
  ctx.shadowBlur = paper ? 0 : 12;
  for (const l of lines) {
    ctx.fillText(l, W / 2, y);
    y += lh;
  }
  // Короткая черта и ссылка
  y += refSize * 0.5;
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 0.75;
  ctx.fillRect(W / 2 - 40, y - refSize * 0.9, 80, 3);
  ctx.globalAlpha = 1;
  ctx.font = `700 ${refSize}px "PT Sans", "Segoe UI", sans-serif`;
  ctx.fillText(ref, W / 2, y + refSize * 0.5);
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
  const [ready, setReady] = useState(false);
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
  useEffect(() => {
    if (!photo) return setImg(null);
    const im = new Image();
    im.onload = () => setImg(im);
    im.onerror = () => setImg(null);
    im.src = `images/verse-bg/${photo.file}`;
  }, [photo?.id]);

  useEffect(() => {
    if (!canvas.current || text == null || !bgId || (photo && !img)) return;
    draw(canvas.current, { bg, img: photo ? img : null, text, ref, format, scale });
  }, [text, bgId, img, format, scale, ready]);

  const blob = () => new Promise((res) => canvas.current.toBlob(res, 'image/jpeg', 0.9));
  const fileName = `${ref.replace(/[:\s]+/g, '_')}.jpg`;
  const share = async () => {
    const b = await blob();
    const file = new File([b], fileName, { type: 'image/jpeg' });
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: ref });
      } catch {
        /* отменили */
      }
    } else save(b);
  };
  const save = async (b) => {
    const data = b || (await blob());
    const url = URL.createObjectURL(data);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    toast('Картинка сохранена');
  };

  return (
    <BottomSheet title="Картинка со стихом" subtitle={ref} onClose={onClose} initial={2}>
      <div className={`vimg-preview ${format}`}>
        {text == null || !bgId ? <Loader2 className="spin" /> : <canvas ref={canvas} aria-label={`Картинка: ${ref}`} />}
      </div>
      <div className="vimg-bgs" role="listbox" aria-label="Фон">
        {photos.map((p) => (
          <button key={p.id} className={`vimg-bg ${bgId === p.id ? 'on' : ''}`} onClick={() => setBgId(p.id)} title={p.title} aria-label={p.title} aria-selected={bgId === p.id}>
            <img src={`images/verse-bg/${p.thumb}`} alt="" loading="lazy" />
          </button>
        ))}
        {GRADIENTS.map((g) => (
          <button
            key={g.id}
            className={`vimg-bg ${bgId === g.id ? 'on' : ''}`}
            onClick={() => setBgId(g.id)}
            title={g.title}
            aria-label={g.title}
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
          ['square', 'Квадрат'],
          ['post', 'Пост'],
          ['story', 'История'],
        ]}
      />
      <div className="vimg-size">
        <span className="field-label">Размер текста</span>
        <button className="icon-btn" onClick={() => setScale((v) => Math.max(0.6, +(v - 0.1).toFixed(1)))} aria-label="Мельче">
          <Minus size={18} />
        </button>
        <button className="icon-btn" onClick={() => setScale((v) => Math.min(1.5, +(v + 0.1).toFixed(1)))} aria-label="Крупнее">
          <Plus size={18} />
        </button>
      </div>
      <div className="pref-btns">
        <button className="btn primary" onClick={share} disabled={text == null}>
          <Share2 size={17} /> Поделиться
        </button>
        <button className="btn" onClick={() => save()} disabled={text == null}>
          <Download size={17} /> Сохранить
        </button>
      </div>
      {photo && (
        <p className="vimg-credit">
          Фото: {photo.title}
          {photo.author ? ` — ${photo.author}` : ''} ({photo.license})
        </p>
      )}
    </BottomSheet>
  );
}
