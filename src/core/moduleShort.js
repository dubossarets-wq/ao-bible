// Короткое название перевода для верхней панели (полное — в списке выбора перевода).
// Длинным названиям — общепринятые сокращения, остальным — первое слово.
const SHORT = {
  luther1912: 'LUT',
  schlachter1951: 'SCH51',
  elberfelder1905: 'ELB',
  segond1910: 'LSG',
  'darby-fr': 'DBY-fr',
  ostervald: 'OST',
  'neo-crampon': 'NCR',
  rv1909: 'RV1909',
  'biblia-livre': 'BLivre',
  riveduta: 'RIV',
  'slowo-zycia': 'SŁŻ',
  ronbl: 'BLR',
  'arm-nt1853': 'ՆԿ 1853',
  'be-nt1931': 'НЗ 1931',
  goetze: 'Гёце',
  'cuv-t': '和合本繁',
  'jps1917': 'JPS',
};

export function shortName(m) {
  if (!m) return '—';
  if (SHORT[m.id]) return SHORT[m.id];
  const n = String(m.name || m.id);
  return n.length <= 9 ? n : n.split(/\s+/)[0].slice(0, 9);
}
