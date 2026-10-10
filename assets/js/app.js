/* DishDeck app shell: boots the tenant, renders the page, keeps the menu
 * live via polling, and wires up search / filters / the dish sheet.
 */

import { h, qs, qsa, clear, debounce, log, relTime, placeholderImage, store, params, makeMoney, qrImageUrl } from './util.js';
import { bootConfig, assetUrl, menuLink } from './config.js';
import { loadMenu } from './data.js';
import { applyTheme, toggleMode, watchSystemMode, logoMark } from './theme.js';
import * as hoursLib from './hours.js';

// Safe default so nothing throws if a render is ever triggered before boot;
// replaced with the tenant's real currency as soon as its brand config loads.
window.__ddMoney = makeMoney({ code: 'INR', symbol: '₹' });

const state = {
  brand: null,
  data: null,
  activeCategory: 'all',
  query: '',
  activeTag: null,
  refreshTimer: null,
  videoObserver: null,
};

const root = () => qs('#app');

/* ---------------------------- video previews ---------------------------- */

// A muted autoplay preview is a fair trade for a visitor on wifi with data
// to spare, and a battery/bandwidth tax for anyone who isn't - so it's opt
// out, not opt in: skip it under prefers-reduced-motion or an explicit
// "Data Saver" connection, where a still poster frame is the better default.
const wantsAutoplayPreview = () => {
  const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const saveData = navigator.connection && navigator.connection.saveData;
  return !reduced && !saveData;
};

/** <source> tags for a list of clip URLs, typed from their file extension. */
function videoSources(urls) {
  const typeOf = (u) => (/\.webm(\?|$)/i.test(u) ? 'video/webm' : /\.mov(\?|$)/i.test(u) ? 'video/quicktime' : 'video/mp4');
  return urls.map((u) => h('source', { src: u, type: typeOf(u) }));
}

/** A grid-card video preview: no network fetch until it actually scrolls
 * into view, muted+looping while visible, paused (not unloaded) once it
 * scrolls back out - so flicking through a long menu doesn't quietly burn
 * through someone's data plan on clips they never really looked at. */
function lazyPreviewVideo(it) {
  const video = h('video.card-video', {
    loop: true, playsinline: true, 'webkit-playsinline': true,
    preload: 'none', poster: it.image || placeholderImage(it.name),
  }, videoSources(it.video));
  // Setting the "muted" attribute doesn't reliably mute an element created
  // via document.createElement (browsers only honour it as the *initial*
  // state during HTML parsing) - the muted property must be set directly,
  // or autoplay is silently blocked by the browser's audio-with-autoplay policy.
  video.muted = true;
  video.defaultMuted = true;
  if (!state.videoObserver) {
    state.videoObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        const el = entry.target;
        if (entry.isIntersecting) {
          if (!el.dataset.loaded) { el.load(); el.dataset.loaded = '1'; }
          el.play().catch(() => {}); // autoplay can be blocked; the poster still shows
        } else {
          el.pause();
        }
      });
    }, { rootMargin: '80px 0px', threshold: 0.35 });
  }
  state.videoObserver.observe(video);
  return video;
}

/* --------------------------------- boot -------------------------------- */

async function main() {
  const app = root();
  clear(app);
  app.append(renderShell());

  let ctx;
  try {
    ctx = await bootConfig();
  } catch (err) {
    renderFatal(err, 'Could not load restaurant configuration (config/tenants.json).');
    return;
  }
  state.brand = ctx.brand;
  window.__ddMoney = makeMoney(state.brand.currency);
  applyTheme(state.brand);
  watchSystemMode(state.brand, () => applyTheme(state.brand));
  paintChrome();
  wireChrome();
  await refresh({ first: true });
  scheduleAutoRefresh();
  window.addEventListener('hashchange', () => renderMenu());
}

