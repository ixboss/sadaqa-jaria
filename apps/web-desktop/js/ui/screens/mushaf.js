// ============================================================================
// mushaf.js — the 604-page reader (Phase 3 core).
// Render: mushaf_lines slots × mushaf_words plates. Word plates render
// glyphs_qpc with the page's own QPC1 subset font (p{NNN}.woff2) — codepoint
// parity guaranteed by the shared dataset source. Navigation: swipe (pointer
// events with momentum + damping per design-engineering skill), tap thirds,
// buttons; spread pair on ≥1024px landscape; chrome auto-hide on tap.
// ============================================================================
import { state, saveProgress, haptic, HAPTICS } from '../../app-state.js';
import { navigate } from '../router.js';

const fontCache = new Map(); // page → { lines, words }
const activeFaces = new Map(); // family → { page, face }

/**
 * Load the per-page QPC1 subset font under a plate-specific family (right
 * plate 'QPC1-P', left spread plate 'QPC1-PL'), evicting the previous face of
 * that family so the browser never falls back into a wrong page's glyph set.
 * Returns true if the face loaded cleanly; false triggers UthmanicHafs fallback.
 */
async function ensurePageFont(page, fam = 'QPC1-P') {
  const cur = activeFaces.get(fam);
  if (cur?.page === page && cur.ok) return true;
  if (cur) document.fonts.delete(cur.face);
  try {
    const f = new FontFace(fam, `url(assets/fonts/qpc1/p${String(page).padStart(3, '0')}.woff2)`);
    await f.load();
    if (f.status !== 'loaded') return false;
    document.fonts.add(f);
    activeFaces.set(fam, { page, face: f, ok: true });
    return true;
  } catch {
    activeFaces.set(fam, { page, face: null, ok: false });
    return false;
  }
}

let bsmlFontLoaded = false;
async function ensureBsmlFont() {
  if (bsmlFontLoaded) return true;
  try {
    const f = new FontFace('QPC1-BSML', `url(assets/fonts/qpc1/QPC1BSML.ttf)`);
    await f.load();
    if (f.status !== 'loaded') return false;
    document.fonts.add(f);
    bsmlFontLoaded = true;
    return true;
  } catch {
    return false;
  }
}

export function renderMushaf(root, { page = null } = {}) {
  const startPage = page ?? state.progress.page ?? 1;
  root.innerHTML = `
  <div class="mushaf-screen" id="mushaf-screen">
    <div class="reader-topbar" id="reader-topbar">
      <button class="rbtn" id="r-back" aria-label="رجوع">→</button>
      <span class="title" id="reader-title">…</span>
      <div class="r-actions">
        <button class="rbtn" id="r-index" aria-label="الفهرس" title="فهرس السور والأجزاء">☰</button>
        <button class="rbtn" id="r-bookmark" aria-label="علامة مرجعية" title="حفظ علامة">🔖</button>
        <button class="rbtn" id="r-audio" aria-label="التلاوة" title="التلاوة">🎧</button>
        <button class="rbtn" id="r-khatmah" aria-label="الختمة" title="الختمة">🌙</button>
      </div>
    </div>
    <div class="mushaf-meta-strip" id="mushaf-meta-strip">
      <span id="meta-surah">…</span>
      <span id="meta-juz">…</span>
    </div>
    <div class="mushaf-stage" id="mushaf-stage"></div>
    <div class="plate-foot" id="plate-foot"></div>
    <div class="mushaf-hud" id="mushaf-hud" role="region" aria-label="أدوات المصحف">
      <div class="hud-scrubber-row">
        <span class="hud-page-pill" id="hud-page-label">ص ${startPage}</span>
        <input type="range" id="hud-page-slider" min="1" max="604" value="${startPage}" aria-label="شريط التنقل بين الصفحات">
      </div>
      <div class="hud-actions-row">
        <button class="hud-btn" id="hud-index">☰ الفهرس</button>
        <button class="hud-btn" id="hud-audio">🎧 التلاوة</button>
        <button class="hud-btn" id="hud-khatmah">🌙 الختمة</button>
        <button class="hud-btn" id="hud-hide">✕ إخفاء</button>
      </div>
    </div>
  </div>`;

  document.body.classList.add('reading', 'chrome-hidden');
  wireChrome(root);
  wireStageGestures(root);
  return showPage(root, startPage);
}

