// Сравнение выделенных стихов во всех установленных переводах.
// У каждого перевода — кнопка «Параллельно»: экран делится, в другой панели открывается этот перевод на том же месте.
import React, { useEffect, useState } from 'react';
import { Columns2, Library, Loader2 } from 'lucide-react';
import BottomSheet from './BottomSheet.jsx';
import { useApp } from '../App.jsx';
import { selectionLabel, selectionText } from './SelectionBar.jsx';
import { Empty, Marquee } from './ui.jsx';
import { langName, langRank } from './ModuleLibrary.jsx';
import { diffWords } from '../core/diff.js';
import { t } from '../core/i18n.js';

// Текст перевода с подсветкой слов, которыми он отличается от открытого перевода
function Diffed({ base, text }) {
  const { parts } = diffWords(base, text);
  return (
    <>
      {parts.map((p, i) => (p.diff ? <mark key={i} className="diff">{p.text}</mark> : <React.Fragment key={i}>{p.text}</React.Fragment>))}
    </>
  );
}

export default function CompareSheet({ pane, payload, onClose }) {
  const { bibles, openParallel, openSheet } = useApp();
  const { refs, moduleId, pick, copyFallback } = payload;
  const [texts, setTexts] = useState(null);
  const [lang, setLang] = useState('all');
  const others = bibles.filter((b) => b.id !== moduleId);
  const current = bibles.find((b) => b.id === moduleId);
  const ordered = [current, ...others].filter(Boolean);
  // Языки установленных переводов: русский первым, дальше по распространённости
  const langs = [...new Set(ordered.map((b) => b.language || ''))].sort((a, b) => langRank(a) - langRank(b));
  const shown = ordered.filter((b) => b.id === moduleId || lang === 'all' || (b.language || '') === lang);

  useEffect(() => {
    let alive = true;
    Promise.all(ordered.map(async (b) => [b.id, await selectionText(b.id, refs)])).then((list) => alive && setTexts(Object.fromEntries(list)));
    return () => {
      alive = false;
    };
  }, []);

  const open = (id) => {
    onClose();
    openParallel(pane, refs[0], id);
  };

  if (copyFallback)
    return (
      <BottomSheet title={t('Скопируйте текст')} subtitle={t('Браузер не дал скопировать автоматически')} onClose={onClose} initial={0}>
        <textarea className="copy-area" readOnly value={copyFallback} onFocus={(e) => e.target.select()} autoFocus rows={6} />
      </BottomSheet>
    );

  return (
    <BottomSheet
      title={pick ? t('Читать параллельно') : t('Сравнение переводов')}
      subtitle={selectionLabel(refs, true)}
      onClose={onClose}
      initial={pick ? 1 : 2}
    >
      {others.length === 0 && (
        <Empty icon={Library} title={t('Другой перевод не установлен')}>
          {t('Установите ещё один перевод из каталога.')}{' '}
          <button className="link-inline" onClick={() => openSheet('library', pane, { tab: 'catalog' })}>
            {t('Открыть каталог')}
          </button>
        </Empty>
      )}
      {!texts && (
        <div className="loading">
          <Loader2 className="spin" size={20} /> {t('Загрузка…')}
        </div>
      )}
      {texts && (
        <>
          {langs.length > 1 && (
            <div className="chips filter-chips lang-chips" role="group" aria-label={t('Язык переводов')}>
              {[['all', t('Все языки')], ...langs.map((c) => [c, langName(c)])].map(([k, l]) => (
                <button key={k} className={`chip ${lang === k ? 'on' : ''}`} aria-pressed={lang === k} onClick={() => setLang(k)}>
                  {l}
                </button>
              ))}
            </div>
          )}
          <ul className="cmp-list">
            {shown.map((b) => (
              <li key={b.id} className="cmp-item">
                <div className="cmp-head">
                  <span className="cmp-name">{b.name}</span>
                  {b.id === moduleId ? <span className="cmp-sub">{t('открыт сейчас')}</span> : <Marquee className="cmp-sub">{b.title}</Marquee>}
                  {b.id !== moduleId && (
                    <button className="icon-btn cmp-par" onClick={() => open(b.id)} aria-label={t('Читать параллельно: {name}', { name: b.name })} title={t('Читать параллельно')}>
                      <Columns2 size={20} />
                    </button>
                  )}
                </div>
                <p className="cmp-text" dir="auto">
                  {!texts[b.id] ? (
                    <span className="muted">{t('В этом переводе нет такого места.')}</span>
                  ) : b.id !== moduleId && current && texts[moduleId] && (b.language || 'ru') === (current.language || 'ru') ? (
                    <Diffed base={texts[moduleId]} text={texts[b.id]} />
                  ) : (
                    texts[b.id]
                  )}
                </p>
              </li>
            ))}
          </ul>
          <button className="btn cmp-more" onClick={() => openSheet('library', pane, { tab: 'catalog' })}>
            <Library size={17} /> {t('Другие переводы')}
          </button>
        </>
      )}
    </BottomSheet>
  );
}