function renderFatal(err, hint) {
  root().append(
    h('div.state', { style: 'max-width:640px;margin:60px auto' }, [
      h('div', { style: 'font-size:2.4rem' }, '\u{1F37D}️'),
      h('h2.state-title', {}, 'DishDeck could not start'),
      h('p.state-text', {}, hint),
      h('pre.state-detail', {}, String(err && err.message || err)),
    ])
  );
  console.error(err);
}

/* -------------------------------- shell -------------------------------- */

function renderShell() {
  return h('div.app-view', {}, [
    h('a.skip-link', { href: '#menu' }, 'Skip to menu'),
    h('header.topbar', { id: 'topbar' }, [
      h('div.wrap.topbar-in', {}, [
        h('a.brand', { href: '#', id: 'brandLink' }),
        h('div.topbar-actions', { id: 'topbarActions' }),
      ]),
    ]),
    h('div', { id: 'statusBar' }),
    h('main', {}, [
      h('section.hero.wrap', { id: 'hero' }),
      h('nav.sticky-nav', { id: 'stickyNav' }, [h('div.wrap.nav-row', { id: 'navRow' })]),
      h('section.menu.wrap', { id: 'menu' }),
    ]),
    h('footer.footer', { id: 'footer' }),
    h('div.toast', { id: 'toast' }),
    h('div.board-page', { id: 'boardPage' }),
    h('div.quickbar', { id: 'quickbar', 'data-empty': '1' }),
  ]);
}

/* -------------------------------- chrome -------------------------------- */

function paintChrome() {
  const b = state.brand;
  const link = qs('#brandLink');
  clear(link);
  const logoSrc = assetUrl(b, b.logo && b.logo.src);
  link.append(
    logoSrc
      ? h('img.brand-logo', { src: logoSrc, alt: (b.logo && b.logo.alt) || b.name + ' logo' })
      : h('span.brand-logo', {}, (b.logo && b.logo.text) || logoMark(b)),
    h('span', {}, [
      h('span.brand-name', {}, b.name),
      b.tagline ? h('span.brand-sub', {}, b.tagline) : null,
    ])
  );

  const actions = qs('#topbarActions');
  clear(actions);
  if (b.features.callToOrder && b.contact.phone) {
    actions.append(h('a.btn.hide-sm', { href: 'tel:' + b.contact.phone }, [icon('phone'), 'Call']));
  }
  if (b.contact.bookUrl) {
    actions.append(h('a.btn.btn-primary', { href: b.contact.bookUrl, target: '_blank', rel: 'noopener' }, 'Book a table'));
  }
  actions.append(h('button.btn.btn-icon', {
    id: 'modeToggle', 'aria-label': 'Toggle dark and light mode', title: 'Toggle theme',
  }, modeGlyph()));

  renderQuickbar();
}

/** Thumb-reachable Call/WhatsApp/Book bar, shown on phone widths only. */
function renderQuickbar() {
  const bar = qs('#quickbar');
  if (!bar) return;
  clear(bar);
  const b = state.brand;
  const c = b.contact;
  const buttons = [];
  if (b.features.callToOrder && c.phone) {
    buttons.push(h('a.btn.btn-primary', { href: 'tel:' + c.phone }, [icon('phone'), 'Call']));
  }
  if (c.whatsapp) {
    buttons.push(h('a.btn', { href: 'https://wa.me/' + c.whatsapp.replace(/[^0-9]/g, ''), target: '_blank', rel: 'noopener' }, ['\u{1F4AC}', 'WhatsApp']));
  }
  if (c.bookUrl) {
    buttons.push(h('a.btn', { href: c.bookUrl, target: '_blank', rel: 'noopener' }, 'Book'));
  }
  bar.append(...buttons);
  bar.dataset.empty = buttons.length ? '0' : '1';
}

function modeGlyph() {
  return document.documentElement.dataset.mode === 'light' ? '☀️' : '\u{1F319}';
}