// ---------------------------------------------------------------------------
// page rendering
// ---------------------------------------------------------------------------
async function showPage(root, page, direction = 0) {
  const stage = root.querySelector('#mushaf-stage');
  if (!Number.isInteger(page) || page < 1 || page > 604) page = 1;
  const [, bsmlOk] = await Promise.all([ensurePageFont(page), ensureBsmlFont()]);
  const { lines, words } = await loadPage(page);
  const spread = matchMedia('(orientation: landscape) and (min-width: 1024px)').matches;
  const pages = spread ? spreadFor(page) : [page];

  stage.innerHTML = pages.map((p) => `<div class="mushaf-plate" data-page="${p}"></div>`).join('');
  const plates = [...stage.querySelectorAll('.mushaf-plate')];

  for (let i = 0; i < pages.length; i++) {
    const data = pages[i] === page ? { lines, words } : await loadPage(pages[i]);
    const fam = i === 0 ? 'QPC1-P' : 'QPC1-PL';
    const pageFontOk = await ensurePageFont(pages[i], fam);
    plates[i].style.setProperty('--mw-font', pageFontOk ? `'${fam}'` : `var(--font-quran)`);
    renderPlate(plates[i], pages[i], data, { pageFontOk, bsmlOk });
  }
  paintFoot(root, pages.at(-1));
  paintTitle(root, pages);
  paintBookmarkState(root, page);
  const slider = root.querySelector('#hud-page-slider');
  const hudLbl = root.querySelector('#hud-page-label');
  if (slider) slider.value = String(page);
  if (hudLbl) hudLbl.textContent = `ص ${page} / ٦٠٤`;
  saveProgress(page);
  if (direction !== 0) animateFlip(plates[0], direction);
}

async function loadPage(p) {
  if (!fontCache.has(p)) {
    const [lines, words] = await Promise.all([
      state.db.query(`SELECT line_number, kind, ayah_number, surah, text_ar, glyphs_qpc FROM mushaf_lines WHERE page_number = ? ORDER BY line_number`, [p]),
      state.db.query(`SELECT word_seq, line_number, line_position, ayah_number, number_in_surah, word_text, glyphs_qpc, surah FROM v_page_words WHERE page_number = ? ORDER BY line_number, line_position`, [p]),
    ]);
    fontCache.set(p, { lines, words });
  }
  return fontCache.get(p);
}

function renderPlate(plate, page, { lines, words }, { pageFontOk = true, bsmlOk = true } = {}) {
  const byLine = new Map();
  for (const w of words) {
    if (!byLine.has(w.line_number)) byLine.set(w.line_number, []);
    byLine.get(w.line_number).push(w);
  }
  const slots = Array.from({ length: 15 }, (_, i) => i + 1);
  plate.innerHTML = slots.map((n) => {
    const line = lines.find((l) => l.line_number === n);
    if (!line) return `<div class="mushaf-line kind-blank" data-line="${n}"></div>`;
    if (line.kind === 'surah_name') {
      return `<div class="mushaf-line kind-surah_name" data-line="${n}"><span>${escapeHtml(line.text_ar ?? '')}</span></div>`;
    }
    if (line.kind === 'bismillah') {
      // Never pass ASCII-mapped BSML glyphs to fallback font if QPC1-BSML failed to load
      const glyphHtml = (bsmlOk && line.glyphs_qpc)
        ? `<span class="mw bsml">${escapeHtml(line.glyphs_qpc)}</span>`
        : `<span class="mw bsml-uthmani">${escapeHtml(line.text_ar ?? 'بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ')}</span>`;
      return `<div class="mushaf-line kind-bismillah" data-line="${n}">${glyphHtml}</div>`;
    }
    const ws = (byLine.get(n) ?? []).map((w) => {
      const renderText = (pageFontOk && w.glyphs_qpc) ? w.glyphs_qpc : (w.word_text ?? '');
      const cls = pageFontOk ? 'mw' : 'mw uthmani-fallback';
      return `<span class="${cls}" data-ayah="${w.ayah_number}" data-surah="${wordSurah(words, w)}" data-nis="${w.number_in_surah}" tabindex="0">${escapeHtml(renderText)}</span>`;
    }).join('');
    return `<div class="mushaf-line kind-text" data-line="${n}">${ws}</div>`;
  }).join('');
  fitLines(plate);
  plate.addEventListener('click', (e) => onWordTap(e, plate, page), false);
  plate.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      const mw = e.target.closest('.mw');
      if (mw) { e.preventDefault(); openAyahSheet(Number(mw.dataset.ayah)); }
    }
  });
}

