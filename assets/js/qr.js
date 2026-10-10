/* Standalone QR generator - for table cards, flyers, or any link, not just
 * a menu. Auto-fills with a restaurant's clean menu URL when one is picked,
 * but the URL field is always free-text so it works for anything.
 */

import { h, qs, clear, qrImageUrl, copyText, params } from './util.js';
import { loadTenants, menuLink } from './config.js';

const state = { registry: null, restaurantId: '', url: '', size: 300, tableNum: '', batchMode: false, batchFrom: 1, batchTo: 10 };

async function main() {
  const app = qs('#qrApp');
  clear(app);
  app.append(h('div.qr-wrap', { id: 'wrap' }));

  try {
    state.registry = await loadTenants();
  } catch {
    state.registry = { restaurants: [] };
  }

  const preselect = params.get('r');
  const preset = state.registry.restaurants.find((r) => r.id === preselect) || state.registry.restaurants[0];
  state.restaurantId = preset ? preset.id : '';
  state.tableNum = params.get('table') || '';
  updateBaseUrl();

  render();
}

function updateBaseUrl() {
  if (state.restaurantId) {
    let link = menuLink({ id: state.restaurantId });
    if (state.tableNum) {
      link += (link.includes('?') ? '&' : '?') + 'table=' + encodeURIComponent(state.tableNum);
    }
    state.url = link;
  } else if (!state.url) {
    state.url = location.origin + '/';
  }
}

function render() {
  const wrap = qs('#wrap');
  clear(wrap);

  const selectedRest = state.registry.restaurants.find((r) => r.id === state.restaurantId);
  const restName = selectedRest ? (selectedRest.name || selectedRest.id) : 'Restaurant';

  wrap.append(
    h('div.qr-head', {}, [
      h('h1', {}, '\u{1F532} Table & Menu QR Code Generator'),
      h('span.spacer'),
      h('a.btn', { href: '/admin.html' + (state.restaurantId ? '?r=' + state.restaurantId : '') }, 'Menu editor'),
      h('a.btn', { href: '/index.html' + (state.restaurantId ? '?r=' + state.restaurantId : '') }, 'View menu'),
    ]),
    h('div.row', {}, [
      h('div.field', {}, [
        h('label', {}, 'Restaurant'),
        h('select', { id: 'restSelect', onchange: (e) => onPickRestaurant(e.target.value) }, [
          h('option', { value: '' }, '— custom link —'),
          ...state.registry.restaurants.map((r) => h('option', { value: r.id, selected: r.id === state.restaurantId }, r.name || r.id)),
        ]),
      ]),
      h('div.field', {}, [
        h('label', {}, 'Mode'),
        h('select', { id: 'modeSelect', onchange: (e) => { state.batchMode = e.target.value === 'batch'; render(); } }, [
          h('option', { value: 'single', selected: !state.batchMode }, 'Single QR Code (Table or General)'),
          h('option', { value: 'batch', selected: state.batchMode }, 'Batch Table Cards (e.g. Tables 1 to 10)'),
        ]),
      ]),
    ]),
    state.batchMode ? renderBatchControls(restName) : renderSingleControls(),
    h('div.qr-preview', { id: 'preview' }),
    h('p.hint', {}, [
      'Guests scan these QR codes with their phone camera to instantly open the digital menu on GitHub Pages. ',
      'No app install needed. When Table numbers are included, the diner sees their specific table number on the header.',
    ])
  );

  if (state.batchMode) {
    renderBatchPreview(restName);
  } else {
    renderPreview();
  }
}

function renderSingleControls() {
  return h('div', { id: 'singleControls' }, [
    h('div.row', {}, [
      h('div.field', {}, [
        h('label', {}, 'Table number (optional)'),
        h('input', {
          type: 'text', placeholder: 'e.g. 1, 4, Patio-2', value: state.tableNum,
          oninput: (e) => { state.tableNum = e.target.value.trim(); updateBaseUrl(); qs('#urlInput').value = state.url; renderPreview(); },
        }),
      ]),
      h('div.field', {}, [
        h('label', {}, 'QR Code Size'),
        h('select', { id: 'sizeSelect', onchange: (e) => { state.size = Number(e.target.value); renderPreview(); } },
          [220, 300, 400, 600].map((n) => h('option', { value: n, selected: n === state.size }, n + ' × ' + n + ' px'))),
      ]),
    ]),
    h('div.field', {}, [
      h('label', {}, 'Target Menu Link'),
      h('input', { type: 'url', id: 'urlInput', value: state.url, oninput: (e) => { state.url = e.target.value; renderPreview(); } }),
    ]),
  ]);
}

