"""Список переводов Библии на других языках для extra_world.py / build_extra.py.

src: "ebible:<id>" (eBible.org, USFM), "sword:<Модуль>" (CrossWire SWORD).
license — по первоисточнику: copr.htm пакета eBible (https://ebible.org/<id>/copr.htm) или DistributionLicense в
conf-файле модуля CrossWire (data-src/modsd/mods.d/<модуль>.conf).
Отобраны только переводы с лицензиями Public Domain, CC0, CC BY, CC BY-SA и с полным текстом (без обрезанных
глав и сбитой разбивки на стихи): сборка печатает по каждому проверку (quality, validate, spot_check).
rtl=True — письмо справа налево (features.rtl в модуле).
"""

PD = "Public Domain"
BYSA = "CC BY-SA 4.0"
# Biblica Open: CC BY-SA 4.0; в производной работе (у нас — перенумерация) знак Biblica® снимается, а
# изменения указываются (copr.htm пакета). Поэтому в названиях нет «Biblica», правообладатель — в license/author.
BIBLICA = BYSA + " (© Biblica, Inc.; изменено: нумерация стихов приведена к синодальной)"

BIBLES = [
    # --- английский ---
    dict(id="web", src="ebible:engwebp", lang="en", name="WEB", title="World English Bible",
         desc="Современный английский перевод World English Bible (редакция ASV 1901 г.), передан в общественное "
              "достояние. 66 книг.",
         license=PD, author="Michael Paul Johnson и добровольцы (eBible.org)"),
    dict(id="asv", src="ebible:eng-asv", lang="en", name="ASV", title="American Standard Version (1901)",
         desc="Американская стандартная версия 1901 г. — буквальная редакция английской Revised Version.",
         license=PD, author="American Revision Committee"),
    dict(id="ylt", src="ebible:engylt", lang="en", name="YLT", title="Young's Literal Translation (1898)",
         desc="Буквальный перевод Роберта Янга (1862/1898): сохраняет времена глаголов и порядок слов оригинала.",
         license=PD, author="Robert Young (1822–1888)"),
    dict(id="darby", src="ebible:engDBY", lang="en", name="Darby", title="Darby Translation (1890)",
         desc="Буквальный английский перевод Джона Нельсона Дарби (1890).", license=PD,
         author="John Nelson Darby (1800–1882)"),
    dict(id="dra", src="ebible:engDRA", lang="en", name="DRA", title="Douay-Rheims 1899 American Edition",
         desc="Католический английский перевод с Вульгаты (Дуэ — Реймс, редакция Чаллонера; изд. 1899) со "
              "второканоническими книгами.",
         license=PD, author="Колледжи Дуэ и Реймса (1582–1610), ред. Р. Чаллонера (1749–1752)"),
    dict(id="geneva1599", src="ebible:enggnv", lang="en", name="Geneva", title="Geneva Bible (1599)",
         desc="Женевская Библия 1599 г. — английский перевод эпохи Реформации, предшественник KJV (орфография "
              "осовременена).",
         license=PD, author="Английские эмигранты в Женеве (У. Уиттингем и др.)"),
    dict(id="lsv", src="ebible:englsv", lang="en", name="LSV", title="Literal Standard Version (2020)",
         desc="Современный буквальный английский перевод Literal Standard Version.",
         license=BYSA + " (Covenant Press)", author="Covenant Press (2020)"),
    dict(id="jps1917", src="ebible:engjps", lang="en", name="JPS 1917", title="JPS Tanakh 1917",
         desc="Ветхий Завет (Танах) в английском переводе Еврейского издательского общества 1917 г.",
         license=PD, author="Jewish Publication Society of America"),
    # --- немецкий ---
    dict(id="luther1912", src="ebible:deu1912", lang="de", name="Luther 1912", title="Lutherbibel 1912",
         desc="Немецкая Библия Мартина Лютера в редакции 1912 г.", license=PD,
         author="Martin Luther (1483–1546); ред. 1912 г."),
    dict(id="schlachter1951", src="ebible:deu1951", lang="de", name="Schlachter 1951", title="Schlachter-Bibel 1951",
         desc="Немецкий перевод Франца Евгения Шлахтера в редакции 1951 г.",
         license="CC BY 4.0 (Genfer Bibelgesellschaft)", author="Franz Eugen Schlachter; ред. 1951 г."),
    dict(id="elberfelder1905", src="ebible:deuelo", lang="de", name="Elberfelder 1905",
         title="Unrevidierte Elberfelder Bibel (1905)",
         desc="Буквальный немецкий перевод — Эльберфельдская Библия (неисправленное издание 1905 г.).",
         license=PD, author="Carl Brockhaus, John Nelson Darby и др."),
    dict(id="menge", src="sword:GerMenge", lang="de", name="Menge", title="Menge-Bibel (1939)",
         desc="Немецкий перевод Германа Менге (1926/1939) — точный и хорошо читаемый. Второканонические книги, "
              "которые не совпадают с синодальными по делению на стихи, не включены.",
         license=PD, author="Hermann Menge (1841–1939)"),
    # --- французский ---
    dict(id="segond1910", src="ebible:fraLSG", lang="fr", name="Segond 1910", title="Louis Segond 1910",
         desc="Французская Библия Луи Сегона (1910) — самый распространённый протестантский перевод.",
         license=PD, author="Louis Segond (1810–1885)"),
    dict(id="darby-fr", src="ebible:frajnd", lang="fr", name="Darby (fr)", title="Bible J. N. Darby (французская)",
         desc="Французский буквальный перевод Джона Нельсона Дарби.", license=PD, author="John Nelson Darby"),
    dict(id="ostervald", src="ebible:fra_fob", lang="fr", name="Ostervald", title="Bible Ostervald",
         desc="Французская Библия в редакции Жана-Фредерика Остервальда.", license=PD,
         author="Jean-Frédéric Ostervald (1663–1747)"),
    dict(id="neo-crampon", src="ebible:francl", lang="fr", name="Crampon", title="Néo-Crampon Libre",
         desc="Католический французский перевод на основе Библии Огюстена Крампона (1923), осовремененный, со "
              "второканоническими книгами.",
         license=BYSA + " (Fraternité de Tibériade)", author="Augustin Crampon; ред. Fraternité de Tibériade"),
    # --- испанский, португальский, итальянский ---
    dict(id="rv1909", src="ebible:spaRV1909", lang="es", name="RV 1909", title="Reina-Valera 1909",
         desc="Испанская Библия Рейны — Валеры в редакции 1909 г.", license=PD,
         author="Casiodoro de Reina, Cipriano de Valera; ред. 1909 г."),
    dict(id="biblia-livre", src="ebible:porbr2018", lang="pt", name="Bíblia Livre", title="Bíblia Livre (2018)",
         desc="Португальский перевод Bíblia Livre (Бразилия), сделанный с оригинальных текстов.",
         license="CC BY 4.0 (Diego Santos, Mario Sérgio, Marco Teles)", author="Diego Santos и др."),
    dict(id="nbv-pt", src="ebible:poronbv", lang="pt", name="NBV-P", title="Nova Bíblia Viva (открытое издание)",
         desc="Современный португальский перевод Nova Bíblia Viva.", license=BIBLICA, author="Biblica, Inc."),
    dict(id="riveduta", src="ebible:ita1927", lang="it", name="Riveduta", title="Riveduta Luzzi (1927)",
         desc="Итальянская Библия Riveduta в переводе Джованни Луцци (1924/1927).", license=PD,
         author="Giovanni Luzzi (1856–1948)"),
    dict(id="diodati", src="ebible:ita1885", lang="it", name="Diodati", title="Diodati (1885)",
         desc="Итальянская Библия Джованни Диодати (1649) в издании 1885 г.", license=PD,
         author="Giovanni Diodati (1576–1649)"),
    # --- славянские и соседние ---
    dict(id="gdanska", src="sword:PolGdanska", lang="pl", name="Gdańska", title="Biblia Gdańska (1632/1881)",
         desc="Польская протестантская Библия Гданьская (1632) в издании 1881 г.", license=PD,
         author="Daniel Mikołajewski, Jan Turnowski",
         # В модуле CrossWire Иов 39–41 втиснут в схему KJV со смещением (как в Вульгате: 40:1 = KJV 40:6,
         # 41:1 = KJV 41:10): глава 40 уже совпадает с синодальной, 41 — со сдвигом на один стих
         per_chapter={"Job": {40: "syn", 41: "syn+1"}}),
    dict(id="slowo-zycia", src="ebible:polsz", lang="pl", name="Słowo Życia", title="Słowo Życia (Новый Завет)",
         desc="Современный польский перевод Нового Завета «Слово жизни».", license=BIBLICA, author="Biblica, Inc."),
    dict(id="kralicka", src="ebible:ces1613", lang="cs", name="Kralická", title="Bible kralická (1613)",
         desc="Чешская Кралицкая Библия (1579–1613) — классический перевод чешских братьев.", license=PD,
         author="Jednota bratrská"),
    dict(id="slk-nt", src="ebible:slk", lang="sk", name="Slovo pre teba", title="Nový zákon (словацкий)",
         desc="Современный словацкий перевод Нового Завета.", license=BIBLICA, author="Biblica, Inc."),
    dict(id="dk-cyr", src="ebible:srp1868", lang="sr", name="Даничић", title="Библија (Даничић — Караџић, 1868)",
         desc="Сербская Библия в переводе Джуры Даничича (ВЗ) и Вука Караджича (НЗ), кириллица.", license=PD,
         author="Đura Daničić, Vuk Stefanović Karadžić"),
    dict(id="hrv-nt", src="ebible:hrvbib", lang="hr", name="Hrv. NZ", title="Novi zavjet (хорватский)",
         desc="Современный хорватский перевод Нового Завета.", license=BIBLICA, author="Biblica, Inc."),
    dict(id="karoli", src="sword:HunKar", lang="hu", name="Károli", title="Károli Biblia (ред. 1908)",
         desc="Венгерская Библия Гашпара Кароли (1590) в редакции 1908 г.", license=PD,
         author="Károli Gáspár (1529–1591)"),
    dict(id="hun-nt", src="ebible:hun", lang="hu", name="Hun. ÚSZ", title="Újszövetség (венгерский)",
         desc="Современный венгерский перевод Нового Завета.", license=BIBLICA, author="Biblica, Inc."),
    dict(id="be-nt1931", src="wikisource:be-dm", lang="be", name="Дзекуць-Малей",
         title="Новы Запавет (пер. Л. Дзекуць-Малея і А. Луцкевіча, 1931)",
         desc="Белорусский перевод Нового Завета Луки Декуть-Малея и Антона Луцкевича (1931). Текст — по "
              "транскрипции белорусской Викитеки; знаки ударения издания убраны.",
         license=PD + " (переводчики умерли в 1955 и 1942 гг.; Викитека)",
         author="Лука Дзекуць-Малей (1888–1955), Антон Луцкевіч (1884–1942)",
         source="https://be.wikisource.org/wiki/Новы_Запавет_(Дзекуць-Малей,_Луцкевіч) (беларуская Вікікрыніца)",
         schemes=("syn",)),
    dict(id="ukr-nup", src="ebible:ukronpu", lang="uk", name="НУП", title="Новий український переклад (НЗ і Псалми)",
         desc="Современный украинский перевод Нового Завета и Псалтири.", license=BIBLICA, author="Biblica, Inc."),
    dict(id="ronbl", src="ebible:ronbl", lang="ro", name="Biblia Liberă", title="Biblia Liberă (Новый Завет)",
         desc="Свободный румынский перевод Нового Завета (рабочая редакция eBible.org).", license=PD,
         author="eBible.org"),
    dict(id="gluck", src="sword:LvGluck8", lang="lv", name="Glika Bībele", title="Bībele (Э. Глюк, 8-е изд.)",
         desc="Латышская Библия Эрнста Глюка (1694) в 8-м издании.", license=PD, author="Ernst Glück (1654–1705)"),
    dict(id="ekk-nt", src="ebible:ekk", lang="et", name="Eesti UT", title="Uus Testament (эстонский)",
         desc="Современный эстонский перевод Нового Завета.", license=BIBLICA, author="Biblica, Inc."),
    dict(id="finbiblia", src="sword:FinBiblia", lang="fi", name="Biblia 1776", title="Biblia (1776)",
         desc="Финская Библия 1776 г.", license=PD, author="Финская церковь"),
    dict(id="fin-nt", src="ebible:fin", lang="fi", name="Elävä Uutinen", title="Uusi testamentti (финский)",
         desc="Современный финский перевод Нового Завета.", license=BIBLICA, author="Biblica, Inc."),
    dict(id="swe1917", src="sword:Swe1917", lang="sv", name="Bibeln 1917", title="Bibeln 1917",
         desc="Шведская церковная Библия 1917 г.", license=PD, author="Kyrkans bibelkommission"),
    dict(id="norsk1930", src="sword:Norsk", lang="nb", name="Norsk 1930", title="Bibelen på norsk (1930)",
         desc="Норвежская Библия 1930 г.", license=PD, author="Det Norske Bibelselskap"),
    dict(id="dansk1871", src="sword:DaOT1871NT1907", lang="da", name="Dansk 1871", title="Bibelen (ВЗ 1871, НЗ 1907)",
         desc="Датская Библия: Ветхий Завет 1871 г., Новый Завет 1907 г. (оригинальная орфография).", license=PD,
         author="Det Danske Bibelselskab"),
    dict(id="statenvertaling", src="sword:DutSVV", lang="nl", name="Statenvertaling", title="Statenvertaling (1637)",
         desc="Нидерландский перевод Statenvertaling (1637) — классическая голландская Библия.", license=PD,
         author="Генеральные штаты Нидерландов (1618–1637)"),
    dict(id="vamvas", src="sword:GreVamvas", lang="el", name="Βάμβας", title="Η Αγία Γραφή (перевод Вамваса)",
         desc="Перевод Библии на новогреческий язык Неофита Вамваса (1850).", license=PD,
         author="Νεόφυτος Βάμβας (1770–1855)"),
    dict(id="alb", src="sword:Alb", lang="sq", name="Bibla", title="Bibla (албанский)",
         desc="Албанский перевод Библии.", license=PD, author="CrossWire"),
    # --- древние языки ---
    dict(id="sblgnt", src="ebible:grcsbl", lang="grc", name="SBLGNT", title="SBL Greek New Testament",
         desc="Критический греческий текст Нового Завета Общества библейской литературы (2010).",
         license="CC BY 4.0 (Society of Biblical Literature, Logos Bible Software)", author="Michael W. Holmes (ред.)"),
    dict(id="tr1894", src="ebible:grctr", lang="grc", name="TR", title="Textus Receptus (Скривенер, 1894)",
         desc="Греческий «Общепринятый текст» Нового Завета (изд. Ф. Скривенера 1894 г.).", license=PD,
         author="F. H. A. Scrivener"),
    dict(id="tischendorf", src="ebible:grc-tisch", lang="grc", name="Tisch", title="Тишендорф: Novum Testamentum Graece",
         desc="Греческий Новый Завет Константина Тишендорфа (8-е издание, 1869–1872).", license=PD,
         author="Constantin von Tischendorf (1815–1874)"),
    dict(id="vulgata", src="ebible:latVUC", lang="la", name="Vulgata", title="Biblia Sacra Vulgatae Editionis (Климентина)",
         desc="Латинская Вульгата в Климентинском издании (1592/1598) со второканоническими книгами; греческие "
              "дополнения к Есфири не включены.",
         license=PD, author="Бл. Иероним; Климентинское издание"),
    dict(id="peshitta", src="sword:Peshitta", lang="syr", name="Peshitta", title="Пешитта: Новый Завет на сирийском",
         desc="Сирийский перевод Нового Завета (Пешитта).", license=PD, author="CrossWire", rtl=True),
    dict(id="heb-modern", src="ebible:heb", lang="he", name="תנ״ך+ברית", title="Библия на иврите (НЗ — пер. Ф. Делича)",
         desc="Ветхий Завет на иврите и Новый Завет в переводе Франца Делича на иврит.", license=PD,
         author="Franz Delitzsch (1813–1890)", rtl=True),
    # --- Азия ---
    dict(id="cuv-s", src="ebible:cmn-cu89s", lang="zh", name="和合本", title="和合本 (упрощённые иероглифы)",
         desc="Китайский Союзный перевод (Chinese Union Version, 1919) — основной протестантский перевод на "
              "китайский язык; упрощённые иероглифы.",
         license=PD, author="Переводческий комитет миссий (1890–1919)"),
    dict(id="cuv-t", src="ebible:cmn-cu89t", lang="zh", name="和合本 (繁)", title="和合本 (традиционные иероглифы)",
         desc="Китайский Союзный перевод (1919), традиционные иероглифы.", license=PD,
         author="Переводческий комитет миссий (1890–1919)"),
    dict(id="ccb", src="ebible:cmncbs", lang="zh", name="当代译本", title="圣经当代译本 (открытое издание)",
         desc="Современный китайский перевод «Библия: современная версия», упрощённые иероглифы.",
         license=BIBLICA, author="Biblica, Inc."),
    dict(id="bungo", src="sword:JapBungo", lang="ja", name="文語訳", title="文語訳聖書 (эпохи Мэйдзи и Тайсё)",
         desc="Японский литературный перевод: Ветхий Завет эпохи Мэйдзи (1887), Новый Завет эпохи Тайсё (1917).",
         license=PD, author="日本聖書協会"),
    dict(id="korrv", src="sword:KorRV", lang="ko", name="개역", title="개역한글판 (Korean Revised Version, 1961)",
         desc="Корейская Библия в пересмотренном переводе 개역한글판 (1952/1961) — классический протестантский "
              "перевод на корейский язык.",
         license=PD + " (срок охраны в Корее истёк в 2012 г.; CrossWire, Викитека)", author="대한성서공회"),
    dict(id="vie1934", src="ebible:vie1934", lang="vi", name="Kinh Thánh 1934", title="Kinh Thánh (1926/1934)",
         desc="Вьетнамская Библия в традиционном протестантском переводе (1926/1934).", license=PD,
         author="William Cadman и др."),
    dict(id="vie-ovcb", src="ebible:vieovcb", lang="vi", name="KTHĐ", title="Kinh Thánh Hiện Đại",
         desc="Современный вьетнамский перевод Библии.", license=BIBLICA, author="Biblica, Inc."),
    dict(id="alkitab-gratis", src="ebible:indags", lang="id", name="AGUS", title="Alkitab Gratis untuk Semua (Новый Завет)",
         desc="Свободный современный индонезийский перевод Нового Завета «Библия для всех».",
         license=BYSA + " (Jonathan Gallagher)", author="Jonathan Gallagher"),
    dict(id="tagalog1905", src="sword:TagAngBiblia", lang="tl", name="Ang Biblia", title="Ang Biblia (1905)",
         desc="Тагальская Библия Филиппинского библейского общества (1905).", license=PD,
         author="Philippine Bible Society"),
    dict(id="hin-irv", src="ebible:hin2017", lang="hi", name="IRV", title="Indian Revised Version (хинди)",
         desc="Пересмотренный перевод Библии на хинди (Indian Revised Version, 2019).",
         license=BYSA + " (Bridge Connectivity Solutions)", author="Bridge Connectivity Solutions"),
    # --- Кавказ ---
    dict(id="arm-nt1853", src="sword:ArmWestern", lang="hy", name="Հայերեն 1853", title="Նոր Կտակարան (1853)",
         desc="Новый Завет на (западно)армянском языке, издание 1853 г.", license=PD,
         author="Американское библейское общество (1853)"),
    # --- Ближний Восток ---
    dict(id="van-dyck", src="ebible:arb-vd", lang="ar", name="فاندايك", title="الكتاب المقدس (Смит — Ван Дейк, 1865)",
         desc="Арабская Библия Смита — Ван Дейка (1865) — основной протестантский перевод на арабский язык.",
         license=PD, author="Eli Smith, Cornelius Van Dyck", rtl=True),
    dict(id="nav-ar", src="ebible:arbnav", lang="ar", name="كتاب الحياة", title="كتاب الحياة (открытое издание)",
         desc="Современный арабский перевод «Книга жизни» (New Arabic Version).", license=BIBLICA,
         author="Biblica, Inc.", rtl=True),
    dict(id="opv", src="ebible:pesOPV", lang="fa", name="ترجمه قدیم", title="ترجمه قدیم (Старый персидский перевод, 1895)",
         desc="Персидская Библия в старом переводе (Old Persian Version, 1895).", license=PD,
         author="Robert Bruce и др.", rtl=True),
    dict(id="tur-nt", src="ebible:turobt", lang="tr", name="Yeni Antlaşma", title="Yeni Antlaşma (турецкий)",
         desc="Современный турецкий перевод Нового Завета.", license=BIBLICA, author="Biblica, Inc."),
    # --- Африка, эсперанто ---
    dict(id="swh-ulb", src="ebible:swhulb", lang="sw", name="ULB", title="Biblia (Swahili Unlocked Literal Bible)",
         desc="Буквальный перевод Библии на суахили (Unlocked Literal Bible, Door43).",
         license=BYSA + " (Door43 World Missions Community)", author="Door43"),
    dict(id="swh-neno", src="ebible:swhonen", lang="sw", name="Neno", title="Biblia Takatifu: Neno",
         desc="Современный перевод Библии на суахили «Слово».", license=BIBLICA, author="Biblica, Inc."),
    dict(id="esperanto", src="ebible:epo", lang="eo", name="Londona Biblio", title="La Sankta Biblio (Лондонская Библия)",
         desc="Библия на эсперанто: Ветхий Завет — Л. Заменгоф, Новый Завет — Британское библейское общество (1926).",
         license=PD, author="L. L. Zamenhof и др."),
]

