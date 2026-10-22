// Подстрочник стиха в порядке оригинала (Ветхий Завет — справа налево): слово оригинала, его чтение, под ним —
// как оно передано в синодальном переводе, ниже — номер Стронга. Нажатие на слово открывает статью словаря
// с точной формой этого слова. Стрелки — к соседним стихам. Окно на всю высоту.
// Ветхий Завет можно смотреть и по Септуагинте (греческий текст Свита, слева направо): под словом — значение
// по словарю Стронга, подобранное по синодальному стиху. Записей чтения для Септуагинты нет.
// В обоих Заветах есть и вкладка «Вульгата»: латинские слова (Климентина) слева направо, под словом — его начальная
// форма и значение по словарю (бледным). Записей чтения и номеров Стронга у Вульгаты нет.
import React, { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Loader2, Volume2, Square } from 'lucide-react';
import BottomSheet from './BottomSheet.jsx';
import { useApp } from '../App.jsx';
import { getBook, getVerse, errorText } from '../core/modules.js';
import { plainText } from '../core/verseMarkup.js';
import { formatRef, testamentOf } from '../core/books.js';
import { ensureOriginal, origInterlinear, originalFor, vinInterlinear, lxxInterlinear, LXX, vulgInterlinear, VULG } from '../core/interlinear.js';
import { usePersistentState } from '../core/storage.js';
import { Segmented } from './ui.jsx';
import { translit } from '../core/translit.js';
import { verseAudio, playSegment, stopVerse, wordStarts, ORIG_AUDIO } from '../core/origAudio.js';
import { t } from '../core/i18n.js';

