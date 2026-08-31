/* DishDeck - small helpers, no dependencies */

export const qs = (sel, root = document) => root.querySelector(sel);
export const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/** Create an element: h('div.card', {'aria-label':'x'}, child, 'text') */
export function h(spec, attrs = {}, ...kids) {
  const [tagPart, ...classes] = String(spec).split('.');
  const el = document.createElement(tagPart || 'div');
  if (classes.length) el.className = classes.join(' ');
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = [el.className, v].filter(Boolean).join(' ');
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid === null || kid === undefined || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

export const clear = (el) => { while (el && el.firstChild) el.removeChild(el.firstChild); return el; };

export function debounce(fn, ms = 200) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

export const slug = (s) => String(s || '').toLowerCase().trim()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

/** Stable 32-bit hash - used to pick deterministic placeholder art. */
export function hash(str) {
  const s = String(str);
  let n = 2166136261;
  for (let i = 0; i < s.length; i++) {
    n ^= s.charCodeAt(i);
    n = Math.imul(n, 16777619);
  }
  return Math.abs(n);
}

/* ------------------------------- money -------------------------------- */

export function makeMoney(cfg) {
  const { code = 'INR', symbol = '', locale = 'en-IN', decimals = null } = cfg || {};
  return function money(value) {
    const n = Number(value);
    if (!isFinite(n)) return '';
    const frac = decimals === null ? (Number.isInteger(n) ? 0 : 2) : decimals;
    if (symbol) {
      return symbol + n.toLocaleString(locale, { minimumFractionDigits: frac, maximumFractionDigits: frac });
    }
    try {
      return new Intl.NumberFormat(locale, {
        style: 'currency', currency: code,
        minimumFractionDigits: frac, maximumFractionDigits: frac,
      }).format(n);
    } catch {
      return n.toLocaleString(locale);
    }
  };
}

/* -------------------------------- dates ------------------------------- */

/** Local YYYY-MM-DD - a menu's "today" is the restaurant's today, never UTC. */
export function today(d = new Date()) {
  const p = (x) => String(x).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

/** Inclusive window test; blank bounds mean "unbounded". */
export function inWindow(from, to, day = today()) {
  if (from && day < from) return false;
  if (to && day > to) return false;
  return true;
}

export function relTime(iso) {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (!isFinite(then)) return '';
  const secs = Math.round((Date.now() - then) / 1000);
  if (secs < 45) return 'just now';
  if (secs < 5400) return Math.round(secs / 60) + ' min ago';
  if (secs < 172800) return Math.round(secs / 3600) + ' h ago';
  return new Date(iso).toLocaleDateString();
}

/* ------------------------------ coercion ------------------------------ */

const TRUTHY = new Set(['true', 'yes', 'y', '1', 'on', 'available', 'in', 'open']);
const FALSY = new Set(['false', 'no', 'n', '0', 'off', 'out', 'soldout', 'sold out', 'closed', '']);

export function bool(v, fallback = false) {
  if (typeof v === 'boolean') return v;
  if (v === null || v === undefined) return fallback;
  const s = String(v).trim().toLowerCase();
  if (TRUTHY.has(s)) return true;
  if (FALSY.has(s)) return false;
  return fallback;
}

export function num(v, fallback = null) {
  if (v === null || v === undefined || v === '') return fallback;
  const n = Number(String(v).replace(/[^0-9.\-]/g, ''));
  return isFinite(n) ? n : fallback;
}

export function list(v) {
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
  return String(v || '').split(/[,;|]/).map((s) => s.trim()).filter(Boolean);
}

/** Read a value from an object, tolerating header spelling drift. */
export function pick(obj, ...keys) {
  if (obj == null) return undefined;
  for (const k of keys) {
    const cands = [k, k.toLowerCase(), k.replace(/[_\s]/g, ''), slug(k).replace(/-/g, '_')];
    for (const c of cands) {
      if (Object.prototype.hasOwnProperty.call(obj, c) && obj[c] !== '' && obj[c] !== undefined) return obj[c];
    }
  }
  return undefined;
}

/* ------------------------------- fetching ----------------------------- */

export async function fetchText(url, opts) {
  const { bust = true, timeout = 15000 } = opts || {};
  const u = new URL(url, location.href);
  if (bust) u.searchParams.set('_', String(Math.floor(Date.now() / 15000))); // 15s cache bucket
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(u.toString(), { signal: ctrl.signal, cache: 'no-cache' });
    if (!res.ok) throw new Error(res.status + ' ' + res.statusText + ' for ' + url);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchJSON(url, opts) {
  const txt = await fetchText(url, opts);
  try {
    return JSON.parse(txt);
  } catch (e) {
    throw new Error('Invalid JSON at ' + url + ': ' + e.message);
  }
}

/* ------------------------------ CSV parsing --------------------------- */

/** RFC4180-ish CSV -> array of row arrays. Handles quotes, escaped quotes, CRLF. */
export function parseCSV(text) {
  const rows = [];
  let row = [], field = '', inQ = false;
  const src = String(text).replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQ) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; } else inQ = false;
      } else field += c;
      continue;
    }
    if (c === '"') { inQ = true; continue; }
    if (c === ',') { row.push(field); field = ''; continue; }
    if (c === '\r') continue;
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue; }
    field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((cell) => String(cell).trim() !== ''));
}

