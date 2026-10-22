// Настройки: язык, что показывать в меню ⋮, аудио (ИИ-диктор, книги без интернета),
// библиотека модулей, мои данные (сохранить в файл / перенести на другой телефон), обновления и «О приложении».
import React, { useRef, useState } from 'react';
import { ChevronRight, Library, Palette, RefreshCw, History, Info, Download, Upload, Trash2, BookOpenCheck, Loader2, MoreVertical, Headphones, HardDrive, Check, Sparkles } from 'lucide-react';
import BottomSheet from './BottomSheet.jsx';
import { useApp } from '../App.jsx';
import { Switch, Hint, ConfirmButton } from './ui.jsx';
import SwipeRow from './SwipeRow.jsx';
import { IS_PWA_BUILD, applyUpdate, buildDate, BUILD } from '../core/updates.js';
import { saveDataFile, readDataFile, describeData, importData } from '../core/dataFile.js';
import { listOffline, removeBook } from '../core/offlineAudio.js';
import { bookMeta } from '../core/books.js';
import { t, N_, LANGS, getLang, setLang, langInfo, fmtDate, locale } from '../core/i18n.js';
import Flag from './Flag.jsx';
import { usePhoneLayout } from '../core/layout.js';

// Строка-переход в другой раздел
function Row({ icon: Icon, children, sub, onClick, extra }) {
  return (
    <button className="pref-row" onClick={onClick}>
      <Icon size={19} />
      <span className="pref-row-text">
        {children}
        {sub && <small>{sub}</small>}
      </span>
      {extra}
      <ChevronRight size={17} className="pref-chev" />
    </button>
  );
}

const MENU_ITEMS = [
  ['help', N_('Инструкция')],
  ['lastBookmark', N_('«К последней закладке»')],
  ['sermons', N_('Проповеди')],
  ['plans', N_('Планы чтения')],
  ['listen', N_('«Слушать с этого места»')],
  ['maps', N_('Карты')],
  ['focus', N_('Режим чтения'), N_('Без кнопок в тексте, панель прячется при прокрутке')],
  ['book', N_('«Как книга»')],
  ['split', N_('Синхронная прокрутка и расположение панелей'), N_('Только при разделённом экране')],
];

// Название языка на языке интерфейса («немецкий»), если браузер это умеет
function langName(code) {
  try {
    const s = new Intl.DisplayNames([locale()], { type: 'language' }).of(code);
    return s && s !== code ? s[0].toLocaleUpperCase(locale()) + s.slice(1) : '';
  } catch {
    return '';
  }
}

// Выбор языка: круглый флаг, название на самом языке и на языке интерфейса; смена — сразу, без перезагрузки
function LangList({ onPicked }) {
  const cur = getLang();
  return (
    <div className="lang-list" role="radiogroup" aria-label={t('Язык')}>
      {LANGS.map((l) => {
        const local = l.code === cur ? '' : langName(l.code);
        return (
          <button
            key={l.code}
            role="radio"
            aria-checked={l.code === cur}
            className={`lang-row ${l.code === cur ? 'on' : ''}`}
            lang={l.locale}
            onClick={() => setLang(l.code).then(onPicked)}
          >
            <Flag code={l.flag} size={30} />
            <span className="lang-text">
              {l.name}
              {local && local.toLowerCase() !== l.name.toLowerCase() && <small lang={locale()}>{local}</small>}
            </span>
            {l.code === cur && <Check size={20} className="lang-check" />}
          </button>
        );
      })}
    </div>
  );
}

