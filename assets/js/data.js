/* Menu data loading + normalisation.
 *
 * Three interchangeable sources, all read-only at runtime:
 *   json  - a menu.json in the repo, or any absolute URL (gist, S3, your API)
 *   csv   - any published CSV URL
 *   sheet - a Google Sheet by id, one tab per table (Menu / Categories / Settings)
 *
 * Whatever the source, the app sees the same normalised shape, and the last
 * good payload is cached in localStorage so a network blip shows a stale menu
 * rather than an empty page.
 */

import {
  fetchJSON, fetchText, csvToObjects, pick, bool, num, list, slug,
  inWindow, today, store, log,
} from './util.js';
import { assetUrl } from './config.js';

const CACHE_PREFIX = 'dishdeck:menu:';

/* --------------------------------- URLs -------------------------------- */

export function sheetCsvUrl(sheetId, tabName) {
  const base = 'https://docs.google.com/spreadsheets/d/' + encodeURIComponent(sheetId) + '/gviz/tq';
  return base + '?tqx=out:csv&sheet=' + encodeURIComponent(tabName || 'Menu');
}

function resolveDataUrls(brand) {
  const d = brand.data || {};
  const source = (d.source || 'json').toLowerCase();
  if (source === 'sheet' && d.sheetId) {
    const tabs = d.sheets || {};
    return {
      source,
      menu: sheetCsvUrl(d.sheetId, tabs.menu || 'Menu'),
      categories: tabs.categories ? sheetCsvUrl(d.sheetId, tabs.categories) : '',
      settings: tabs.settings ? sheetCsvUrl(d.sheetId, tabs.settings) : '',
    };
  }
  if (source === 'csv' || d.csvUrl) {
    return { source: 'csv', menu: d.csvUrl || assetUrl(brand, d.menuUrl), categories: '', settings: '' };
  }
  return { source: 'json', menu: assetUrl(brand, d.menuUrl || 'menu.json'), categories: '', settings: '' };
}

/* ----------------------------- normalisation --------------------------- */

const STATUS_ALIASES = {
  on: 'on', available: 'on', yes: 'on', in: 'on', true: 'on', active: 'on', '1': 'on',
  soldout: 'soldout', sold: 'soldout', out: 'soldout', finished: 'soldout', over: 'soldout',
  off: 'off', unavailable: 'off', no: 'off', closed: 'off', paused: 'off', '86': 'off',
  hidden: 'hidden', hide: 'hidden', draft: 'hidden', archived: 'hidden',
};

/**
 * One row -> one dish.
 * status: on | soldout (stamped, still shown) | off (off menu today) | hidden (never rendered)
 */
