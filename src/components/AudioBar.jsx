// Нижняя панель «аудиокниги»: ▶/⏸, предыдущий/следующий стих, текущее место, источник, скорость, таймер сна.
import React, { useEffect, useState } from 'react';
import { Play, Pause, SkipBack, SkipForward, X, SlidersHorizontal, Loader2, Headphones } from 'lucide-react';
import { useApp } from '../App.jsx';
import { useAudio, pauseAudio, resumeAudio, stopAudio, stepVerse, setRate, setSource, setSleep, audioSourcesFor } from '../core/audio.js';
import { formatRef } from '../core/books.js';
import { Segmented } from './ui.jsx';

const RATES = [0.75, 1, 1.25, 1.5];

export default function AudioBar() {
  const a = useAudio();
  const { modules } = useApp();
  const [opts, setOpts] = useState(false);
  const [sources, setSources] = useState({ recorded: [], otherRecorded: [], tts: true });
  const [, tick] = useState(0);

  useEffect(() => {
    if (a.active && a.ref) audioSourcesFor(a.moduleId, a.ref).then(setSources);
  }, [a.active, a.moduleId, a.ref?.book, a.ref?.chapter, modules]);

  // Обратный отсчёт таймера сна
  useEffect(() => {
    if (a.sleep?.kind !== 'min') return;
    const t = setInterval(() => tick((x) => x + 1), 15000);
    return () => clearInterval(t);
  }, [a.sleep]);

  if (!a.active) return null;
  const srcName = a.source === 'tts' ? 'Синтез речи' : modules.find((m) => m.id === a.source)?.name || 'Запись';
  const left = a.sleep?.kind === 'min' ? Math.max(1, Math.round((a.sleep.until - Date.now()) / 60000)) : null;

  return (
    <div className="audio-bar" role="region" aria-label="Аудиокнига">
      {opts && (
        <div className="audio-opts">
          <div className="audio-opt-row">
            <span className="field-label">Источник</span>
            <div className="chips">
              {sources.tts && (
                <button className={`chip ${a.source === 'tts' ? 'on' : ''}`} onClick={() => setSource('tts')}>
                  Синтез речи
                </button>
              )}
              {[...sources.recorded, ...sources.otherRecorded].map((m) => (
                <button key={m.id} className={`chip ${a.source === m.id ? 'on' : ''}`} onClick={() => setSource(m.id)} title={m.title}>
                  <Headphones size={13} /> {m.name}
                </button>
              ))}
            </div>
          </div>
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
          <span className="audio-src">
            {a.error || srcName}
            {left ? ` · сон через ${left} мин` : a.sleep?.kind === 'chapter' ? ' · до конца главы' : ''}
          </span>
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