function MyData() {
  const { toast } = useApp();
  const input = useRef(null);
  const [pending, setPending] = useState(null); // файл, который собираются восстановить
  const [err, setErr] = useState(null);
  const save = async () => {
    const r = await saveDataFile();
    if (r === 'downloaded') toast(t('Файл сохранён в «Загрузки»'));
    if (r === 'shared') toast(t('Файл сохранён'));
  };
  const pick = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setErr(null);
    try {
      setPending(await readDataFile(f));
    } catch (x) {
      setErr(x.message);
    }
  };
  const d = pending && describeData(pending);
  return (
    <section className="settings-group">
      <p className="pref-note">
        {t('Закладки, заметки, любимые стихи, выделения, планы, проповеди и настройки — в одном файле. Чтобы ничего не потерять или перейти на новый телефон.')}
      </p>
      <div className="pref-btns">
        <button className="btn primary" onClick={save}>
          <Download size={17} /> {t('Сохранить в файл')}
        </button>
        <button className="btn" onClick={() => input.current?.click()}>
          <Upload size={17} /> {t('Восстановить из файла')}
        </button>
        <input ref={input} type="file" accept=".json,application/json" hidden onChange={pick} />
      </div>
      {err && <p className="error-text small">{err}</p>}
      {d && (
        <div className="pref-restore">
          <p>
            {d.at
              ? t('В файле от {date}: закладок {bookmarks}, заметок {notes}, любимых стихов {favorites}, выделений {highlights}, планов {plans}, проповедей {sermons}.', { ...d, date: fmtDate(d.at), at: null })
              : t('В файле: закладок {bookmarks}, заметок {notes}, любимых стихов {favorites}, выделений {highlights}, планов {plans}, проповедей {sermons}.', { ...d, at: null })}
          </p>
          <p className="pref-note">{t('Всё на телефоне заменится данными из файла. Нынешнее останется в резервной копии («Версии приложения»).')}</p>
          <div className="pref-btns">
            <button className="btn primary" onClick={() => importData(pending)}>
              {t('Восстановить')}
            </button>
            <button className="btn" onClick={() => setPending(null)}>
              {t('Отмена')}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function OfflineList() {
  const { modules, toast } = useApp();
  const [list, setList] = useState(listOffline);
  const items = Object.entries(list);
  if (!items.length)
    return <p className="pref-note">{t('Пока ничего нет. Чтобы слушать без интернета, нажмите в проигрывателе стрелку вниз.')}</p>;
  const total = items.reduce((a, [, v]) => a + (v.bytes || 0), 0);
  return (
    <>
      <p className="pref-note">{t('Скачано {n} кн. · {size} МБ', { n: items.length, size: (total / 1048576).toFixed(0) })}</p>
      <ul className="pref-list">
        {items.map(([k, v]) => {
          const [audioId, book] = k.split('|');
          return (
            // Смахнуть влево — кнопка «Удалить» (удалить сразу длинным свайпом нельзя: вернуть книгу — только скачать заново)
            <SwipeRow
              key={k}
              innerClassName="pref-list-row"
              full={false}
              onDelete={() => removeBook(audioId, book).then(() => (setList(listOffline()), toast(t('Удалено из телефона: {book}', { book: bookMeta(book).name }))))}
              label={t('Удалить скачанную книгу {book}', { book: bookMeta(book).name })}
            >
              <span>
                {bookMeta(book).name} <small>{modules.find((m) => m.id === audioId)?.name || audioId} · {t('{n} МБ', { n: (v.bytes / 1048576).toFixed(0) })}</small>
              </span>
              <ConfirmButton className="icon-btn subtle" confirmText={t('Удалить')} onConfirm={() => removeBook(audioId, book).then(() => setList(listOffline()))} aria-label={t('Удалить скачанную книгу {book}', { book: bookMeta(book).name })}>
                <Trash2 size={15} />
              </ConfirmButton>
            </SwipeRow>
          );
        })}
      </ul>
    </>
  );
}

// Простые настройки: короткий список крупных строк, каждая открывает свою страницу
const PAGES = {
  lang: N_('Язык'),
  menu: N_('Меню ⋮'),
  audio: N_('Аудио'),
  data: N_('Мои данные'),
  app: N_('Обновления'),
};

// Вместо значка в строке «Язык» — флажок текущего языка
const CurrentFlag = () => (
  <span className="pref-row-flag">
    <Flag code={langInfo().flag} size={24} />
  </span>
);

export default function PrefsSheet({ pane, payload, sheetId, onClose }) {
  const { settings: s, setSettings: set, openSheet, updates, toast } = useApp();
  const phone = usePhoneLayout(); // на телефоне меню ⋮ — это лист «Ещё» на нижней панели
  const [page, setPage] = useState(null);
  const [checking, setChecking] = useState(false);
  const setMenu = (k, v) => set({ menu: { ...s.menu, [k]: v } });
  // Пункты настроек открываются со стрелкой «‹ Назад» — обратно в «Настройки»
  const go = (kind) => openSheet(kind, pane, { returnTo: { kind: 'prefs', payload: payload || {}, id: sheetId } });

  const check = async () => {
    if (updates.available) return applyUpdate();
    setChecking(true);
    const r = await updates.check();
    setChecking(false);
    if (r.error) toast(t('Не удалось проверить: {error}', { error: r.error }), 'error');
    else if (!r.available) toast(t('У вас последняя версия'));
  };

  return (
    <BottomSheet title={page ? (page === 'menu' && phone ? t('Меню «Ещё»') : t(PAGES[page])) : t('Настройки')} onClose={onClose} onBack={page ? () => setPage(null) : null} initial={2}>
      {!page && (
        <div className="pref-list-main">
          {/* «Language» по-английски — чтобы найти строку, даже если случайно выбран незнакомый язык */}
          <Row icon={CurrentFlag} onClick={() => setPage('lang')} sub={langInfo().name + (getLang() === 'ru' || getLang() === 'en' ? '' : ' · Language')}>
            {t('Язык')}
          </Row>
          <Row icon={BookOpenCheck} onClick={() => go('help')} sub={t('Пошаговые подсказки')}>
            {t('Инструкция')}
          </Row>
          <Row icon={Palette} onClick={() => go('settings')} sub={t('Тема, шрифт, размер букв')}>
            {t('Оформление')}
          </Row>
          <Row icon={MoreVertical} onClick={() => setPage('menu')} sub={phone ? t('Что показывать в разделе «Ещё»') : t('Выбрать пункты меню')}>
            {phone ? t('Меню «Ещё»') : t('Меню ⋮')}
          </Row>
          <Row icon={Headphones} onClick={() => setPage('audio')} sub={t('ИИ-диктор, книги без интернета')}>
            {t('Аудио')}
          </Row>
          <Row icon={Library} onClick={() => go('library')} sub={t('Переводы, словари, аудиокниги')}>
            {t('Библиотека модулей')}
          </Row>
          <Row icon={HardDrive} onClick={() => setPage('data')} sub={t('Сохранить и перенести на новый телефон')}>
            {t('Мои данные')}
          </Row>
          {IS_PWA_BUILD && (
            <Row icon={RefreshCw} onClick={() => setPage('app')} sub={updates.available ? t('Есть новая версия') : t('Версия от {date}', { date: buildDate(BUILD) })} extra={updates.available ? <span className="badge-new">{t('новая')}</span> : null}>
              {t('Обновления')}
            </Row>
          )}
          <Row icon={Info} onClick={() => go('about')} sub={t('Переводы, словари, авторы')}>
            {t('О приложении')}
          </Row>
        </div>
      )}

      {page === 'lang' && <LangList onPicked={() => setPage(null)} />}

      {page === 'menu' && (
        <section className="settings-group">
          <p className="pref-note">
            {phone
              ? t('Отметьте, что показывать в разделе «Ещё» на нижней панели. Остальное всегда есть здесь, в настройках.')
              : t('Отметьте, что показывать в меню ⋮. Остальное всегда есть в настройках.')}
          </p>
          {MENU_ITEMS.map(([k, label, hint]) => (
            <Switch key={k} id={`menu-${k}`} checked={!!s.menu[k]} onChange={(v) => setMenu(k, v)} label={t(label)} hint={hint && t(hint)} />
          ))}
        </section>
      )}

      {page === 'audio' && (
        <section className="settings-group">
          <Switch
            id="pref-tts"
            checked={s.ttsFallback}
            onChange={(ttsFallback) => set({ ttsFallback })}
            label={t('ИИ-диктор, когда нет записи')}
            hint={t('Если живой записи нет, главу прочитает синтезированный голос')}
          />
          <h4>{t('Книги без интернета')}</h4>
          <OfflineList />
        </section>
      )}

      {page === 'data' && <MyData />}

      {page === 'app' && (
        <section className="settings-group">
          <Row icon={RefreshCw} onClick={check} sub={updates.available ? t('Нажмите, чтобы обновить') : t('Версия от {date}', { date: buildDate(BUILD) })} extra={checking ? <Loader2 size={16} className="spin" /> : null}>
            {updates.available ? t('Обновить приложение') : t('Проверить обновления')}
          </Row>
          <Row icon={Sparkles} onClick={() => go('news')} sub={t('Последнее обновление')}>
            {t('Что нового')}
          </Row>
          <Row icon={History} onClick={() => go('versions')} sub={t('Откат и резервные копии')}>
            {t('Версии приложения')}
          </Row>
        </section>
      )}
    </BottomSheet>
  );
}