function wordSurah(words, w) {
  // v_page_words exposes surah per word row
  return words.find((x) => x.word_seq === w.word_seq && x.line_number === w.line_number && x.ayah_number === w.ayah_number)?.surah ?? null;
}

/** Auto-fit: compute uniform plate font-size so all 15 lines fit vertically and horizontally with zero clipping. */
function fitLines(plate) {
  const rect = plate.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) { requestAnimationFrame(() => fitLines(plate)); return; }
  const maxByHeight = (rect.height / 15) * 0.72;
  const maxByWidth = rect.width / 11.5;
  let plateSize = Math.max(13, Math.min(maxByHeight, maxByWidth));
  plate.style.setProperty('--plate-font-size', `${plateSize.toFixed(1)}px`);

  const textLines = [...plate.querySelectorAll('.kind-text, .kind-bismillah')];
  for (const line of textLines) {
    let size = plateSize;
    const childWidth = () => [...line.children].reduce((s, c) => s + c.getBoundingClientRect().width, 0)
      + Math.max(0, line.children.length - 1) * (size * 0.14);
    for (let i = 0; i < 10 && (childWidth() > line.clientWidth - 4 || line.scrollWidth > line.clientWidth + 1); i++) {
      size *= 0.92;
      line.style.setProperty('--plate-font-size', `${size.toFixed(1)}px`);
    }
  }
}

function paintFoot(root, page) {
  root.querySelector('#plate-foot').innerHTML = `
    <span class="pf-nav">
      <button class="pf-btn" id="pf-prev" aria-label="الصفحة السابقة">›</button>
      <span id="foot-page-num">${page}</span>
      <button class="pf-btn" id="pf-next" aria-label="الصفحة التالية">‹</button>
    </span>`;
  root.querySelector('#pf-prev')?.addEventListener('click', (e) => { e.stopPropagation(); flip(root, -1); });
  root.querySelector('#pf-next')?.addEventListener('click', (e) => { e.stopPropagation(); flip(root, +1); });
  state.db.queryOne(`SELECT juz_start, hizb_start FROM mushaf_pages WHERE page_number = ?`, [page]).then((m) => {
    const juzEl = root.querySelector('#meta-juz');
    if (!m || !juzEl) return;
    const parts = [];
    if (m.juz_start) parts.push(`الجزء ${m.juz_start}`);
    if (m.hizb_start) parts.push(`الحزب ${m.hizb_start}`);
    juzEl.textContent = parts.join(' · ') || '';
  });
}

