// Разметка текста стиха (см. docs/MODULE_SCHEMA.md):
//   {слово|H7225}             — слово с номером Стронга
//   {сотворил|H1254 H853|TH8804} — с морфологическим кодом
//   ‹это›                     — слово, добавленное переводчиками (курсив)
// Всё остальное — обычный текст. Каждое слово становится отдельным «токеном», на который можно нажать.

const WORD = /[\p{L}\p{M}]+(?:[-’'][\p{L}\p{M}]+)*/gu;

export function tokenize(text) {
  const tokens = []; // { kind: 'w'|'t', text, strongs?, morph?, italic }
  let italic = false;
  let i = 0;
  const pushPlain = (s) => {
    let last = 0;
    for (const m of s.matchAll(WORD)) {
      if (m.index > last) tokens.push({ kind: 't', text: s.slice(last, m.index), italic });
      tokens.push({ kind: 'w', text: m[0], italic });
      last = m.index + m[0].length;
    }
    if (last < s.length) tokens.push({ kind: 't', text: s.slice(last), italic });
  };
  while (i < text.length) {
    const ch = text[i];
    if (ch === '‹') {
      italic = true;
      i++;
    } else if (ch === '›') {
      italic = false;
      i++;
    } else if (ch === '{') {
      const end = text.indexOf('}', i);
      if (end < 0) {
        pushPlain(text.slice(i));
        break;
      }
      const [word, s = '', m = ''] = text.slice(i + 1, end).split('|');
      const strongs = s.split(/\s+/).filter(Boolean);
      const morph = m.split(/\s+/).filter(Boolean);
      if (strongs.length) tokens.push({ kind: 'w', text: word, strongs, morph, italic });
      else pushPlain(word);
      i = end + 1;
    } else {
      let j = i;
      while (j < text.length && !'‹›{'.includes(text[j])) j++;
      pushPlain(text.slice(i, j));
      i = j;
    }
  }
  return tokens;
}

export function plainText(text) {
  return text.replace(/\{([^|}]*)\|[^}]*\}/g, '$1').replace(/[‹›]/g, '');
}

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
const esc = (s) => s.replace(/[&<>"]/g, (c) => ESC[c]);

// HTML стиха со словами-кнопками. Делегирование событий: по data-i ищем токен заново.
export function verseHtml(text, { showStrongs = false, highlight = null } = {}) {
  const tokens = tokenize(text);
  let out = '';
  let wi = 0;
  let inItalic = false;
  for (const t of tokens) {
    if (t.italic !== inItalic) {
      out += t.italic ? '<i class="add">' : '</i>';
      inItalic = t.italic;
    }
    if (t.kind === 't') {
      out += esc(t.text);
      continue;
    }
    const hl = highlight && highlight.test(t.text);
    if (highlight) highlight.lastIndex = 0;
    out += `<span class="w${t.strongs ? ' s' : ''}${hl ? ' hl' : ''}" data-i="${wi}">${esc(t.text)}</span>`;
    if (showStrongs && t.strongs) out += `<sup class="sn" data-i="${wi}">${t.strongs.join(' ')}</sup>`;
    wi++;
  }
  if (inItalic) out += '</i>';
  return out;
}

export function wordAt(text, index) {
  let wi = 0;
  for (const t of tokenize(text)) {
    if (t.kind !== 'w') continue;
    if (wi === index) return t;
    wi++;
  }
  return null;
}

export function normalizeWord(w) {
  return w.toLowerCase().replace(/ё/g, 'е');
}
