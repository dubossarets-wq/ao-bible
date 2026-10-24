# Письма правообладателям: data-src/permissions/letters/*.html
# Запуск: python scripts/build_letters.py
# Текст письма — шаблон с {NAME} и {EMAIL}; их владелец вводит на странице.
import html
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / 'data-src' / 'permissions' / 'letters'
SITE = 'https://aobible.app'

INTRO_RU = (f'Меня зовут {{NAME}}. Я разрабатываю бесплатное некоммерческое библейское приложение AO Bible ({SITE}): '
            'без рекламы, без платных функций, без сбора платежей и без регистрации. '
            'Оно работает в браузере и проходит тестирование в Google Play.')
INTRO_EN = (f'My name is {{NAME}}. I am the developer of AO Bible ({SITE}), a free, non-commercial Bible reading app '
            'with no advertising, no subscriptions, no in-app purchases and no user registration. '
            'It runs in the browser and is in testing on Google Play.')
SIGN_RU = f'С уважением,\n{{NAME}}\n{{EMAIL}}\nAO Bible: {SITE}'
SIGN_EN = f'Sincerely,\n{{NAME}}\n{{EMAIL}}\nAO Bible: {SITE}'

LETTERS = [
    {
        'file': '1-goetze-ibt.html',
        'title': 'Библия Геце — Институт перевода Библии (ИПБ)',
        'what': 'Подзаголовки, параллельные места и примечания пастора Б. Геце',
        'note': 'ИПБ переиздавал «Библию Геце» (1981–2001) и, вероятнее всего, знает правопреемников. '
                'Если ответят, что права у других (наследники, Samenkorn), — пришлите мне ответ, подготовлю следующее письмо. '
                'Samenkorn — отдельное письмо № 6: на bible.by стоит именно их редакция.',
        'info': [('Телефон', '+7 (495) 956-6446, +7 (495) 956-6439'), ('Почтовый адрес', 'Москва, а/я 360, 101000'),
                 ('Сайт', 'https://ibt.org.ru')],
        'to': 'ibt_inform@ibt.org.ru',
        'subject': 'Просьба о разрешении использовать подзаголовки и примечания «Библии Геце» в бесплатном некоммерческом приложении',
        'body': f'''Здравствуйте!

{INTRO_RU}

Мы хотели бы включить в приложение Синодальный перевод с подзаголовками, параллельными местами и объяснительными примечаниями пастора Болеслава (Бернарда) Геце в том виде, как они опубликованы в изданиях Института перевода Библии. Текст будет показан без изменений — для чтения, поиска и сравнения переводов. Автор, издание и ИПБ будут указаны как источник (например: «Подзаголовки и примечания пастора Б. Геце. Издание ИПБ. Использовано с разрешения»).

Просим сообщить:
1. являетесь ли вы правообладателем примечаний, подзаголовков и параллельных мест, а если нет — к кому обратиться (наследники Б. Геце, другие издатели);
2. возможно ли разрешение на такое использование и на каких условиях;
3. какую формулировку указания авторства вы просите использовать.

Готовы соблюдать ваши условия: формулировка авторства, ограничения по объёму, возможность отзыва разрешения, отчёт об использовании.

{SIGN_RU}''',
    },
    {
        'file': '2-nrt-biblica.html',
        'title': 'Новый русский перевод (НРП) и «Слово Жизни» — Biblica',
        'what': 'Новый русский перевод, Новый Завет «Слово Жизни» (1991), аудиозапись НРП',
        'note': 'У Biblica нет адреса почты для таких запросов — только форма на сайте: вставьте текст письма в поле описания. '
                'Важно: полный текст Библии они лицензируют только зарегистрированным организациям, частному лицу могут отказать. '
                'Для разработчиков Biblica советует партнёров (api.bible) — в письме спрашиваем, какой путь подходит нам.',
        'info': [('Язык письма', 'английский')],
        'form': 'https://www.biblica.com/permission-request-form/',
        'subject': 'Permission request: New Russian Translation (NRT) and Slovo Zhizni NT in a free non-commercial Bible app',
        'body': f'''Dear Biblica Permissions Team,

{INTRO_EN}

We would like to request permission to include the New Russian Translation (Новый русский перевод, NRT), latest edition, in the app: the complete Bible text, unaltered. The text will be used for reading, full-text search and side-by-side comparison with other Russian translations. We will display the notice "© Biblica, Inc.® Used by permission. All rights reserved worldwide." on the translation's screen and in the app's About section, and will not modify or sell the text.

If possible, we would also like to include:
1. the New Testament "Slovo Zhizni" (Слово Жизни, International Bible Society, 1991), as a historical edition;
2. the NRT audio recording, if it is owned by Biblica — or please tell us whom to contact about it.

We understand that licenses for a complete Bible are granted to registered legal entities. AO Bible is currently developed by an individual on a non-commercial basis. Could you please advise whether a license is possible in this case, or whether we should access the NRT through one of your partners (for example, api.bible)?

We will gladly follow your terms (territory, usage reporting, notice wording, updating to the latest edition, takedown on request) and can provide screenshots of how the text is displayed.

Thank you for your time.

{SIGN_EN}''',
    },
    {
        'file': '3-srp-rbo.html',
        'title': 'Современный русский перевод и перевод Кассиана — Российское Библейское Общество (РБО)',
        'what': '«Библия. Современный русский перевод», Новый Завет в переводе еп. Кассиана, аудиозаписи',
        'note': 'Отдельного адреса для лицензий у РБО нет — пишем на общий; в письме просим подсказать, кто занимается лицензированием. '
                'Перевод Кассиана впервые издало Британское и Иностранное Библейское Общество (1970); РБО спрашиваем, у кого права сейчас.',
        'info': [('Телефон', '+7 (495) 940-55-90 (секретарь)'), ('Адрес', 'Москва, ул. Валовая, д. 8, стр. 1'),
                 ('Сайт', 'https://biblia.ru/AboutUs/Contacts/')],
        'to': 'info@biblia.ru',
        'subject': 'Просьба о разрешении использовать «Современный русский перевод» и перевод еп. Кассиана в бесплатном некоммерческом приложении',
        'body': f'''Здравствуйте!

{INTRO_RU}

Просим разрешения включить в приложение «Библию. Современный русский перевод» Российского Библейского Общества (2011) в полном объёме и без изменений текста. Текст будет использоваться для чтения, поиска и сравнения переводов. На экране перевода и в разделе «О приложении» будет указано: «Современный русский перевод © Российское Библейское Общество. Использовано с разрешения».

Если это возможно, мы хотели бы также включить:
1. Новый Завет в переводе под редакцией епископа Кассиана (Безобразова). Подскажите, пожалуйста, принадлежат ли права на него РБО, и если нет — к кому обратиться;
2. аудиозапись «Современного русского перевода», если права на неё у РБО.

Готовы соблюдать ваши условия (формулировка авторства, срок, территория, отчётность, отзыв разрешения) и при необходимости подписать письменное соглашение. Просим также подсказать, к кому в РБО следует обращаться по вопросам лицензирования.

{SIGN_RU}''',
    },
    {
        'file': '4-kulakov-zaoksky.html',
        'title': 'Перевод под ред. Кулаковых — Институт перевода Библии им. М. П. Кулакова (Заокский)',
        'what': 'Библия в переводе под редакцией М. П. и М. М. Кулаковых, полный текст и аудиозапись',
        'note': 'Отдельной почты у института нет — пишем на общий адрес Заокского адвентистского университета, при котором он работает, '
                'с просьбой передать письмо. Если ответа не будет 2–3 недели, отправьте то же письмо в ББИ.',
        'info': [('Правообладатель', '© Институт перевода Библии им. М. П. Кулакова в Заокском'),
                 ('Телефон', '+7 48734 2-01-20; 8 800 101-90-85'),
                 ('Адрес', '301000, Тульская обл., п. Заокский, ул. Руднева, 43а'),
                 ('Запасной адресат', 'издательство ББИ (выпускало полное издание 2015/2021): sales@standrews.ru, +7 495 670-22-00')],
        'to': 'umo@zau.ru',
        'subject': 'Просьба передать в Институт перевода Библии им. М. П. Кулакова: разрешение на перевод в бесплатном приложении',
        'body': f'''Здравствуйте!

Просим передать это письмо в Институт перевода Библии им. М. П. Кулакова.

{INTRO_RU}

Просим разрешения включить в приложение Библию в переводе под редакцией М. П. Кулакова и М. М. Кулакова в полном объёме и без изменений текста — для чтения, поиска и сравнения переводов. Авторство и источник будут указаны на экране перевода и в разделе «О приложении» в той формулировке, которую вы назовёте (например: «© Институт перевода Библии им. М. П. Кулакова в Заокском. Используется с разрешения правообладателя»).

Если существует аудиозапись этого перевода и права на неё у института, мы были бы рады включить и её.

Просим сообщить, на каких условиях возможно разрешение и какую формулировку авторства использовать. Если права на текст или издание принадлежат также другой организации (например, ББИ), подскажите, пожалуйста, к кому ещё обратиться. Готовы подписать лицензионное соглашение и соблюдать ваши требования.

{SIGN_RU}''',
    },
    {
        'file': '5-vinokurov-ot.html',
        'title': 'Подстрочник Ветхого Завета — Алексей Винокуров',
        'what': 'Подстрочный перевод Септуагинты (Ветхий Завет)',
        'note': 'Разрешение на Новый Завет уже есть. Это письмо — про Ветхий Завет (Септуагинту) и про полный файл без пропусков.',
        'info': [('Как связаться', 'тем же способом, каким вы получили разрешение на Новый Завет')],
        'subject': 'Подстрочник Септуагинты в бесплатном приложении AO Bible',
        'body': f'''Здравствуйте, Алексей!

Благодарю вас за разрешение использовать ваш подстрочный перевод Нового Завета в нашем бесплатном некоммерческом приложении AO Bible: он уже доступен читателям, с указанием вашего авторства.

Мы добавили в приложение Септуагинту (греческий текст издания Свита, общественное достояние). Позвольте ли вы так же — бесплатно, без рекламы и с указанием вашего имени — использовать ваш подстрочный перевод Ветхого Завета: русские слова под греческими?

И два вопроса:
1. На «Азбуке веры» доступны 29 книг, и в них пропущены слова без номера Стронга (например, в Быт 1:4 нет «разделил»). Нет ли у вас полного файла без пропусков, и какие книги ещё готовы?
2. Переводите ли вы Псалтирь?

{SIGN_RU}''',
    },
    {
        'file': '6-samenkorn-goetze.html',
        'title': 'Библия Гёце (редакция SK) и словари Гёце — Samenkorn e.V.',
        'what': 'Синодальный текст с примечаниями Б. Гёце в редакции Samenkorn, «Библейский словарь» и «Краткий библейский словарь» Гёце',
        'note': 'Именно эта редакция стоит на bible.by («Библия Болеслава Гёце (SK)»), там же оба словаря Гёце. '
                'Samenkorn — издательство российских немцев-меннонитов в Германии, выпускает книги по-русски, поэтому письмо по-русски. '
                'Если ответят, что их редакция сделана по лицензии ИПБ или наследников, — это ответ и на письмо № 1.',
        'info': [('Телефон', '+49 5204 9249430'), ('Адрес', 'Samenkorn e.V., Liebigstraße 8, 33803 Steinhagen, Германия'),
                 ('Руководитель', 'Genadi Dick'), ('Сайт', 'https://www.samenkorn.shop')],
        'to': 'info@cvsamenkorn.de',
        'subject': 'Просьба о разрешении: Библия с примечаниями Б. Гёце (редакция Samenkorn) в бесплатном приложении AO Bible',
        'body': f'''Здравствуйте!

{INTRO_RU}

Мы хотели бы включить в приложение Синодальный перевод с подзаголовками, параллельными местами и примечаниями пастора Болеслава (Бернарда) Гёце в новой редакции вашего издательства, а также «Библейский словарь» и «Краткий библейский словарь» Гёце. Тексты будут показаны без изменений — для чтения, поиска и сравнения переводов. На экране перевода и в разделе «О приложении» будут указаны автор и ваше издательство в той формулировке, которую вы назовёте.

Просим сообщить:
1. принадлежат ли вам права на эту редакцию и на словари, а если частично — к кому ещё обратиться (наследники Б. Гёце, Институт перевода Библии);
2. возможно ли разрешение на такое использование и на каких условиях;
3. можете ли вы предоставить электронный текст издания.

Готовы соблюдать ваши условия: формулировка авторства, ограничения по объёму, возможность отзыва разрешения.

{SIGN_RU}''',
    },
    {
        'file': '7-lio-jubilee.html',
        'title': 'Синодальный перевод, юбилейное издание и аудиобиблия — «Свет на Востоке» (Licht im Osten)',
        'what': 'Исправленное издание Синодального перевода (© 2000, 2008) и аудиозапись Библии «Свет на Востоке»',
        'note': 'На bible.by этот текст подписан «Публикуется с разрешения миссии „Свет на Востоке“». '
                'Миссия немецкая, но работает на русском, поэтому письмо по-русски.',
        'info': [('Телефон', '+49 711 839908-0'),
                 ('Адрес', 'LICHT IM OSTEN e.V., Zuffenhauser Str. 37, 70825 Korntal-Münchingen, Германия'),
                 ('Руководитель миссии', 'Waldemar Benzel'), ('Сайт', 'https://www.lio.org')],
        'to': 'lio@lio.org',
        'subject': 'Просьба о разрешении: юбилейное издание Синодального перевода и аудиобиблия в бесплатном приложении AO Bible',
        'body': f'''Здравствуйте!

{INTRO_RU}

Просим разрешения включить в приложение исправленное (юбилейное) издание Синодального перевода миссии «Свет на Востоке» в полном объёме и без изменений текста — для чтения, поиска и сравнения переводов. На экране перевода и в разделе «О приложении» будет указано: «Синодальный перевод, исправленное издание. © Миссия „Свет на Востоке“. Используется с разрешения» — или иная формулировка, которую вы назовёте.

Если права на аудиозапись Библии «Свет на Востоке» тоже принадлежат миссии, мы были бы рады включить и её (с возможностью слушать без подключения к интернету).

Просим сообщить, возможно ли это и на каких условиях, и можете ли вы предоставить электронный текст издания. Готовы соблюдать ваши требования (формулировка авторства, отчётность, отзыв разрешения).

{SIGN_RU}''',
    },
    {
        'file': '8-bibleleague-erv.html',
        'title': 'Современный перевод (ERV и WBTC) — Bible League International',
        'what': '«Библия. Современный перевод» (Easy-to-Read Version) и редакция WBTC 1993–1996',
        'note': 'По правилам Bible League их тексты можно распространять в электронном виде некоммерчески и без изменений, '
                'но размещение на сервере требует письменного разрешения — поэтому пишем. Письмо по-английски.',
        'info': [('Язык письма', 'английский'), ('Правила', 'https://www.bibleleague.org/license-agreement')],
        'to': 'permission@bibleleague.org',
        'subject': 'Permission request: Russian Easy-to-Read Version (and WBTC edition) in a free non-commercial Bible app',
        'body': f'''Dear Bible League Permissions Team,

{INTRO_EN}

We would like to request written permission to include the Russian Easy-to-Read Version (Библия. Современный перевод) in the app: the complete text, unaltered, for reading, search and side-by-side comparison with other Russian translations. If possible, we would also like to include the earlier World Bible Translation Center edition (1993–1996) as a historical text.

We understand that your license allows non-commercial electronic distribution without modification, and that hosting the text on a server requires written permission. The app downloads Bible texts from its own website, so we are writing to ask for that permission. We will show your copyright notice on the translation's screen and in the app's About section, and include a copy of your license.

Could you please let us know whether this is possible, what notice wording to use, and whether you can provide the current electronic text?

Thank you for your time.

{SIGN_EN}''',
    },
    {
        'file': '9-mjp-stern.html',
        'title': 'Еврейский Новый Завет и комментарий Д. Стерна — Messianic Jewish Publishers',
        'what': '«Еврейский Новый Завет» Давида Стерна и «Комментарий к Еврейскому Новому Завету» (русские издания)',
        'note': 'Права на книги Стерна у Messianic Jewish Publishers / Jewish New Testament Publications (США). '
                'Кто выпускал русские издания, найти не удалось — в письме спрашиваем. Шансы ниже среднего: издательство '
                'обычно разрешает только короткие цитаты. Письмо по-английски.',
        'info': [('Язык письма', 'английский'), ('Правила', 'https://www.messianicjewish.net/pages/copyright'),
                 ('Телефон', '+1 419 281-5100')],
        'to': 'Lisa@messianicjewish.net',
        'subject': 'Permission request: Russian Jewish New Testament and Commentary (David H. Stern) in a free non-commercial Bible app',
        'body': f'''Dear Messianic Jewish Publishers,

{INTRO_EN}

We would like to ask about permission to include the Russian translation of the Jewish New Testament by David H. Stern (Еврейский Новый Завет), and, if possible, the Russian edition of his Jewish New Testament Commentary, in the app. The texts would be shown unaltered, for reading and comparison with other Russian translations, with full credit to the author and publisher on the translation's screen and in the app's About section.

Could you please let us know:
1. whether you hold the rights to the Russian editions, or whom we should contact;
2. whether such use is possible and on what terms.

Our contact details: {{NAME}}, {{EMAIL}}, {SITE}.

Thank you for your time.

{SIGN_EN}''',
    },
    {
        'file': '10-vishenchuk.html',
        'title': 'Новозаветные Писания — Гелий Вишенчук-Вишенька',
        'what': '«Новозаветные Писания», 6-я редакция (по UBS4)',
        'note': 'Автор живёт в США (род. 1935). Почты на сайте нет — только форма обратной связи: вставьте в неё текст письма. '
                'Письмо по-русски.',
        'info': [('Сайт', 'https://gvish.com'), ('Почтовый адрес', '2477 Baskette Way, Chattanooga, TN 37421, USA')],
        'form': 'https://gvish.com/contact-form/',
        'subject': 'Ваш перевод «Новозаветных Писаний» в бесплатном приложении AO Bible',
        'body': f'''Здравствуйте, Гелий!

{INTRO_RU}

Нам очень хотелось бы, чтобы читатели приложения могли читать «Новозаветные Писания» в вашем переводе (6-я редакция) — рядом с другими русскими переводами, для чтения, поиска и сравнения. Текст будет показан без изменений, с вашим именем и ссылкой на ваш сайт.

Позволите ли вы такое использование? Если да — подскажите, пожалуйста, какой формулировкой указать авторство и нет ли у вас электронного файла итоговой редакции.

{SIGN_RU}''',
    },
    {
        'file': '11-averintsev.html',
        'title': 'Переводы С. С. Аверинцева — издательство «Дух і Літера»',
        'what': 'Евангелия, книга Иова и Псалмы в переводе Сергея Аверинцева (Киев, «Дух і Літера», 2004)',
        'note': 'Аверинцев умер в 2004 году — права у наследников и у издательства. Почту издательства найти не удалось '
                '(сайт не открылся): возьмите адрес с duh-i-litera.com или с выходных данных книги. Письмо по-русски — издательство двуязычное.',
        'info': [('Сайт', 'https://duh-i-litera.com'), ('Город', 'Киев, при Национальном университете «Киево-Могилянская академия»')],
        'subject': 'Просьба о разрешении: переводы С. С. Аверинцева в бесплатном приложении AO Bible',
        'body': f'''Здравствуйте!

{INTRO_RU}

Просим разрешения включить в приложение переводы Сергея Сергеевича Аверинцева — Евангелия, книгу Иова и Псалмы — по изданию «Дух і Літера» 2004 года, без изменений текста, для чтения и сравнения переводов. Переводчик, издательство и комментарии будут указаны в той формулировке, которую вы назовёте.

Просим сообщить, принадлежат ли права издательству или к кому из наследников следует обратиться, и на каких условиях возможно такое использование.

{SIGN_RU}''',
    },
    {
        'file': '12-bibleby.html',
        'title': 'Вопрос коллегам — bible.by',
        'what': 'Откуда взяты аудиозаписи и некоторые тексты, и как связаться с авторами',
        'note': 'Одно письмо вместо десятка поисков: у bible.by есть контакты тех, кто дал им разрешения. '
                'Пишем как коллеги, без намёков на права — просто просим подсказать источники.',
        'info': [('Сайт', 'https://bible.by')],
        'to': 'bible-man@mail.ru',
        'subject': 'Вопрос от разработчика бесплатного библейского приложения AO Bible',
        'body': f'''Здравствуйте!

{INTRO_RU}

Мы давно с уважением смотрим на ваш сайт и хотели бы спросить совета: подскажите, пожалуйста, к кому обращаться за разрешением по материалам, которые есть у вас.

1. Аудиобиблии: записи Синодального перевода (А. Бондаренко, И. Козлов, Ефимов, Пейсти, «Свет на Востоке»), а также записи перевода Кассиана, РБО и Кулаковых — кто их выпускал и с кем вы договаривались?
2. Перевод Леонида Лутковского и перевод Андрея Десницкого — как можно связаться с авторами?
3. Открытый перевод Нового Завета (С. Ирюпин): страница загрузки на biblelamp.ru больше не открывается. Не знаете ли вы, где сейчас актуальная версия?
4. Синодальный перевод с ударениями: вы отметили его как общественное достояние. Можно ли использовать вашу расстановку ударений в нашем приложении, со ссылкой на bible.by?

Будем благодарны за любую подсказку.

{SIGN_RU}''',
    },
]

