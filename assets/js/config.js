/* Tenant resolution + brand config loading.
 *
 * Layering (later wins):
 *   1. DEFAULTS below
 *   2. config/tenants.json -> "defaults" block (shared across all restaurants)
 *   3. restaurants/<id>/brand.json  (or brand.yaml, if that is what is listed)
 *   4. config/runtime.json  -> env/CI-injected overrides, global then per-tenant
 *   5. ?override= URL params (debug only, e.g. ?skin=classic&mode=light)
 */

import { fetchJSON, fetchText, params, log, resolveGoogleDriveUrl } from './util.js';
import { parseYAML } from './yaml.js';

// Root-absolute so these still resolve correctly from a nested clean-URL
// page like /nova-table/index.html (see resolveTenantId's path matching).
export const TENANTS_URL = '/config/tenants.json';
export const RUNTIME_URL = '/config/runtime.json';

export const DEFAULTS = {
  id: 'restaurant',
  name: 'Restaurant',
  tagline: '',
  about: '',
  logo: { src: '', text: '', alt: '' },
  theme: {
    skin: 'futuristic',          // futuristic | classic
    mode: 'dark',                // dark | light | auto
    accent: '#7af0e0',
    accent2: '#a98bff',
    ink: '',
    surface: '',
    radius: '18px',
    fonts: { display: '', body: '', google: [] },
    texture: true,               // grain / paper overlay
    heroImage: '',
  },
  currency: { code: 'INR', symbol: '₹', locale: 'en-IN', decimals: null },
  contact: { phone: '', whatsapp: '', address: '', maps: '', email: '', bookUrl: '' },
  social: { instagram: '', facebook: '', x: '', youtube: '' },
  hours: {},                     // { mon: [["11:30","23:00"]], ... }  empty = always open
  closedDates: [],
  timezoneNote: '',
  features: {
    search: true,
    specials: true,
    board: true,                 // printable daily-specials board
    tagFilters: true,
    callToOrder: true,
    languageToggle: false,
    showSoldOut: true,           // list sold-out dishes (stamped) instead of hiding
    autoRefreshSeconds: 120,
  },
  labels: {
    specialsTitle: "Today's Board",
    specialsNote: 'Fresh today, gone tomorrow.',
    menuTitle: 'The Menu',
    soldOut: 'Sold out',
    unavailable: 'Off menu today',
    specialBadge: 'Today',
    openNow: 'Open now',
    closedNow: 'Closed',
    closedToday: 'Closed today',
    orderCta: 'Call to order',
  },
  data: {
    source: 'json',              // json | csv | sheet
    menuUrl: 'menu.json',        // relative to the restaurant folder, or absolute
    csvUrl: '',
    sheetId: '',
    sheets: { menu: 'Menu', categories: 'Categories', settings: 'Settings' },
  },
};

/* ------------------------------- merging ------------------------------- */

const isPlain = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

export function deepMerge(base, patch) {
  if (!isPlain(patch)) return patch === undefined ? base : patch;
  const out = isPlain(base) ? { ...base } : {};
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    if (k.includes('.')) { setPath(out, k, v); continue; }   // "data.sheetId": "..."
    out[k] = isPlain(v) ? deepMerge(out[k], v) : v;
  }
  return out;
}

export function setPath(obj, path, value) {
  const keys = String(path).split('.');
  let cur = obj;
  keys.slice(0, -1).forEach((k) => {
    if (!isPlain(cur[k])) cur[k] = {};
    cur = cur[k];
  });
  cur[keys[keys.length - 1]] = value;
  return obj;
}

export function getPath(obj, path, fallback = undefined) {
  const v = String(path).split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
  return v === undefined ? fallback : v;
}

/* ---------------------------- tenant registry -------------------------- */

export async function loadTenants() {
  const reg = await fetchJSON(TENANTS_URL);
  reg.restaurants = (reg.restaurants || []).map((r) => ({
    config: 'brand.json',
    ...r,
    // Normalise to exactly one leading slash so brand-relative assets
    // resolve the same from "/" and from a nested "/<id>/" page.
    dir: '/' + (r.dir || 'restaurants/' + r.id).replace(/^\/+/, ''),
  }));
  return reg;
}

/**
 * Resolve which restaurant to show, in priority order:
 *   ?r=<id>  ->  first path segment (e.g. /nova-table/)  ->  /r/<id>/  ->
 *   #/<id>  ->  hostname map  ->  default
 *
 * The bare first-segment match is what lets a restaurant get a clean URL
 * like yoursite.github.io/nova-table/ with zero server config - it works
 * because GitHub Pages serves restaurants/<id>/index.html for that path
 * as a normal static file (see the clean-url tenant folders in the repo
 * root), and that file loads this same app.
 */
