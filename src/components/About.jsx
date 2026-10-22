// О приложении: что это, авторы и лицензии всех источников (весь каталог модулей, библиотеки, шрифты, карты,
// записи чтения, иллюстрации) и политика конфиденциальности. Лицензии CC BY / BY-SA / BY-NC требуют указывать
// авторов — здесь они все в одном месте.
import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import BottomSheet from './BottomSheet.jsx';
import { fetchCatalog } from '../core/modules.js';
import { MODULE_SECTIONS } from '../core/schema.js';
import { Segmented } from './ui.jsx';
import { t } from '../core/i18n.js';
import { licenseUrl, EXTRA_ATTRIBUTION } from '../core/licenses.js';

// Текст лицензии — ссылкой на её полный текст, если он известен
const License = ({ name }) => {
  const url = licenseUrl(name);
  return url ? (
    <a href={url} target="_blank" rel="noopener noreferrer">
      {name}
    </a>
  ) : (
    name
  );
};
const Linkify = ({ text }) =>
  /^https?:\/\/\S+$/.test(text) ? (
    <a href={text} target="_blank" rel="noopener noreferrer">
      {text}
    </a>
  ) : (
    text
  );

// Сторонние программы и службы, которые использует само приложение
const THIRD_PARTY = [
  ['React', 'Meta Platforms, Inc.', 'MIT', 'https://react.dev'],
  ['Lucide', 'Lucide Contributors', 'ISC', 'https://lucide.dev'],
  ['MapLibre GL JS', 'MapLibre contributors', 'BSD-3-Clause', 'https://maplibre.org'],
  ['OpenFreeMap / OpenStreetMap', '© OpenStreetMap contributors', 'ODbL', 'https://openfreemap.org'],
  ['Esri World Imagery', 'Powered by Esri. Source: Esri, Vantor (Maxar), Earthstar Geographics, and the GIS User Community', 'Esri Terms of Use', 'https://www.esri.com'],
  // Приложение для Google Play (оболочка Android)
  ['Capacitor', 'Ionic', 'MIT', 'https://capacitorjs.com'],
  ['capacitor-media-session', 'Capgo, Jonas Rothmann', 'MPL-2.0', 'https://github.com/Cap-go/capacitor-media-session'],
  ['Noto Serif, Noto Serif Hebrew', 'Google', 'SIL Open Font License 1.1', 'https://fonts.google.com/noto'],
  // разметка записей по словам при сборке; в само приложение модель не входит
  ['Torchaudio MMS_FA (forced alignment)', 'Meta AI', 'CC BY-NC 4.0', 'https://pytorch.org/audio'],
];

