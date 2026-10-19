// Короткое название перевода для верхней панели — не длиннее 5 знаков (полное — в списке выбора перевода).
// Длинным названиям — общепринятые сокращения, остальным — первые 5 знаков первого слова.
const MAX = 5;
const SHORT = {
  'rst-dc': 'RSTНК',
  'rus-makarij': 'Макар',
  'rus-pobedonostsev': 'Побед',
  'rus-rbo-nt': 'РБО23',
  'rus-yungerov': 'Юнгер',
  'rus-sergievsky': 'Серг',
  'rst-interlinear': 'Подст',
  'vin-interlinear': 'Винок',
  'lxx-swete': 'LXX',
  goetze: 'Гёце',
  'ukr-ogienko': 'Огієн',
  'cornilescu-cyr': 'Корн',
  'dk-cyr': 'Данич',
  'be-nt1931': 'НЗ31',
  'arm-nt1853': 'ՆԿ53',
  jps1917: 'JPS',
  luther1912: 'LUT',
  schlachter1951: 'SCH51',
  elberfelder1905: 'ELB',
  swe1917: 'SV17',
  statenvertaling: 'SVV',
  vamvas: 'Βάμβ',
  sblgnt: 'SBL',
  vulgata: 'Vulg',
  peshitta: 'Pesh',
  'heb-modern': 'תנ״ך',
  'cuv-t': '和合本繁',
  shinkaiyaku1965: '新改訳',
  'van-dyck': 'SVD',
  esperanto: 'Esper',
  geneva1599: 'GNV',
  segond1910: 'LSG',
  'darby-fr': 'DBYfr',
  ostervald: 'OST',
  'neo-crampon': 'NCR',
  rv1909: 'RV09',
  'biblia-livre': 'BLV',
  riveduta: 'RIV',
  diodati: 'Diod',
  gdanska: 'BG',
  'slowo-zycia': 'SŁŻ',
  kralicka: 'BKR',
  ronbl: 'BLR',
};

export function shortName(m) {
  if (!m) return '—';
  if (SHORT[m.id]) return SHORT[m.id];
  const n = String(m.name || m.id).trim();
  return [...n].length <= MAX ? n : [...n.split(/\s+/)[0]].slice(0, MAX).join('');
}