function icon(name) {
  const map = { phone: '\u{1F4DE}', pin: '\u{1F4CD}', clock: '⏰', warn: '⚠️', wifi: '\u{1F4E1}' };
  return h('span', { 'aria-hidden': 'true' }, map[name] || '');
}

function wireChrome() {
  window.addEventListener('scroll', () => {
    qs('#topbar').dataset.stuck = window.scrollY > 4 ? '1' : '0';
  }, { passive: true });

  qs('#topbarActions').addEventListener('click', (e) => {
    if (e.target.closest('#modeToggle')) {
      toggleMode(state.brand);
      qs('#modeToggle').textContent = modeGlyph();
      toast(document.documentElement.dataset.mode === 'light' ? 'Light mode' : 'Dark mode');
    }
  });
}

/* -------------------------------- refresh ------------------------------- */

async function refresh({ first = false } = {}) {
  try {
    const data = await loadMenu(state.brand);
    const changed = !state.data || data.updatedAt !== state.data.updatedAt;
    state.data = data;
    renderStatusBar();
    renderHero();
    renderNav();
    renderMenu();
    renderFooter();
    renderBoardPage();
    if (!first && changed) toast('Menu updated · ' + relTime(data.updatedAt));
  } catch (err) {
    log('refresh failed', err);
    if (first) {
      renderFatal(err, 'Could not load the menu for ' + state.brand.name + '.');
    } else {
      toast('Could not refresh the menu – showing last known version', 4200);
    }
  }
}

function scheduleAutoRefresh() {
  clearInterval(state.refreshTimer);
  const secs = Number(state.brand.features.autoRefreshSeconds) || 0;
  if (secs <= 0) return;
  state.refreshTimer = setInterval(() => refresh(), Math.max(20, secs) * 1000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refresh();
  });
}

/* ------------------------------ status bar ------------------------------ */

function renderStatusBar() {
  const bar = qs('#statusBar');
  clear(bar);
  const b = state.brand, d = state.data;
  const st = hoursLib.status(b, d);

  if (d.stale) {
    bar.append(h('div.stale-bar', {}, [
      icon('wifi'),
      h('span', {}, 'Showing a cached menu from ' + relTime(d.staleSince) + ' – live source unreachable.'),
    ]));
  }
  if (!st.open && st.reason !== 'always') {
    bar.append(h('div.stale-bar.closed-bar', {}, [
      icon('clock'),
      h('span', {}, (st.detail ? b.name + ' is closed — ' + st.detail : b.name + ' is currently closed.') +
        (st.nextOpen ? ' · Reopens ' + st.nextOpen : '')),
    ]));
  }
}

/* --------------------------------- hero ---------------------------------- */

function renderHero() {
  const hero = qs('#hero');
  clear(hero);
  const b = state.brand, d = state.data;
  const st = hoursLib.status(b, d);

  hero.append(h('div.hero-grid', {}, [
    h('div.panel.hero-card', {}, [
      h('span.rim'),
      h('span.eyebrow', {}, [icon('pin'), b.contact.address ? b.contact.address : (b.tagline || 'Welcome')]),
      h('h1.hero-title', {}, b.name),
      b.about ? h('p.hero-tagline', {}, b.about) : null,
      h('div.hero-meta', {}, [
        h('span.pill', { class: st.open ? 'is-open' : 'is-shut' }, [h('span.dot'), st.label + (st.detail ? ' · ' + st.detail : '')]),
        params.get('table') ? h('span.pill', { style: 'border-color:var(--accent);color:var(--accent);font-weight:600' }, ['\u{1F37D} Table ' + params.get('table')]) : null,
        b.contact.phone ? h('a.pill', { href: 'tel:' + b.contact.phone }, [icon('phone'), b.contact.phone]) : null,
      ]),
      h('div.hero-cta', {}, [
        h('a.btn.btn-primary', { href: '#menu' }, 'View the menu'),
        b.features.specials && d.specials.length ? h('a.btn', { href: '#specials' }, [icon('warn'), (b.labels.specialBadge || 'Today') + '’s specials']) : null,
      ]),
    ]),
    b.features.specials ? renderSpecialsCard() : h('div'),
  ]));
}

