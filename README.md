# AO Bible

Веб-приложение для чтения и изучения Библии: переводы, словари с ивритом и греческим (номера Стронга),
параллельные места, две независимые панели чтения, гибкое оформление. Работает на телефоне, планшете и компьютере
и устанавливается на главный экран iPhone и Android как приложение (PWA).

**Открыть:** https://dubossarets-wq.github.io/ao-bible/ — обновление сайта: `npm run deploy`.

## Сборка

```bash
npm install
npm run data    # data-src/ → public/modules/*.json(.gz) + catalog.json  (нужен Python 3)
npm run build   # → dist/artifact/ (для Claude Artifact) и dist/pwa/ (устанавливаемая версия)
node scripts/smoke-test.mjs   # проверка сценариев в Chrome (нужен npm i --no-save playwright-core)
```

Исходные данные в `data-src/` (скачиваются заново командами из `scripts/build_data.py`, см. docstring):
`RSTE_verse_words.xml` из [swmail/RST](https://github.com/swmail/RST) и `strongs-*-dictionary.js` из
[openscriptures/strongs](https://github.com/openscriptures/strongs).

## Установка на iPhone и Android

1. Выложите содержимое `dist/pwa/` на любой статический хостинг с HTTPS: GitHub Pages, Netlify, Vercel,
   Cloudflare Pages. Подойдёт и подпапка сайта: все пути относительные.
2. Откройте адрес на телефоне:
   - **iPhone (Safari):** «Поделиться» → «На экран „Домой“».
   - **Android (Chrome):** меню ⋮ → «Установить приложение» (или баннер «Добавить на главный экран»).
3. Приложение запускается без адресной строки, учитывает вырез экрана и работает офлайн: оболочку кэширует
   service worker, а установленные модули хранятся в IndexedDB.

В Claude Artifact установка на главный экран недоступна: платформа не разрешает service worker и манифест.
Там приложение работает как обычная страница.

## Структура

```
src/
  core/           — данные и логика без интерфейса (можно перенести в любой фреймворк)
    books.js        справочник книг, разбор ссылок «Ин 3:16» и OSIS
    db.js           IndexedDB (модули), запасной режим в памяти
    schema.js       проверка и нормализация модулей, автоопределение формата
    modules.js      репозиторий: установка/удаление/обновление, каталог, ленивые книги и словари
    verseMarkup.js  разметка стиха {слово|H123|TH8804}, ‹курсив›
    lexicon.js      поиск статей для слова: точная привязка или приблизительная по симфонии
    crossrefs.js    параллельные места и их тексты
    search.js       полнотекстовый поиск с прогрессом и отменой
    morph.js        расшифровка морфологических кодов Стронга (иврит)
    settings.js     темы и оформление → CSS-переменные
    storage.js      localStorage для настроек, закладок и истории
  components/     — React-компоненты (BibleReader, ReaderToolbar, ChapterView, SplitScreenReader,
                    BookNavigator, ModuleLibrary, ModuleImporter, DictionaryManager, DictionaryBottomSheet,
                    CrossReferencesSheet, SearchPanel, AppearanceSettings, BookmarksManager, BottomSheet …)
docs/MODULE_SCHEMA.md — формат модулей
```

## Данные и лицензии

| Модуль | Источник | Лицензия |
|---|---|---|
| RST+, RST, параллельные места RST | Синодальный перевод (1876), разметка Стронга — В. Столярский ([swmail/RST](https://github.com/swmail/RST)) | Public Domain |
| Симфония RST+ | Собрана автоматически из RST+ | Public Domain |
| Стронг: иврит / греческий | J. Strong (1890/1894), JSON — [Open Scriptures](https://github.com/openscriptures/strongs) | CC-BY-SA |
| Синодальный с неканоническими книгами (RST НК) | CrossWire RusSynodal | Public Domain |
| Места (карта мест) | OpenBible.info Bible Geocoding Data; русские названия и описания — проект BibleMap | CC BY 4.0 (OpenBible.info) |
| KJV со Стронгом | ebible.org eng-kjv2006 | Public Domain (кроме Великобритании) |
| Berean Standard Bible | CrossWire BSB | CC0 1.0 |
| Еврейский ВЗ (OSHB/WLC) | Open Scriptures Hebrew Bible, github.com/openscriptures/morphhb | CC BY 4.0 (OSHB); WLC — Public Domain |
| Греческий НЗ Robinson–Pierpont 2018 | github.com/byztxt/byzantine-majority-text | Public Domain |
| Елизаветинская Библия, Пятикнижие Макария, НЗ Кулиша | CrossWire (CSlElizabeth, RusMakarij, UkrKulish) | Public Domain |
| Толковая Библия Лопухина | github.com/swmail/lopukhin_commentary | Public Domain |
| Matthew Henry Concise, Jamieson-Fausset-Brown, Barnes | CrossWire | Public Domain |
| Библейская энциклопедия архим. Никифора | ru.wikisource.org | CC BY-SA 4.0 (Викитека); текст 1891 г. — Public Domain |
| Easton, Smith, Hitchcock, Nave, Abbott-Smith, BDB (краткие значения) | CrossWire | Public Domain |
| Параллельные места OpenBible.info | a.openbible.info/data/cross-references.zip | CC BY (OpenBible.info) |
| Treasury of Scripture Knowledge | CrossWire TSK | Public Domain |
| Библейские карты | Wikimedia Commons (Biblica Open Bible Maps и др.; автор и лицензия — в описании каждой карты) | CC BY-SA 4.0 / CC BY-SA 3.0 / Public Domain |
| Библия Гёце | Свободной электронной версии не найдено | — (в каталоге помечена как недоступная) |