CSS = '''
:root { --bg:#f7f6f3; --card:#fff; --text:#1c1c1e; --muted:#6a6a6f; --line:#e4e2dd; --accent:#1c1c1e; --on:#fff; --ok:#2f6339; }
@media (prefers-color-scheme: dark) { :root { --bg:#161617; --card:#212123; --text:#e8e6e1; --muted:#9a9893; --line:#333336; --accent:#e8e6e1; --on:#161617; --ok:#7cc68a; } }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text); font: 16px/1.5 -apple-system, "Segoe UI", Roboto, Arial, sans-serif; }
main { max-width: 760px; margin: 0 auto; padding: 24px 16px 60px; }
h1 { font-size: 1.45rem; margin: 0 0 4px; }
h2 { font-size: 1.1rem; margin: 26px 0 10px; }
.what { color: var(--muted); margin: 0 0 18px; }
.card { background: var(--card); border: 1px solid var(--line); border-radius: 14px; padding: 16px; margin: 0 0 14px; }
.note { border-left: 4px solid var(--accent); }
.row { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.row.stack { flex-direction: column-reverse; align-items: flex-start; }
.label { font-size: .78rem; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--muted); margin: 0 0 6px; }
.val { flex: 1; min-width: 0; font-weight: 600; overflow-wrap: anywhere; }
pre { white-space: pre-wrap; font: inherit; margin: 0; }
button, a.btn { font: inherit; font-weight: 600; padding: 8px 14px; border-radius: 10px; border: 0; background: var(--accent); color: var(--on); cursor: pointer; text-decoration: none; display: inline-block; }
a.btn.alt { background: transparent; color: var(--text); border: 1px solid var(--line); }
button.done { background: var(--ok); color: #fff; }
input { font: inherit; width: 100%; padding: 9px 11px; border: 1px solid var(--line); border-radius: 10px; background: var(--bg); color: var(--text); }
.me { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
@media (max-width: 560px) { .me { grid-template-columns: 1fr; } }
dl { display: grid; grid-template-columns: max-content 1fr; gap: 4px 12px; margin: 10px 0 0; font-size: .92rem; }
@media (max-width: 560px) { dl { grid-template-columns: 1fr; } dd { margin-bottom: 6px; } }
dt { color: var(--muted); } dd { margin: 0; overflow-wrap: anywhere; }
a { color: inherit; }
ul.list { list-style: none; padding: 0; margin: 0; }
ul.list li { margin: 0 0 10px; }
ul.list a { display: block; background: var(--card); border: 1px solid var(--line); border-radius: 14px; padding: 14px 16px; text-decoration: none; }
ul.list small { display: block; color: var(--muted); }
ul.free { margin: 0; padding-left: 20px; } ul.free li { margin: 0 0 8px; }
'''