function renderSpecialsCard() {
  const b = state.brand, d = state.data;
  const items = d.specials;
  const card = h('div.panel.board-card', { id: 'specials' });
  if (items.length) card.append(h('span.ribbon', {}, b.labels.specialBadge || 'Today'));
  card.append(
    h('div.board-head', {}, [
      h('h2.board-title', {}, b.labels.specialsTitle || "Today's Board"),
      h('span.board-date', {}, new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })),
    ]),
    h('p.state-text', { style: 'text-align:left' }, d.settings.specialsNote || b.labels.specialsNote || ''),
    items.length
      ? h('ul.board-list', {}, items.map((it) => h('li', {}, [
          h('button.board-item', { onclick: () => openDish(it) }, [
            h('img.board-thumb', {
              src: it.image || placeholderImage(it.name), alt: '', loading: 'lazy',
              onerror: (e) => { if (!e.target.dataset.failed) { e.target.dataset.failed = '1'; e.target.src = placeholderImage(it.name); } },
            }),
            h('span', {}, [
              h('span.board-name', {}, it.name),
              it.desc ? h('span.board-note', {}, truncate(it.desc, 60)) : null,
            ]),
            priceTag(it, b, true),
          ]),
        ])))
      : h('p.board-empty', {}, 'No specials posted for today — check back soon.'),
    b.features.board ? h('a.btn.hide-sm', { href: '/board.html?r=' + b.id }, 'Open printable board') : null
  );
  return card;
}

const truncate = (s, n) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);

/* --------------------------------- nav ----------------------------------- */

function renderNav() {
  const nav = qs('#navRow');
  clear(nav);
  const b = state.brand, d = state.data;
  const cats = d.categories;

  const scroller = h('div.cat-scroll', {}, [
    catChip('all', 'All', d.items.length),
    ...cats.map((c) => catChip(c.id, c.name, countInCategory(c.id))),
  ]);
  nav.append(scroller);

  if (b.features.search) {
    const input = h('input', {
      type: 'search', placeholder: 'Search dishes…', 'aria-label': 'Search dishes',
      value: state.query, oninput: debounce((e) => { state.query = e.target.value; renderMenu(); }, 160),
    });
    nav.append(h('div.search', {}, [h('span', { 'aria-hidden': 'true' }, '\u{1F50D}'), input]));
  }
}

function countInCategory(catId) {
  return state.data.items.filter((it) => it.category === catId && it.status !== 'off').length
    || state.data.items.filter((it) => it.category === catId).length;
}

function catChip(id, name, count) {
  return h('button.chip', {
    'aria-current': state.activeCategory === id ? 'true' : 'false',
    onclick: () => { state.activeCategory = id; renderMenu(); document.querySelector('#menu').scrollIntoView({ block: 'start' }); },
  }, [name, h('span.chip-count', {}, count)]);
}

/* --------------------------------- menu ----------------------------------- */

/** Matches if every typed word appears somewhere in the dish's text, in any
 * order - so "chicken spicy" and "spicy chicken" both find "Spicy Miso
 * Chicken", not just an exact phrase match. */
function matchesQuery(it, q) {
  const words = String(q || '').toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = (it.name + ' ' + it.desc + ' ' + it.category + ' ' + it.tags.join(' ')).toLowerCase();
  return words.every((w) => hay.includes(w));
}