export function normaliseItem(raw, index, brand) {
  const name = String(pick(raw, 'name', 'dish', 'item', 'title') || '').trim();
  if (!name) return null;

  const rawStatus = String(pick(raw, 'status', 'state') || '').trim().toLowerCase().replace(/[\s_-]/g, '');
  let status = STATUS_ALIASES[rawStatus];
  if (!status) {
    // No status column? Fall back to the friendlier available / soldout columns.
    const soldOut = pick(raw, 'soldOut', 'sold_out', 'sold');
    const available = pick(raw, 'available', 'in_stock', 'inStock', 'active');
    if (soldOut !== undefined && bool(soldOut, false)) status = 'soldout';
    else if (available !== undefined) status = bool(available, true) ? 'on' : 'off';
    else if (bool(pick(raw, 'hidden'), false)) status = 'hidden';
    else status = 'on';
  }

  const price = num(pick(raw, 'price', 'rate', 'amount', 'cost'), null);
  const specialPrice = num(pick(raw, 'specialPrice', 'special_price', 'offerPrice', 'offer_price', 'todayPrice'), null);
  const from = String(pick(raw, 'specialFrom', 'special_from', 'from', 'startDate') || '').trim();
  const to = String(pick(raw, 'specialTo', 'special_to', 'to', 'endDate') || '').trim();

  const specialFlag = bool(pick(raw, 'special', 'isSpecial', 'is_special', 'daily_special', 'todaysSpecial'), false);
  const windowed = Boolean(specialFlag || specialPrice !== null || from || to);
  const activeSpecial = windowed && inWindow(from, to);

  // Variants: either a structured array, or "Half=180 | Full=320" in a CSV cell.
  let variants = [];
  const rawVariants = pick(raw, 'variants', 'priceVariants', 'options', 'sizes');
  if (Array.isArray(rawVariants)) {
    variants = rawVariants
      .map((v) => ({ label: String(v.label || v.name || '').trim(), price: num(v.price, null) }))
      .filter((v) => v.label && v.price !== null);
  } else if (rawVariants) {
    variants = String(rawVariants).split(/[|;]/).map((part) => {
      const m = part.split(/[=:]/);
      return m.length >= 2 ? { label: m[0].trim(), price: num(m[1], null) } : null;
    }).filter((v) => v && v.label && v.price !== null);
  }

  const image = String(pick(raw, 'image', 'img', 'photo', 'imageUrl', 'image_url') || '').trim();
  const category = slug(pick(raw, 'category', 'section', 'group', 'course') || 'menu');

  return {
    id: String(pick(raw, 'id', 'sku', 'code') || slug(name) || 'item-' + index),
    category,
    name,
    desc: String(pick(raw, 'desc', 'description', 'details', 'subtitle') || '').trim(),
    price,
    specialPrice: activeSpecial ? specialPrice : null,
    variants,
    image: image ? (/^(https?:|data:|\/\/)/i.test(image) ? image : assetUrl(brand, image)) : '',
    tags: list(pick(raw, 'tags', 'labels', 'badges')).map((t) => t.toLowerCase()),
    spice: num(pick(raw, 'spice', 'heat', 'spiceLevel'), 0) || 0,
    status,
    special: activeSpecial,
    specialFrom: from,
    specialTo: to,
    note: String(pick(raw, 'note', 'notes', 'chefNote') || '').trim(),
    sort: num(pick(raw, 'sort', 'order', 'position'), index * 10),
    _row: index + 2, // spreadsheet row number, for the admin view
  };
}

function normaliseCategories(rawCats, items) {
  const seen = new Map();
  (rawCats || []).forEach((c, i) => {
    const id = slug(pick(c, 'id', 'category', 'name') || '');
    if (!id) return;
    seen.set(id, {
      id,
      name: String(pick(c, 'name', 'title', 'label', 'category') || id).trim(),
      note: String(pick(c, 'note', 'description', 'subtitle') || '').trim(),
      icon: String(pick(c, 'icon', 'emoji') || '').trim(),
      sort: num(pick(c, 'sort', 'order'), i * 10),
      hidden: bool(pick(c, 'hidden'), false),
    });
  });
  // Any category referenced by a dish but never declared still gets a section.
  items.forEach((it, i) => {
    if (!seen.has(it.category)) {
      seen.set(it.category, {
        id: it.category,
        name: it.category.replace(/-/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase()),
        note: '', icon: '', sort: 1000 + i, hidden: false,
      });
    }
  });
  return Array.from(seen.values()).filter((c) => !c.hidden).sort((a, b) => a.sort - b.sort);
}

/** Settings tab is a key/value sheet: closedToday, announcement, note... */
function normaliseSettings(rows) {
  const out = {};
  (rows || []).forEach((r) => {
    const key = String(pick(r, 'key', 'setting', 'name') || '').trim();
    if (!key) return;
    out[key.replace(/[\s_-]+(.)/g, (_, c) => c.toUpperCase())] = pick(r, 'value', 'val', 'data');
  });
  return out;
}

export function normalise(payload, brand) {
  const rawItems = payload.items || payload.dishes || payload.menu || [];
  const items = rawItems
    .map((r, i) => normaliseItem(r, i, brand))
    .filter(Boolean)
    .filter((it) => it.status !== 'hidden')
    .sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));

  const settings = payload.settings || {};
  const specials = items.filter((it) => it.special && it.status !== 'off');

  return {
    updatedAt: payload.updatedAt || payload.updated_at || new Date().toISOString(),
    day: today(),
    settings: {
      closedToday: bool(settings.closedToday, false),
      closedNote: String(settings.closedNote || '').trim(),
      announcement: String(settings.announcement || '').trim(),
      specialsNote: String(settings.specialsNote || '').trim(),
    },
    categories: normaliseCategories(payload.categories, items),
    items,
    specials,
    soldOut: items.filter((it) => it.status === 'soldout'),
    offMenu: items.filter((it) => it.status === 'off'),
    source: payload.__source || 'json',
    stale: false,
  };
}

