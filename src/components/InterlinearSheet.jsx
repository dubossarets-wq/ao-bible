// Подстрочник стиха: слово оригинала, под ним — как оно передано в синодальном переводе, ниже — номер Стронга.
// Нажатие на слово или номер открывает статью словаря. Стрелки — к соседним стихам. Окно на всю высоту.
import React, { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import BottomSheet from './BottomSheet.jsx';
import { useApp } from '../App.jsx';
import { getBook, getVerse } from '../core/modules.js';
import { plainText } from '../core/verseMarkup.js';
import { formatRef, testamentOf } from '../core/books.js';
import { ensureOriginal, ruInterlinear, originalFor } from '../core/interlinear.js';
import { translit } from '../core/translit.js';
import { t } from '../core/i18n.js';

export default function InterlinearSheet({ pane, payload, onClose }) {
  const { openSheet } = useApp();
  const [ref, setRef] = useState(payload.ref);
  const [state, setState] = useState({ status: 'loading' });
  const hebrew = testamentOf(ref.book) === 'OT';

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!originalFor(ref.book)) return alive && setState({ status: 'none' });
      try {
        await ensureOriginal(ref.book, (p, label) => alive && setState({ status: 'install', label }));
        const [words, ru] = await Promise.all([ruInterlinear(ref), payload.moduleId ? getVerse(payload.moduleId, ref) : null]);
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

  const open = (w, i) => w.strongs && openSheet('dict', pane, { token: { text: w.text, strongs: w.strongs, morph: w.morph ? [w.morph] : null }, ref, moduleId: payload.moduleId, wi: i, autoOpen: true, initial: 'full' });

  return (
    <BottomSheet
      title={t('Подстрочник · {ref}', { ref: formatRef(ref) })}
      subtitle={hebrew ? t('Еврейский текст (OSHB) и синодальный перевод') : t('Греческий текст (Робинсон — Пирпонт) и синодальный перевод')}
      onClose={onClose}
      initial="full"
      headerExtra={
        <>
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
          {!state.words.length && <p className="muted">{t('В оригинальном тексте этого стиха нет.')}</p>}
          <div className={`il-grid ${hebrew ? 'hebrew' : 'greek'}`}>
            {state.words.map((w, i) => (
              <button key={i} className={`il-cell ${w.italic ? 'added' : ''}`} onClick={() => open(w, i)} disabled={!w.strongs}>
                <span className="il-ru">
                  {w.text}
                  {w.after}
                </span>
                <span className="il-orig" dir={hebrew ? 'rtl' : 'ltr'}>
                  {w.orig || ' '}
                </span>
                <span className="il-tr">{w.orig ? translit(w.orig) : ' '}</span>
                <span className="il-num">{w.num ? w.num.slice(1) : ' '}</span>
              </button>
            ))}
          </div>
          <p className="sheet-hint">
            {t('Все слова синодального текста; под словом — слово оригинала, его приблизительное чтение и номер Стронга. Слова без оригинала добавлены переводчиками. Нажмите на слово — откроется статья словаря.')}
          </p>
        </>
      )}
    </BottomSheet>
  );
}
