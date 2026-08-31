/* Opening hours: is the kitchen open right now, and what to say if not.
 *
 * brand.hours = { mon: [["11:30","15:00"], ["18:30","23:00"]], tue: "closed", ... }
 * An empty hours object means "always open" (the status pill is then hidden).
 */

import { today } from './util.js';

export const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
export const DAY_NAMES = {
  sun: 'Sunday', mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday',
  thu: 'Thursday', fri: 'Friday', sat: 'Saturday',
};

const toMinutes = (hhmm) => {
  const m = String(hhmm || '').match(/^(\d{1,2}):?(\d{2})?/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2] || 0);
};

const fmtTime = (hhmm) => {
  const mins = toMinutes(hhmm);
  if (mins === null) return String(hhmm || '');
  const d = new Date(2000, 0, 1, Math.floor(mins / 60) % 24, mins % 60);
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).replace(':00', '');
};

/** Normalise one day's config into an array of {open, close} minute pairs. */
export function windowsFor(hours, dayKey) {
  const raw = hours ? hours[dayKey] : undefined;
  if (raw === undefined || raw === null) return [];
  if (typeof raw === 'string') {
    if (/^closed$/i.test(raw.trim())) return [];
    // "11:30-15:00, 18:30-23:00"
    return raw.split(/[,;]/).map((part) => {
      const [a, b] = part.split(/[-–to]+/i).map((s) => s && s.trim());
      const open = toMinutes(a), close = toMinutes(b);
      return open === null || close === null ? null : { open, close, raw: [a, b] };
    }).filter(Boolean);
  }
  if (!Array.isArray(raw)) return [];
  const pairs = Array.isArray(raw[0]) ? raw : [raw];
  return pairs.map((pair) => {
    const open = toMinutes(pair[0]), close = toMinutes(pair[1]);
    return open === null || close === null ? null : { open, close, raw: [pair[0], pair[1]] };
  }).filter(Boolean);
}

export function formatDay(hours, dayKey) {
  const wins = windowsFor(hours, dayKey);
  if (!wins.length) return 'Closed';
  return wins.map((w) => fmtTime(w.raw[0]) + ' – ' + fmtTime(w.raw[1])).join(', ');
}

/**
 * Current status.
 * @returns {{open:boolean, reason:string, label:string, detail:string, nextOpen:string}}
 */
export function status(brand, data) {
  const hours = brand.hours || {};
  const labels = brand.labels || {};
  const configured = Object.keys(hours).length > 0;
  const now = new Date();
  const day = today(now);
  const minutes = now.getHours() * 60 + now.getMinutes();

  const manualClosed = data && data.settings && data.settings.closedToday;
  if (manualClosed) {
    return {
      open: false, reason: 'manual', configured: true,
      label: labels.closedToday || 'Closed today',
      detail: (data.settings.closedNote || '').trim(),
      nextOpen: nextOpening(hours, now, 1),
    };
  }

  if ((brand.closedDates || []).includes(day)) {
    return {
      open: false, reason: 'holiday', configured: true,
      label: labels.closedToday || 'Closed today',
      detail: 'Closed for the day.',
      nextOpen: nextOpening(hours, now, 1),
    };
  }

  if (!configured) {
    return { open: true, reason: 'always', configured: false, label: labels.openNow || 'Open now', detail: '', nextOpen: '' };
  }

  const wins = windowsFor(hours, DAY_KEYS[now.getDay()]);
  const current = wins.find((w) => minutes >= w.open && minutes < w.close);
  if (current) {
    const closingIn = current.close - minutes;
    return {
      open: true, reason: 'hours', configured: true,
      label: labels.openNow || 'Open now',
      detail: closingIn <= 60 ? 'Closing in ' + closingIn + ' min' : 'Until ' + fmtTime(current.raw[1]),
      nextOpen: '',
    };
  }

  const later = wins.find((w) => w.open > minutes);
  return {
    open: false, reason: 'hours', configured: true,
    label: labels.closedNow || 'Closed',
    detail: later ? 'Opens at ' + fmtTime(later.raw[0]) : '',
    nextOpen: later ? 'Today ' + fmtTime(later.raw[0]) : nextOpening(hours, now, 1),
  };
}

function nextOpening(hours, from, startOffset) {
  for (let i = startOffset; i <= 7; i++) {
    const d = new Date(from.getTime() + i * 86400000);
    const wins = windowsFor(hours, DAY_KEYS[d.getDay()]);
    if (wins.length) {
      const dayLabel = i === 1 ? 'Tomorrow' : DAY_NAMES[DAY_KEYS[d.getDay()]];
      return dayLabel + ' ' + fmtTime(wins[0].raw[0]);
    }
  }
  return '';
}

/** Rows for the footer hours table, week starting Monday, today flagged. */
export function weekRows(brand) {
  const order = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  const todayKey = DAY_KEYS[new Date().getDay()];
  return order.map((k) => ({
    key: k,
    name: DAY_NAMES[k],
    short: DAY_NAMES[k].slice(0, 3),
    text: formatDay(brand.hours, k),
    isToday: k === todayKey,
  }));
}
