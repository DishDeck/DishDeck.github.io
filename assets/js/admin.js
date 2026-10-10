/* DishDeck Menu Editor & Admin Dashboard
 *
 * Full-featured, dynamic management dashboard for restaurant staff:
 *   - Google Sign-In (OAuth 2.0) & Google Apps Script direct save support.
 *   - Live spreadsheet grid: edit dish names, prices, specials, and stock availability in 1 click.
 *   - Image manager: paste Google Drive links or upload images directly to Google Drive.
 *   - Zero hardcoded secrets: everything is dynamic and customer-scoped.
 *   - Offline backups: download menu.json or copy CSV at any time.
 */

import {
  h, qs, qsa, clear, download, copyText, num, log, objectsToCSV,
  resolveGoogleDriveUrl, getGoogleDriveFileId, placeholderImage, params, store
} from './util.js';
import { bootConfig } from './config.js';
import { loadMenu, itemToSheetRow, toMenuJSON, SHEET_COLUMNS } from './data.js';

const state = {
  ctx: null,
  data: null,
  dirty: false,
  catFilter: 'all',
  stockFilter: 'all',
  search: '',
  auth: {
    googleToken: null,
    googleUser: null,
    isSigningIn: false,
  },
  config: {
    sheetId: '',
    scriptUrl: '',
    secretKey: '',
    googleClientId: '',
    driveFolderId: '',
  },
  activeModal: null,
};

const CONFIG_STORAGE_KEY = 'dishdeck:admin:cfg:';

/* --------------------------------- Boot -------------------------------- */

async function main() {
  const app = qs('#admin');
  clear(app);
  app.append(h('div.admin-wrap', { id: 'wrap' }, [h('p', {}, 'Loading admin dashboard…')]));

  try {
    state.ctx = await bootConfig();
    loadStoredConfig();
    state.data = await loadMenu(state.ctx.brand);
  } catch (err) {
    renderError(err);
    return;
  }

  // Restore session token if available
  const savedToken = sessionStorage.getItem('dishdeck:google_token');
  if (savedToken) {
    state.auth.googleToken = savedToken;
    fetchGoogleUserInfo(savedToken);
  }

  render();
}

function loadStoredConfig() {
  const b = state.ctx.brand;
  const stored = store.get(CONFIG_STORAGE_KEY + b.id, {});
  state.config = {
    sheetId: stored.sheetId || (b.data && b.data.sheetId) || '',
    scriptUrl: stored.scriptUrl || (b.data && b.data.scriptUrl) || '',
    secretKey: stored.secretKey || '',
    googleClientId: stored.googleClientId || (b.data && b.data.googleClientId) || '',
    driveFolderId: stored.driveFolderId || (b.data && b.data.driveFolderId) || '',
  };
}

function saveConfig() {
  const b = state.ctx.brand;
  store.set(CONFIG_STORAGE_KEY + b.id, state.config);
  toast('Admin settings updated');
}

function renderError(err) {
  qs('#wrap').replaceChildren(
    h('h1', {}, 'Could not load menu'),
    h('p', { style: 'color:#fb7185' }, String(err.message || err)),
    h('p', {}, 'Pick a restaurant with ', h('code', {}, '?r=<id>'), ' in the URL, e.g. ', h('code', {}, 'admin.html?r=nova-table'), '.')
  );
}

/* ------------------------------- Main UI ------------------------------- */

function render() {
  const b = state.ctx.brand;
  const wrap = qs('#wrap');
  clear(wrap);

  wrap.append(
    renderHeader(b),
    renderStatusBar(b),
    renderFilterBar(),
    h('div.table-scroll', {}, [renderTable()]),
    renderFootActions()
  );

  updateCount();
}

function renderHeader(b) {
  return h('div.admin-head', {}, [
    h('div', {}, [
      h('h1', {}, '\u{1F37D}️ ' + b.name + ' · Menu Editor'),
      h('div.sub', {}, 'Manage prices, stock availability, and dish images in real time'),
    ]),
    h('div.spacer'),
    renderAuthBadge(),
    h('button.btn', { onclick: openSettingsModal }, '⚙️ Settings'),
    h('a.btn', { href: '/qr.html?r=' + b.id }, '\u{1F532} Table QRs'),
    h('a.btn', { href: '/index.html?r=' + b.id, target: '_blank', rel: 'noopener' }, '↗ Live Menu'),
  ]);
}

