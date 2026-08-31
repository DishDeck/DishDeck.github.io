/* Turns a brand config into CSS custom properties, fonts, title and favicon.
 * Every skin reads the same token names, so a new restaurant needs colours -
 * not CSS.
 */

import { h, qs, hash } from './util.js';
import { assetUrl } from './config.js';

const FONT_PRESETS = {
  futuristic: {
    display: "'Chakra Petch', 'Space Grotesk', system-ui, sans-serif",
    body: "'Inter', system-ui, -apple-system, sans-serif",
    google: ['Chakra+Petch:wght@500;600;700', 'Inter:wght@400;500;600'],
  },
  classic: {
    display: "'Cormorant Garamond', 'Georgia', serif",
    body: "'Inter', system-ui, -apple-system, sans-serif",
    google: ['Cormorant+Garamond:wght@500;600;700', 'Inter:wght@400;500;600'],
  },
};

/* ------------------------------- colour ------------------------------- */

function hexToRgb(hex) {
  let s = String(hex || '').trim().replace('#', '');
  if (s.length === 3) s = s.split('').map((c) => c + c).join('');
  if (!/^[0-9a-f]{6}$/i.test(s)) return null;
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
}

export function rgbaOf(hex, alpha) {
  const rgb = hexToRgb(hex) || [122, 240, 224];
  return 'rgba(' + rgb.join(',') + ',' + alpha + ')';
}

/** Perceived luminance 0..1 - used to pick readable text on the accent. */
export function luminance(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0.5;
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export const onAccent = (hex) => (luminance(hex) > 0.45 ? '#0b0d12' : '#ffffff');

/* -------------------------------- fonts ------------------------------- */

function injectGoogleFonts(families) {
  const wanted = (families || []).filter(Boolean);
  if (!wanted.length) return;
  const href = 'https://fonts.googleapis.com/css2?' +
    wanted.map((f) => 'family=' + f).join('&') + '&display=swap';
  const existing = qs('link[data-dishdeck-fonts]');
  if (existing && existing.getAttribute('href') === href) return;
  if (existing) existing.remove();
  document.head.append(h('link', { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: true }));
  document.head.append(h('link', { rel: 'stylesheet', href, 'data-dishdeck-fonts': '1' }));
}

/* ------------------------------- favicon ------------------------------ */

function faviconDataUri(brand) {
  const letter = (brand.name || '?').trim().charAt(0).toUpperCase();
  const accent = brand.theme.accent;
  const bg = brand.theme.skin === 'classic' ? '#12100c' : '#070b14';
  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">',
    '<rect width="64" height="64" rx="14" fill="' + bg + '"/>',
    '<circle cx="32" cy="32" r="21" fill="none" stroke="' + accent + '" stroke-width="3"/>',
    '<text x="32" y="41" text-anchor="middle" font-family="Georgia,serif" font-size="24" fill="' + accent + '">',
    letter, '</text></svg>',
  ].join('');
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

/** Word/monogram logo used when a restaurant has no logo file. */
export function logoMark(brand) {
  const words = String(brand.name || '').trim().split(/\s+/);
  const initials = (words[0] || '?').charAt(0) + (words[1] ? words[1].charAt(0) : '');
  return initials.toUpperCase();
}

/* ------------------------------- applying ----------------------------- */

export function resolveMode(mode) {
  if (mode === 'auto' || !mode) {
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
  return mode === 'light' ? 'light' : 'dark';
}

export function applyTheme(brand) {
  const t = brand.theme || {};
  const skin = t.skin === 'classic' ? 'classic' : 'futuristic';
  const mode = resolveMode(t.mode);
  const root = document.documentElement;

  root.dataset.skin = skin;
  root.dataset.mode = mode;
  root.dataset.texture = t.texture === false ? 'off' : 'on';

  const preset = FONT_PRESETS[skin];
  const fonts = t.fonts || {};
  const display = fonts.display || preset.display;
  const body = fonts.body || preset.body;
  injectGoogleFonts(fonts.google && fonts.google.length ? fonts.google : preset.google);

  const accent = t.accent || '#7af0e0';
  const accent2 = t.accent2 || accent;
  const vars = {
    '--accent': accent,
    '--accent-2': accent2,
    '--on-accent': onAccent(accent),
    '--accent-a08': rgbaOf(accent, 0.08),
    '--accent-a15': rgbaOf(accent, 0.15),
    '--accent-a30': rgbaOf(accent, 0.3),
    '--accent-a55': rgbaOf(accent, 0.55),
    '--accent2-a20': rgbaOf(accent2, 0.2),
    '--font-display': display,
    '--font-body': body,
    '--radius': t.radius || (skin === 'classic' ? '6px' : '18px'),
    '--brand-hue-seed': String(hash(brand.id) % 360),
  };
  if (t.surface) vars['--surface-override'] = t.surface;
  if (t.ink) vars['--ink-override'] = t.ink;
  Object.entries(vars).forEach(([k, v]) => root.style.setProperty(k, v));

  const heroImage = assetUrl(brand, t.heroImage);
  root.style.setProperty('--hero-image', heroImage ? 'url("' + heroImage + '")' : 'none');
  root.dataset.hero = heroImage ? 'photo' : 'plain';

  document.title = brand.name + (brand.tagline ? ' · ' + brand.tagline : ' · Menu');

  const iconHref = assetUrl(brand, (brand.logo && brand.logo.favicon) || '') || faviconDataUri(brand);
  let icon = qs('link[rel="icon"]');
  if (!icon) {
    icon = h('link', { rel: 'icon' });
    document.head.append(icon);
  }
  icon.setAttribute('href', iconHref);

  let meta = qs('meta[name="theme-color"]');
  if (!meta) {
    meta = h('meta', { name: 'theme-color' });
    document.head.append(meta);
  }
  meta.setAttribute('content', mode === 'light' ? '#f7f4ee' : (skin === 'classic' ? '#12100c' : '#070b14'));

  let desc = qs('meta[name="description"]');
  if (!desc) {
    desc = h('meta', { name: 'description' });
    document.head.append(desc);
  }
  desc.setAttribute('content', [brand.name, brand.tagline, brand.about].filter(Boolean).join(' — ').slice(0, 300));

  return { skin, mode };
}

/** Let the viewer flip dark/light without touching the restaurant's config. */
export function toggleMode(brand) {
  const current = document.documentElement.dataset.mode === 'light' ? 'light' : 'dark';
  const next = current === 'light' ? 'dark' : 'light';
  brand.theme.mode = next;
  applyTheme(brand);
  return next;
}

export function watchSystemMode(brand, onChange) {
  if (!window.matchMedia) return;
  const mq = window.matchMedia('(prefers-color-scheme: light)');
  const handler = () => {
    if ((brand.theme.mode || 'dark') === 'auto') {
      applyTheme(brand);
      if (onChange) onChange();
    }
  };
  if (mq.addEventListener) mq.addEventListener('change', handler);
  else if (mq.addListener) mq.addListener(handler);
}
