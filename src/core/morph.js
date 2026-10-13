// Расшифровка морфологических кодов Стронга (TVM) для иврита.
// Таблица соответствий взята из сетки FHL (ctb.fhl.net/heb.html): породы × формы.
// Для кодов, которых нет в таблице (в том числе греческих), показываем сам код без догадок.

const FORMS = ['перфект', 'имперфект', 'повелительное наклонение', 'инфинитив', 'действительное причастие', 'страдательное причастие', 'причастие'];
const GRID = {
  'Кал (Qal)': [8804, 8799, 8798, 8800, 8802, 8803, 8801],
  'Пиэль (Piel)': [8765, 8762, 8761, 8763, null, null, 8764],
  'Пуаль (Pual)': [8795, 8792, null, null, null, null, 8794],
  'Нифаль (Niphal)': [8738, 8735, 8734, 8736, null, null, 8737],
  'Хифиль (Hiphil)': [8689, 8686, 8685, 8687, null, null, 8688],
  'Хофаль (Hophal)': [8717, 8714, null, 8715, null, null, 8716],
  'Хитпаэль (Hithpael)': [8694, 8691, 8690, 8692, null, null, 8693],
  'Полель (Polel)': [8790, 8787, null, 8788, null, null, 8789],
  'Пеэль/Пеиль (Peel/Peil)': [null, null, null, 8756, null, null, null],
  'Поэль (Poel)': [null, 8779, null, 8780, null, null, 8781],
  'Поаль (Poal)': [8776, null, null, null, null, null, null],
  'Пилпель (Pilpel)': [8773, 8770, 8769, 8771, null, null, 8772],
  'Пилель (Pilel)': [8768, 8766, null, null, null, null, null],
  'Пулаль (Pulal)': [8797, null, null, null, null, null, null],
  'Хитпоэль (Hithpoel)': [null, 8704, 8703, null, null, null, 8706],
  'Хитполель (Hithpolel)': [8712, 8709, null, null, null, null, null],
  'Хитпалпель (Hithpalpel)': [null, 8698, null, null, null, null, null],
  'Шафель (Shaphel)': [8806, null, null, null, null, null, null],
};

const TABLE = new Map();
for (const [stem, codes] of Object.entries(GRID)) codes.forEach((c, i) => c && TABLE.set(c, `${stem}, ${FORMS[i]}`));

export function describeMorph(code) {
  const m = /^T?([HG])(\d+)$/.exec(code);
  if (!m) return { code, text: null };
  const n = +m[2];
  if (m[1] === 'H' && TABLE.has(n)) return { code, text: TABLE.get(n) };
  return { code, text: null };
}