function renderAuthBadge() {
  if (state.auth.googleUser) {
    return h('div.auth-badge.is-authed', { title: 'Signed in with Google' }, [
      '\u{1F7E2} ' + (state.auth.googleUser.email || 'Google Connected'),
      h('button.btn', {
        style: 'padding:2px 8px;font-size:.7rem;margin-left:4px',
        onclick: signOutGoogle,
      }, 'Sign out'),
    ]);
  }
  if (state.config.scriptUrl) {
    return h('div.auth-badge.is-script', { title: 'Connected via Google Apps Script' }, [
      '⚡ Apps Script Connected',
    ]);
  }
  return h('div.auth-badge', {}, [
    '🔒 Guest Mode (Local edits)',
    state.config.googleClientId
      ? h('button.btn.btn-primary', { style: 'padding:2px 10px;font-size:.75rem;margin-left:6px', onclick: signInGoogle }, 'Sign In')
      : h('button.btn', { style: 'padding:2px 8px;font-size:.75rem;margin-left:6px', onclick: openSettingsModal }, 'Connect Sheet'),
  ]);
}

function renderStatusBar(b) {
  const isSheet = state.config.sheetId || (b.data && b.data.sheetId);
  const saveDestination = state.config.scriptUrl
    ? 'Google Apps Script (Web App)'
    : state.auth.googleToken
    ? 'Google Sheets API v4'
    : 'Local only (connect Google Sheet to save directly)';

  return h('div.hint', {}, [
    h('b', {}, 'Connected Sheet: '),
    isSheet ? h('code', {}, state.config.sheetId || b.data.sheetId) : h('span', { style: 'color:#fbbf24' }, 'No Sheet ID configured'),
    ' · ',
    h('b', {}, 'Save Target: '), saveDestination,
  ]);
}

function renderFilterBar() {
  const cats = ['all', ...state.data.categories.map((c) => c.id)];
  return h('div.admin-bar', {}, [
    h('select', { id: 'catFilter', onchange: (e) => { state.catFilter = e.target.value; renderTableOnly(); } },
      cats.map((c) => h('option', { value: c, selected: c === state.catFilter }, c === 'all' ? 'All categories' : c))),
    h('select', { id: 'stockFilter', onchange: (e) => { state.stockFilter = e.target.value; renderTableOnly(); } }, [
      h('option', { value: 'all', selected: state.stockFilter === 'all' }, 'All availability'),
      h('option', { value: 'on', selected: state.stockFilter === 'on' }, '🟢 In Stock only'),
      h('option', { value: 'soldout', selected: state.stockFilter === 'soldout' }, '🟡 Sold Out only'),
      h('option', { value: 'off', selected: state.stockFilter === 'off' }, '🔴 Off Menu only'),
      h('option', { value: 'special', selected: state.stockFilter === 'special' }, '⭐ Specials only'),
    ]),
    h('input', {
      type: 'text', id: 'search', placeholder: 'Filter by name or tag…',
      value: state.search || '', oninput: (e) => { state.search = e.target.value; renderTableOnly(); },
    }),
    h('button.btn', { onclick: addRow }, '+ Add dish'),
    h('button.btn.btn-save', {
      id: 'saveBtn', disabled: !state.dirty, onclick: saveToSheet,
    }, [
      state.dirty ? h('span.unsaved-dot') : null,
      '💾 Save to Google Sheet',
    ]),
  ]);
}

