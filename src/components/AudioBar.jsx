// Нижняя панель «аудиокниги»: ▶/⏸, предыдущий/следующий стих, текущее место, скорость, таймер сна,
// кнопка «скачать книгу» для прослушивания без интернета. Нет записи — предложение включить ИИ-диктора.
import React, { useEffect, useState } from 'react';
import { Play, Pause, SkipBack, SkipForward, X, SlidersHorizontal, Loader2, CornerUpLeft, Download, CheckCircle2, Sparkles } from 'lucide-react';
import { useAudio, pauseAudio, resumeAudio, stopAudio, stepVerse, setRate, setSleep, resumeFollow, startAudio } from '../core/audio.js';
import { downloadBook, isBookOffline, removeBook } from '../core/offlineAudio.js';
import { useApp } from '../App.jsx';
import { formatRef, bookMeta } from '../core/books.js';
import { Segmented } from './ui.jsx';

const RATES = [0.75, 1, 1.25, 1.5];
const mb = (b) => `${(b / 1048576).toFixed(b < 10485760 ? 1 : 0)} МБ`;

// Кнопка рядом с настройками: скачать звучащую книгу, чтобы слушать без интернета.
// Во время загрузки — круг прогресса, после — зелёная галочка; под панелью — короткая подпись.
function DownloadButton({ audioId, book, onNote }) {
  const [offline, setOffline] = useState(() => isBookOffline(audioId, book));
  const [prog, setProg] = useState(null); // доля 0..1
  useEffect(() => setOffline(isBookOffline(audioId, book)), [audioId, book]);
  const name = bookMeta(book).name;
  const click = async () => {
    if (prog != null) return;
    if (offline) return onNote({ ok: true, text: `«${name}» есть в телефоне — слушается без интернета`, remove: () => removeBook(audioId, book).then(() => (setOffline(false), onNote(null))) });
    setProg(0);
    onNote({ text: `Скачиваю «${name}»…` });
    try {
      const bytes = await downloadBook(audioId, book, { onProgress: (done, total, b) => (setProg(done / total), onNote({ text: `Скачиваю «${name}»: ${done} из ${total} · ${mb(b)}` })) });
      setOffline(true);
      onNote({ ok: true, text: `«${name}» скачана (${mb(bytes)}) — можно слушать без интернета` });
    } catch (e) {
      onNote({ text: e.message });
    } finally {
      setProg(null);
    }
  };
  const C = 2 * Math.PI * 14;
  return (
    <button className={`audio-btn dl ${offline ? 'ok' : ''}`} onClick={click} aria-label={offline ? `${name} скачана для прослушивания без интернета` : `Скачать ${name} для прослушивания без интернета`} title={offline ? 'Скачано' : 'Скачать книгу'}>
      {prog != null ? (
        <>
          <svg className="dl-ring" viewBox="0 0 32 32" aria-hidden="true">
            <circle className="bg" cx="16" cy="16" r="14" />
            <circle className="fg" cx="16" cy="16" r="14" strokeDasharray={C} strokeDashoffset={C * (1 - prog)} />
          </svg>
          <Download size={14} />
        </>
      ) : offline ? (
        <CheckCircle2 size={19} />
      ) : (
        <Download size={19} />
      )}
    </button>
  );
}

export default function AudioBar() {
  const a = useAudio();
  const { navigate, setSettings } = useApp();
  const [opts, setOpts] = useState(false);
  const [note, setNote] = useState(null); // подпись о скачивании книги
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
      {note && (
        <div className={`audio-dl-note ${note.ok ? 'ok' : ''}`}>
          {note.text}
          {note.remove && (
            <button className="link-btn" onClick={note.remove}>
              удалить из телефона
            </button>
          )}
          <button className="link-btn" onClick={() => setNote(null)}>
            скрыть
          </button>
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
        {a.ref && a.source !== 'tts' && a.source !== 'none' && <DownloadButton audioId={a.source} book={a.ref.book} onNote={setNote} />}
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
