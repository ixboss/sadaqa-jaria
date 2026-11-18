// ============================================================================
// mushaf.js — 604-page 15-line Madani Mushaf reader.
// Render: non-blocking QPC1 subset font load (p{NNN}.woff2) with immediate
// UthmanicHafs fallback + seamless background upgrade; 15-slot uniform fit;
// RTL swipe (pointer capture + velocity + damping); tap-to-toggle HUD with
// scrubber, previous-position jump, search, index, audio, khatmah, bookmark.
// ============================================================================
import { state, saveProgress, haptic, HAPTICS } from '../../app-state.js';
import { navigate } from '../router.js';
import { iconSvg } from '../icons.js';

const pageCache = new Map(); // page -> { lines, words }
const activeFaces = new Map(); // family -> { page, face, ok }
let renderSeq = 0;
let lastPositionBeforeJump = null;

let keyHandler = null;

async function ensurePageFont(page, fam = 'QPC1-P') {
  const cur = activeFaces.get(fam);
  if (cur?.page === page && cur.ok) return true;
  try {
    const f = new FontFace(fam, `url(assets/fonts/qpc1/p${String(page).padStart(3, '0')}.woff2)`);
    await f.load();
    if (f.status !== 'loaded') {
      activeFaces.set(fam, { page, face: cur?.face ?? null, ok: false });
      return false;
    }
    document.fonts.add(f);
    if (cur?.face) document.fonts.delete(cur.face);
    activeFaces.set(fam, { page, face: f, ok: true });
    return true;
  } catch {
    activeFaces.set(fam, { page, face: cur?.face ?? null, ok: false });
    return false;
  }
}

let bsmlFontLoaded = false;
let bsmlFontPromise = null;
function ensureBsmlFont() {
  if (bsmlFontLoaded) return Promise.resolve(true);
  if (bsmlFontPromise) return bsmlFontPromise;
  bsmlFontPromise = (async () => {
    try {
      const f = new FontFace('QPC1-BSML', `url(assets/fonts/qpc1/QPC1BSML.ttf)`);
      await f.load();
      if (f.status !== 'loaded') { bsmlFontPromise = null; return false; }
      document.fonts.add(f);
      bsmlFontLoaded = true;
      return true;
    } catch {
      bsmlFontPromise = null;
      return false;
    }
  })();
  return bsmlFontPromise;
}

function skeletonHtml() {
  const widths = [64, 88, 92, 86, 94, 90, 82, 94, 88, 91, 85, 92, 87, 79, 58];
  return `<div class="mushaf-skeleton" aria-hidden="true">${widths.map((w) => `<i style="width:${w}%"></i>`).join('')}</div>`;
}

export function renderMushaf(root, { page = null } = {}) {
  const parsed = Number(page);
  const saved = Number(state.progress.page ?? 1);
  const startPage = (Number.isInteger(parsed) && parsed >= 1 && parsed <= 604) ? parsed : (Number.isInteger(saved) && saved >= 1 && saved <= 604 ? saved : 1);
  if (parsed && saved && parsed !== saved) lastPositionBeforeJump = saved;

  root.innerHTML = `
  <div class="mushaf-screen" id="mushaf-screen">
    <div class="reader-topbar" id="reader-topbar">
      <button class="rbtn" id="r-back" aria-label="رجوع">${iconSvg('arrow-right', 18)}</button>
      <span class="title" id="reader-title">صفحة ${startPage}</span>
      <div class="r-actions">
        <button class="rbtn" id="r-index" aria-label="الفهرس" title="فهرس السور والأجزاء">${iconSvg('list', 18)}</button>
        <button class="rbtn" id="r-bookmark" aria-label="علامة مرجعية" title="حفظ علامة">${iconSvg('bookmark', 18)}</button>
        <button class="rbtn" id="r-audio" aria-label="التلاوة" title="التلاوة">${iconSvg('headphones', 18)}</button>
        <button class="rbtn" id="r-khatmah" aria-label="الختمة" title="الختمة">${iconSvg('moon', 18)}</button>
      </div>
    </div>
    <div class="mushaf-meta-strip" id="mushaf-meta-strip">
      <span id="meta-surah">المصحف الشريف</span>
      <span id="meta-juz">ص ${startPage}</span>
    </div>
    <div class="mushaf-stage" id="mushaf-stage">${skeletonHtml()}</div>
    <div class="plate-foot" id="plate-foot"></div>
    <div class="mushaf-hud" id="mushaf-hud" role="region" aria-label="أدوات المصحف">
      <div class="hud-scrubber-row">
        <span class="hud-page-pill" id="hud-page-label">ص ${startPage} / ٦٠٤</span>
        <input type="range" id="hud-page-slider" min="1" max="604" value="${startPage}" aria-label="شريط التنقل بين الصفحات">
      </div>
      <div class="hud-actions-row">
        <button class="hud-btn" id="hud-index">${iconSvg('list', 15)}<span>الفهرس</span></button>
        <button class="hud-btn" id="hud-prev-pos" ${lastPositionBeforeJump && lastPositionBeforeJump !== startPage ? '' : 'disabled'}>${iconSvg('history', 15)}<span>آخر موضع</span></button>
        <button class="hud-btn" id="hud-search">${iconSvg('search', 15)}<span>بحث</span></button>
        <button class="hud-btn" id="hud-khatmah">${iconSvg('moon', 15)}<span>الختمة</span></button>
      </div>
      <div class="hud-actions-row" style="grid-template-columns:repeat(2,minmax(0,1fr))">
        <button class="hud-btn" id="hud-audio">${iconSvg('headphones', 15)}<span>التلاوة الصوتية</span></button>
        <button class="hud-btn" id="hud-hide">${iconSvg('close', 15)}<span>إخفاء الشريط</span></button>
      </div>
    </div>
  </div>`;

  document.body.classList.add('reading', 'chrome-hidden');
  wireChrome(root);
  wireStageGestures(root);
  return showPage(root, startPage);
}

