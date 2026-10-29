// Быстрое переключение перевода в панели: книга, глава и стих сохраняются. Ниже установленных — переводы
// из каталога, которых ещё нет на устройстве: их можно скачать прямо отсюда, фильтры отбирают и их.
import React, { useEffect, useState } from 'react';
import { Library, Star } from 'lucide-react';
import BottomSheet from './BottomSheet.jsx';
import { useApp } from '../App.jsx';
import * as repo from '../core/modules.js';
import { t, getLang } from '../core/i18n.js';
import { bookMeta } from '../core/books.js';
import { langName } from './ModuleLibrary.jsx';
import { fmtSize } from './ui.jsx';

// Что в переводе: 'ot', 'nt', 'dc' — у установленного по его книгам, у не скачанного — по полю scope каталога
const scopeOf = (b) => {
  if (!b.books) return new Set(b.scope || []);
  const s = new Set();
  for (const x of b.books) {
    const m = bookMeta(x.id);
    s.add(m.dc || m.t === 'AP' ? 'dc' : m.t === 'NT' ? 'nt' : 'ot');
  }
  return s;
};
// Фильтр показывается, только если отбирает часть списка
const KINDS = [
  ['full', 'Вся Библия', (s) => s.has('ot') && s.has('nt')],
  ['ot', 'Ветхий Завет', (s) => s.has('ot')],
  ['nt', 'Новый Завет', (s) => s.has('nt')],
  ['dc', 'Неканон', (s) => s.has('dc')],
  ['strongs', 'С номерами Стронга', (s, b) => !!b.features?.strongs],
  ['il', 'Подстрочник', (s, b) => !!b.features?.interlinear],
];
const fits = (test) => (b) => test(scopeOf(b), b);