export default function InterlinearSheet({ pane, payload, sheetId, onClose }) {
  const { openSheet } = useApp();
  const [ref, setRef] = useState(payload.ref);
  const [state, setState] = useState({ status: 'loading' });
  const ot = testamentOf(ref.book) === 'OT';
  // Новый Завет: «Синодальный» (греческий Робинсона — Пирпонта, перевод из синодального) или подстрочник Винокурова
  const [source, setSource] = usePersistentState('ilSource', 'syn');
  // Ветхий Завет: «Еврейский» (OSHB) или «Септуагинта» (греческий текст Свита, значения по словарю)
  const [otSource, setOtSource] = usePersistentState('ilSourceOT', 'heb');
  const vin = !ot && source === 'vin';
  const lxx = ot && otSource === 'lxx';
  // «Вульгата» — в обоих Заветах (латинский текст, значения по словарю)
  const vulg = (ot ? otSource : source) === 'vulg';
  const hebrew = ot && !lxx && !vulg;
  const noSound = !ORIG_AUDIO || vin || lxx || vulg; // записей чтения нет (или озвучка пока выключена)
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
  }, [ref.book, ref.chapter, ref.verse, lxx, vulg]);

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
        const progress = (p, label) => alive && setState({ status: 'install', label });
        if (!lxx && !vulg) await ensureOriginal(ref.book, progress);
        const [words, ru] = await Promise.all([
          lxx ? lxxInterlinear(ref, progress) : vulg ? vulgInterlinear(ref, progress) : vin ? vinInterlinear(ref) : origInterlinear(ref),
          payload.moduleId ? getVerse(payload.moduleId, ref) : null,
        ]);
        if (alive) setState({ status: 'ok', words: words || [], ru: ru ? plainText(ru) : '' });
      } catch (e) {
        if (alive) setState({ status: 'error', message: errorText(e) });
      }
    })();
    return () => {
      alive = false;
    };
  }, [ref.book, ref.chapter, ref.verse, vin, lxx, vulg]);

  // Соседний стих по оригинальному тексту (с переходом через главу)
  const step = async (d) => {
    const id = lxx ? LXX : vulg ? VULG : originalFor(ref.book);
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

  const open = (w) => w.strongs && openSheet('dict', pane, { token: { text: w.gloss || w.text, strongs: w.strongs, morph: w.morph ? [w.morph] : null }, ref, moduleId: payload.moduleId, origWord: w, autoOpen: true, initial: 'full', returnTo: { kind: 'interlinear', payload: { ...payload, ref }, id: sheetId } });

  const subtitle = vulg
    ? t('Вульгата (Климентина) · значения по словарю')
    : lxx
    ? t('Септуагинта (Свит) · значения по словарю')
    : hebrew
      ? t('Еврейский текст (OSHB) · синодальный')
      : vin
        ? t('Греческий текст (Робинсон — Пирпонт) · А. Винокуров')
        : t('Греческий текст (Робинсон — Пирпонт) · синодальный');

  return (
    <BottomSheet
      title={t('Подстрочник · {ref}', { ref: formatRef(ref) })}
      subtitle={subtitle}
      onClose={onClose}
      initial="full"
      headerExtra={
        <>
          {!noSound && (
            <button className={`icon-btn ${playing ? 'on' : ''}`} onClick={listen} aria-label={playing ? t('Остановить') : t('Слушать стих')} title={playing ? t('Остановить') : t('Слушать стих')}>
              {playing === 'loading' ? <Loader2 className="spin" size={20} /> : playing ? <Square size={18} /> : <Volume2 size={21} />}
            </button>
          )}
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
          <Loader2 className="spin" size={20} /> {state.status === 'install' ? `${t('Загружаю оригинал…')} ${state.label || ''}` : t('Загрузка…')}
        </div>
      )}
      {state.status === 'none' && <p className="muted">{t('Для этой книги нет оригинала.')}</p>}
      {state.status === 'error' && <p className="warn">{state.message}</p>}
      {state.status === 'ok' && (
        <>
          {ot ? (
            <Segmented
              id="il-source-ot"
              value={vulg ? 'vulg' : lxx ? 'lxx' : 'heb'}
              onChange={setOtSource}
              options={[
                ['heb', t('Еврейский')],
                ['lxx', t('Септуагинта')],
                ['vulg', t('Вульгата')],
              ]}
            />
          ) : (
            <Segmented
              id="il-source"
              value={vulg ? 'vulg' : vin ? 'vin' : 'syn'}
              onChange={setSource}
              options={[
                ['syn', t('Синодальный')],
                ['vin', t('Винокуров')],
                ['vulg', t('Вульгата')],
              ]}
            />
          )}
          {state.ru && <blockquote className="xref-source">{state.ru}</blockquote>}
          {noAudio && <p className="muted small">{t('Записи этого стиха пока нет.')}</p>}
          {!state.words.length && <p className="muted">{t('В оригинале этого стиха нет.')}</p>}
          {(lxx || vulg) && state.words.length > 0 && <p className="muted small">{t('Под словами — значения по словарю, а не перевод.')}</p>}
          <div className={`il-grid ${hebrew ? 'hebrew' : vulg ? 'latin' : 'greek'}`} dir={hebrew ? 'rtl' : 'ltr'}>
            {state.words.map((w, i) => (
              <div key={i} className={`il-cell ${i === cur ? 'speaking' : ''}`}>
                <span className={`il-line ${hebrew || noSound ? '' : 'say-after'}`} dir="ltr">
                  {!noSound && (
                    <button className="il-say" onClick={() => sayWord(i)} aria-label={t('Послушать слово')} title={t('Послушать слово')}>
                      <Volume2 size={15} />
                    </button>
                  )}
                  <button className="il-orig" dir={hebrew ? 'rtl' : 'ltr'} lang={hebrew ? 'he' : vulg ? 'la' : 'grc'} onClick={() => open(w)} disabled={!w.strongs}>
                    {w.text}
                  </button>
                </span>
                <button className="il-rest" onClick={() => open(w)} disabled={!w.strongs}>
                  <span className="il-tr" dir="ltr">
                    {(vulg ? w.lemma : translit(w.text)) || ' '}
                  </span>
                  <span className={`il-ru ${w.guess ? 'guess' : ''}`} dir="ltr">
                    {w.gloss || ' '}
                  </span>
                  <span className="il-num" dir="ltr">
                    {w.num ? w.num.slice(1) : ' '}
                  </span>
                </button>
              </div>
            ))}
          </div>
          {vin && <p className="sheet-hint">{t('Подстрочник А. Винокурова — с разрешения автора. Под словом: чтение, перевод и номер Стронга.')}</p>}
          {lxx && <p className="sheet-hint">{t('Септуагинта — греческий Ветхий Завет (изд. Г. Б. Свита). Под словом: чтение, значение и номер Стронга. Нажмите на слово — откроется словарь.')}</p>}
          {vulg && <p className="sheet-hint">{t('Вульгата — латинская Библия бл. Иеронима (Климентинское издание). Под словом: начальная форма и значение. Значения — из Викисловаря (CC BY-SA 4.0), формы — по Collatinus.')}</p>}
          {/* не hidden: у .sheet-hint свой display, атрибут hidden его не перебивает */}
          {!vin && !lxx && !vulg && (
            <p className="sheet-hint">
              {t('Под словом: чтение, перевод и номер Стронга; бледным — обычное значение. Нажмите на слово — откроется словарь.')}
            </p>
          )}
        </>
      )}
    </BottomSheet>
  );
}