SCRIPT = '''
const me = { name: localStorage.getItem('aob-letters-name') || '', email: localStorage.getItem('aob-letters-email') || '' };
const fill = (s) => s.replaceAll('{NAME}', me.name || '[ваше имя]').replaceAll('{EMAIL}', me.email || '[ваша почта]');
const text = (id) => document.getElementById(id)?.textContent || '';
function render() {
  document.querySelectorAll('[data-tpl]').forEach((el) => (el.textContent = fill(el.dataset.tpl)));
  const to = text('to'), su = text('subject'), body = text('body'), q = encodeURIComponent;
  const mail = document.getElementById('mailto'), gm = document.getElementById('gmail');
  if (mail) mail.href = 'mailto:' + to + '?subject=' + q(su) + '&body=' + q(body);
  if (gm) gm.href = 'https://mail.google.com/mail/?view=cm&fs=1&to=' + q(to) + '&su=' + q(su) + '&body=' + q(body);
}
document.querySelectorAll('input[data-me]').forEach((inp) => {
  inp.value = me[inp.dataset.me];
  inp.addEventListener('input', () => { me[inp.dataset.me] = inp.value.trim(); try { localStorage.setItem('aob-letters-' + inp.dataset.me, me[inp.dataset.me]); } catch {} render(); });
});
document.querySelectorAll('button[data-copy]').forEach((b) => b.addEventListener('click', async () => {
  const t = text(b.dataset.copy);
  try { await navigator.clipboard.writeText(t); } catch { const a = document.createElement('textarea'); a.value = t; document.body.append(a); a.select(); document.execCommand('copy'); a.remove(); }
  const old = b.textContent; b.textContent = 'Скопировано ✓'; b.classList.add('done');
  setTimeout(() => { b.textContent = old; b.classList.remove('done'); }, 1600);
}));
render();
'''