function visibleItems() {
  const cat = state.catFilter || 'all';
  const stock = state.stockFilter || 'all';
  const q = (state.search || '').toLowerCase().trim();

  return state.data.items.filter((it) => {
    if (cat !== 'all' && it.category !== cat) return false;
    if (stock === 'special' && !it.special) return false;
    if (stock !== 'all' && stock !== 'special' && it.status !== stock) return false;
    if (q) {
      const matchName = (it.name || '').toLowerCase().includes(q);
      const matchDesc = (it.desc || '').toLowerCase().includes(q);
      const matchTag = (it.tags || []).some((t) => t.toLowerCase().includes(q));
      if (!matchName && !matchDesc && !matchTag) return false;
    }
    return true;
  });
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
      h('th', { style: 'width:50px' }, 'Photo'),
      h('th', {}, 'Category'),
      h('th', {}, 'Dish Name'),
      h('th', {}, 'Price (₹)'),
      h('th', { style: 'text-align:center' }, 'Stock / Status'),
      h('th', { style: 'text-align:center' }, 'Today Special'),
      h('th', {}, 'Special (₹)'),
      h('th', {}, 'Tags'),
      h('th', { style: 'text-align:right' }, 'Actions'),
    ])]),
    h('tbody', {}, items.length ? items.map((it) => row(it)) : [
      h('tr', {}, [h('td', { colspan: '9', style: 'text-align:center;padding:32px;color:#8fa0bd' }, 'No dishes match this filter.')]),
    ]),
  ]);
}

function row(it) {
  const imgUrl = resolveGoogleDriveUrl(it.image) || placeholderImage(it.name);

  return h('tr', { 'data-id': it.id, class: it._dirty ? 'dirty' : '' }, [
    // Image thumbnail + picker
    h('td', {}, [
      h('div.img-cell', {}, [
        h('img.img-thumb', {
          src: imgUrl, alt: it.name, title: 'Click to edit dish image',
          onerror: (e) => { if (!e.target.dataset.failed) { e.target.dataset.failed = '1'; e.target.src = placeholderImage(it.name); } },
          onclick: () => openImageModal(it),
        }),
      ]),
    ]),
    // Category
    h('td', {}, [
      h('input', {
        type: 'text', value: it.category, style: 'width:90px;text-transform:lowercase',
        oninput: (e) => { it.category = e.target.value.trim().toLowerCase(); markDirty(it); },
      }),
    ]),
    // Name
    h('td', {}, [
      h('input.name', {
        type: 'text', value: it.name, placeholder: 'Dish name',
        oninput: (e) => { it.name = e.target.value; markDirty(it); },
      }),
    ]),
    // Price
    h('td', {}, [
      h('input.price', {
        type: 'number', value: it.price ?? '', placeholder: '0',
        oninput: (e) => { it.price = num(e.target.value, 0); markDirty(it); },
      }),
    ]),
    // Status (Interactive Pill Selector)
    h('td', { style: 'text-align:center' }, [
      statusSelector(it),
    ]),
    // Special Checkbox
    h('td', { style: 'text-align:center' }, [
      h('input.chk', {
        type: 'checkbox', checked: !!it.special, title: "Feature on Today's Board",
        onchange: (e) => { it.special = e.target.checked; markDirty(it); },
      }),
    ]),
    // Special Price
    h('td', {}, [
      h('input.price', {
        type: 'number', value: it.specialPrice ?? '', placeholder: 'Offer ₹',
        oninput: (e) => { it.specialPrice = num(e.target.value, null); markDirty(it); },
      }),
    ]),
    // Tags
    h('td', {}, [
      h('input', {
        type: 'text', value: (it.tags || []).join(', '), placeholder: 'veg, spicy, chef', style: 'min-width:120px',
        oninput: (e) => { it.tags = e.target.value.split(',').map((s) => s.trim()).filter(Boolean); markDirty(it); },
      }),
    ]),
    // Actions
    h('td', { style: 'text-align:right;white-space:nowrap' }, [
      h('button.btn', {
        style: 'padding:2px 8px;font-size:.75rem;margin-right:4px', title: 'Duplicate dish',
        onclick: () => duplicateRow(it),
      }, '⧉'),
      h('button.row-del', { title: 'Remove dish', onclick: () => removeRow(it) }, '✕'),
    ]),
  ]);
}