function renderMenu() {
  const menu = qs('#menu');
  clear(menu);
  // renderMenu rebuilds every card from scratch, so any video observer from
  // the previous pass would otherwise keep watching now-detached elements.
  if (state.videoObserver) { state.videoObserver.disconnect(); state.videoObserver = null; }
  const b = state.brand, d = state.data;
  const showSoldOut = b.features.showSoldOut !== false;
  const searching = state.query.trim() !== '';

  // A search looks across the whole menu regardless of the selected
  // category chip - a category filter only makes sense when not searching.
  const visibleCats = searching
    ? d.categories
    : d.categories.filter((c) => state.activeCategory === 'all' || state.activeCategory === c.id);
  let anyRendered = false;

  visibleCats.forEach((cat) => {
    let items = d.items.filter((it) => it.category === cat.id);
    if (!showSoldOut) items = items.filter((it) => it.status !== 'soldout');
    items = items.filter((it) => it.status !== 'off');
    items = items.filter((it) => matchesQuery(it, state.query));
    if (!items.length) return;
    anyRendered = true;

    menu.append(h('section.section', { id: 'cat-' + cat.id }, [
      h('div.section-head', {}, [
        h('h2.section-title', {}, cat.name),
        cat.note ? h('span.section-note', {}, cat.note) : null,
        h('span.section-count', {}, items.length + (items.length === 1 ? ' dish' : ' dishes')),
      ]),
      h('div.rule.section-rule', {}, [h('span.rule-mark', {}, '✧')]),
      h('div.grid', {}, items.map((it) => dishCard(it))),
    ]));
  });

  if (!anyRendered) {
    menu.append(h('div.state', {}, [
      h('div', { style: 'font-size:2rem' }, '\u{1F37D}️'),
      h('h3.state-title', {}, state.query ? 'No dishes match “' + state.query + '”' : 'Nothing here right now'),
      h('p.state-text', {}, state.query ? 'Try a different search term or clear the filter.' : 'This section has no dishes on today’s menu.'),
      state.query ? h('button.btn', { onclick: () => { state.query = ''; qs('.search input') && (qs('.search input').value = ''); renderMenu(); } }, 'Clear search') : null,
    ]));
  }
}

function priceTag(it, brand, compact) {
  const money = window.__ddMoney;
  if (it.variants && it.variants.length) {
    return h('span.price-variants', {}, it.variants.map((v) => v.label + ' ' + money(v.price)).join(' · '));
  }
  const hasSpecial = it.specialPrice !== null && it.specialPrice !== undefined;
  return h('span.price', {}, [
    hasSpecial ? h('span.price-was', {}, money(it.price)) : null,
    h('span', { class: hasSpecial ? 'price-now' : '' }, money(hasSpecial ? it.specialPrice : it.price)),
  ]);
}

function dishCard(it) {
  const b = state.brand;
  const img = it.image || placeholderImage(it.name);
  const hasVideo = it.video && it.video.length && it.status !== 'off';
  const showVideo = hasVideo && wantsAutoplayPreview();
  return h('button.card', { 'data-status': it.status, onclick: () => openDish(it) }, [
    h('div.card-media', {}, [
      showVideo ? lazyPreviewVideo(it) : h('img', {
        src: img, alt: it.name, loading: 'lazy',
        onerror: (e) => { if (!e.target.dataset.failed) { e.target.dataset.failed = '1'; e.target.src = placeholderImage(it.name); } },
      }),
      h('div.card-badges', {}, [
        it.special ? h('span.badge.badge-special', {}, b.labels.specialBadge || 'Today') : null,
        it.status === 'soldout' ? h('span.badge.badge-dim', {}, b.labels.soldOut || 'Sold out') : null,
        hasVideo ? h('span.badge.badge-dim', { title: 'Video preview' }, '▶ Clip') : null,
      ]),
      it.status === 'soldout' ? h('span.stamp', {}, b.labels.soldOut || 'Sold Out') : null,
    ]),
    h('div.card-body', {}, [
      h('div.card-title-row', {}, [
        h('h3.card-name', {}, it.name),
        priceTag(it, b),
      ]),
      it.desc ? h('p.card-desc', {}, it.desc) : null,
      (it.tags.length || it.spice) ? h('div.card-tags', {}, [
        it.spice ? h('span.spice', {}, '\u{1F336}️'.repeat(Math.min(3, it.spice))) : null,
        ...it.tags.slice(0, 4).map((t) => h('span.tag', { 'data-tag': t }, t)),
      ]) : null,
    ]),
  ]);
}

