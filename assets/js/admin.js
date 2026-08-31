/* DishDeck Menu Editor - a static, no-backend worktable for the person who
 * has to change prices at 11pm on a Tuesday.
 *
 * It loads a restaurant's live menu (same tenant/config resolution as the
 * storefront), lets you edit prices/status/specials in a spreadsheet-like
 * grid, and exports either:
 *   - menu.json  -> commit it over restaurants/<id>/menu.json, or
 *   - menu.csv   -> paste it into the "Menu" tab of a Google Sheet
 * Nothing here writes back to GitHub or Sheets automatically - by design,
 * this is a static site with no server, so "save" always means "download,
 * then you paste/commit it". Wire it to Sheets directly if you want that.
 */

import { h, qs, qsa, clear, download, copyText, num, log, objectsToCSV } from './util.js';
import { bootConfig } from './config.js';
import { loadMenu, itemToSheetRow, toMenuJSON, SHEET_COLUMNS } from './data.js';

const state = { ctx: null, data: null, dirty: false };

async function main() {
  const app = qs('#admin');
  clear(app);
  app.append(h('div.admin-wrap', { id: 'wrap' }, [h('p', {}, 'Loading…')]));

  try {
    state.ctx = await bootConfig();
    state.data = await loadMenu(state.ctx.brand);
  } catch (err) {
    renderError(err);
    return;
  }
  render();
}

function renderError(err) {
  qs('#wrap').replaceChildren(
    h('h1', {}, 'Could not load the menu'),
    h('p', { style: 'color:#fb7185' }, String(err.message || err)),
    h('p', {}, 'Pick a restaurant with ', h('code', {}, '?r=<id>'), ' in the URL, e.g. ', h('code', {}, 'admin.html?r=nova-table'), '.')
  );
}

function render() {
  const b = state.ctx.brand;
  const wrap = qs('#wrap');
  clear(wrap);

  wrap.append(
    h('div.admin-head', {}, [
      h('div', {}, [
        h('h1', {}, '\u{1F37D}️ Menu Editor'),
        h('div.sub', {}, b.name + ' · editing a local copy, nothing is sent anywhere until you export'),
      ]),
      h('div.spacer'),
      h('a.btn', { href: '/qr.html?r=' + b.id }, '\u{1F532} Table QR code'),
      h('a.btn', { href: '/index.html?r=' + b.id }, '← Back to site'),
    ]),
    h('div.hint', {}, [
      'Change a price, flip a status, tick "special" for today\'s board — then use ',
      h('b', {}, 'Export'), ' below. If this restaurant runs on a Google Sheet ',
      '(', h('code', {}, 'data.source: sheet'), '), copy the CSV and paste it over the Menu tab. ',
      'If it runs on ', h('code', {}, 'menu.json'), ', download the JSON and commit it over ',
      h('code', {}, b.dir + '/menu.json'), '.',
    ]),
    renderBar(),
    h('div.table-scroll', {}, [renderTable()]),
    renderFootActions()
  );
}

function renderBar() {
  const cats = ['all', ...state.data.categories.map((c) => c.id)];
  return h('div.admin-bar', {}, [
    h('select', { id: 'catFilter', onchange: (e) => { state.catFilter = e.target.value; render(); } },
      cats.map((c) => h('option', { value: c, selected: c === (state.catFilter || 'all') }, c === 'all' ? 'All categories' : c))),
    h('input', { type: 'text', id: 'search', placeholder: 'Filter by name…', value: state.search || '', oninput: (e) => { state.search = e.target.value; renderTableOnly(); } }),
    h('button.btn', { onclick: addRow }, '+ Add dish'),
  ]);
}

function visibleItems() {
  const cat = state.catFilter || 'all';
  const q = (state.search || '').toLowerCase();
  return state.data.items.filter((it) => (cat === 'all' || it.category === cat) && (!q || it.name.toLowerCase().includes(q)));
}

function renderTableOnly() {
  const scroll = qs('.table-scroll');
  clear(scroll);
  scroll.append(renderTable());
  updateCount();
}

