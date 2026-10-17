// Приблизительное чтение слов оригинала русскими буквами (для подстрочника).
// Греческий — по эразмову произношению (как в учебниках); еврейский — по огласовкам (никуд).

const GR = { α: 'а', β: 'б', γ: 'г', δ: 'д', ε: 'е', ζ: 'дз', η: 'э', θ: 'т', ι: 'и', κ: 'к', λ: 'л', μ: 'м', ν: 'н', ξ: 'кс', ο: 'о', π: 'п', ρ: 'р', σ: 'с', ς: 'с', τ: 'т', υ: 'ю', φ: 'ф', χ: 'х', ψ: 'пс', ω: 'о' };
const GR_PAIRS = [
  ['αυ', 'ау'],
  ['ευ', 'эу'],
  ['ηυ', 'эу'],
  ['ου', 'у'],
  ['υι', 'юи'],
  ['γγ', 'нг'],
  ['γκ', 'нк'],
  ['γξ', 'нкс'],
  ['γχ', 'нх'],
];

export function greekToRu(word) {
  const d = word.normalize('NFD');
  const rough = /^[^̀-ͯ]*[̀-ͯ]*̔/.test(d) || /^ῥ/.test(word); // густое придыхание в начале
  let s = d.replace(/[̀-ͯ]/g, '').toLowerCase();
  let out = '';
  for (let i = 0; i < s.length; ) {
    const pair = GR_PAIRS.find(([g]) => s.startsWith(g, i));
    if (pair) {
      out += pair[1];
      i += 2;
      continue;
    }
    out += GR[s[i]] ?? (/[a-zа-я]/i.test(s[i]) ? s[i] : '');
    i++;
  }
  return (rough && !/^р/.test(out) ? 'х' : '') + out;
}

// Еврейский: согласные + огласовки. Дагеш в בכפ — взрывные (б, к, п), без него — в, х, ф.
const HE = { א: '', ב: 'в', ג: 'г', ד: 'д', ה: 'х', ו: 'в', ז: 'з', ח: 'х', ט: 'т', י: 'й', כ: 'х', ך: 'х', ל: 'л', מ: 'м', ם: 'м', נ: 'н', ן: 'н', ס: 'с', ע: '', פ: 'ф', ף: 'ф', צ: 'ц', ץ: 'ц', ק: 'к', ר: 'р', ש: 'ш', ת: 'т' };
const HARD = { ב: 'б', כ: 'к', ך: 'к', פ: 'п', ף: 'п' };
const VOW = { 'ְ': 'е', 'ֱ': 'е', 'ֲ': 'а', 'ֳ': 'о', 'ִ': 'и', 'ֵ': 'е', 'ֶ': 'е', 'ַ': 'а', 'ָ': 'а', 'ֹ': 'о', 'ֺ': 'о', 'ֻ': 'у', 'ׇ': 'о' };

export function hebrewToRu(word) {
  const s = word.replace(/[֑-ֽ֯׀׃־]/g, ''); // кантилляция, метег, макаф
  // Имя Божье (огласовано гласными «Адонай») — традиционное «Иегова», с приставкой (ла-, ва-, ми-…)
  const bare = s.replace(/[^א-ת]/g, '');
  if (bare.endsWith('יהוה')) {
    const cut = [...s].findIndex((ch, i, a) => ch === 'י' && a.slice(i).join('').replace(/[^א-ת]/g, '') === 'יהוה');
    return (cut > 0 ? hebrewToRu([...s].slice(0, cut).join('')) : '') + (cut > 0 ? 'иегова' : 'Иегова');
  }
  const letters = [];
  for (const ch of s) {
    if (HE[ch] != null) letters.push({ c: ch, marks: '' });
    else if (letters.length) letters[letters.length - 1].marks += ch;
  }
  let out = '';
  letters.forEach((l, i) => {
    const dagesh = l.marks.includes('ּ');
    const vowels = [...l.marks].map((m) => VOW[m]).filter(Boolean);
    const last = i === letters.length - 1;
    if (l.c === 'ו' && !vowels.length && dagesh) return void (out += 'у'); // шурук
    if (l.c === 'ו' && l.marks.includes('ֹ') && i > 0) return void (out += 'о'); // холам-мале
    let cons = dagesh && HARD[l.c] ? HARD[l.c] : HE[l.c];
    if (l.c === 'ש' && l.marks.includes('ׂ')) cons = 'с'; // син
    if (l.c === 'ה' && last && !dagesh) cons = ''; // немая хе в конце
    if (l.c === 'י' && !vowels.length && i > 0 && /[иеэ]$/.test(out)) cons = ''; // йуд как знак долготы
    const v = vowels.find((x) => x !== 'е' || !l.marks.includes('ְ') || !last) ?? '';
    const shva = l.marks.includes('ְ') && !l.marks.match(/[ֱ-ׇֻ]/);
    out += cons + (shva ? (i === 0 ? 'е' : '') : v);
  });
  return out;
}

export const translit = (word) => (/[֐-׿]/.test(word) ? hebrewToRu(word) : /[Ͱ-Ͽἀ-῿]/.test(word) ? greekToRu(word) : '');
