// Ссылка на стих в Синайском кодексе (IV в.) — на сайте codexsinaiticus.org: снимок листа и расшифровка.
// Сами снимки приложение не хранит и не показывает (их можно смотреть только на сайте, для личного и учебного
// использования), поэтому это просто ссылка. Таблица sinaiticus.json — scripts/build_sinaiticus.py: номер книги
// на сайте, сохранившиеся участки книг-фрагментов (have) и расхождения нумерации (map: синодальная -> сайта;
// Ветхий Завет там в греческой нумерации, Новый — в стандартной).
import data from './sinaiticus.json';
import { getLang } from './i18n.js';

const SITE_LANG = { ru: 'ru', uk: 'ru', be: 'ru', de: 'de' };

function toSite(map, c, v) {
  for (const [sc, sv, tc, tv, n] of map || []) {
    if (sc === c && v >= sv && v < sv + n) return [tc, tv + (v - sv)];
  }
  return [c, v];
}

const inside = (have, c, v) => have.some(([c1, v1, c2, v2]) => (c > c1 || (c === c1 && v >= v1)) && (c < c2 || (c === c2 && v <= v2)));

// Адрес стиха на сайте кодекса или null, если этого места в кодексе нет
export function sinaiticusUrl(ref) {
  const b = data.books[ref.book];
  if (!b) return null;
  const [c, v] = toSite(b.map, ref.chapter, ref.verse);
  if (b.have && !inside(b.have, c, v)) return null;
  const l = SITE_LANG[getLang()] || 'en';
  return `https://codexsinaiticus.org/${l}/manuscript.aspx?book=${b.no}&chapter=${c}&verse=${v}&lid=${l}&side=r&zoomSlider=0`;
}