# Что на bible.by можно взять без писем (проверено 23.10.2026).
FREE = [
    ('Русская открытая Библия (ROB)', 'Door43, CC BY-SA 4.0, все 66 книг в USFM: https://git.door43.org/Door43-Catalog/ru_rob. Нужно указать авторов и лицензию.'),
    ('Перевод Десницкого (Новый Завет)', 'на bible.by: «Автор допускает использование текста в некоммерческих целях в любых объемах». Писать не обязательно, нужен только файл (спрашиваем в письме № 12). Книги Ветхого Завета в его переводе принадлежат РБО и ИПБ — на них это не распространяется.'),
    ('Открытый перевод Нового Завета (С. Ирюпин)', 'CC BY-SA 3.0. Страница загрузки на biblelamp.ru пропала — где взять текст, спрашиваем в письме № 12.'),
    ('Белорусская Библия А. Бокуна', 'eBible, CC BY-ND 4.0 (без изменений текста): https://ebible.org/bel/. Там же Новый Завет церкви Иоанна Предтечи (beln).'),
    ('Синодальный перевод с ударениями', 'Синодальный текст — общественное достояние, ударения bible.by расставил сервисом russiangram. Можно сделать самим или взять их вариант (спрашиваем в письме № 12).'),
    ('Подстрочник TR + Синодальный', 'bible.by собрал его из свободных Textus Receptus 1550 и Синодального перевода. Такой же можно собрать из наших модулей (TR, Стронг, Синодальный).'),
    ('Толкования Златоуста, Феофилакта, Августина', 'дореволюционные русские переводы — общественное достояние (тексты есть на azbyka.ru).'),
    ('Вне bible.by: украинский «Відкрита Новий Переклад» (Biblica)', 'Новый Завет и Псалмы, CC BY-SA 4.0: https://ebible.org/ukronpu/.'),
]

