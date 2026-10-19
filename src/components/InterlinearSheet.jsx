// Подстрочник стиха в порядке оригинала (Ветхий Завет — справа налево): слово оригинала, его чтение, под ним —
// как оно передано в синодальном переводе, ниже — номер Стронга. Нажатие на слово открывает статью словаря
// с точной формой этого слова. Стрелки — к соседним стихам. Окно на всю высоту.
import React, { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Loader2, Volume2, Square } from 'lucide-react';
import BottomSheet from './BottomSheet.jsx';
import { useApp } from '../App.jsx';
import { getBook, getVerse } from '../core/modules.js';
import { plainText } from '../core/verseMarkup.js';
import { formatRef, testamentOf } from '../core/books.js';
import { ensureOriginal, origInterlinear, originalFor } from '../core/interlinear.js';
import { translit } from '../core/translit.js';
import { verseAudio, playSegment, stopVerse, wordStarts } from '../core/origAudio.js';
import { t } from '../core/i18n.js';

export default function InterlinearSheet({ pane, payload, onClose }) {
  const { openSheet } = useApp();
  const [ref, setRef] = useState(payload.ref);
  const [state, setState] = useState({ status: 'loading' });
  const hebrew = testamentOf(ref.book) === 'OT';
  // Живое чтение стиха: playing — 'loading' | true | false; cur — звучащее слово
  const [playing, setPlaying] = useState(false);
  const [cur, setCur] = useState(-1);
  const [noAudio, setNoAudio] = useState(false);
  useEffect(() => () => stopVerse(), []);
  useEffect(() => {
    stopVerse();
    setPlaying(false);
    setCur(-1);
    setNoAudio(false);
  }, [ref.book, ref.chapter, ref.verse]);

  // Запись стиха и начала слов — один раз на стих (для «Слушать» и для отдельных слов)
  const segRef = React.useRef(null);
  useEffect(() => {
    segRef.current = null;
  }, [ref.book, ref.chapter, ref.verse]);
  const loadSeg = async () => {
    if (segRef.current) return segRef.current;
    const seg = await verseAudio(ref).catch(() => null);
    if (!seg || state.status !== 'ok') return null;
    segRef.current = { seg, starts: wordStarts(seg, state.words.map((w) => w.text)) };
    return segRef.current;
  };
  // Одно слово: от его начала до начала следующего
  const sayWord = async (i) => {
    const a = await loadSeg();
    if (!a) return setNoAudio(true);
    const { seg, starts } = a;
    setPlaying(false);
    setCur(i);
    playSegment({ url: seg.url, start: Math.max(seg.start, starts[i] - 0.04), end: i + 1 < starts.length ? starts[i + 1] : seg.end }, { onEnd: () => setCur(-1) });
  };

  const listen = async () => {
    if (playing) {
      stopVerse();
      setPlaying(false);
      setCur(-1);
      return;
    }
    setPlaying('loading');
    const a = await loadSeg();
    if (!a) {
      setPlaying(false);
      setNoAudio(true);
      return;
    }
    const { seg, starts } = a;
    setPlaying(true);
    playSegment(seg, {
      onTime: (t) => {
        let i = 0;
        while (i + 1 < starts.length && starts[i + 1] <= t) i++;
        setCur(i);
      },
      onEnd: () => (setPlaying(false), setCur(-1)),
    });
  };

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!originalFor(ref.book)) return alive && setState({ status: 'none' });
      try {
        await ensureOriginal(ref.book, (p, label) => alive && setState({ status: 'install', label }));
        const [words, ru] = await Promise.all([origInterlinear(ref), payload.moduleId ? getVerse(payload.moduleId, ref) : null]);
        if (alive) setState({ status: 'ok', words, ru: ru ? plainText(ru) : '' });
      } catch (e) {
        if (alive) setState({ status: 'error', message: e.message });
      }
    })();
    return () => {
      alive = false;
    };
  }, [ref.book, ref.chapter, ref.verse]);

  // Соседний стих по оригинальному тексту (с переходом через главу)
  const step = async (d) => {
    const id = originalFor(ref.book);
    const book = id && (await getBook(id, ref.book));
    if (!book) return;
    const ch = book.chapters;
    let { chapter, verse } = ref;
    verse += d;
    if (verse < 1) {
      if (chapter === 1) return;
      chapter -= 1;
      verse = ch[chapter - 1]?.length || 1;
    } else if (verse > (ch[chapter - 1]?.length || 0)) {
      if (chapter >= ch.length) return;
      chapter += 1;
      verse = 1;
    }
    setRef({ book: ref.book, chapter, verse });
  };

  const open = (w) => w.strongs && openSheet('dict', pane, { token: { text: w.gloss || w.text, strongs: w.strongs, morph: w.morph ? [w.morph] : null }, ref, moduleId: payload.moduleId, origWord: w, autoOpen: true, initial: 'full' });

  return (
    <BottomSheet
      title={t('Подстрочник · {ref}', { ref: formatRef(ref) })}
      subtitle={hebrew ? t('Еврейский текст (OSHB) и синодальный перевод') : t('Греческий текст (Робинсон — Пирпонт) и синодальный перевод')}
      onClose={onClose}
      initial="full"
      headerExtra={
        <>
          <button className={`icon-btn ${playing ? 'on' : ''}`} onClick={listen} aria-label={playing ? t('Остановить') : t('Слушать стих')} title={playing ? t('Остановить') : t('Слушать стих')}>
            {playing === 'loading' ? <Loader2 className="spin" size={20} /> : playing ? <Square size={18} /> : <Volume2 size={21} />}
          </button>
          <button className="icon-btn" onClick={() => step(-1)} aria-label={t('Предыдущий стих')}>
            <ChevronLeft size={22} />
          </button>
          <button className="icon-btn" onClick={() => step(1)} aria-label={t('Следующий стих')}>
            <ChevronRight size={22} />
          </button>
        </>
      }
    >
      {(state.status === 'loading' || state.status === 'install') && (
        <div className="loading">
          <Loader2 className="spin" size={20} /> {state.status === 'install' ? `${t('Загружаю оригинальный текст…')} ${state.label || ''}` : t('Загрузка…')}
        </div>
      )}
      {state.status === 'none' && <p className="muted">{t('Для этой книги нет оригинального текста с номерами Стронга.')}</p>}
      {state.status === 'error' && <p className="warn">{state.message}</p>}
      {state.status === 'ok' && (
        <>
          {state.ru && <blockquote className="xref-source">{state.ru}</blockquote>}
          {noAudio && <p className="muted small">{t('Для этого стиха пока нет записи чтения.')}</p>}
          {!state.words.length && <p className="muted">{t('В оригинальном тексте этого стиха нет.')}</p>}
          <div className={`il-grid ${hebrew ? 'hebrew' : 'greek'}`} dir={hebrew ? 'rtl' : 'ltr'}>
            {state.words.map((w, i) => (
              <div key={i} className={`il-cell ${i === cur ? 'speaking' : ''}`}>
                <span className="il-line" dir="ltr">
                  <button className="il-say" onClick={() => sayWord(i)} aria-label={t('Послушать слово')} title={t('Послушать слово')}>
                    <Volume2 size={15} />
                  </button>
                  <button className="il-orig" dir={hebrew ? 'rtl' : 'ltr'} lang={hebrew ? 'he' : 'grc'} onClick={() => open(w)} disabled={!w.strongs}>
                    {w.text}
                  </button>
                </span>
                <button className="il-rest" onClick={() => open(w)} disabled={!w.strongs}>
                  <span className="il-tr" dir="ltr">
                    {translit(w.text) || ' '}
                  </span>
                  <span className={`il-ru ${w.guess ? 'guess' : ''}`} dir="ltr">
                    {w.gloss || ' '}
                  </span>
                  <span className="il-num" dir="ltr">
                    {w.num ? w.num.slice(1) : ' '}
                  </span>
                </button>
              </div>
            ))}
          </div>
          <p className="sheet-hint">
            {t('Слова оригинала по порядку (еврейский текст — справа налево); под словом — его чтение, перевод из синодального текста и номер Стронга. Бледным — обычный перевод слова, если в этом стихе его нет. Нажмите на слово — откроется статья словаря.')}
          </p>
        </>
      )}
    </BottomSheet>
  );
}