function paintTitle(root, pages) {
  const p = pages[0];
  const label = pages.length > 1 ? `صفحة ${pages[0]}–${pages.at(-1)}` : `صفحة ${pages[0]}`;
  const el = root.querySelector('#reader-title');
  const surahEl = root.querySelector('#meta-surah');
  if (el) el.textContent = label;
  state.db.queryOne(`SELECT s.name_ar FROM ayahs a JOIN surahs s ON s.number = a.surah WHERE a.page = ? ORDER BY a.ayah_number LIMIT 1`, [p])
    .then((row) => {
      if (row?.name_ar) {
        if (el) el.textContent = `${row.name_ar} · ${label}`;
        if (surahEl) surahEl.textContent = row.name_ar;
      }
    });
}

async function paintBookmarkState(root, page) {
  const btn = root.querySelector('#r-bookmark');
  if (!btn) return;
  const hit = await state.db.queryOne(`SELECT uuid FROM bookmarks WHERE page = ? AND deleted = 0 LIMIT 1`, [page]);
  btn.classList.toggle('active', Boolean(hit));
  btn.textContent = hit ? '★' : '🔖';
}

/** Book pairing: odd page on the right (RTL first), even on the left. */
function spreadFor(n) { return n % 2 === 1 ? [n, n + 1] : [n - 1, n]; }

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---------------------------------------------------------------------------
// gestures (design-engineering: pointer capture, velocity, damping)
// ---------------------------------------------------------------------------
function wireStageGestures(root) {
  const stage = root.querySelector('#mushaf-stage');
  let startX = 0, startY = 0, dragging = false, startT = 0, moved = 0;

  stage.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.mw') || e.target.closest('.reader-topbar')) return;
    dragging = true; moved = 0;
    startX = e.clientX; startY = e.clientY; startT = performance.now();
    stage.setPointerCapture(e.pointerId);
  });
  stage.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    moved = e.clientX - startX;
    const dy = e.clientY - startY;
    if (Math.abs(dy) > Math.abs(moved)) return; // vertical = scroll, not flip
    const w = stage.getBoundingClientRect().width;
    const damped = moved * (1 - Math.min(Math.abs(moved) / w, 0.6) * 0.6);
    stage.style.transform = `translateX(${damped}px)`;
  });
  stage.addEventListener('pointerup', (e) => {
    if (!dragging) return;
    dragging = false;
    stage.style.transform = '';
    const dt = performance.now() - startT;
    const velocity = Math.abs(moved) / Math.max(dt, 1);
    const w = stage.getBoundingClientRect().width;
    if (Math.abs(moved) >= w * 0.22 || velocity > 0.11) {
      // RTL Arabic Mushaf: page 1 is on the right, page 604 is on the left.
      // Swiping finger LEFT-TO-RIGHT (moved > 0) turns to the NEXT page (+1);
      // swiping finger RIGHT-TO-LEFT (moved < 0) turns to the PREVIOUS page (-1).
      flip(root, moved > 0 ? +1 : -1);
    } else if (Math.abs(moved) < 6 && !e.target.closest('.mw')) {
      toggleChrome(); // plain tap toggles floating HUD
    }
  });
  stage.addEventListener('pointercancel', () => { dragging = false; stage.style.transform = ''; });
}