function statusSelector(it) {
  const current = it.status || 'on';
  const labelMap = { on: '🟢 In Stock', soldout: '🟡 Sold Out', off: '🔴 Off Menu', hidden: '👁️ Hidden' };

  return h('select', {
    class: 'status-pill status-' + current,
    onchange: (e) => {
      it.status = e.target.value;
      e.target.className = 'status-pill status-' + it.status;
      markDirty(it);
    },
  }, [
    h('option', { value: 'on', selected: current === 'on' }, '🟢 In Stock'),
    h('option', { value: 'soldout', selected: current === 'soldout' }, '🟡 Sold Out'),
    h('option', { value: 'off', selected: current === 'off' }, '🔴 Off Menu'),
    h('option', { value: 'hidden', selected: current === 'hidden' }, '👁️ Hidden'),
  ]);
}

function addRow() {
  const id = 'dish-' + Date.now().toString(36);
  const cat = (state.catFilter && state.catFilter !== 'all')
    ? state.catFilter
    : (state.data.categories[0] && state.data.categories[0].id) || 'mains';

  const newItem = {
    id, category: cat, name: 'New Dish', desc: '', price: 100, variants: [],
    image: '', video: [], tags: [], spice: 0, status: 'on', special: false,
    specialPrice: null, specialFrom: '', specialTo: '', note: '',
    sort: state.data.items.length * 10, _dirty: true,
  };

  state.data.items.unshift(newItem);
  markDirty(newItem);
  render();
}

function duplicateRow(it) {
  const clone = JSON.parse(JSON.stringify(it));
  clone.id = 'dish-' + Date.now().toString(36);
  clone.name = clone.name + ' (Copy)';
  clone._dirty = true;
  state.data.items.splice(state.data.items.indexOf(it) + 1, 0, clone);
  markDirty(clone);
  render();
}

function removeRow(it) {
  if (!confirm('Remove "' + it.name + '" from the menu?')) return;
  state.data.items = state.data.items.filter((x) => x !== it);
  state.dirty = true;
  renderTableOnly();
}

function markDirty(it) {
  if (it) it._dirty = true;
  state.dirty = true;
  updateCount();
}

function updateCount() {
  const pill = qs('#countPill');
  const saveBtn = qs('#saveBtn');
  const dirtyCount = state.data.items.filter((x) => x._dirty).length;

  if (pill) {
    pill.textContent = visibleItems().length + ' / ' + state.data.items.length + ' dishes shown' +
      (dirtyCount ? ' · ' + dirtyCount + ' unsaved edits' : '');
  }
  if (saveBtn) {
    saveBtn.disabled = !state.dirty;
    saveBtn.textContent = dirtyCount ? '💾 Save ' + dirtyCount + ' Edits to Sheet' : '💾 Save to Google Sheet';
  }
}

function renderFootActions() {
  return h('div.foot-actions', {}, [
    h('button.btn.btn-save', { disabled: !state.dirty, onclick: saveToSheet }, '💾 Save to Google Sheet'),
    h('button.btn', { onclick: reloadMenu }, '🔄 Reload from Live Sheet'),
    h('button.btn', { onclick: exportJSON }, '⬇ Download menu.json'),
    h('button.btn', { onclick: exportCSV }, '⬇ Download menu.csv'),
    h('button.btn', { onclick: copyCSV }, '⧉ Copy CSV for Sheets'),
    h('span.count-pill', { id: 'countPill' }),
  ]);
}

/* --------------------------- Save to Sheet ----------------------------- */

async function saveToSheet() {
  const saveBtn = qs('#saveBtn');
  if (saveBtn) saveBtn.textContent = '⏳ Saving…';

  try {
    if (state.config.scriptUrl) {
      await saveViaAppsScript();
    } else if (state.auth.googleToken && state.config.sheetId) {
      await saveViaGoogleSheetsAPI();
    } else {
      openSettingsModal({ hint: 'To save directly, configure your Google Apps Script URL or Sign In with Google.' });
      return;
    }

    state.dirty = false;
    state.data.items.forEach((it) => { it._dirty = false; });
    toast('✅ Successfully saved to Google Sheet!');
    render();
  } catch (err) {
    console.error('Save error', err);
    alert('Failed to save to Google Sheet:\n' + err.message + '\n\nTip: You can use "Download menu.json" or "Copy CSV" to backup your work.');
  } finally {
    updateCount();
  }
}

