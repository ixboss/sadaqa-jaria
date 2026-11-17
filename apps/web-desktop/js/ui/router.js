// ============================================================================
// router.js — hash router + SCREEN_TAB registry (v1 e2e contract carried over:
// `#/mushaf/page/242`, `#/adhkar/morning`, `#/tools/qibla`, `#/search`, …)
// Tabs: اليوم · المصحف · الأذكار · الأدوات + trailing بحث pill (Pillar A).
// ============================================================================

/** screen id → owning tab. Nav highlights the tab, deep links stay stable. */
export const SCREEN_TAB = Object.freeze({
  today: 'today',
  'mushaf-page': 'mushaf',
  'mushaf-surah-index': 'mushaf',
  'mushaf-khatmah': 'mushaf',
  'mushaf-audio': 'mushaf',
  'adhkar-cat': 'athkar',
  'adhkar-screen': 'athkar',
  'tasbih-screen': 'athkar',
  'tools-qibla': 'tools',
  'tools-hijri': 'tools',
  'tools-zakat': 'tools',
  'tools-qiyam': 'tools',
  'tools-backup': 'tools',
  'tools-settings': 'tools',
  'tools-phase4': 'tools',
});

const ROUTES = {
  'mushaf-page': (m) => m[1] ? { page: Number(m[1]) } : {},
};

let current = { screen: null, args: {} };
const listeners = new Set();

export function onNavigate(fn) { listeners.add(fn); return () => listeners.delete(fn); }

export function currentRoute() { return current; }

export function navigate(screen, args = {}) {
  const qs = new URLSearchParams(
    Object.entries(args).filter(([, v]) => v !== undefined && v !== null && v !== ''),
  ).toString();
  location.hash = `#/${screen}${qs ? '?' + qs : ''}`;
}

export function replace(screen, args = {}) {
  const url = `#/${screen}${Object.keys(args).length ? '?' + new URLSearchParams(entriesOf(args)) : ''}`;
  history.replaceState(null, '', url);
  parse();
  emit();
}

function entriesOf(args) {
  return Object.entries(args).filter(([, v]) => v !== undefined && v !== null && v !== '');
}

function parse() {
  const h = location.hash.replace(/^#\/?/, '');
  const [pathPart, queryPart] = h.split('?');
  const [screen, ...rest] = pathPart.split('/');
  const args = {};
  if (rest.length > 0) args.id = rest.join('/');            // #/mushaf/page/242 → screen 'mushaf', id 'page/242'
  for (const [k, v] of new URLSearchParams(queryPart ?? '')) args[k] = v;
  if (screen === 'mushaf' && args.id?.startsWith('page/')) {
    current = { screen: 'mushaf-page', args: { page: Number(args.id.split('/')[1]) || 1 } };
    return;
  }
  if (screen === 'mushaf' && args.id && ['khatmah', 'audio', 'surah-index'].includes(args.id.split('/')[0])) {
    current = { screen: `mushaf-${args.id.split('/')[0]}`, args: {} };
    return;
  }
  if (screen === 'adhkar' && args.id) {
    current = { screen: 'adhkar-cat', args: { id: args.id } };
    return;
  }
  current = { screen: screen || 'today', args };
}

function emit() {
  for (const fn of listeners) fn(current);
}

export function bootRouter() {
  addEventListener('hashchange', () => { parse(); emit(); });
  parse();
  emit();
}
