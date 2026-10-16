// Настройки: язык, что показывать в меню ⋮, вид текста, аудио (ИИ-диктор, книги без интернета),
// библиотека модулей, мои данные (сохранить в файл / перенести на другой телефон), обновления и «О приложении».
import React, { useRef, useState } from 'react';
import { ChevronRight, Library, Palette, RefreshCw, History, Info, Download, Upload, Trash2, BookOpenCheck, Loader2, AlignLeft, MoreVertical, Headphones, HardDrive, Check } from 'lucide-react';
import BottomSheet from './BottomSheet.jsx';
import { useApp } from '../App.jsx';
import { Segmented, Switch, Hint, ConfirmButton } from './ui.jsx';
import { textView } from './AppearanceSettings.jsx';
import { IS_PWA_BUILD, applyUpdate, buildDate, BUILD } from '../core/updates.js';
import { saveDataFile, readDataFile, describeData, importData } from '../core/dataFile.js';
import { listOffline, removeBook } from '../core/offlineAudio.js';
import { bookMeta } from '../core/books.js';
import { t, N_, LANGS, getLang, setLang, langInfo, fmtDate, locale } from '../core/i18n.js';
import Flag from './Flag.jsx';

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
  ['focus', N_('Режим чтения (вкл/выкл)'), N_('Прячет кнопки в тексте, верхняя панель уходит при прокрутке вниз')],
  ['book', N_('«Как книга» (вкл/выкл)'), N_('Быстро переключать текст в вид книги и обратно')],
  ['split', N_('Синхронная прокрутка и расположение панелей'), N_('Видны в меню, когда экран разделён на две панели')],
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
            onClick={() => {
              setLang(l.code);
              onPicked();
            }}
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
    if (r === 'downloaded') toast(t('Файл с данными сохранён в «Загрузки»'));
    if (r === 'shared') toast(t('Файл с данными сохранён'));
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
        {t('Сохраните файл, чтобы не потерять заметки или перенести всё на другой телефон. В файл входят закладки, заметки, любимые стихи, выделения, планы, проповеди и настройки.')}
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
          <p className="pref-note">{t('Данные в этом телефоне заменятся данными из файла. Нынешние сохранятся в резервной копии («Версии приложения»).')}</p>
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
  const { modules } = useApp();
  const [list, setList] = useState(listOffline);
  const items = Object.entries(list);
  if (!items.length)
    return <p className="pref-note">{t('Пока ничего не скачано. Чтобы слушать без интернета: включите прослушивание и нажмите в проигрывателе кнопку со стрелкой вниз.')}</p>;
  const total = items.reduce((a, [, v]) => a + (v.bytes || 0), 0);
  return (
    <>
      <p className="pref-note">{t('Скачано {n} кн. · {size} МБ', { n: items.length, size: (total / 1048576).toFixed(0) })}</p>
      <ul className="pref-list">
        {items.map(([k, v]) => {
          const [audioId, book] = k.split('|');
          return (
            <li key={k}>
              <span>
                {bookMeta(book).name} <small>{modules.find((m) => m.id === audioId)?.name || audioId} · {t('{n} МБ', { n: (v.bytes / 1048576).toFixed(0) })}</small>
              </span>
              <ConfirmButton className="icon-btn subtle" confirmText={t('Удалить')} onConfirm={() => removeBook(audioId, book).then(() => setList(listOffline()))} aria-label={t('Удалить скачанную книгу {book}', { book: bookMeta(book).name })}>
                <Trash2 size={15} />
              </ConfirmButton>
            </li>
          );
        })}
      </ul>
    </>
  );
}

// Простые настройки: короткий список крупных строк, каждая открывает свою страницу
const PAGES = {
  lang: N_('Язык'),
  view: N_('Вид текста'),
  menu: N_('Меню ⋮'),
  audio: N_('Аудио'),
  data: N_('Мои данные'),
  app: N_('Обновления'),
};
const VIEW_NAMES = { verses: N_('По стихам'), flow: N_('Сплошной текст'), book: N_('Как книга') };

// Вместо значка в строке «Язык» — флажок текущего языка
const CurrentFlag = () => (
  <span className="pref-row-flag">
    <Flag code={langInfo().flag} size={24} />
  </span>
);