export function resolveTenantId(registry) {
  const ids = new Set((registry.restaurants || []).map((r) => r.id));
  const fromParam = params.get('r') || params.get('restaurant');
  if (fromParam && ids.has(fromParam)) return { id: fromParam, via: 'query' };

  const segments = location.pathname.split('/').filter(Boolean);
  if (segments[0] && ids.has(segments[0])) return { id: segments[0], via: 'path' };

  const seg = location.pathname.match(/\/r\/([^/]+)\/?/);
  if (seg && ids.has(seg[1])) return { id: seg[1], via: 'path' };

  const hashId = (location.hash || '').replace(/^#\/?/, '').split('/')[0];
  if (hashId && ids.has(hashId)) return { id: hashId, via: 'hash' };

  const host = location.hostname.toLowerCase();
  const hosts = registry.hosts || {};
  if (hosts[host] && ids.has(hosts[host])) return { id: hosts[host], via: 'host' };
  for (const [pattern, id] of Object.entries(hosts)) {          // "*.novatable.com"
    if (pattern.startsWith('*.') && host.endsWith(pattern.slice(1)) && ids.has(id)) {
      return { id, via: 'host' };
    }
  }

  const fallback = registry.default || (registry.restaurants[0] && registry.restaurants[0].id);
  return { id: fallback, via: 'default', requested: fromParam || null };
}

/* ------------------------------ brand load ----------------------------- */

async function loadConfigFile(url) {
  if (/\.ya?ml($|\?)/i.test(url)) return parseYAML(await fetchText(url));
  return fetchJSON(url);
}

/** Values a non-developer may want to flip from a URL while previewing. */
const URL_OVERRIDES = {
  skin: 'theme.skin',
  mode: 'theme.mode',
  accent: 'theme.accent',
  accent2: 'theme.accent2',
  menu: 'data.menuUrl',
  sheet: 'data.sheetId',
  csv: 'data.csvUrl',
  source: 'data.source',
};

export async function loadBrand(entry, registry) {
  const dir = (entry.dir || 'restaurants/' + entry.id).replace(/\/$/, '');
  let brand = deepMerge(DEFAULTS, registry.defaults || {});
  brand = deepMerge(brand, { id: entry.id, name: entry.name || entry.id, dir });

  try {
    brand = deepMerge(brand, await loadConfigFile(dir + '/' + (entry.config || 'brand.json')));
  } catch (e) {
    log('brand config missing, using defaults', e.message);
  }

  // env / CI overrides - see .github/workflows/runtime-config.yml
  try {
    const runtime = await fetchJSON(RUNTIME_URL);
    brand = deepMerge(brand, runtime.all || runtime['*'] || {});
    brand = deepMerge(brand, runtime[entry.id] || {});
  } catch {
    /* optional file */
  }

  for (const [param, path] of Object.entries(URL_OVERRIDES)) {
    const v = params.get(param);
    if (v !== null && v !== '') setPath(brand, path, v);
  }

  brand.dir = dir;
  brand.id = entry.id;
  return brand;
}

/**
 * The shareable URL for a restaurant's menu - the one to print on a table
 * QR code or hand out. Uses the ?r= query form, which always works with no
 * extra setup - safer for something printed on paper than the clean
 * /<id>/ path, which only resolves once that restaurant's clean-URL folder
 * exists (see cleanMenuLink and the README). If you've set that folder up,
 * pass preferClean to get the shorter link instead.
 */
export function menuLink(brand, { preferClean = false } = {}) {
  return preferClean ? cleanMenuLink(brand) : location.origin + '/?r=' + brand.id;
}

/**
 * The short, clean URL - e.g. https://yoursite.github.io/nova-table/ - valid
 * only once a physical "<id>/index.html" folder exists at the repo root
 * mirroring the root shell (see README: "Clean per-restaurant URLs").
 */
export function cleanMenuLink(brand) {
  return location.origin + '/' + brand.id + '/';
}

/** Absolute-or-relative asset URL, resolved against the restaurant folder or Google Drive. */
export function assetUrl(brand, path) {
  if (!path) return '';
  const driveResolved = resolveGoogleDriveUrl(path);
  if (driveResolved !== path) return driveResolved;
  if (/^(https?:|data:|\/\/)/i.test(path) || path.startsWith('/')) return path;
  return brand.dir + '/' + path.replace(/^\.\//, '');
}

export async function bootConfig() {
  const registry = await loadTenants();
  const resolved = resolveTenantId(registry);
  const entry = (registry.restaurants || []).find((r) => r.id === resolved.id)
    || { id: resolved.id, name: resolved.id };
  const brand = await loadBrand(entry, registry);
  log('tenant', resolved, brand);
  return { registry, resolved, entry, brand };
}