export default function ModulePicker({ pane, onClose }) {
  const { bibles, modules, panes, setPaneModule, openSheet, settings, setSettings, toast } = useApp();
  const current = panes[pane]?.moduleId;
  // каталог — для переводов, которых нет на устройстве; без сети этого раздела просто нет
  const [catalog, setCatalog] = useState(null);
  const [catErr, setCatErr] = useState(false);
  useEffect(() => void repo.fetchCatalog().then(setCatalog, () => setCatErr(true)), []);
  const [busy, setBusy] = useState({});
  const install = async (c) => {
    setBusy((b) => ({ ...b, [c.id]: 0 }));
    try {
      await repo.installFromCatalog(c, (p) => setBusy((b) => ({ ...b, [c.id]: p })));
      toast(t('{name} установлен', { name: c.name }));
    } catch (e) {
      toast(`${c.name}: ${repo.errorText(e)}`, 'error');
    } finally {
      setBusy((b) => {
        const n = { ...b };
        delete n[c.id];
        return n;
      });
    }
  };
  const have = new Set((modules || []).map((m) => m.id));
  const more = (catalog || []).filter((m) => m.type === 'bible' && !m.unavailable && !m.features?.helper && !have.has(m.id));
  // основной (избранный ★) — первым, остальные в прежнем порядке, подстрочники — всегда внизу;
  // открытый сейчас — отмечен фоном (.pick-row.on)
  const ordered = [...bibles.filter((b) => b.id === settings.primaryModule), ...bibles.filter((b) => b.id !== settings.primaryModule)];
  const sorted = [...ordered.filter((b) => !b.features?.interlinear), ...ordered.filter((b) => b.features?.interlinear)];
  // выборка по языкам сверху — если переводы на разных языках: язык приложения, затем языки установленных,
  // затем остальные — по числу переводов в каталоге
  const [lang, setLang] = useState(null);
  const cnt = {};
  more.forEach((b) => (cnt[b.language || 'ru'] = (cnt[b.language || 'ru'] || 0) + 1));
  const mine = [...new Set(sorted.map((b) => b.language || 'ru'))];
  const rest = Object.keys(cnt).filter((l) => !mine.includes(l)).sort((a, b) => cnt[b] - cnt[a] || a.localeCompare(b));
  const langs = [...mine, ...rest].sort((a, b) => (a === getLang() ? -1 : b === getLang() ? 1 : 0));
  const shown = langs.includes(lang) ? lang : null;
  const ofLang = (l) => (shown ? l.filter((b) => (b.language || 'ru') === shown) : l);
  const byLang = ofLang(sorted);
  const moreByLang = ofLang(more);
  // что в переводе: вся Библия, Ветхий или Новый Завет, неканонические книги, номера Стронга, подстрочник
  const [kind, setKind] = useState(null);
  const pool = [...byLang, ...moreByLang];
  const kinds = KINDS.filter(([, , test]) => {
    const n = pool.filter(fits(test)).length;
    return n > 0 && n < pool.length;
  });
  const shownKind = kinds.find(([k]) => k === kind);
  const list = shownKind ? byLang.filter(fits(shownKind[2])) : byLang;
  const moreList = shownKind ? moreByLang.filter(fits(shownKind[2])) : moreByLang;
  return (
    <BottomSheet title={t('Перевод')} subtitle={pane === 1 ? t('Вторая панель') : t('Основная панель')} onClose={onClose}>
      {kinds.length > 0 && (
        <div className="pick-langs pick-kinds" role="group" aria-label={t('Что в переводе')}>
          <button type="button" className={`chip ${!shownKind ? 'on' : ''}`} aria-pressed={!shownKind} onClick={() => setKind(null)}>
            {t('Все')}
          </button>
          {kinds.map(([k, label]) => (
            <button key={k} type="button" className={`chip ${shownKind?.[0] === k ? 'on' : ''}`} aria-pressed={shownKind?.[0] === k} onClick={() => setKind(k)}>
              {t(label)}
            </button>
          ))}
        </div>
      )}
      {langs.length > 1 && (
        <div className="pick-langs" role="group" aria-label={t('Язык')}>
          <button type="button" className={`chip ${!shown ? 'on' : ''}`} aria-pressed={!shown} onClick={() => setLang(null)}>
            {t('Все')}
          </button>
          {langs.map((l) => (
            <button key={l} type="button" className={`chip ${shown === l ? 'on' : ''}`} aria-pressed={shown === l} onClick={() => setLang(l)}>
              {langName(l)}
            </button>
          ))}
        </div>
      )}
      <ul className="pick-list">
        {list.map((b) => (
          <li key={b.id}>
            <button
              className={`pick-row ${b.id === current ? 'on' : ''}`}
              onClick={() => {
                setPaneModule(pane, b.id);
                onClose();
              }}
            >
              <span className="pick-name">{b.name}</span>
              <span className="pick-desc">
                {b.title}
                {b.features?.strongs ? ` · ${t('номера Стронга')}` : ''}
              </span>
            </button>
            {settings.primaryModule !== b.id ? (
              <button className="icon-btn subtle" title={t('Сделать основным')} aria-label={t('Сделать {name} основным переводом', { name: b.name })} onClick={() => setSettings({ primaryModule: b.id })}>
                <Star size={16} />
              </button>
            ) : (
              <span className="icon-btn subtle on" title={t('Основной перевод')} aria-label={t('Основной перевод')}>
                <Star size={16} fill="currentColor" />
              </span>
            )}
          </li>
        ))}
      </ul>
      {/* не скачанные переводы — с теми же фильтрами; «Скачать» прямо в строке, скачанный перевод встаёт в список выше */}
      {!catalog && !catErr && <p className="pick-more-h pick-more-wait">{t('Загружаю каталог…')}</p>}
      {moreList.length > 0 && (
        <>
          <h4 className="pick-more-h">
            {t('Можно скачать')} <span className="tab-n">{moreList.length}</span>
          </h4>
          <ul className="pick-list pick-more">
            {moreList.map((b) => {
              const size = b.sizeGz || b.size;
              const p = busy[b.id];
              const pct = Math.round((p || 0) * 100);
              return (
                <li key={b.id}>
                  <div className="pick-row">
                    <span className="pick-name">{b.name}</span>
                    <span className="pick-desc">
                      {[b.title !== b.name && b.title, b.features?.strongs && t('номера Стронга'), !shown && langs.length > 1 && langName(b.language || 'ru'), size && fmtSize(size)].filter(Boolean).join(' · ')}
                    </span>
                  </div>
                  {p != null ? (
                    <span className="mod-busy" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={t('Загрузка {pct}%', { pct })}>
                      <span className="mod-ring" style={{ '--p': pct }} aria-hidden="true" />
                      {pct}%
                    </span>
                  ) : (
                    <button className="mod-pill" onClick={() => install(b)} aria-label={`${t('Скачать {name}', { name: b.name })}${size ? `, ${fmtSize(size)}` : ''}`}>
                      {t('Скачать')}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
      <button className="btn wide" onClick={() => openSheet('library', pane, { tab: 'catalog' })}>
        <Library size={16} /> {t('Другие переводы')}
      </button>
    </BottomSheet>
  );
}
