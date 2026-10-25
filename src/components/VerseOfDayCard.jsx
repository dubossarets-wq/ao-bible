// Стих дня: крупно на свободной фотографии, кнопки «Читать», «Картинка», «Поделиться».
// Показывается вверху листа «Планы». Стих и фото выбираются по дате (core/verseOfDay.js).
import React, { useEffect, useMemo, useState } from 'react';
import { BookOpen, Image as ImageIcon, Share2 } from 'lucide-react';
import { useApp } from '../App.jsx';
import { selectionLabel, selectionText, quoteVerse, quoteLabel } from './SelectionBar.jsx';
import { verseOfDay, dayOfYear, VERSES } from '../core/verseOfDay.js';
import { t } from '../core/i18n.js';

// Перевод для стиха дня: перевод основной панели, иначе основной перевод из настроек, иначе первый установленный
function verseModules(bibles, panes, settings) {
  const ids = [panes[0]?.moduleId, settings.primaryModule, ...bibles.map((b) => b.id)];
  return [...new Set(ids)].map((id) => bibles.find((b) => b.id === id)).filter(Boolean);
}

// Текст стиха дня. Если в установленных переводах его нет (например, есть только Новый Завет) — следующий стих списка
async function loadVerse(mods) {
  const first = verseOfDay();
  const start = VERSES.findIndex((r) => r === `${first.book}.${first.chapter}.${first.verse}`);
  for (let k = 0; k < 40; k++) {
    const [book, chapter, verse] = VERSES[(start + k) % VERSES.length].split('.');
    const ref = { book, chapter: +chapter, verse: +verse };
    for (const m of mods) {
      const text = (await selectionText(m.id, [ref])).trim();
      if (text) return { ref, text, module: m };
    }
  }
  return null;
}

export default function VerseOfDayCard({ pane = 0, onClose }) {
  const { bibles, panes, settings } = useApp();
  const mods = useMemo(() => verseModules(bibles, panes, settings), [bibles, panes, settings]);
  const { navigate, openSheet, toast } = useApp();
  const [v, setV] = useState(undefined); // undefined — загружается, null — не нашёлся
  const [photo, setPhoto] = useState(null);
  const key = mods.map((m) => m.id).join();

  useEffect(() => {
    let alive = true;
    loadVerse(mods).then((x) => alive && setV(x), () => alive && setV(null));
    // Фото на сегодня — из свободных снимков для картинок со стихом, тоже по дате
    fetch('images/verse-bg/index.json')
      .then((r) => (r.ok ? r.json() : { images: [] }))
      .then((j) => {
        const list = j.images || [];
        if (alive && list.length) setPhoto(list[dayOfYear() % list.length]);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [key]);

  if (v === null) return null;
  const label = v ? selectionLabel([v.ref], true) : '';

  const read = () => {
    onClose();
    navigate(pane, v.ref);
  };
  const image = () => openSheet('verse-image', pane, { refs: [v.ref], moduleId: v.module.id });
  // Как «Поделиться» у выделенных стихов: системное окно, иначе — скопировать текст
  const share = async () => {
    const text = quoteVerse(v.text, quoteLabel([v.ref]));
    if (navigator.share) {
      try {
        await navigator.share({ text });
        return;
      } catch (e) {
        if (e?.name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      toast(t('Поделиться нельзя — текст скопирован'));
    } catch {
      toast(t('Не удалось ни поделиться, ни скопировать'), 'error');
    }
  };

  return (
    <section className={`today-verse ${photo?.tone === 'light' ? 'light-photo' : ''}`} aria-label={t('Стих дня')}>
      {photo && <img className="today-photo" src={`images/verse-bg/${photo.file}`} alt="" aria-hidden="true" />}
      <div className="today-veil" aria-hidden="true" />
      <div className="today-verse-body">
        <span className="today-kicker">{t('Стих дня')}</span>
        {v ? (
          <>
            <blockquote className="today-text">{v.text}</blockquote>
            <span className="today-ref">{label}</span>
          </>
        ) : (
          <span className="today-text-skeleton" aria-hidden="true" />
        )}
      </div>
      <div className="today-actions">
        <button className="today-act primary" onClick={read} disabled={!v}>
          <BookOpen size={18} /> {t('Читать')}
        </button>
        <button className="today-act" onClick={image} disabled={!v}>
          <ImageIcon size={18} /> {t('Картинка')}
        </button>
        {/* «Поделиться» — только значком; автор и лицензия фото — в «О приложении → Лицензии» */}
        <button className="today-act icon-only" onClick={share} disabled={!v} aria-label={t('Поделиться')} title={t('Поделиться')}>
          <Share2 size={18} />
        </button>
      </div>
    </section>
  );
}