export default function PrefsSheet({ pane, onClose }) {
  const { settings: s, setSettings: set, openSheet, updates, toast } = useApp();
  const [page, setPage] = useState(null);
  const [checking, setChecking] = useState(false);
  const setMenu = (k, v) => set({ menu: { ...s.menu, [k]: v } });
  const go = (kind) => openSheet(kind, pane);

  const check = async () => {
    if (updates.available) return applyUpdate();
    setChecking(true);
    const r = await updates.check();
    setChecking(false);
    if (r.error) toast(t('Не удалось проверить: {error}', { error: r.error }), 'error');
    else if (!r.available) toast(t('У вас последняя версия'));
  };

  return (
    <BottomSheet title={page ? t(PAGES[page]) : t('Настройки')} onClose={onClose} onBack={page ? () => setPage(null) : null} initial={2}>
      {!page && (
        <div className="pref-list-main">
          {/* «Language» по-английски — чтобы найти строку, даже если случайно выбран незнакомый язык */}
          <Row icon={CurrentFlag} onClick={() => setPage('lang')} sub={langInfo().name + (getLang() === 'ru' || getLang() === 'en' ? '' : ' · Language')}>
            {t('Язык')}
          </Row>
          <Row icon={BookOpenCheck} onClick={() => go('help')} sub={t('Как пользоваться приложением')}>
            {t('Инструкция')}
          </Row>
          <Row icon={Palette} onClick={() => go('settings')} sub={t('Тема, шрифт, размер букв')}>
            {t('Оформление')}
          </Row>
          <Row icon={AlignLeft} onClick={() => setPage('view')} sub={t(VIEW_NAMES[textView(s)]) + (s.focusMode ? ` · ${t('режим чтения')}` : '')}>
            {t('Вид текста')}
          </Row>
          <Row icon={MoreVertical} onClick={() => setPage('menu')} sub={t('Что показывать в меню «три точки»')}>
            {t('Меню ⋮')}
          </Row>
          <Row icon={Headphones} onClick={() => setPage('audio')} sub={t('ИИ-диктор, книги без интернета')}>
            {t('Аудио')}
          </Row>
          <Row icon={Library} onClick={() => go('library')} sub={t('Переводы, словари, аудиокниги')}>
            {t('Библиотека модулей')}
          </Row>
          <Row icon={HardDrive} onClick={() => setPage('data')} sub={t('Сохранить в файл, перенести на другой телефон')}>
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

      {page === 'view' && (
        <section className="settings-group">
          <Segmented
            id="pref-view"
            value={textView(s)}
            onChange={(v) => set({ bookMode: v === 'book', continuousVerses: v === 'flow' })}
            options={[
              ['verses', t('По стихам')],
              ['flow', t('Сплошной')],
              ['book', t('Как книга')],
            ]}
          />
          <p className="pref-note">
            {textView(s) === 'verses' && t('Каждый стих с новой строки, с номером.')}
            {textView(s) === 'flow' && t('Стихи идут подряд, как в обычной книге, но с номерами.')}
            {textView(s) === 'book' && t('Текст абзацами, без номеров и кнопок — для спокойного долгого чтения.')}
          </p>
          <Switch id="pref-focus" checked={s.focusMode} onChange={(focusMode) => set({ focusMode })} label={t('Режим чтения')} hint={t('Прячет кнопки в тексте, верхняя панель уходит при прокрутке вниз')} />
        </section>
      )}

      {page === 'menu' && (
        <section className="settings-group">
          <p className="pref-note">{t('Отметьте, что показывать в меню «три точки» вверху справа. Остальное всегда есть здесь, в настройках.')}</p>
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
            hint={t('Если к главе нет живой аудиозаписи, текст прочитает синтезированный голос')}
          />
          <h4>{t('Книги без интернета')}</h4>
          <OfflineList />
        </section>
      )}

      {page === 'data' && <MyData />}

      {page === 'app' && (
        <section className="settings-group">
          <Row icon={RefreshCw} onClick={check} sub={updates.available ? t('Нажмите, чтобы обновить') : t('Сейчас: версия от {date}', { date: buildDate(BUILD) })} extra={checking ? <Loader2 size={16} className="spin" /> : null}>
            {updates.available ? t('Обновить приложение') : t('Проверить обновления')}
          </Row>
          <Row icon={History} onClick={() => go('versions')} sub={t('Вернуться к прежней версии, резервные копии')}>
            {t('Версии приложения')}
          </Row>
        </section>
      )}
    </BottomSheet>
  );
}