SKIP = [
    ('Английские NIV, ESV, NASB, NLT, NKJV', 'крупные издательства, лицензии платные или только онлайн. Путь — API.Bible после выхода в Google Play.'),
    ('Комментарии МакАртура, Баркли, МакДональда, Женевская учебная, Новый библейский комментарий, «Библия говорит сегодня», Стерн, Кузнецова, Вязовский', 'русские переводы современные, права у коммерческих издательств. Письма — по запросу.'),
    ('Словари Брокгауза, «Большой библейский», Нюстрема, Вихлянцева', 'охраняются, русские издания современные. Письма — по запросу.'),
    ('Мэтью Генри, Кальвин, Лютер, Райл, Сперджен, Скофилд', 'английские оригиналы свободны, но русские переводы новые и охраняются.'),
    ('Перевод Л. Лутковского', 'контакты не найдены — спрашиваем в письме № 12.'),
    ('Белорусские (Сёмуха, Чарняўскі, Станкевіч и др.) и украинские (Хоменко, Турконяк, «Сучасний переклад»)', 'письма — по запросу.'),
    ('Уже есть в AO Bible', 'Синодальный (66 и 77 книг), Макарий, Юнгеров, НЗ РБО 1824, подстрочник Винокурова, Огиенко, Кулиш, Елизаветинская, Никифор, Стронг, Лопухин.'),
]