async function saveViaAppsScript() {
  const url = state.config.scriptUrl;
  const payload = {
    action: 'update_menu',
    secretKey: state.config.secretKey,
    items: state.data.items,
  };

  const res = await fetch(url, {
    method: 'POST',
    mode: 'cors',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload),
  });

  const data = await res.json();
  if (!data.ok) throw new Error(data.error || 'Apps Script returned an error.');
}

async function saveViaGoogleSheetsAPI() {
  const sheetId = state.config.sheetId;
  const token = state.auth.googleToken;

  const rows = [SHEET_COLUMNS];
  state.data.items.forEach((it) => {
    const r = itemToSheetRow(it);
    rows.push(SHEET_COLUMNS.map((col) => r[col] ?? ''));
  });

  const apiUrl = 'https://sheets.googleapis.com/v4/spreadsheets/' + encodeURIComponent(sheetId) +
    '/values/Menu!A1?valueInputOption=USER_ENTERED';

  const res = await fetch(apiUrl, {
    method: 'PUT',
    headers: {
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ range: 'Menu!A1', majorDimension: 'ROWS', values: rows }),
  });

  if (!res.ok) {
    const errObj = await res.json().catch(() => ({}));
    throw new Error(errObj.error ? errObj.error.message : (res.status + ' ' + res.statusText));
  }
}

async function reloadMenu() {
  if (state.dirty && !confirm('You have unsaved changes. Discard and reload from the live sheet?')) return;
  try {
    state.data = await loadMenu(state.ctx.brand, { useCache: false });
    state.dirty = false;
    toast('Menu reloaded from source');
    render();
  } catch (err) {
    alert('Failed to reload: ' + err.message);
  }
}

/* ---------------------------- Image Modal ------------------------------ */

function openImageModal(it) {
  closeModal();

  const currentUrl = it.image || '';
  const currentPreview = resolveGoogleDriveUrl(currentUrl) || placeholderImage(it.name);

  const previewImg = h('img', {
    src: currentPreview, alt: it.name,
    onerror: (e) => { e.target.src = placeholderImage(it.name); },
  });

  const urlInput = h('input', {
    type: 'text', placeholder: 'Paste Google Drive share link or image URL',
    value: currentUrl,
    oninput: (e) => {
      const resolved = resolveGoogleDriveUrl(e.target.value.trim());
      previewImg.src = resolved || placeholderImage(it.name);
    },
  });

  const fileInput = h('input', {
    type: 'file', accept: 'image/*', style: 'display:none',
    onchange: async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      await uploadImageFile(file, it, urlInput, previewImg);
    },
  });

  const modal = h('div.modal-back', {}, [
    h('div.modal', {}, [
      h('h2', {}, [
        'Photo for ' + it.name,
        h('button.close-btn', { onclick: closeModal }, '✕'),
      ]),
      h('div.sub', {}, 'Use Google Drive to store high-resolution dish photos. Paste a share link or upload directly.'),
      h('div.form-group', {}, [
        h('label', {}, 'Image URL or Google Drive Link'),
        urlInput,
        h('div.form-help', {}, 'Supports drive.google.com/file/d/... links, Google user content links, or direct image URLs.'),
      ]),
      h('div.form-group', {}, [
        h('label', {}, 'Or upload photo to Google Drive'),
        h('button.btn', {
          onclick: () => fileInput.click(),
          disabled: !state.config.scriptUrl && !state.auth.googleToken,
          title: (!state.config.scriptUrl && !state.auth.googleToken) ? 'Connect Google Apps Script or Sign In with Google to enable direct upload' : '',
        }, '📁 Choose Image File…'),
        fileInput,
        (!state.config.scriptUrl && !state.auth.googleToken)
          ? h('div.form-help', { style: 'color:#fbbf24' }, 'Connect Apps Script or Sign In with Google in Settings to enable direct 1-click uploads.')
          : null,
      ]),
      h('div.form-group', {}, [
        h('label', {}, 'Preview'),
        h('div.img-preview-box', {}, [previewImg]),
      ]),
      h('div', { style: 'display:flex;justify-content:flex-end;gap:10px;margin-top:20px' }, [
        h('button.btn', { onclick: closeModal }, 'Cancel'),
        h('button.btn.btn-primary', {
          onclick: () => {
            it.image = urlInput.value.trim();
            markDirty(it);
            closeModal();
            renderTableOnly();
          },
        }, 'Apply Photo'),
      ]),
    ]),
  ]);

  document.body.append(modal);
  state.activeModal = modal;
}

