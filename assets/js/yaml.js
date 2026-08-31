/* Tiny YAML subset parser - enough for config files, zero dependencies.
 *
 * Supports: nested maps by indentation, "- " sequences (scalars, inline maps,
 * and nested blocks), quoted/unquoted scalars, inline [a, b] and {k: v},
 * booleans, numbers, null/~, # comments, and multi-line "|" / ">" blocks.
 * Not supported (and not needed here): anchors, aliases, multi-doc, tags.
 */

function scalar(raw) {
  const s = String(raw).trim();
  if (s === '' || s === '~' || s.toLowerCase() === 'null') return null;
  if (/^(true|yes|on)$/i.test(s)) return true;
  if (/^(false|no|off)$/i.test(s)) return false;
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    const body = s.slice(1, -1);
    return s[0] === '"' ? body.replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\') : body;
  }
  if (s.startsWith('[') && s.endsWith(']')) return splitInline(s.slice(1, -1)).map(scalar);
  if (s.startsWith('{') && s.endsWith('}')) {
    const out = {};
    for (const part of splitInline(s.slice(1, -1))) {
      const i = part.indexOf(':');
      if (i < 0) continue;
      out[scalar(part.slice(0, i))] = scalar(part.slice(i + 1));
    }
    return out;
  }
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  return s;
}

/** Split "a, {b: 1}, [c, d]" on top-level commas only. */
function splitInline(str) {
  const out = [];
  let depth = 0, quote = null, cur = '';
  for (const ch of String(str)) {
    if (quote) {
      cur += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; cur += ch; continue; }
    if (ch === '[' || ch === '{') depth++;
    if (ch === ']' || ch === '}') depth--;
    if (ch === ',' && depth === 0) { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim() !== '') out.push(cur);
  return out.map((s) => s.trim()).filter((s) => s !== '');
}

/** Strip a trailing comment that is not inside quotes. */
function stripComment(line) {
  let quote = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quote) { if (c === quote) quote = null; continue; }
    if (c === '"' || c === "'") { quote = c; continue; }
    if (c === '#' && (i === 0 || /\s/.test(line[i - 1]))) return line.slice(0, i);
  }
  return line;
}

export function parseYAML(text) {
  const lines = [];
  String(text).replace(/\r\n?/g, '\n').split('\n').forEach((raw, idx) => {
    if (/^\s*(#|$)/.test(raw)) return;
    if (/^\s*---\s*$/.test(raw)) return;
    const indent = raw.match(/^\s*/)[0].replace(/\t/g, '  ').length;
    lines.push({ indent, text: stripComment(raw).trim(), no: idx + 1 });
  });

  let pos = 0;

  function parseBlock(indent) {
    // A block is a map or a sequence, decided by its first line.
    if (pos >= lines.length) return null;
    return lines[pos].text.startsWith('- ') || lines[pos].text === '-'
      ? parseSeq(indent)
      : parseMap(indent);
  }

  function parseSeq(indent) {
    const arr = [];
    while (pos < lines.length && lines[pos].indent === indent && /^-(\s|$)/.test(lines[pos].text)) {
      const rest = lines[pos].text.replace(/^-\s*/, '');
      pos++;
      if (rest === '') {
        arr.push(pos < lines.length && lines[pos].indent > indent ? parseBlock(lines[pos].indent) : null);
      } else if (/^[^:\s"'{[]+:(\s|$)/.test(rest) || /^".*":(\s|$)/.test(rest)) {
        // inline first key of a map item: "- name: x" followed by deeper keys
        const item = {};
        const i = rest.indexOf(':');
        assign(item, rest.slice(0, i), rest.slice(i + 1), indent + 2);
        if (pos < lines.length && lines[pos].indent > indent) Object.assign(item, parseMap(lines[pos].indent));
        arr.push(item);
      } else {
        arr.push(scalar(rest));
      }
    }
    return arr;
  }

  function assign(target, keyRaw, valueRaw, indent) {
    const key = String(scalar(keyRaw));
    const value = valueRaw.trim();
    if (value === '|' || value === '>' || value === '|-' || value === '>-') {
      const fold = value[0] === '>';
      const parts = [];
      const base = pos < lines.length ? lines[pos].indent : indent + 2;
      while (pos < lines.length && lines[pos].indent >= base) { parts.push(lines[pos].text); pos++; }
      target[key] = parts.join(fold ? ' ' : '\n');
      return;
    }
    if (value === '') {
      target[key] = pos < lines.length && lines[pos].indent > indent ? parseBlock(lines[pos].indent) : null;
      return;
    }
    target[key] = scalar(value);
  }

  function parseMap(indent) {
    const obj = {};
    while (pos < lines.length && lines[pos].indent === indent) {
      const line = lines[pos];
      if (/^-(\s|$)/.test(line.text)) break;
      const i = line.text.indexOf(':');
      if (i < 0) { pos++; continue; }
      pos++;
      assign(obj, line.text.slice(0, i), line.text.slice(i + 1), indent);
    }
    return obj;
  }

  const root = lines.length ? parseBlock(lines[0].indent) : {};
  return root === null ? {} : root;
}

export default parseYAML;