function wireChrome(root) {
  root.querySelector('#r-back').addEventListener('click', () => history.back());
  root.querySelector('#r-index')?.addEventListener('click', () => navigate('mushaf-surah-index'));
  root.querySelector('#r-audio')?.addEventListener('click', () => navigate('mushaf-audio'));
  root.querySelector('#r-khatmah').addEventListener('click', () => navigate('mushaf-khatmah'));
  root.querySelector('#hud-index')?.addEventListener('click', () => navigate('mushaf-surah-index'));
  root.querySelector('#hud-audio')?.addEventListener('click', () => navigate('mushaf-audio'));
  root.querySelector('#hud-khatmah')?.addEventListener('click', () => navigate('mushaf-khatmah'));
  root.querySelector('#hud-hide')?.addEventListener('click', () => document.body.classList.add('chrome-hidden'));

  const slider = root.querySelector('#hud-page-slider');
  const hudLbl = root.querySelector('#hud-page-label');
  slider?.addEventListener('input', () => {
    if (hudLbl) hudLbl.textContent = `ص ${slider.value} / ٦٠٤`;
  });
  slider?.addEventListener('change', () => {
    const target = Number(slider.value);
    if (target >= 1 && target <= 604) showPage(root, target);
  });

  const onKey = (e) => {
    if (!root.querySelector('#mushaf-screen')) { removeEventListener('keydown', onKey); return; }
    if (e.key === 'ArrowLeft') flip(root, +1);
    else if (e.key === 'ArrowRight') flip(root, -1);
  };
  addEventListener('keydown', onKey);

  root.querySelector('#r-bookmark')?.addEventListener('click', async () => {
    const cur = Number(root.querySelector('#mushaf-stage .mushaf-plate')?.dataset.page ?? 1);
    const existing = await state.db.queryOne(`SELECT uuid FROM bookmarks WHERE page = ? AND deleted = 0 LIMIT 1`, [cur]);
    const now = Date.now();
    if (existing) {
      await state.db.write(`UPDATE bookmarks SET deleted = 1, updated_at = ? WHERE uuid = ?`, [now, existing.uuid]);
    } else {
      const surah = await state.db.queryOne(`SELECT s.name_ar FROM ayahs a JOIN surahs s ON s.number = a.surah WHERE a.page = ? ORDER BY a.ayah_number LIMIT 1`, [cur]);
      const label = surah?.name_ar ? `${surah.name_ar} · ص ${cur}` : `صفحة ${cur}`;
      await state.db.write(`INSERT INTO bookmarks (uuid, page, label_ar, created_at, updated_at, deleted) VALUES (?, ?, ?, ?, ?, 0)`,
        [crypto.randomUUID(), cur, label, now, now]);
    }
    haptic(HAPTICS.bookmarkSaved);
    paintBookmarkState(root, cur);
  });
}

function toggleChrome() {
  document.body.classList.toggle('chrome-hidden');
}

let flipping = false;
function flip(root, dir) {
  if (flipping) return;
  const plates = root.querySelectorAll('#mushaf-stage .mushaf-plate');
  const cur = Number(plates[0]?.dataset.page ?? 1);
  const step = plates.length > 1 ? dir * 2 : dir;
  const target = Math.max(1, Math.min(604, cur + step));
  if (target === cur) return;
  flipping = true;
  haptic(HAPTICS.pageFlipSettle);
  showPage(root, target, dir).finally(() => { flipping = false; });
}

function animateFlip(plate, dir) {
  plate.classList.add('flipping');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced) return;
  const w = plate.getBoundingClientRect().width || 300;
  plate.animate(
    [{ transform: `translateX(${-dir * w * 0.35}px)`, opacity: 0.55 }, { transform: 'translateX(0)', opacity: 1 }],
    { duration: 380, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'backwards' },
  );
}

// ---------------------------------------------------------------------------
// word tap → ayah highlight + action sheet
// ---------------------------------------------------------------------------
function onWordTap(e, plate) {
  const mw = e.target.closest('.mw');
  if (!mw) return;
  const ayahNumber = Number(mw.dataset.ayah);
  for (const el of plate.querySelectorAll('.mw.ayah-active')) el.classList.remove('ayah-active');
  for (const el of plate.querySelectorAll(`.mw[data-ayah="${ayahNumber}"]`)) el.classList.add('ayah-active');
  openAyahSheet(ayahNumber);
}

async function openAyahSheet(ayahNumber) {
  const { renderAyahSheet } = await import('./ayah-sheet.js');
  renderAyahSheet(ayahNumber);
}

/** Jump the reader to the page containing an ayah (search results / sheet). */
export async function gotoAyah(ayahNumber) {
  const row = await state.db.queryOne(`SELECT page FROM ayahs WHERE ayah_number = ?`, [ayahNumber]);
  if (!row) return;
  navigate('mushaf-page', { page: row.page });
}