// ---------------------------------------------------------------------------
// page rendering (never blocks indefinitely on network fonts)
// ---------------------------------------------------------------------------
function updateHudPrevButton(root, curPage) {
  const btn = root.querySelector('#hud-prev-pos');
  if (!btn) return;
  const enabled = Boolean(lastPositionBeforeJump && lastPositionBeforeJump !== curPage);
  btn.disabled = !enabled;
  btn.title = enabled ? `العودة إلى صفحة ${lastPositionBeforeJump}` : '';
}

async function showPage(root, page, direction = 0) {
  const stage = root.querySelector('#mushaf-stage');
  if (!stage) return;
  if (!Number.isInteger(page) || page < 1 || page > 604) page = 1;
  const mySeq = ++renderSeq;

  const slider = root.querySelector('#hud-page-slider');
  const hudLbl = root.querySelector('#hud-page-label');
  if (slider) slider.value = String(page);
  if (hudLbl) hudLbl.textContent = `ص ${page} / ٦٠٤`;
  const titleEl = root.querySelector('#reader-title');
  if (titleEl) titleEl.textContent = `صفحة ${page}`;
  updateHudPrevButton(root, page);

  try {
    const spread = matchMedia('(orientation: landscape) and (min-width: 1024px)').matches;
    const pages = spread ? spreadFor(page) : [page];

    // Kick off DB load + per-page font fetches in parallel
    const dataPromise = Promise.all(pages.map((p) => loadPage(p)));
    const fontPromises = pages.map((p, i) => ensurePageFont(p, i === 0 ? 'QPC1-P' : 'QPC1-PL'));
    const allFontsPromise = Promise.all([Promise.all(fontPromises), ensureBsmlFont()]);

    // Race fonts against a 1500ms ceiling: fast/cached loads render QPC1 on first paint,
    // stalled/offline fonts never trap the user on a dark void.
    const raced = await Promise.all([
      dataPromise,
      Promise.race([
        allFontsPromise.then(([pageOks, bsmlOk]) => ({ ready: true, pageOks, bsmlOk })),
        new Promise((r) => setTimeout(() => r({ ready: false }), 1500)),
      ]),
    ]);
    if (mySeq !== renderSeq || !root.querySelector('#mushaf-stage')) return;

    const allData = raced[0];
    const fontStatus = raced[1];
    if (!allData[0]?.lines?.length && !allData[0]?.words?.length) {
      throw new Error('بيانات هذه الصفحة غير متوفرة في قاعدة البيانات المحلية');
    }

    stage.innerHTML = pages.map((p) => `<div class="mushaf-plate" data-page="${p}"></div>`).join('');
    const plates = [...stage.querySelectorAll('.mushaf-plate')];

    for (let i = 0; i < pages.length; i++) {
      const fam = i === 0 ? 'QPC1-P' : 'QPC1-PL';
      const pageFontOk = fontStatus.ready ? Boolean(fontStatus.pageOks[i]) : (activeFaces.get(fam)?.page === pages[i] && activeFaces.get(fam)?.ok);
      const bsmlOk = fontStatus.ready ? Boolean(fontStatus.bsmlOk) : bsmlFontLoaded;
      plates[i].style.setProperty('--mw-font', pageFontOk ? `'${fam}'` : `var(--font-quran)`);
      renderPlate(plates[i], pages[i], allData[i], { pageFontOk, bsmlOk });
    }

    // If fonts arrived after the 1500ms timeout, seamlessly upgrade in place
    if (!fontStatus.ready) {
      allFontsPromise.then(([pageOks, bsmlOk]) => {
        if (mySeq !== renderSeq || !root.querySelector('#mushaf-stage')) return;
        for (let i = 0; i < pages.length; i++) {
          const plate = stage.querySelector(`.mushaf-plate[data-page="${pages[i]}"]`);
          if (!plate) continue;
          const fam = i === 0 ? 'QPC1-P' : 'QPC1-PL';
          if (pageOks[i] || bsmlOk) {
            plate.style.setProperty('--mw-font', pageOks[i] ? `'${fam}'` : `var(--font-quran)`);
            renderPlate(plate, pages[i], allData[i], { pageFontOk: Boolean(pageOks[i]), bsmlOk: Boolean(bsmlOk) });
          }
        }
      }).catch(() => {});
    }

    paintFoot(root, pages.at(-1));
    paintTitle(root, pages);
    paintBookmarkState(root, page);
    saveProgress(page);
    if (direction !== 0 && plates[0]) animateFlip(plates[0], direction);

    // Pre-warm next/prev pages in background
    setTimeout(() => {
      if (mySeq !== renderSeq) return;
      if (page < 604) loadPage(page + 1).catch(() => {});
      if (page > 1) loadPage(page - 1).catch(() => {});
    }, 120);
  } catch (err) {
    if (mySeq !== renderSeq) return;
    console.error('[mushaf]', err);
    stage.innerHTML = `<div class="empty-state">
      <div class="icon">${iconSvg('alert', 22)}</div>
      <h2>تعذر عرض الصفحة ${page}</h2>
      <p style="margin-bottom:14px">${escapeHtml(err?.message ?? 'حدث خطأ أثناء القراءة')}</p>
      <button class="btn primary" id="mushaf-retry">إعادة المحاولة</button>
    </div>`;
    stage.querySelector('#mushaf-retry')?.addEventListener('click', () => showPage(root, page));
  }
}