/* -------------------------------- dish sheet ------------------------------ */

function openDish(it) {
  const b = state.brand, money = window.__ddMoney;
  let dlg = qs('#dishDialog');
  if (!dlg) {
    dlg = h('dialog.sheet', { id: 'dishDialog' });
    document.body.append(dlg);
    dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
    // Stop any playing clip the instant the sheet closes, rather than
    // leaving it - and its audio - running behind a dialog nobody can see.
    dlg.addEventListener('close', () => { const v = dlg.querySelector('video'); if (v) v.pause(); });
  }
  clear(dlg);
  const img = it.image || placeholderImage(it.name);
  const hasVideo = it.video && it.video.length;
  dlg.append(
    h('button.sheet-close', { onclick: () => dlg.close(), 'aria-label': 'Close' }, '✕'),
    h('div.sheet-media', {}, [
      hasVideo
        ? h('video', { controls: true, playsinline: true, preload: 'metadata', poster: img }, videoSources(it.video))
        : h('img', {
            src: img, alt: it.name,
            onerror: (e) => { if (!e.target.dataset.failed) { e.target.dataset.failed = '1'; e.target.src = placeholderImage(it.name); } },
          }),
    ]),
    h('div.sheet-body', {}, [
      it.special ? h('span.badge.badge-special', { style: 'align-self:flex-start' }, b.labels.specialBadge || 'Today') : null,
      h('h2.sheet-title', {}, it.name),
      it.desc ? h('p.state-text', { style: 'text-align:left;max-width:none' }, it.desc) : null,
      (it.tags.length || it.spice) ? h('div.card-tags', {}, [
        it.spice ? h('span.spice', {}, '\u{1F336}️'.repeat(Math.min(3, it.spice))) : null,
        ...it.tags.map((t) => h('span.tag', { 'data-tag': t }, t)),
      ]) : null,
      h('dl.sheet-rows', {}, [
        it.variants && it.variants.length
          ? h('div.sheet-row', {}, [h('dt', {}, 'Options'), h('dd', {}, it.variants.map((v) => v.label + ' ' + money(v.price)).join(' · '))])
          : h('div.sheet-row', {}, [h('dt', {}, 'Price'), h('dd', {}, priceInline(it, money))]),
        it.status === 'soldout' ? h('div.sheet-row', {}, [h('dt', {}, 'Availability'), h('dd', {}, b.labels.soldOut || 'Sold out')]) : null,
        it.note ? h('div.sheet-row', {}, [h('dt', {}, 'Note'), h('dd', {}, it.note)]) : null,
      ]),
      b.contact.phone ? h('a.btn.btn-primary', { href: 'tel:' + b.contact.phone }, [icon('phone'), b.labels.orderCta || 'Call to order']) : null,
    ])
  );
  dlg.showModal();
}

function priceInline(it, money) {
  if (it.specialPrice !== null && it.specialPrice !== undefined) return money(it.price) + '  →  ' + money(it.specialPrice);
  return money(it.price);
}

/* -------------------------------- footer ---------------------------------- */