/* -------------------------------- loading ------------------------------ */

async function loadRawPayload(urls) {
  if (urls.source === 'json') {
    const json = await fetchJSON(urls.menu);
    return { ...json, __source: 'json' };
  }
  const [menuCsv, catCsv, setCsv] = await Promise.all([
    fetchText(urls.menu),
    urls.categories ? fetchText(urls.categories).catch(() => '') : Promise.resolve(''),
    urls.settings ? fetchText(urls.settings).catch(() => '') : Promise.resolve(''),
  ]);
  if (/^\s*</.test(menuCsv)) {
    throw new Error('Got HTML instead of CSV - is the sheet shared as "Anyone with the link can view"?');
  }
  return {
    items: csvToObjects(menuCsv),
    categories: catCsv ? csvToObjects(catCsv) : [],
    settings: setCsv ? normaliseSettings(csvToObjects(setCsv)) : {},
    updatedAt: new Date().toISOString(),
    __source: urls.source,
  };
}

/**
 * Load the menu. Returns normalised data; on failure falls back to the cached
 * copy (marked stale) and only throws when there is nothing cached either.
 */
export async function loadMenu(brand, { useCache = true } = {}) {
  const urls = resolveDataUrls(brand);
  const cacheKey = CACHE_PREFIX + brand.id;
  log('menu source', urls);
  try {
    const raw = await loadRawPayload(urls);
    const data = normalise(raw, brand);
    if (!data.items.length) throw new Error('The menu source loaded but contains no dishes.');
    store.set(cacheKey, { raw, at: Date.now() });
    return data;
  } catch (err) {
    log('menu load failed', err);
    const cached = useCache ? store.get(cacheKey) : null;
    if (cached && cached.raw) {
      const data = normalise(cached.raw, brand);
      data.stale = true;
      data.staleSince = cached.at;
      data.error = err.message;
      return data;
    }
    throw err;
  }
}

/** Rows for the admin editor / CSV export, in sheet column order. */
export const SHEET_COLUMNS = [
  'id', 'category', 'name', 'description', 'price', 'variants', 'image', 'tags',
  'spice', 'status', 'special', 'special_price', 'special_from', 'special_to', 'sort', 'note',
];

export function itemToSheetRow(it) {
  return {
    id: it.id,
    category: it.category,
    name: it.name,
    description: it.desc,
    price: it.price === null ? '' : it.price,
    variants: (it.variants || []).map((v) => v.label + '=' + v.price).join(' | '),
    image: it.image,
    tags: (it.tags || []).join(', '),
    spice: it.spice || '',
    status: it.status,
    special: it.special ? 'TRUE' : 'FALSE',
    special_price: it.specialPrice === null ? '' : it.specialPrice,
    special_from: it.specialFrom || '',
    special_to: it.specialTo || '',
    sort: it.sort,
    note: it.note || '',
  };
}

/** Normalised data -> a menu.json payload you can commit to the repo. */
export function toMenuJSON(data) {
  return {
    updatedAt: new Date().toISOString(),
    settings: data.settings,
    categories: data.categories.map((c) => ({ id: c.id, name: c.name, note: c.note, icon: c.icon, sort: c.sort })),
    items: data.items.map((it) => ({
      id: it.id,
      category: it.category,
      name: it.name,
      desc: it.desc,
      price: it.price,
      variants: it.variants && it.variants.length ? it.variants : undefined,
      image: it.image,
      tags: it.tags && it.tags.length ? it.tags : undefined,
      spice: it.spice || undefined,
      status: it.status,
      special: it.special || undefined,
      specialPrice: it.specialPrice === null ? undefined : it.specialPrice,
      specialFrom: it.specialFrom || undefined,
      specialTo: it.specialTo || undefined,
      note: it.note || undefined,
      sort: it.sort,
    })),
  };
}