function renderTable() {
  const items = visibleItems();
  return h('table.editor', {}, [
    h('thead', {}, [h('tr', {}, [
      h('th', {}, 'Category'), h('th', {}, 'Name'), h('th', {}, 'Price'),
      h('th', {}, 'Status'), h('th', {}, 'Special'), h('th', {}, 'Special ₹'),
      h('th', {}, 'Tags'), h('th', {}, ''),
    ])]),
    h('tbody', {}, items.map((it) => row(it))),
  ]);
}

function row(it) {
  return h('tr', { 'data-id': it.id }, [
    h('td', {}, h('span.cat-tag', {}, it.category)),
    h('td', {}, h('input.name', { type: 'text', value: it.name, oninput: (e) => { it.name = e.target.value; touch(); } })),
    h('td', {}, h('input.price', { type: 'number', value: it.price ?? '', oninput: (e) => { it.price = num(e.target.value, null); touch(); } })),
    h('td', { class: 'status-' + it.status }, statusSelect(it)),
    h('td', { style: 'text-align:center' }, h('input.chk', { type: 'checkbox', checked: !!it.special, onchange: (e) => { it.special = e.target.checked; touch(); } })),
    h('td', {}, h('input.price', { type: 'number', value: it.specialPrice ?? '', oninput: (e) => { it.specialPrice = num(e.target.value, null); touch(); } })),
    h('td', {}, h('input', { type: 'text', value: (it.tags || []).join(', '), style: 'min-width:120px', oninput: (e) => { it.tags = e.target.value.split(',').map((s) => s.trim()).filter(Boolean); touch(); } })),
    h('td', {}, h('button.row-del', { title: 'Remove dish', onclick: () => removeRow(it) }, '✕')),
  ]);
}

function statusSelect(it) {
  const opts = ['on', 'soldout', 'off', 'hidden'];
  return h('select', {
    onchange: (e) => { it.status = e.target.value; e.target.closest('td').className = 'status-' + it.status; touch(); },
  }, opts.map((o) => h('option', { value: o, selected: o === it.status }, o)));
}

function addRow() {
  const id = 'dish-' + Date.now().toString(36);
  const cat = (state.catFilter && state.catFilter !== 'all') ? state.catFilter : (state.data.categories[0] && state.data.categories[0].id) || 'menu';
  state.data.items.push({ id, category: cat, name: 'New dish', desc: '', price: 0, variants: [], image: '', tags: [], spice: 0, status: 'on', special: false, specialPrice: null, specialFrom: '', specialTo: '', note: '', sort: state.data.items.length * 10 });
  render();
}

function removeRow(it) {
  if (!confirm('Remove "' + it.name + '" from this working copy?')) return;
  state.data.items = state.data.items.filter((x) => x !== it);
  touch();
  renderTableOnly();
}

function touch() { state.dirty = true; updateCount(); }

function updateCount() {
  const pill = qs('#countPill');
  if (pill) pill.textContent = visibleItems().length + ' / ' + state.data.items.length + ' dishes shown' + (state.dirty ? ' · unsaved changes' : '');
}

function renderFootActions() {
  return h('div.foot-actions', {}, [
    h('button.btn.btn-primary', { onclick: exportJSON }, '⬇ Download menu.json'),
    h('button.btn', { onclick: exportCSV }, '⬇ Download menu.csv'),
    h('button.btn', { onclick: copyCSV }, '⧉ Copy CSV for pasting into Sheets'),
    h('span.count-pill', { id: 'countPill' }, visibleItems().length + ' / ' + state.data.items.length + ' dishes shown'),
  ]);
}

function exportJSON() {
  const json = toMenuJSON(state.data);
  download('menu.json', JSON.stringify(json, null, 2));
  state.dirty = false;
  updateCount();
}

function csvText() {
  return objectsToCSV(state.data.items.map(itemToSheetRow), SHEET_COLUMNS);
}

function exportCSV() { download('menu.csv', csvText(), 'text/csv'); state.dirty = false; updateCount(); }

async function copyCSV() {
  const ok = await copyText(csvText());
  alert(ok ? 'CSV copied — paste it over the Menu tab in Google Sheets.' : 'Could not access the clipboard; use Download menu.csv instead.');
}

window.addEventListener('beforeunload', (e) => { if (state.dirty) { e.preventDefault(); e.returnValue = ''; } });

document.addEventListener('DOMContentLoaded', main);