function renderFooter() {
  const footer = qs('#footer');
  clear(footer);
  const b = state.brand;
  const rows = hoursLib.weekRows(b);

  footer.append(h('div.wrap', {}, [
    h('div.footer-grid', {}, [
      h('div', {}, [
        h('h3', {}, 'Hours'),
        Object.keys(b.hours || {}).length
          ? h('table.hours-table', {}, rows.map((r) => h('tr', { 'data-today': r.isToday ? '1' : '0' }, [
              h('td', {}, r.short),
              h('td', {}, r.text),
            ])))
          : h('p.footer-links', {}, 'Open every day.'),
      ]),
      h('div', {}, [
        h('h3', {}, 'Contact'),
        h('div.footer-links', {}, [
          b.contact.address ? h('span', { title: 'Address' }, b.contact.address) : null,
          b.contact.phone ? h('a', { href: 'tel:' + b.contact.phone, title: 'Call us' }, b.contact.phone) : null,
          b.contact.email ? h('a', { href: 'mailto:' + b.contact.email, title: 'Email us' }, b.contact.email) : null,
          b.contact.maps ? h('a', { href: b.contact.maps, target: '_blank', rel: 'noopener', title: 'Open in maps' }, 'Get directions') : null,
        ]),
      ]),
      h('div', {}, [
        h('h3', {}, 'Follow'),
        h('div.footer-links', {}, socialLinks(b)),
      ]),
    ]),
    h('div.footer-bottom', {}, [
      h('span', {}, '© ' + new Date().getFullYear() + ' ' + b.name),
      h('span.spacer'),
      h('span', {}, 'Menu synced ' + relTime(state.data.updatedAt)),
      h('span', {}, 'Powered by DishDeck'),
    ]),
  ]));
}

function socialLinks(b) {
  const s = b.social || {};
  const map = { instagram: 'Instagram', facebook: 'Facebook', x: 'X / Twitter', youtube: 'YouTube' };
  const links = Object.entries(map).filter(([k]) => s[k]).map(([k, label]) => h('a', { href: s[k], target: '_blank', rel: 'noopener' }, label));
  return links.length ? links : [h('span', {}, '—')];
}

/* --------------------------- printable board page -------------------------- */

function renderBoardPage() {
  const page = qs('#boardPage');
  if (!page) return;
  clear(page);
  if (document.body.dataset.view !== 'board') return;
  const b = state.brand, d = state.data;

  // Query-string form, not the clean /<id>/ URL: it works even for a
  // restaurant that hasn't had its clean-URL folder set up yet.
  const back = qs('#backToMenu');
  if (back) back.setAttribute('href', '/index.html?r=' + b.id);
  page.append(h('div.sheet-paper', {}, [
    h('div.paper-head', {}, [
      h('span.eyebrow', {}, b.name),
      h('h1.paper-title', {}, b.labels.specialsTitle || "Today's Board"),
      h('p.paper-sub', {}, new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })),
    ]),
    h('ul.paper-list', {}, (d.specials.length ? d.specials : d.items.slice(0, 10)).map((it) => h('li.paper-item', { class: it.status === 'soldout' ? 'paper-out' : '' }, [
      h('span.paper-name', {}, it.name),
      h('span.dots'),
      h('span.paper-price', {}, it.status === 'soldout' ? (b.labels.soldOut || 'Sold out') : window.__ddMoney(it.specialPrice ?? it.price)),
    ]))),
    h('div.paper-foot', {}, [
      h('span', {}, [
        h('span', { style: 'display:block' }, b.contact.phone ? 'Call ' + b.contact.phone + ' to order' : (b.tagline || '')),
        h('span', { style: 'display:block' }, 'Updated ' + relTime(d.updatedAt)),
      ]),
      h('div.qr', {}, [h('img', { src: qrImageUrl(menuLink(b), 220), alt: 'QR code linking to the ' + b.name + ' menu' })]),
    ]),
  ]));
}

/* ---------------------------------- toast ---------------------------------- */

let toastTimer;
function toast(msg, ms = 2600) {
  const el = qs('#toast');
  el.textContent = msg;
  el.dataset.show = '1';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.dataset.show = '0'; }, ms);
}

/* ---------------------------------- boot ------------------------------------ */

document.addEventListener('DOMContentLoaded', main);