/** CSV -> array of objects keyed by normalised header names. */
export function csvToObjects(text) {
  const rows = parseCSV(text);
  if (!rows.length) return [];
  const headers = rows[0].map((c) => slug(c).replace(/-/g, '_'));
  return rows.slice(1).map((r) => {
    const o = {};
    headers.forEach((key, i) => { if (key) o[key] = String(r[i] === undefined ? '' : r[i]).trim(); });
    return o;
  });
}

/** Objects -> CSV text (used by the admin export). */
export function objectsToCSV(rows, headers) {
  const cols = headers || Array.from(rows.reduce((set, r) => {
    Object.keys(r).forEach((k) => set.add(k));
    return set;
  }, new Set()));
  const esc = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  return [cols.join(',')].concat(rows.map((r) => cols.map((c) => esc(r[c])).join(','))).join('\n');
}

/* --------------------------- placeholder art -------------------------- */

const GLYPHS = ['\u{1F37D}', '\u{1F35D}', '\u{1F363}', '\u{1F963}', '\u{1F371}', '\u{1F37F}', '\u{1F96A}', '\u{1F346}'];

/** Deterministic gradient "plate" so a missing photo still looks intentional. */
export function placeholderImage(seedText, opts) {
  const { dark = true } = opts || {};
  const n = hash(seedText || 'dish');
  const hue = n % 360;
  const hue2 = (hue + 38 + (n % 40)) % 360;
  const glyph = GLYPHS[n % GLYPHS.length];
  const l1 = dark ? 26 : 86, l2 = dark ? 12 : 72;
  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400" viewBox="0 0 640 400">',
    '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">',
    '<stop offset="0" stop-color="hsl(' + hue + ' 62% ' + l1 + '%)"/>',
    '<stop offset="1" stop-color="hsl(' + hue2 + ' 55% ' + l2 + '%)"/></linearGradient>',
    '<radialGradient id="p" cx="50%" cy="50%">',
    '<stop offset="0" stop-color="rgba(255,255,255,.22)"/>',
    '<stop offset="1" stop-color="rgba(255,255,255,0)"/></radialGradient></defs>',
    '<rect width="640" height="400" fill="url(#g)"/>',
    '<circle cx="320" cy="200" r="150" fill="url(#p)"/>',
    '<circle cx="320" cy="200" r="108" fill="none" stroke="rgba(255,255,255,.26)" stroke-width="2"/>',
    '<circle cx="320" cy="200" r="82" fill="none" stroke="rgba(255,255,255,.15)" stroke-width="1.5"/>',
    '<text x="320" y="234" font-size="86" text-anchor="middle" opacity=".92">' + glyph + '</text>',
    '</svg>',
  ].join('');
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

/* -------------------------------- QR codes ----------------------------- */

/**
 * A scannable QR code for a URL, as an <img src>. Rendered by a free public
 * API (no key, no signup) rather than a vendored generator library, since a
 * printed table-tent code only needs to work at print time, not offline -
 * this keeps the site's own JS payload at zero for a feature most visitors
 * never trigger. If you'd rather not depend on a third party, swap this one
 * function for a vendored encoder (e.g. github.com/kazuhikoarase/qrcode-generator)
 * and every caller keeps working unchanged.
 */
export function qrImageUrl(text, size = 300) {
  const px = Math.max(64, Math.min(1000, Math.round(size)));
  return 'https://api.qrserver.com/v1/create-qr-code/?size=' + px + 'x' + px +
    '&margin=8&data=' + encodeURIComponent(text);
}

/* -------------------------------- storage ----------------------------- */

export const store = {
  get(key, fallback = null) {
    try { const v = localStorage.getItem(key); return v === null ? fallback : JSON.parse(v); }
    catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
  },
  del(key) { try { localStorage.removeItem(key); } catch {} },
};

export function download(filename, text, mime = 'application/json') {
  const blob = new Blob([text], { type: mime + ';charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = h('textarea', { style: 'position:fixed;opacity:0' });
    ta.value = text;
    document.body.append(ta);
    ta.select();
    const ok = document.execCommand && document.execCommand('copy');
    ta.remove();
    return !!ok;
  }
}

export const params = new URLSearchParams(location.search);
export const DEBUG = params.get('debug') === '1';
export const log = (...a) => { if (DEBUG) console.log('[dishdeck]', ...a); };