function renderBatchControls(restName) {
  return h('div', { id: 'batchControls' }, [
    h('div.row', {}, [
      h('div.field', {}, [
        h('label', {}, 'From Table #'),
        h('input', {
          type: 'number', min: '1', max: '100', value: state.batchFrom,
          oninput: (e) => { state.batchFrom = Math.max(1, parseInt(e.target.value) || 1); renderBatchPreview(restName); },
        }),
      ]),
      h('div.field', {}, [
        h('label', {}, 'To Table #'),
        h('input', {
          type: 'number', min: '1', max: '100', value: state.batchTo,
          oninput: (e) => { state.batchTo = Math.max(state.batchFrom, parseInt(e.target.value) || 10); renderBatchPreview(restName); },
        }),
      ]),
      h('div.field', { style: 'display:flex;align-items:flex-end' }, [
        h('button.btn.btn-primary', { style: 'width:100%', onclick: () => window.print() }, '\u{1F5B6} Print All Table Cards (PDF)'),
      ]),
    ]),
  ]);
}

function onPickRestaurant(id) {
  state.restaurantId = id;
  updateBaseUrl();
  render();
}

function renderPreview() {
  const box = qs('#preview');
  if (!box) return;
  clear(box);
  const url = (state.url || '').trim();
  if (!url) {
    box.append(h('p.qr-link', {}, 'Enter a link above to generate a code.'));
    return;
  }
  const img = qrImageUrl(url, state.size);
  box.append(
    state.tableNum ? h('h3', { style: 'margin:0;color:var(--accent)' }, 'Table ' + state.tableNum) : null,
    h('img', { src: img, width: 220, height: 220, alt: 'QR code for ' + url }),
    h('p.qr-link', {}, url),
    h('div.qr-actions', {}, [
      h('a.btn.btn-primary', { href: img, target: '_blank', rel: 'noopener' }, 'Open full size to save'),
      h('button.btn', { onclick: async () => { await copyText(url); toast(); } }, 'Copy link'),
      h('button.btn', { onclick: () => window.print() }, '\u{1F5B6} Print Table Card'),
    ])
  );
}

function renderBatchPreview(restName) {
  const box = qs('#preview');
  if (!box) return;
  clear(box);

  const from = state.batchFrom;
  const to = Math.min(from + 50, state.batchTo); // limit 50 at once for speed

  const grid = h('div.table-cards-grid');
  for (let t = from; t <= to; t++) {
    const tableUrl = menuLink({ id: state.restaurantId }) + (menuLink({ id: state.restaurantId }).includes('?') ? '&' : '?') + 'table=' + t;
    const imgUrl = qrImageUrl(tableUrl, 260);

    grid.append(h('div.table-card', {}, [
      h('div.card-rest', {}, restName),
      h('div.card-table', {}, 'Table ' + t),
      h('img', { src: imgUrl, width: 140, height: 140, alt: 'Table ' + t + ' QR' }),
      h('div.card-scan', {}, '\u{1F4F1} Scan with phone camera for menu'),
    ]));
  }

  box.append(
    h('div', { style: 'width:100%' }, [
      h('div', { style: 'display:flex;justify-content:space-between;align-items:center;margin-bottom:12px' }, [
        h('span', { style: 'font-size:.9rem;color:#8fa0bd' }, 'Generated ' + (to - from + 1) + ' table cards for ' + restName),
        h('button.btn.btn-primary', { onclick: () => window.print() }, '\u{1F5B6} Print All Cards'),
      ]),
      grid,
    ])
  );
}

function toast() {
  const box = qs('#preview');
  const note = h('p.qr-link', {}, 'Link copied.');
  box.append(note);
  setTimeout(() => note.remove(), 1800);
}

document.addEventListener('DOMContentLoaded', main);
