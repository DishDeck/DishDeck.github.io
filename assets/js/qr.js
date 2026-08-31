/* Standalone QR generator - for table cards, flyers, or any link, not just
 * a menu. Auto-fills with a restaurant's clean menu URL when one is picked,
 * but the URL field is always free-text so it works for anything.
 */

import { h, qs, clear, qrImageUrl, copyText, params } from './util.js';
import { loadTenants, menuLink } from './config.js';

const state = { registry: null, url: '', size: 320 };

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
  state.url = preset ? menuLink({ id: preset.id }) : location.origin + '/';

  render();
}

function render() {
  const wrap = qs('#wrap');
  clear(wrap);

  wrap.append(
    h('div.qr-head', {}, [
      h('h1', {}, '\u{1F532} QR Code Generator'),
      h('span.spacer'),
      h('a.btn', { href: '/admin.html' + (params.get('r') ? '?r=' + params.get('r') : '') }, 'Menu editor'),
    ]),
    h('div.field', {}, [
      h('label', {}, 'Restaurant (fills in its menu link)'),
      h('select', { id: 'restSelect', onchange: (e) => { onPickRestaurant(e.target.value); } }, [
        h('option', { value: '' }, '— custom link —'),
        ...state.registry.restaurants.map((r) => h('option', { value: r.id }, r.name || r.id)),
      ]),
    ]),
    h('div.field', {}, [
      h('label', {}, 'Link this code opens'),
      h('input', { type: 'url', id: 'urlInput', value: state.url, oninput: (e) => { state.url = e.target.value; renderPreview(); } }),
    ]),
    h('div.row', {}, [
      h('div.field', {}, [
        h('label', {}, 'Size'),
        h('select', { id: 'sizeSelect', onchange: (e) => { state.size = Number(e.target.value); renderPreview(); } },
          [220, 320, 480, 640].map((n) => h('option', { value: n, selected: n === state.size }, n + ' × ' + n + ' px'))),
      ]),
    ]),
    h('div.qr-preview', { id: 'preview' }),
    h('p.hint', {}, [
      'This code is generated on the fly by a free public QR API - nothing about it is stored. ',
      'To save it: open the image in a new tab and use your browser/phone\'s "Save image", ',
      'or right-click → Save Image As. It stays scannable at any print size since QR codes are ',
      'resolution-independent up to the pixel size chosen above.',
    ])
  );

  renderPreview();
}

function onPickRestaurant(id) {
  if (!id) return;
  state.url = menuLink({ id });
  qs('#urlInput').value = state.url;
  renderPreview();
}

function renderPreview() {
  const box = qs('#preview');
  clear(box);
  const url = (state.url || '').trim();
  if (!url) {
    box.append(h('p.qr-link', {}, 'Enter a link above to generate a code.'));
    return;
  }
  const img = qrImageUrl(url, state.size);
  box.append(
    h('img', { src: img, width: 220, height: 220, alt: 'QR code for ' + url }),
    h('p.qr-link', {}, url),
    h('div.qr-actions', {}, [
      h('a.btn.btn-primary', { href: img, target: '_blank', rel: 'noopener' }, 'Open full size to save'),
      h('button.btn', { onclick: async () => { await copyText(url); toast(); } }, 'Copy link'),
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
