// Нижняя панель «аудиокниги»: ▶/⏸, предыдущий/следующий стих, текущее место, скорость, таймер сна.
import React, { useEffect, useState } from 'react';
import { Play, Pause, SkipBack, SkipForward, X, SlidersHorizontal, Loader2 } from 'lucide-react';
import { useAudio, pauseAudio, resumeAudio, stopAudio, stepVerse, setRate, setSleep } from '../core/audio.js';
import { formatRef } from '../core/books.js';
import { Segmented } from './ui.jsx';

const RATES = [0.75, 1, 1.25, 1.5];

export default function AudioBar() {
  const a = useAudio();
  const [opts, setOpts] = useState(false);
  const [, tick] = useState(0);

  // Обратный отсчёт таймера сна
  useEffect(() => {
    if (a.sleep?.kind !== 'min') return;
    const t = setInterval(() => tick((x) => x + 1), 15000);
    return () => clearInterval(t);
  }, [a.sleep]);

  if (!a.active) return null;
  const left = a.sleep?.kind === 'min' ? Math.max(1, Math.round((a.sleep.until - Date.now()) / 60000)) : null;

  return (
    <div className="audio-bar" role="region" aria-label="Аудиокнига">
      {opts && (
        <div className="audio-opts">
          <Segmented id="audio-rate" label="Скорость" value={a.rate} onChange={setRate} options={RATES.map((r) => [r, `${r}×`])} />
          <Segmented
            id="audio-sleep"
            label="Таймер сна"
            value={a.sleep ? (a.sleep.kind === 'chapter' ? 'chapter' : String(a.sleep.minutes)) : 'off'}
            onChange={(v) => (v === 'off' ? setSleep(null) : v === 'chapter' ? setSleep('chapter') : setSleep('min', +v))}
            options={[
              ['off', 'Выкл'],
              ['15', '15 мин'],
              ['30', '30 мин'],
              ['60', '60 мин'],
              ['chapter', 'Конец главы'],
            ]}
          />
        </div>
      )}
      <div className="audio-main">
        <button className="audio-btn" onClick={() => stepVerse(-1)} aria-label="Предыдущий стих">
          <SkipBack size={20} />
        </button>
        <button className="audio-btn play" onClick={() => (a.playing ? pauseAudio() : resumeAudio())} aria-label={a.playing ? 'Пауза' : 'Слушать'}>
          {a.loading ? <Loader2 size={22} className="spin" /> : a.playing ? <Pause size={22} /> : <Play size={22} />}
        </button>
        <button className="audio-btn" onClick={() => stepVerse(1)} aria-label="Следующий стих">
          <SkipForward size={20} />
        </button>
        <div className="audio-info">
          <span className="audio-ref">{a.ref ? formatRef(a.ref) : ''}</span>
          {(a.error || left || a.sleep?.kind === 'chapter') && (
            <span className="audio-src">{a.error || (left ? `Сон через ${left} мин` : 'До конца главы')}</span>
          )}
        </div>
        <button className={`audio-btn ${opts ? 'on' : ''}`} onClick={() => setOpts((v) => !v)} aria-label="Настройки чтения вслух" aria-expanded={opts}>
          <SlidersHorizontal size={19} />
        </button>
        <button className="audio-btn" onClick={stopAudio} aria-label="Закрыть аудио">
          <X size={20} />
        </button>
      </div>
    </div>
  );
}
