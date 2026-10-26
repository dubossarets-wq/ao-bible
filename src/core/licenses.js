// Ссылки на тексты лицензий (CC BY и BY-SA требуют давать ссылку на лицензию, GPL — на её текст)
// и дополнительные строки атрибуции, которых требуют правообладатели отдельных модулей.
const CC = (kind, ver, port = '') => `https://creativecommons.org/licenses/${kind}/${ver}/${port}`;
export function licenseUrl(text) {
  const s = String(text || '');
  if (/CC0|Public Domain Dedication/i.test(s)) return 'https://creativecommons.org/publicdomain/zero/1.0/';
  const m = /CC[ -]BY(-NC)?(-SA|-ND)?(?:[ -](\d\.\d))?(?:\s*(US))?/i.exec(s);
  if (m) {
    const kind = ['by', m[1] && 'nc', m[2] && m[2].slice(1)].filter(Boolean).join('-').toLowerCase();
    return CC(kind, m[3] || '4.0', m[4] ? 'us/' : '');
  }
  if (/GPL[- ]?3/i.test(s)) return 'https://www.gnu.org/licenses/gpl-3.0.html';
  if (/ODbL/i.test(s)) return 'https://opendatacommons.org/licenses/odbl/1-0/';
  if (/Open Font License|OFL/i.test(s)) return 'https://openfontlicense.org';
  if (/MPL[- ]?2/i.test(s)) return 'https://www.mozilla.org/MPL/2.0/';
  return null;
}

const BIBLICA = 'The original work by Biblica, Inc. is available for free at www.biblica.com and open.bible.';
export const EXTRA_ATTRIBUTION = {
  'ukr-nup': [BIBLICA],
  'nbv-pt': [BIBLICA],
  'slowo-zycia': [BIBLICA],
  ccb: [BIBLICA],
  'swh-neno': [BIBLICA],
  'bible-maps': [BIBLICA],
  'audio-grc-phemister': ['© 2001 Marilyn Phemister'],
  'lxx-swete': ['https://github.com/eliranwong/LXX-Swete-1930'],
  sblgnt: ['© 2010 Society of Biblical Literature and Logos Bible Software', 'Strong’s numbers and morphology: STEPBible.org (Tyndale House, Cambridge), https://github.com/STEPBible'],
  wh1881: ['Accents and punctuation: STEPBible.org (Tyndale House, Cambridge), https://github.com/STEPBible'],
  tregelles: ['Text, Strong’s numbers and morphology: STEPBible.org (Tyndale House, Cambridge), https://github.com/STEPBible'],
  tr1894: ['Accents and punctuation: STEPBible.org (Tyndale House, Cambridge), https://github.com/STEPBible'],
  stephanus1550: ['Accents and punctuation: STEPBible.org (Tyndale House, Cambridge), https://github.com/STEPBible'],
  elzevir1624: ['Accents and punctuation: STEPBible.org (Tyndale House, Cambridge), https://github.com/STEPBible'],
  f35: ['© 2020 Wilbur N. Pickering'],
};
