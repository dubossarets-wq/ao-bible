// Расшифровка морфологических кодов на русском:
//  • коды Стронга TVM для иврита (RST+, например TH8804) — по сетке FHL (ctb.fhl.net/heb.html);
//  • коды Робинсона для греческого (модуль byz-rp2018, например V-PAI-1S) и коды OSHB для иврита
//    и арамейского (модуль oshb, например HC/Vqw3ms) — по таблицам morphData.json
//    (перенос эталонного разбора scripts/morph_check.py).
// Для неизвестных кодов показываем сам код без догадок.
import DATA from './morphData.json';

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
const TVM = new Map();
for (const [stem, codes] of Object.entries(GRID)) codes.forEach((c, i) => c && TVM.set(c, `${stem}, ${FORMS[i]}`));

// --- Робинсон / OSHB ---------------------------------------------------------------------

function slotTable(section, name, lang) {
  const byLang = section.slotsByLanguage || {};
  if (name in byLang) return byLang[name][lang] || {};
  return section.slots[name] || {};
}

function matchForm(section, form, body, lang) {
  const ph = section.placeholder;
  let pos = 0;
  const out = [];
  for (const name of form.slots) {
    if (pos === body.length) {
      if (section.allowShort) break;
      return null;
    }
    if (name === '-') {
      if (body[pos] !== '-') return null;
      pos++;
      continue;
    }
    if (ph && body[pos] === ph) {
      out.push([name, ph, null]);
      pos++;
      continue;
    }
    const table = slotTable(section, name, lang);
    let key = null;
    for (let n = Math.min(4, body.length - pos); n > 0; n--) {
      if (body.slice(pos, pos + n) in table) {
        key = body.slice(pos, pos + n);
        break;
      }
    }
    if (key == null) return null;
    out.push([name, key, table[key]]);
    pos += key.length;
  }
  if (pos !== body.length) return null;
  for (const [name, allowed] of Object.entries(form.when || {})) {
    const got = out.find(([n]) => n === name)?.[1];
    if (got != null && got !== ph && !allowed.includes(got)) return null;
  }
  return out;
}

function parseBody(section, posCode, body, lang) {
  const info = section.pos[posCode];
  if (!info) return { pos: posCode, error: true };
  for (const form of info.forms) {
    const slots = matchForm(section, form, body, lang);
    if (slots) return { pos: posCode, posInfo: info, slots };
  }
  return { pos: posCode, posInfo: info, error: true };
}

function parseGreek(code) {
  const g = DATA.greek;
  const parts = code.split(g.separator);
  const suffixes = [];
  while (parts.length > 1 && parts[parts.length - 1] in g.suffixes) suffixes.unshift(parts.pop());
  const seg = parseBody(g, parts[0], parts.slice(1).join(g.separator));
  seg.suffixes = suffixes.map((s) => [s, g.suffixes[s]]);
  return [seg];
}

function parseHebrew(code) {
  const h = DATA.hebrew;
  const lang = code[0];
  if (!(lang in h.languages)) return null;
  return code
    .slice(1)
    .split(h.segmentSeparator)
    .map((s) => {
      const seg = s ? parseBody(h, s[0], s.slice(1), lang) : { pos: '', error: true };
      seg.suffixes = [];
      return seg;
    });
}

function describeParsed(segs, key = 'ru') {
  if (!segs || segs.some((s) => s.error)) return null;
  return segs
    .map((s) => [s.posInfo[key], ...s.slots.filter(([, , v]) => v).map(([, , v]) => v[key]), ...s.suffixes.map(([, v]) => v[key])].join(', '))
    .join(' + ');
}

export function describeMorph(code) {
  const tvm = /^T?([HG])(\d+)$/.exec(code);
  if (tvm) {
    const n = +tvm[2];
    return { code, text: tvm[1] === 'H' && TVM.has(n) ? TVM.get(n) : null };
  }
  try {
    const hebrew = /^[HA][A-Za-z0-9/]*$/.test(code) && !code.includes('-') && !(code in DATA.greek.pos);
    return { code, text: describeParsed(hebrew ? parseHebrew(code) : parseGreek(code)) };
  } catch {
    return { code, text: null };
  }
}