# Отклонены проверкой полноты (scripts/extra_world.py: quality): nbv-es (eBible spaonbv), ces-snc (ceslb),
# ind-tsi (ind) — пересказы с объединёнными стихами «1-3», много пустых стихов; lit-bht (lit) — перевод не закончен
# (24 % стихов); kougo (CrossWire JapKougo) — в модуле нет Пс 130–139 и Притч 30–31; ukr1871/ukrfb (Куліш, eBible)
# — сбита разбивка на стихи почти во всех главах; kor (корейский 1910) — пропуски в главах.

# Не нашлось со свободной лицензией (10.2026): болгарский — Цариградский перевод 1871 г. на Викитеке неполон
# (137 глав), модули CrossWire BulCarigrad/BulVeren — «Copyrighted», цифровой текст издания 1940 г. — © bibliata.com
# с запретом менять нумерацию; грузинский — ни в eBible.org, ни в CrossWire, ни на Викитеке; белорусский перевод
# Бокуна (eBible bel/beln) — CC BY-ND (NC), модуль CrossWire Bela (Сёмуха) — «Copyrighted». Армянский ArmEastern
# (CrossWire) — только Бытие, Исход и Евангелия, издание не указано.

# Сомнительные по лицензии: собираются, но НЕ вносятся в approved-modules.json — решение за владельцем.
DOUBTFUL = [
    dict(id="ukr-ogienko", src="sword:UkrOgienko", lang="uk", name="Огієнко", title="Біблія (переклад І. Огієнка)",
         desc="Украинская Библия в переводе митрополита Илариона (Огиенко), 1962.",
         license="CrossWire: Public Domain (сомнительно: И. Огиенко ум. 1972, перевод издан в 1962 г.)",
         author="Іван Огієнко (митр. Іларіон, 1882–1972)",
         note="CrossWire указывает Public Domain, но переводчик умер в 1972 г.; по закону Украины срок охраны — до 2042 г."),
    dict(id="cornilescu-cyr", src="ebible:ron1924", lang="ro", name="Корнилеску", title="Библия Корнилеску 1924 (кириллица)",
         desc="Румынская (молдавская) Библия Думитру Корнилеску 1924 г. в кириллической графике.",
         license="eBible.org: Public Domain (сомнительно: Д. Корнилеску ум. 1975)",
         author="Dumitru Cornilescu (1891–1975)",
         note="eBible.org: Public Domain «по истечении срока», но CrossWire распространяет латинскую версию (RomCor) "
              "только с разрешения правообладателя; переводчик умер в 1975 г."),
    dict(id="saric", src="ebible:hrv", lang="hr", name="Šarić", title="Biblija (prijevod I. Šarića)",
         desc="Хорватская Библия в переводе архиепископа Ивана Шарича (1941–1942).",
         license="eBible.org / CrossWire: Public Domain (сомнительно: И. Шарич ум. 1960)",
         author="Ivan Šarić (1871–1960)",
         note="Переводчик умер в 1960 г.; в Хорватии срок охраны — 70 лет после смерти (до 2030 г.)."),
    dict(id="shinkaiyaku1965", src="ebible:jpn1965", lang="ja", name="新改訳 1965", title="新改訳新約聖書 (1965)",
         desc="Японский Новый Завет «Синкайяку» издания 1965 г. (срок охраны истёк в 2015 г.).",
         license="eBible.org: Public Domain (сомнительно: срок охраны в Японии истёк в 2015 г., но в США — "
                 "восстановлен до 2060 г.)",
         author="新改訳聖書刊行会",
         note="Японский срок охраны (50 лет для работ организации) истёк 31.12.2015; в США права иностранных "
              "работ восстановлены (URAA, 1996), а издатель продолжает выпускать новые редакции 新改訳."),
]
