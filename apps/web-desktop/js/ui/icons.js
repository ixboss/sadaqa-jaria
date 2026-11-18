// ============================================================================
// icons.js — Unified 1.5px-stroke SVG icon registry (unslop §3 Icons: zero
// emojis in UI chrome, consistent 16–20px grid, currentColor inheritance).
// ============================================================================

const PATHS = {
  // Primary tabs
  today: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>',
  mushaf: '<path d="M2 5.5A2.5 2.5 0 0 1 4.5 3H11v17H4.5A2.5 2.5 0 0 0 2 22V5.5Z"/><path d="M22 5.5A2.5 2.5 0 0 0 19.5 3H13v17h6.5a2.5 2.5 0 0 1 2.5 2V5.5Z"/>',
  athkar: '<path d="M12 3c-2.2 3.2-5 5.4-5 9a5 5 0 0 0 10 0c0-3.6-2.8-5.8-5-9Z"/><path d="M12 12v5"/><path d="M8 20h8"/>',
  tools: '<rect x="3" y="3" width="8" height="8" rx="2"/><rect x="13" y="3" width="8" height="8" rx="2"/><rect x="3" y="13" width="8" height="8" rx="2"/><rect x="13" y="13" width="8" height="8" rx="2"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.8-3.8"/>',

  // Navigation & actions
  'arrow-right': '<path d="M5 12h14M13 6l6 6-6 6"/>',
  'chevron-right': '<path d="m9 6 6 6-6 6"/>',
  'chevron-left': '<path d="m15 6-6 6 6 6"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  bookmark: '<path d="M6 4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18l-6-4-6 4V4Z"/>',
  'bookmark-filled': '<path fill="currentColor" stroke="currentColor" d="M6 4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18l-6-4-6 4V4Z"/>',
  headphones: '<path d="M4 14v-2a8 8 0 0 1 16 0v2"/><rect x="3" y="14" width="4" height="6" rx="1.5"/><rect x="17" y="14" width="4" height="6" rx="1.5"/>',
  moon: '<path d="M20.5 14.5A8.5 8.5 0 1 1 9.5 3.5a6.8 6.8 0 0 0 11 11Z"/>',
  close: '<path d="M18 6 6 18M6 6l12 12"/>',
  history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l3 2"/>',
  type: '<path d="M4 7V5h16v2M9 19h6M12 5v14"/>',
  play: '<polygon fill="currentColor" stroke="none" points="7 5 19 12 7 19 7 5"/>',
  pause: '<rect fill="currentColor" stroke="none" x="6" y="5" width="4" height="14" rx="1"/><rect fill="currentColor" stroke="none" x="14" y="5" width="4" height="14" rx="1"/>',
  stop: '<rect fill="currentColor" stroke="none" x="6" y="6" width="12" height="12" rx="1.5"/>',

  // Prayer / Time / Sanctuary
  sunrise: '<path d="M12 3v4M5.6 9.6l2.1 2.1M18.4 9.6l-2.1 2.1M3 17h18M7 17a5 5 0 0 1 10 0M8 21h8"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>',
  dhuhr: '<circle cx="12" cy="11" r="4.5"/><path d="M12 2v2.5M4.5 11H2M22 11h-2.5M6.3 5.3 4.6 3.6M17.7 5.3l1.7-1.7M5 19h14"/>',
  sunset: '<path d="M12 9V5M5.6 9.6l2.1 2.1M18.4 9.6l-2.1 2.1M3 17h18M7 17a5 5 0 0 1 10 0M9 21h6"/>',
  maghrib: '<path d="M3 18h18M6 18a6 6 0 0 1 12 0"/><path d="M17 7.5a3.5 3.5 0 0 1-4.5 3.3 3.5 3.5 0 0 0 4.5-3.3Z"/>',
  mosque: '<path d="M12 3c-2.5 2-4 4-4 6.5V12h8V9.5C16 7 14.5 5 12 3Z"/><path d="M4 21v-7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v7"/><path d="M10 21v-4a2 2 0 0 1 4 0v4"/><path d="M3 21h18"/>',

  // Tools & Actions
  location: '<path d="M12 21s6-5.3 6-10.5a6 6 0 1 0-12 0C6 15.7 12 21 12 21Z"/><circle cx="12" cy="10.5" r="2.2"/>',
  tasbih: '<circle cx="12" cy="12" r="8" stroke-dasharray="1 3.5"/><circle cx="12" cy="4" r="1.5" fill="currentColor" stroke="none"/>',
  qibla: '<circle cx="12" cy="12" r="9"/><polygon points="15.5 8.5 13.5 13.5 8.5 15.5 10.5 10.5 15.5 8.5"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>',
  scale: '<path d="M12 4v16M6 20h12M5 7h14"/><path d="m5 7-2.5 6a3 3 0 0 0 5 0L5 7Z"/><path d="m19 7-2.5 6a3 3 0 0 0 5 0L19 7Z"/>',
  backup: '<path d="M12 3v12M7 10l5 5 5-5"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>',
  alert: '<circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/>',
  check: '<path d="m5 12 4.5 4.5L19 7"/>',
  flame: '<path d="M12 2c1 4-3 6-3 10a5 5 0 0 0 10 0c0-3-2-5-3-7-1 2-3 2-4-3Z"/>',
};

export function iconSvg(name, size = 18, cls = '') {
  const body = PATHS[name] ?? PATHS.mushaf;
  const clsAttr = cls ? ` class="${cls}"` : '';
  return `<svg${clsAttr} width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

export function prayerIconName(prayer) {
  return {
    fajr: 'sunrise',
    sunrise: 'sun',
    dhuhr: 'dhuhr',
    asr: 'sunset',
    maghrib: 'maghrib',
    isha: 'moon',
  }[prayer] ?? 'mosque';
}

export function smartCardIconName(kind) {
  return {
    kahf: 'mushaf',
    after_prayer: 'tasbih',
    qiyam: 'moon',
    morning: 'sunrise',
    evening: 'sunset',
    next_prayer: 'mosque',
  }[kind] ?? 'mosque';
}

export function athkarWindowIconName(win) {
  return {
    fajr: 'sunrise',
    asr: 'sunset',
    night: 'moon',
    duha: 'sun',
    after_prayer: 'mosque',
  }[win] ?? 'athkar';
}