async function loadPage(p) {
  if (!pageCache.has(p)) {
    const [lines, words] = await Promise.all([
      state.db.query(`SELECT line_number, kind, ayah_number, surah, text_ar, glyphs_qpc FROM mushaf_lines WHERE page_number = ? ORDER BY line_number`, [p]),
      state.db.query(`SELECT word_seq, line_number, line_position, ayah_number, number_in_surah, word_text, glyphs_qpc, surah FROM v_page_words WHERE page_number = ? ORDER BY line_number, line_position`, [p]),
    ]);
    pageCache.set(p, { lines, words });
  }
  return pageCache.get(p);
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
      const glyphHtml = (bsmlOk && line.glyphs_qpc)
        ? `<span class="mw bsml">${escapeHtml(line.glyphs_qpc)}</span>`
        : `<span class="mw bsml-uthmani">${escapeHtml(line.text_ar ?? 'بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ')}</span>`;
      return `<div class="mushaf-line kind-bismillah" data-line="${n}">${glyphHtml}</div>`;
    }
    const ws = (byLine.get(n) ?? []).map((w) => {
      const renderText = (pageFontOk && w.glyphs_qpc) ? w.glyphs_qpc : (w.word_text ?? '');
      const cls = pageFontOk ? 'mw' : 'mw uthmani-fallback';
      return `<span class="${cls}" data-ayah="${w.ayah_number}" data-surah="${w.surah ?? ''}" data-nis="${w.number_in_surah}" tabindex="0">${escapeHtml(renderText)}</span>`;
    }).join('');
    return `<div class="mushaf-line kind-text" data-line="${n}">${ws}</div>`;
  }).join('');
  fitLines(plate);
  if (!plate.dataset.wired) {
    plate.dataset.wired = '1';
    plate.addEventListener('click', (e) => onWordTap(e, plate, page), false);
    plate.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        const mw = e.target.closest('.mw');
        if (mw) { e.preventDefault(); openAyahSheet(Number(mw.dataset.ayah)); }
      }
    });
  }
}

/** Auto-fit: compute uniform plate font-size so all 15 lines fit vertically and horizontally with zero clipping. */
function fitLines(plate) {
  if (!plate.isConnected) return;
  const rect = plate.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) { requestAnimationFrame(() => fitLines(plate)); return; }
  const maxByHeight = (rect.height / 15) * 0.72;
  const maxByWidth = rect.width / 11.5;
  const plateSize = Math.max(13, Math.min(maxByHeight, maxByWidth));
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
  const foot = root.querySelector('#plate-foot');
  if (!foot) return;
  foot.innerHTML = `
    <span class="pf-nav">
      <button class="pf-btn" id="pf-prev" aria-label="الصفحة السابقة">${iconSvg('chevron-right', 14)}</button>
      <span id="foot-page-num">${page}</span>
      <button class="pf-btn" id="pf-next" aria-label="الصفحة التالية">${iconSvg('chevron-left', 14)}</button>
    </span>`;
  foot.querySelector('#pf-prev')?.addEventListener('click', (e) => { e.stopPropagation(); flip(root, -1); });
  foot.querySelector('#pf-next')?.addEventListener('click', (e) => { e.stopPropagation(); flip(root, +1); });
  state.db.queryOne(`SELECT juz_start, hizb_start FROM mushaf_pages WHERE page_number = ?`, [page]).then((m) => {
    const juzEl = root.querySelector('#meta-juz');
    if (!m || !juzEl) return;
    const parts = [];
    if (m.juz_start) parts.push(`الجزء ${m.juz_start}`);
    if (m.hizb_start) parts.push(`الحزب ${m.hizb_start}`);
    juzEl.textContent = parts.join(' · ') || `ص ${page}`;
  }).catch(() => {});
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
    }).catch(() => {});
}