esc = html.escape


def head(title):
    return (f'<!doctype html>\n<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">\n'
            f'<title>{esc(title)}</title><style>{CSS}</style></head>\n')


def letter_page(l):
    info = ''.join(f'<dt>{esc(k)}</dt><dd>{esc(v)}</dd>' for k, v in l.get('info', []))
    if 'to' in l:
        where = (f'<section class="card"><p class="label">Кому (почта)</p><div class="row"><div class="val" id="to">{esc(l["to"])}</div>'
                 f'<button data-copy="to">Скопировать</button></div>'
                 f'<div class="row" style="margin-top:12px"><a class="btn" id="gmail" target="_blank" rel="noopener">Открыть в Gmail</a>'
                 f'<a class="btn alt" id="mailto">Открыть в почте</a></div></section>')
    elif 'form' in l:
        where = (f'<section class="card"><p class="label">Куда отправить</p><div class="val">Форма на сайте: '
                 f'<a href="{esc(l["form"])}" target="_blank" rel="noopener">{esc(l["form"])}</a></div></section>')
    else:
        where = ''
    sub_tpl = esc(l['subject'], quote=True)
    body_tpl = esc(l['body'], quote=True)
    return (head(l['title']) +
            f'<body><main><p><a href="index.html">← Все письма</a></p>\n<h1>{esc(l["title"])}</h1><p class="what">{esc(l["what"])}</p>\n'
            f'<section class="card note"><div>{esc(l["note"])}</div>' + (f'<dl>{info}</dl>' if info else '') + '</section>\n'
            '<section class="card"><p class="label">Ваши данные — подставятся в письмо</p><div class="me">\n'
            '<input data-me="name" placeholder="Ваше имя" autocomplete="name"><input data-me="email" placeholder="Ваша почта" autocomplete="email" type="email"></div></section>\n'
            f'{where}\n'
            f'<section class="card"><p class="label">Тема</p><div class="row stack"><div class="val" id="subject" data-tpl="{sub_tpl}"></div><button data-copy="subject">Скопировать</button></div></section>\n'
            f'<section class="card"><p class="label">Текст письма</p><div class="row stack"><pre class="val" id="body" data-tpl="{body_tpl}"></pre><button data-copy="body">Скопировать</button></div></section>'
            f'</main><script>{SCRIPT}</script></body></html>\n')


