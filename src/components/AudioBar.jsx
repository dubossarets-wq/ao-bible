// Нижняя панель «аудиокниги»: ▶/⏸, предыдущий/следующий стих, текущее место, скорость, таймер сна,
// скачивание книги для прослушивания без интернета. Нет записи — предложение включить ИИ-диктора.
import React, { useEffect, useState } from 'react';
import { Play, Pause, SkipBack, SkipForward, X, SlidersHorizontal, Loader2, CornerUpLeft, Download, Check, Sparkles } from 'lucide-react';
import { useAudio, pauseAudio, resumeAudio, stopAudio, stepVerse, setRate, setSleep, resumeFollow, startAudio } from '../core/audio.js';
import { downloadBook, isBookOffline, removeBook } from '../core/offlineAudio.js';
import { useApp } from '../App.jsx';
import { formatRef, bookMeta } from '../core/books.js';
import { Segmented } from './ui.jsx';

const RATES = [0.75, 1, 1.25, 1.5];
const mb = (b) => `${(b / 1048576).toFixed(b < 10485760 ? 1 : 0)} МБ`;

// Скачать звучащую книгу, чтобы слушать без интернета
function OfflineBook({ audioId, book }) {
  const [offline, setOffline] = useState(() => isBookOffline(audioId, book));
  const [prog, setProg] = useState(null); // { done, total, bytes }
  const [err, setErr] = useState(null);
  useEffect(() => setOffline(isBookOffline(audioId, book)), [audioId, book]);
  const name = bookMeta(book).name;
  const start = async () => {
    setErr(null);
    setProg({ done: 0, total: 0, bytes: 0 });
    try {
      await downloadBook(audioId, book, { onProgress: (done, total, bytes) => setProg({ done, total, bytes }) });
      setOffline(true);
    } catch (e) {
      setErr(e.message);
    } finally {
      setProg(null);
    }
  };
  return (
    <div className="audio-offline">
      <span className="field-label">Без интернета</span>
      {prog ? (
        <div className="audio-dl">
          <Loader2 size={16} className="spin" /> Скачиваю «{name}»: {prog.done} из {prog.total || '…'} · {mb(prog.bytes)}
        </div>
      ) : offline ? (
        <div className="audio-dl ok">
          <Check size={16} /> «{name}» есть в телефоне — слушается без интернета
          <button className="link-btn" onClick={() => removeBook(audioId, book).then(() => setOffline(false))}>
            удалить
          </button>
        </div>
      ) : (
        <button className="btn" onClick={start}>
          <Download size={16} /> Скачать «{name}»
        </button>
      )}
      {err && <p className="error-text small">{err}</p>}
    </div>
  );
}

export default function AudioBar() {
  const a = useAudio();
  const { navigate, setSettings } = useApp();
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
      {/* Записи нет — предлагаем ИИ-диктора */}
      {a.offerTts && !a.playing && (
        <div className="audio-offer">
          <p>
            <strong>{a.error || 'Для этой главы нет аудиозаписи.'}</strong> Включить ИИ-диктора? Он прочитает текст синтезированным голосом — не так живо, как чтец.
          </p>
          <div className="audio-offer-btns">
            <button
              className="btn primary"
              onClick={() => {
                setSettings({ ttsFallback: true });
                startAudio({ pane: a.pane, moduleId: a.moduleId, ref: a.ref, source: 'tts' });
              }}
            >
              <Sparkles size={16} /> Включить ИИ-диктора
            </button>
            <button className="btn" onClick={stopAudio}>
              Не нужно
            </button>
          </div>
          <small>Выключить можно в «Настройках», раздел «Аудио».</small>
        </div>
      )}
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
          {a.ref && a.source !== 'tts' && a.source !== 'none' && <OfflineBook audioId={a.source} book={a.ref.book} />}
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
          {/* Человек ушёл в другое место — место чтения становится кнопкой «вернуться» */}
          {a.ref && !a.follow ? (
            <button className="audio-ref audio-back" onClick={() => (resumeFollow(), navigate(a.pane, a.ref, { flash: false, audio: true }))} title="Вернуться к месту, которое сейчас звучит">
              <CornerUpLeft size={14} /> {formatRef(a.ref)}
            </button>
          ) : (
            <span className="audio-ref">{a.ref ? formatRef(a.ref) : ''}</span>
          )}
          {((a.error && !a.offerTts) || left || a.sleep?.kind === 'chapter' || a.source === 'tts') && (
            <span className="audio-src">
              {a.error && !a.offerTts ? a.error : [a.source === 'tts' && 'ИИ-диктор', left ? `сон через ${left} мин` : a.sleep?.kind === 'chapter' && 'до конца главы'].filter(Boolean).join(' · ')}
            </span>
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