async function uploadImageFile(file, item, urlInput, previewImg) {
  const uploadBtn = qs('.modal button.btn');
  if (uploadBtn) uploadBtn.textContent = '⏳ Uploading to Google Drive…';

  try {
    const reader = new FileReader();
    reader.onload = async () => {
      const base64Data = reader.result;

      if (state.config.scriptUrl) {
        const payload = {
          action: 'upload_image',
          secretKey: state.config.secretKey,
          data: base64Data,
          fileName: file.name,
          mimeType: file.type,
          folderId: state.config.driveFolderId,
        };

        const res = await fetch(state.config.scriptUrl, {
          method: 'POST',
          mode: 'cors',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify(payload),
        });

        const data = await res.json();
        if (!data.ok) throw new Error(data.error || 'Image upload failed');

        urlInput.value = data.cdnUrl || data.directUrl;
        previewImg.src = data.cdnUrl || data.directUrl;
        toast('Photo uploaded to Google Drive!');
      } else {
        throw new Error('Please configure Google Apps Script in Settings to enable direct file upload.');
      }
    };
    reader.readAsDataURL(file);
  } catch (err) {
    alert('Upload failed: ' + err.message);
  } finally {
    if (uploadBtn) uploadBtn.textContent = '📁 Choose Image File…';
  }
}

/* -------------------------- Settings Modal ----------------------------- */

function openSettingsModal(opts) {
  closeModal();
  const hint = (opts && opts.hint) || '';

  const sheetInput = h('input', { type: 'text', value: state.config.sheetId, placeholder: '1AbCDefGhIJkLmnoPQRstuVWxyz' });
  const scriptInput = h('input', { type: 'url', value: state.config.scriptUrl, placeholder: 'https://script.google.com/macros/s/.../exec' });
  const secretInput = h('input', { type: 'password', value: state.config.secretKey, placeholder: 'Your admin secret token' });
  const folderInput = h('input', { type: 'text', value: state.config.driveFolderId, placeholder: 'Drive folder ID for photos' });
  const clientInput = h('input', { type: 'text', value: state.config.googleClientId, placeholder: 'OAuth 2.0 Client ID (optional)' });

  const modal = h('div.modal-back', {}, [
    h('div.modal', {}, [
      h('h2', {}, [
        '⚙️ Connection & Cloud Settings',
        h('button.close-btn', { onclick: closeModal }, '✕'),
      ]),
      hint ? h('div.hint', { style: 'margin-bottom:14px;border-color:#fbbf24;color:#fbbf24' }, hint) : null,
      h('div.sub', {}, 'Connect your public Google Sheet and Google Drive for 100% free hosting and instant updates.'),

      h('div.form-group', {}, [
        h('label', {}, '1. Google Sheet ID'),
        sheetInput,
        h('div.form-help', {}, 'From your Sheet URL: docs.google.com/spreadsheets/d/<b>SHEET_ID</b>/edit. Must be shared as "Anyone with link: Viewer".'),
      ]),

      h('div.form-group', {}, [
        h('label', {}, '2. Google Apps Script Web App URL (Recommended)'),
        scriptInput,
        h('div.form-help', {}, 'Deploy google-apps-script/Code.gs from the repo as a Web App to enable 1-click saves and image uploads without OAuth.'),
      ]),

      h('div.form-group', {}, [
        h('label', {}, '3. Admin Secret Key (For Apps Script)'),
        secretInput,
        h('div.form-help', {}, 'Optional secret password to protect your Google Sheet from unauthorized writes.'),
      ]),

      h('div.form-group', {}, [
        h('label', {}, '4. Google Drive Folder ID (For Images)'),
        folderInput,
        h('div.form-help', {}, 'ID of the Google Drive folder where uploaded photos are stored with public view access.'),
      ]),

      h('div.form-group', {}, [
        h('label', {}, '5. Google OAuth Client ID (Alternative)'),
        clientInput,
        h('div.form-help', {}, 'Optional Client ID from Google Cloud Console for browser-based "Sign In with Google" OAuth.'),
      ]),

      h('div', { style: 'display:flex;justify-content:flex-end;gap:10px;margin-top:20px' }, [
        h('button.btn', { onclick: closeModal }, 'Cancel'),
        h('button.btn.btn-primary', {
          onclick: () => {
            state.config.sheetId = sheetInput.value.trim();
            state.config.scriptUrl = scriptInput.value.trim();
            state.config.secretKey = secretInput.value.trim();
            state.config.driveFolderId = folderInput.value.trim();
            state.config.googleClientId = clientInput.value.trim();
            saveConfig();
            closeModal();
            render();
          },
        }, 'Save & Apply'),
      ]),
    ]),
  ]);

  document.body.append(modal);
  state.activeModal = modal;
}