def index_page():
    items = ''.join(
        f'<li><a href="{l["file"]}"><b>{esc(l["title"])}</b><small>{esc(l.get("to") or ("форма на сайте" if "form" in l else "адрес см. в письме"))}</small></a></li>'
        for l in LETTERS)
    free = ''.join(f'<li><b>{esc(k)}</b> — {esc(v)}</li>' for k, v in FREE)
    skip = ''.join(f'<li><b>{esc(k)}</b> — {esc(v)}</li>' for k, v in SKIP)
    return (head('Письма правообладателям — AO Bible') +
            '<body><main><h1>Письма правообладателям</h1><p class="what">Откройте письмо, введите имя и почту — они подставятся в текст. '
            'Кнопка «Открыть в Gmail» откроет готовое письмо: останется проверить и нажать «Отправить».</p>'
            f'<ul class="list">{items}</ul>'
            f'<h2>Можно взять без писем</h2><section class="card"><ul class="free">{free}</ul></section>'
            f'<h2>Пока не пишем</h2><section class="card"><ul class="free">{skip}</ul></section>'
            '</main></body></html>\n')


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for l in LETTERS:
        (OUT / l['file']).write_text(letter_page(l), encoding='utf-8')
    (OUT / 'index.html').write_text(index_page(), encoding='utf-8')
    print(f'{len(LETTERS)} писем → {OUT}')


if __name__ == '__main__':
    main()