async function paintBookmarkState(root, page) {
  const btn = root.querySelector('#r-bookmark');
  if (!btn) return;
  const hit = await state.db.queryOne(`SELECT uuid FROM bookmarks WHERE page = ? AND deleted = 0 LIMIT 1`, [page]).catch(() => null);
  btn.classList.toggle('active', Boolean(hit));
  btn.innerHTML = iconSvg(hit ? 'bookmark-filled' : 'bookmark', 18);
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
    if (e.target.closest('.mw') || e.target.closest('.reader-topbar') || e.target.closest('#mushaf-retry')) return;
    dragging = true; moved = 0;
    startX = e.clientX; startY = e.clientY; startT = performance.now();
    stage.setPointerCapture(e.pointerId);
  });
  stage.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    moved = e.clientX - startX;
    const dy = e.clientY - startY;
    if (Math.abs(dy) > Math.abs(moved)) return;
    const w = stage.getBoundingClientRect().width || 360;
    const damped = moved * (1 - Math.min(Math.abs(moved) / w, 0.6) * 0.6);
    stage.style.transform = `translateX(${damped}px)`;
  });
  stage.addEventListener('pointerup', (e) => {
    if (!dragging) return;
    dragging = false;
    stage.style.transform = '';
    const dt = performance.now() - startT;
    const velocity = Math.abs(moved) / Math.max(dt, 1);
    const w = stage.getBoundingClientRect().width || 360;
    if (Math.abs(moved) >= w * 0.22 || velocity > 0.11) {
      // RTL Arabic Mushaf: page 1 on right; swiping LEFT-TO-RIGHT (moved > 0) turns to NEXT page (+1)
      flip(root, moved > 0 ? +1 : -1);
    } else if (Math.abs(moved) < 6 && !e.target.closest('.mw')) {
      toggleChrome();
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
  root.querySelector('#hud-search')?.addEventListener('click', async () => {
    const { renderSearchSheet } = await import('./search.js');
    renderSearchSheet();
  });
  root.querySelector('#hud-prev-pos')?.addEventListener('click', () => {
    const cur = Number(root.querySelector('#mushaf-stage .mushaf-plate')?.dataset.page ?? 1);
    if (lastPositionBeforeJump && lastPositionBeforeJump !== cur) {
      const target = lastPositionBeforeJump;
      lastPositionBeforeJump = cur;
      showPage(root, target);
    }
  });
  root.querySelector('#hud-hide')?.addEventListener('click', () => document.body.classList.add('chrome-hidden'));

  const slider = root.querySelector('#hud-page-slider');
  const hudLbl = root.querySelector('#hud-page-label');
  slider?.addEventListener('input', () => {
    if (hudLbl) hudLbl.textContent = `ص ${slider.value} / ٦٠٤`;
  });
  slider?.addEventListener('change', () => {
    const cur = Number(root.querySelector('#mushaf-stage .mushaf-plate')?.dataset.page ?? 1);
    const target = Number(slider.value);
    if (target >= 1 && target <= 604 && target !== cur) {
      lastPositionBeforeJump = cur;
      showPage(root, target);
    }
  });

  if (keyHandler) removeEventListener('keydown', keyHandler);
  keyHandler = (e) => {
    if (!root.querySelector('#mushaf-screen')) { removeEventListener('keydown', keyHandler); keyHandler = null; return; }
    if (e.key === 'ArrowLeft') flip(root, +1);
    else if (e.key === 'ArrowRight') flip(root, -1);
  };
  addEventListener('keydown', keyHandler);

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
    { duration: 340, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'backwards' },
  );
}

// ---------------------------------------------------------------------------
// word tap → ayah highlight + action sheet
// ---------------------------------------------------------------------------
function onWordTap(e, plate) {
  const mw = e.target.closest('.mw[data-ayah]');
  if (!mw) return;
  const ayahNumber = Number(mw.dataset.ayah);
  if (!Number.isInteger(ayahNumber) || ayahNumber < 1) return;
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