function Licenses() {
  const [cat, setCat] = useState(null);
  useEffect(() => {
    fetchCatalog()
      .then((c) => setCat(c.filter((m) => !m.unavailable)))
      .catch(() => setCat([]));
  }, []);
  if (!cat)
    return (
      <div className="loading">
        <Loader2 className="spin" size={20} /> {t('Загрузка…')}
      </div>
    );
  return (
    <>
      <p>{t('Тексты, словари, записи и иллюстрации взяты из свободных источников (общественное достояние и открытые лицензии) или используются с разрешения авторов. У каждой иллюстрации автор и лицензия указаны под картинкой.')}</p>
      {MODULE_SECTIONS.map(([type, label]) => {
        const list = cat.filter((m) => m.type === type);
        if (!list.length) return null;
        return (
          <section key={type} className="lic-group">
            <h4>{t(label)}</h4>
            <ul className="lic-list">
              {list.map((m) => (
                <li key={m.id}>
                  <b>{m.name}</b>
                  {m.title ? ` — ${m.title}` : ''}
                  {m.author && <span className="lic-line">{t('Авторы: {author}.', { author: m.author })}</span>}
                  {m.license && (
                    <span className="lic-line">
                      {t('Лицензия:')} <License name={m.license} />
                    </span>
                  )}
                  {(EXTRA_ATTRIBUTION[m.id] || []).map((x) => (
                    <span key={x} className="lic-line">
                      <Linkify text={x} />
                    </span>
                  ))}
                  {m.source && (
                    <span className="lic-line">
                      {t('Источник:')}{' '}
                      {/^https?:\/\/\S+$/.test(m.source) ? (
                        <a href={m.source} target="_blank" rel="noopener noreferrer">
                          {m.source}
                        </a>
                      ) : (
                        m.source
                      )}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      <section className="lic-group">
        <h4>{t('Программы и службы')}</h4>
        <ul className="lic-list">
          {THIRD_PARTY.map(([name, author, license, url]) => (
            <li key={name}>
              <b>{name}</b>
              <span className="lic-line">
                {author} · {license} ·{' '}
                <a href={url} target="_blank" rel="noopener noreferrer">
                  {url.replace(/^https:\/\//, '')}
                </a>
              </span>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

function Privacy() {
  return (
    <>
      <p>
        <b>{t('Коротко: приложение ничего о вас не собирает.')}</b>
      </p>
      <ul>
        <li>{t('Нет регистрации, рекламы, счётчиков посещений и аналитики. Мы не получаем ваши данные и никому их не передаём.')}</li>
        <li>{t('Закладки, заметки, выделения, проповеди, планы чтения и настройки хранятся только на вашем устройстве (в памяти браузера). Их можно сохранить в файл: Настройки → «Мои данные».')}</li>
        <li>{t('Чтобы показать текст и материалы, приложение загружает файлы с нескольких сайтов. Как и при открытии любого сайта, эти сайты видят адрес вашего подключения (IP) и тип браузера:')}</li>
      </ul>
      <ul className="lic-list">
        <li>{t('GitHub Pages — само приложение и модули (переводы, словари).')}</li>
        <li>{t('archive.org — записи чтения Библии.')}</li>
        <li>{t('Wikimedia Commons — иллюстрации к стихам.')}</li>
        <li>{t('Google Fonts — шрифты для иврита и греческого.')}</li>
        <li>{t('OpenFreeMap, Esri и jsDelivr — карты (только когда вы открываете карту).')}</li>
      </ul>
      <p>{t('Мы не управляем этими сайтами; у каждого из них своя политика конфиденциальности.')}</p>
      <p>{t('Доступ к микрофону, камере, контактам и местоположению приложению не нужен и не запрашивается.')}</p>
      <p>
        {t('Вопросы и предложения:')} <a href="mailto:dubossarets@gmail.com">dubossarets@gmail.com</a> ·{' '}
        <a href="https://t.me/bystreetsky" target="_blank" rel="noopener noreferrer">
          Telegram
        </a>
      </p>
    </>
  );
}

export default function About({ onClose, payload }) {
  const [tab, setTab] = useState(payload?.tab || 'about');
  return (
    <BottomSheet title={t('О приложении')} subtitle={t('AO Bible · версия {v}', { v: '0.1' })} onClose={onClose} initial={2}>
      <Segmented
        id="about-tab"
        value={tab}
        onChange={setTab}
        options={[
          ['about', t('О приложении')],
          ['licenses', t('Лицензии и авторы')],
          ['privacy', t('Конфиденциальность')],
        ]}
      />
      <div className="prose">
        {tab === 'about' && (
          <>
            <p>{t('AO Bible — бесплатное приложение для чтения и изучения Библии, без рекламы и регистрации: переводы, подстрочник с ивритом и греческим, словари Стронга на русском, параллельные места, иллюстрации, живое чтение, проповеди и планы чтения.')}</p>
            <p>{t('Приложение некоммерческое: часть материалов (подстрочник А. Винокурова, записи чтения на иврите и греческом) используется с разрешения авторов или по лицензиям, которые разрешают только бесплатное распространение.')}</p>
            <p>{t('Всё хранится на вашем устройстве; скачанные модули работают без интернета.')}</p>
          </>
        )}
        {tab === 'licenses' && <Licenses />}
        {tab === 'privacy' && <Privacy />}
      </div>
    </BottomSheet>
  );
}