function closeModal() {
  if (state.activeModal) {
    state.activeModal.remove();
    state.activeModal = null;
  }
}

/* ---------------------------- Google Auth ------------------------------ */

function signInGoogle() {
  const clientId = state.config.googleClientId;
  if (!clientId) {
    openSettingsModal({ hint: 'Please enter your Google OAuth Client ID first.' });
    return;
  }

  if (typeof google === 'undefined' || !google.accounts || !google.accounts.oauth2) {
    alert('Google Identity Services script is still loading. Please wait 2 seconds and try again.');
    return;
  }

  const client = google.accounts.oauth2.initTokenClient({
    client_id: clientId,
    scope: 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file',
    callback: (res) => {
      if (res.access_token) {
        state.auth.googleToken = res.access_token;
        sessionStorage.setItem('dishdeck:google_token', res.access_token);
        fetchGoogleUserInfo(res.access_token);
        toast('Signed in with Google!');
        render();
      }
    },
  });

  client.requestAccessToken();
}

async function fetchGoogleUserInfo(token) {
  try {
    const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: 'Bearer ' + token },
    });
    if (res.ok) {
      state.auth.googleUser = await res.json();
      render();
    }
  } catch (err) {
    console.warn('Could not fetch Google user info', err);
  }
}

function signOutGoogle() {
  state.auth.googleToken = null;
  state.auth.googleUser = null;
  sessionStorage.removeItem('dishdeck:google_token');
  toast('Signed out');
  render();
}

/* ------------------------------- Toast --------------------------------- */

function toast(msg) {
  const existing = qs('.admin-toast');
  if (existing) existing.remove();

  const t = h('div.admin-toast', {}, [msg]);
  document.body.append(t);
  setTimeout(() => t.remove(), 2600);
}

/* ------------------------------- Exports ------------------------------- */

function exportJSON() {
  const json = toMenuJSON(state.data);
  download('menu.json', JSON.stringify(json, null, 2));
  toast('menu.json downloaded');
}

function csvText() {
  return objectsToCSV(state.data.items.map(itemToSheetRow), SHEET_COLUMNS);
}

function exportCSV() {
  download('menu.csv', csvText(), 'text/csv');
  toast('menu.csv downloaded');
}

async function copyCSV() {
  const ok = await copyText(csvText());
  toast(ok ? 'CSV copied to clipboard' : 'Clipboard access denied');
}

window.addEventListener('beforeunload', (e) => {
  if (state.dirty) {
    e.preventDefault();
    e.returnValue = '';
  }
});

document.addEventListener('DOMContentLoaded', main);
