// ============================================================================
// mushaf.js — 604-page 15-line Madani Mushaf reader.
// Render: non-blocking QPC1 subset font load (p{NNN}.woff2) with immediate
// UthmanicHafs fallback + seamless background upgrade; 15-slot uniform fit;
// RTL swipe (pointer capture + velocity + damping); tap-to-toggle HUD with
// scrubber, previous-position jump, search, index, audio, khatmah, bookmark.
// ============================================================================
import { state, saveProgress, saveSetting, haptic, HAPTICS } from '../../app-state.js';
import { navigate } from '../router.js';
import { iconSvg } from '../icons.js';
import { mountTheme } from '../../main.js';

const pageCache = new Map(); // page -> { lines, words }
const activeFaces = new Map(); // family -> { page, face, ok }
const warmedFonts = new Set(); // page numbers whose woff2 has been pre-fetched
const plateState = new WeakMap(); // plate -> { page, data, flags, isZoomed }
let pageSurahMap = null; // page (1..604) -> surah name_ar
let renderSeq = 0;
let activePage = 1;
let lastPositionBeforeJump = null;

function currentMushafScale() {
  return Math.min(Math.max(Number(state.settings.mushaf_scale ?? 1) || 1, 0.8), 2);
}

function warmPageAssets(p) {
  if (p < 1 || p > 604) return;
  loadPage(p).catch(() => {});
  if (!warmedFonts.has(p)) {
    warmedFonts.add(p);
    fetch(`assets/fonts/qpc1/p${String(p).padStart(3, '0')}.woff2`).catch(() => {});
  }
}

let keyHandler = null;

async function ensurePageSurahMap() {
  if (pageSurahMap) return pageSurahMap;
  const rows = await state.db.query(`SELECT start_page, name_ar FROM surahs ORDER BY start_page ASC, number ASC`).catch(() => []);
  const map = new Array(605).fill('المصحف الشريف');
  let cur = 'المصحف الشريف';
  let idx = 0;
  for (let p = 1; p <= 604; p++) {
    while (idx < rows.length && Number(rows[idx].start_page) <= p) {
      cur = rows[idx].name_ar || cur;
      idx++;
    }
    map[p] = cur;
  }
  pageSurahMap = map;
  return map;
}

function surahNameForPage(p) {
  const n = Math.min(604, Math.max(1, Math.round(Number(p) || 1)));
  return pageSurahMap?.[n] ?? 'المصحف الشريف';
}

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
  flipping = false;
  activePage = startPage;

  root.innerHTML = `
  <div class="mushaf-screen" id="mushaf-screen">
    <div class="reader-top-wrap" id="reader-top-wrap">
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
      <div class="reader-hub-seg" role="tablist" aria-label="أقسام المصحف">
        <button type="button" class="seg-btn on" role="tab" aria-selected="true" id="seg-reader">المصحف</button>
        <button type="button" class="seg-btn" role="tab" aria-selected="false" id="seg-reading">قراءاتي وختمتي</button>
        <button type="button" class="seg-btn" role="tab" aria-selected="false" id="seg-index">الفهرس</button>
      </div>
    </div>
    <div class="mushaf-meta-strip" id="mushaf-meta-strip">
      <span id="meta-surah">المصحف الشريف</span>
      <span id="meta-juz">ص ${startPage}</span>
    </div>
    <div class="mushaf-stage" id="mushaf-stage">${skeletonHtml()}</div>
    <div class="plate-foot" id="plate-foot"></div>
    <div class="mushaf-hud" id="mushaf-hud" role="region" aria-label="أدوات المصحف">
      <div class="hud-slider-preview" id="hud-slider-preview" hidden>ص ${startPage}</div>
      <div class="hud-scrubber-row">
        <span class="hud-page-pill" id="hud-page-label">ص ${startPage} / ٦٠٤</span>
        <button class="hud-step" id="hud-prev-page" aria-label="الصفحة السابقة" title="الصفحة السابقة">${iconSvg('chevron-right', 15)}</button>
        <input type="range" id="hud-page-slider" min="1" max="604" value="${startPage}" aria-label="شريط التنقل بين الصفحات">
        <button class="hud-step" id="hud-next-page" aria-label="الصفحة التالية" title="الصفحة التالية">${iconSvg('chevron-left', 15)}</button>
        <button class="hud-aa" id="hud-look" aria-label="مظهر القراءة" title="حجم الخط ومظهر القراءة">${iconSvg('type', 16)}</button>
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
      <div class="hud-actions-row" style="grid-template-columns:repeat(3,minmax(0,1fr))">
        <button class="hud-btn" id="hud-tab-today">${iconSvg('today', 15)}<span>اليوم</span></button>
        <button class="hud-btn" id="hud-tab-athkar">${iconSvg('athkar', 15)}<span>الأذكار</span></button>
        <button class="hud-btn" id="hud-tab-tools">${iconSvg('tools', 15)}<span>الأدوات</span></button>
      </div>
    </div>
  </div>`;

  document.body.classList.add('reading', 'chrome-hidden');
  ensurePageSurahMap().catch(() => {});
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
  activePage = page;
  const mySeq = ++renderSeq;

  const slider = root.querySelector('#hud-page-slider');
  const hudLbl = root.querySelector('#hud-page-label');
  const preview = root.querySelector('#hud-slider-preview');
  const prevStep = root.querySelector('#hud-prev-page');
  const nextStep = root.querySelector('#hud-next-page');
  if (slider) slider.value = String(page);
  if (hudLbl) hudLbl.textContent = `ص ${page} / ٦٠٤`;
  if (preview) preview.hidden = true;
  if (prevStep) prevStep.disabled = page <= 1;
  if (nextStep) nextStep.disabled = page >= 604;
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

    // Pre-warm adjacent pages & fonts in background for zero-flicker RTL swipes
    setTimeout(() => {
      if (mySeq !== renderSeq) return;
      warmPageAssets(page + 1);
      warmPageAssets(page - 1);
      warmPageAssets(page + 2);
      warmPageAssets(page - 2);
    }, 100);
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

function renderPlate(plate, page, data, flags = {}) {
  const { lines, words } = data;
  const { pageFontOk = true, bsmlOk = true } = flags;
  const isZoomed = currentMushafScale() > 1.01;
  plateState.set(plate, { page, data, flags: { pageFontOk, bsmlOk }, isZoomed });

  const byLine = new Map();
  for (const w of words) {
    if (!byLine.has(w.line_number)) byLine.set(w.line_number, []);
    byLine.get(w.line_number).push(w);
  }
  const slots = Array.from({ length: 15 }, (_, i) => i + 1);

  if (isZoomed) {
    // Above 100%: continuous justified UthmanicHafs1Ver18 flow grouped between Surah/Basmala dividers
    const html = [];
    let flowWords = [];
    const flushFlow = () => {
      if (!flowWords.length) return;
      const spans = flowWords.map((w) =>
        `<span class="mw uthmani-flow" data-ayah="${w.ayah_number}" data-surah="${w.surah ?? ''}" data-nis="${w.number_in_surah}" tabindex="0">${escapeHtml(w.word_text ?? '')}</span>`,
      ).join(' ');
      html.push(`<p class="mushaf-flow" dir="rtl">${spans}</p>`);
      flowWords = [];
    };
    for (const n of slots) {
      const line = lines.find((l) => l.line_number === n);
      if (!line) continue;
      if (line.kind === 'surah_name') {
        flushFlow();
        html.push(`<div class="mushaf-line kind-surah_name" data-line="${n}"><span>${escapeHtml(line.text_ar ?? '')}</span></div>`);
      } else if (line.kind === 'bismillah') {
        flushFlow();
        html.push(`<div class="mushaf-line kind-bismillah" data-line="${n}"><span class="mw bsml-uthmani">${escapeHtml(line.text_ar ?? 'بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ')}</span></div>`);
      } else {
        const ws = byLine.get(n) ?? [];
        if (ws.length) flowWords.push(...ws);
      }
    }
    flushFlow();
    plate.innerHTML = html.join('');
  } else {
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
  }

  fitLines(plate);
  if (!plate.dataset.wired) {
    plate.dataset.wired = '1';
    plate.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        const mw = e.target.closest('.mw');
        if (mw) { e.preventDefault(); openAyahSheet(Number(mw.dataset.ayah)); }
      }
    });
  }
}

/** Auto-fit: compute uniform plate font-size + edge-to-edge justification on 15-line
 *  plates (<=100%), or switch to continuous justified UthmanicHafs1Ver18 flow (>100%). */
function fitLines(plate) {
  if (!plate.isConnected) return;
  const rect = plate.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) { requestAnimationFrame(() => fitLines(plate)); return; }
  const scale = currentMushafScale();
  const isZoomed = scale > 1.01;
  const st = plateState.get(plate);
  if (st && st.isZoomed !== isZoomed) {
    renderPlate(plate, st.page, st.data, st.flags);
    return;
  }

  const slotH = rect.height / 15;
  plate.classList.toggle('zoomed', isZoomed);

  if (isZoomed) {
    const base = Math.min(slotH * 0.84, rect.width / 11.2);
    const zoomedSize = Math.max(17, base * scale);
    plate.style.setProperty('--plate-font-size', `${zoomedSize.toFixed(1)}px`);
    return;
  }

  const pageNum = Number(plate.dataset.page ?? 1);
  const base = Math.min(slotH * 0.88, rect.width / 10.0);
  let plateSize = Math.max(14, Math.min(base * scale, slotH * 0.92));
  plate.style.setProperty('--plate-font-size', `${plateSize.toFixed(1)}px`);

  const textLines = [...plate.querySelectorAll('.kind-text, .kind-bismillah')];
  const measureLineWidth = (line, size) => {
    const children = [...line.children];
    return children.reduce((s, c) => s + c.getBoundingClientRect().width, 0)
      + Math.max(0, children.length - 1) * (size * 0.14);
  };

  for (const line of textLines) {
    line.classList.remove('justified');
    line.style.removeProperty('--plate-font-size');
  }

  // Uniform shrink across the plate so all 15 lines share one consistent size
  for (let step = 0; step < 12 && plateSize > 12; step++) {
    const overflows = textLines.some((line) =>
      measureLineWidth(line, plateSize) > line.clientWidth - 2 || line.scrollWidth > line.clientWidth + 1,
    );
    if (!overflows) break;
    plateSize = Math.max(12, plateSize * 0.94);
    plate.style.setProperty('--plate-font-size', `${plateSize.toFixed(1)}px`);
  }

  for (const line of textLines) {
    let size = plateSize;
    for (let i = 0; i < 3 && (measureLineWidth(line, size) > line.clientWidth - 2 || line.scrollWidth > line.clientWidth + 1); i++) {
      size *= 0.94;
      line.style.setProperty('--plate-font-size', `${size.toFixed(1)}px`);
    }
    if (pageNum > 2 && line.classList.contains('kind-text') && line.children.length >= 3) {
      const naturalW = measureLineWidth(line, size);
      if (naturalW >= line.clientWidth * 0.58) line.classList.add('justified');
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
// gestures — single tap ANYWHERE (even on an ayah) toggles the HUD; a 450ms
// press-and-hold on an ayah is the ONLY way to select it + open its action
// sheet; horizontal drags page with finger tracking (RTL: rightward → P+1).
// ---------------------------------------------------------------------------
function wireStageGestures(root) {
  const stage = root.querySelector('#mushaf-stage');
  const LONG_PRESS_MS = 450;
  let startX = 0, startY = 0, startT = 0, moved = 0, activePointerId = null;
  let pressing = false, dragging = false, horiz = null, lpTimer = null;
  let snapAnim = null;

  const cancelLongPress = () => { if (lpTimer) { clearTimeout(lpTimer); lpTimer = null; } };
  const cancelSnap = () => { if (snapAnim) { snapAnim.cancel(); snapAnim = null; } };
  const springBack = (fromX) => {
    cancelSnap();
    stage.style.transform = '';
    if (!fromX || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    snapAnim = stage.animate(
      [{ transform: `translateX(${fromX}px)` }, { transform: 'translateX(0)' }],
      { duration: 220, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
    );
    snapAnim.onfinish = () => { snapAnim = null; };
  };

  stage.addEventListener('pointerdown', (e) => {
    if (flipping || activePointerId !== null || (e.pointerType === 'mouse' && e.button !== 0) || e.target.closest('#mushaf-retry')) return;
    cancelSnap();
    activePointerId = e.pointerId;
    pressing = true; dragging = false; horiz = null; moved = 0;
    startX = e.clientX; startY = e.clientY; startT = performance.now();
    const word = e.target.closest('.mw[data-ayah]');
    if (word) {
      lpTimer = setTimeout(() => {
        lpTimer = null;
        if (!pressing) return;
        pressing = false;
        activePointerId = null;
        onAyahLongPress(root, word);
      }, LONG_PRESS_MS);
    }
  });

  stage.addEventListener('pointermove', (e) => {
    if (!pressing || e.pointerId !== activePointerId) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (Math.abs(dx) > 8 || Math.abs(dy) > 8) cancelLongPress();
    if (horiz === null && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) horiz = Math.abs(dx) > Math.abs(dy);
    if (horiz !== true) return; // vertical pans belong to the page scroll (touch-action: pan-y)
    if (!dragging) {
      dragging = true;
      try { stage.setPointerCapture(e.pointerId); } catch { /* already captured */ }
    }
    const plates = stage.querySelectorAll('.mushaf-plate');
    const cur = Number(plates[0]?.dataset.page ?? 1);
    const step = plates.length > 1 ? 2 : 1;
    const atBoundary = (dx > 0 && cur + step > 604) || (dx < 0 && cur - step < 1);
    // 1:1 finger tracking across pages; rubber-band only past page 1 / 604 boundaries
    moved = atBoundary ? dx * 0.22 : dx;
    stage.style.transform = `translateX(${moved}px)`;
  });

  const finishPointer = (e, cancelled) => {
    if (!pressing || (e.pointerId !== undefined && e.pointerId !== activePointerId)) return;
    const pid = activePointerId;
    pressing = false;
    activePointerId = null;
    cancelLongPress();
    if (pid !== null) {
      try {
        if (stage.hasPointerCapture?.(pid)) stage.releasePointerCapture(pid);
      } catch { /* capture already released */ }
    }
    const dt = performance.now() - startT;
    startT = 0;
    const w = stage.getBoundingClientRect().width || 360;
    const velocity = Math.abs(moved) / Math.max(dt, 1);
    const dragOffset = moved;
    const wasDragging = dragging;
    moved = 0; dragging = false; horiz = null;

    if (!cancelled && wasDragging && (Math.abs(dragOffset) >= w * 0.22 || (velocity > 0.32 && Math.abs(dragOffset) > 14))) {
      // RTL Arabic Mushaf: page 1 on right; swiping LEFT-TO-RIGHT (dragOffset > 0) turns to NEXT page (+1)
      const flipped = flip(root, dragOffset > 0 ? +1 : -1, dragOffset);
      if (!flipped) springBack(dragOffset);
    } else if (wasDragging) {
      springBack(dragOffset);
    } else {
      stage.style.transform = '';
      if (!cancelled && Math.abs(dragOffset) < 6 && dt < LONG_PRESS_MS) {
        toggleChrome(); // single tap anywhere — even directly on an ayah — toggles the HUD only
      }
    }
  };

  stage.addEventListener('pointerup', (e) => finishPointer(e, false));
  stage.addEventListener('pointercancel', (e) => finishPointer(e, true));
  stage.addEventListener('lostpointercapture', (e) => finishPointer(e, true));
  // long-press must never raise the browser callout / selection UI on the page
  stage.addEventListener('contextmenu', (e) => e.preventDefault());
}

/** Long-press on an ayah: highlight it, tick haptic, open the action sheet. */
function onAyahLongPress(root, mwEl) {
  const plate = mwEl.closest('.mushaf-plate');
  const ayahNumber = Number(mwEl.dataset.ayah);
  if (!plate || !Number.isInteger(ayahNumber) || ayahNumber < 1) return;
  for (const el of root.querySelectorAll('.mw.ayah-active')) el.classList.remove('ayah-active');
  for (const el of plate.querySelectorAll(`.mw[data-ayah="${ayahNumber}"]`)) el.classList.add('ayah-active');
  haptic(HAPTICS.ayahSelect);
  openAyahSheet(ayahNumber);
}

function wireChrome(root) {
  root.querySelector('#r-back').addEventListener('click', () => {
    if (history.length > 1) history.back();
    else navigate('mushaf-surah-index');
  });
  root.querySelector('#seg-reading')?.addEventListener('click', () => navigate('mushaf-khatmah'));
  root.querySelector('#seg-index')?.addEventListener('click', () => navigate('mushaf-surah-index'));
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
  root.querySelector('#hud-look')?.addEventListener('click', () => openAppearanceSheet(root));
  root.querySelector('#hud-tab-today')?.addEventListener('click', () => navigate('today'));
  root.querySelector('#hud-tab-athkar')?.addEventListener('click', () => navigate('adhkar-screen'));
  root.querySelector('#hud-tab-tools')?.addEventListener('click', () => navigate('tools-phase4'));

  root.querySelector('#hud-prev-page')?.addEventListener('click', () => flip(root, -1));
  root.querySelector('#hud-next-page')?.addEventListener('click', () => flip(root, +1));

  const slider = root.querySelector('#hud-page-slider');
  const hudLbl = root.querySelector('#hud-page-label');
  const preview = root.querySelector('#hud-slider-preview');
  const updatePreview = (val) => {
    const p = Math.min(604, Math.max(1, Number(val) || 1));
    if (hudLbl) hudLbl.textContent = `ص ${p} / ٦٠٤`;
    if (preview) {
      preview.textContent = `ص ${p} — ${surahNameForPage(p)}`;
      preview.hidden = false;
    }
  };
  const commitSlider = () => {
    if (preview) preview.hidden = true;
    const cur = Number(root.querySelector('#mushaf-stage .mushaf-plate')?.dataset.page ?? 1);
    const target = Number(slider?.value ?? cur);
    if (target >= 1 && target <= 604 && target !== cur) {
      lastPositionBeforeJump = cur;
      showPage(root, target);
    }
  };
  slider?.addEventListener('input', () => updatePreview(slider.value));
  slider?.addEventListener('change', commitSlider);
  slider?.addEventListener('pointercancel', () => { if (preview) preview.hidden = true; });

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

/** Reader Appearance sheet (AA): font scale with live re-fit + reading theme. */
function openAppearanceSheet(root) {
  const host = document.getElementById('sheet-root');
  const cur = Math.min(Math.max(Number(state.settings.mushaf_scale ?? 1) || 1, 0.8), 2);
  const theme = state.settings.theme ?? 'dark';
  const themes = [['dark', 'داكنة'], ['night', 'ليلية'], ['sepia', 'ورقية'], ['light', 'فاتحة']];
  host.innerHTML = `
  <div class="sheet-backdrop" id="sh-backdrop"></div>
  <div class="sheet" role="dialog" aria-modal="true" aria-label="مظهر القراءة">
    <div class="sheet-handle"></div>
    <div class="sheet-head"><h2>مظهر القراءة</h2><button class="sheet-close" id="sh-close" aria-label="إغلاق">${iconSvg('close', 18)}</button></div>
    <div class="sheet-body">
      <div class="field"><label>حجم خط المصحف (<span id="look-scale-val">${Math.round(cur * 100)}٪</span>)</label>
        <input id="look-scale" type="range" min="0.8" max="2" step="0.05" value="${cur}" aria-label="حجم خط المصحف"></div>
      <div class="field"><label>سمة القراءة</label>
        <div class="row-actions" id="look-themes">
          ${themes.map(([v, l]) => `<button class="btn ${theme === v ? 'primary' : ''}" data-theme="${v}">${l}</button>`).join('')}
        </div></div>
    </div>
  </div>`;
  const close = () => {
    host.querySelector('.sheet')?.classList.add('closing');
    host.querySelector('.sheet-backdrop')?.classList.add('closing');
    setTimeout(() => { host.innerHTML = ''; }, 180);
  };
  host.querySelector('#sh-close').addEventListener('click', close);
  host.querySelector('#sh-backdrop').addEventListener('click', close);
  const slider = host.querySelector('#look-scale');
  const out = host.querySelector('#look-scale-val');
  slider.addEventListener('input', async () => {
    const v = Number(slider.value);
    out.textContent = `${Math.round(v * 100)}٪`;
    await saveSetting('mushaf_scale', v);
    for (const plate of root.querySelectorAll('.mushaf-plate')) fitLines(plate);
  });
  for (const btn of host.querySelectorAll('#look-themes [data-theme]')) {
    btn.addEventListener('click', async () => {
      await saveSetting('theme', btn.dataset.theme);
      mountTheme();
      for (const b of host.querySelectorAll('#look-themes [data-theme]')) b.classList.toggle('primary', b === btn);
    });
  }
}

let flipping = false;
function flip(root, dir, fromDragOffset = 0) {
  if (flipping) return false;
  const stage = root.querySelector('#mushaf-stage');
  const plates = root.querySelectorAll('#mushaf-stage .mushaf-plate');
  const cur = activePage || Number(plates[0]?.dataset.page ?? 1);
  const step = plates.length > 1 ? dir * 2 : dir;
  const target = Math.max(1, Math.min(604, cur + step));
  if (target === cur) return false;
  activePage = target;
  haptic(HAPTICS.pageFlipSettle);

  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (stage && fromDragOffset !== 0 && !reduced) {
    flipping = true;
    const w = stage.getBoundingClientRect().width || 360;
    const exitX = dir * Math.min(w * 0.55, Math.abs(fromDragOffset) + w * 0.25);
    Promise.all([
      loadPage(target).catch(() => {}),
      stage.animate(
        [
          { transform: `translateX(${fromDragOffset}px)`, opacity: 1 },
          { transform: `translateX(${exitX}px)`, opacity: 0.35 },
        ],
        { duration: 135, easing: 'cubic-bezier(0.2, 0.9, 0.3, 1)' },
      ).finished.catch(() => {}),
    ]).finally(() => {
      flipping = false;
      if (!root.isConnected) return;
      stage.style.transform = '';
      showPage(root, target, dir);
    });
  } else {
    if (stage) stage.style.transform = '';
    showPage(root, target, dir);
  }
  return true;
}

function animateFlip(plate, dir) {
  plate.classList.add('flipping');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced) return;
  const w = plate.getBoundingClientRect().width || 300;
  // RTL Arabic Mushaf: +1 enters from left (-w * 0.30), -1 enters from right (+w * 0.30)
  plate.animate(
    [
      { transform: `translateX(${-dir * w * 0.30}px) scale(0.99)`, opacity: 0.5 },
      { transform: 'translateX(0) scale(1)', opacity: 1 },
    ],
    { duration: 260, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'backwards' },
  );
}

// ---------------------------------------------------------------------------
// long-press on an ayah → highlight + action sheet (keyboard path above)
// ---------------------------------------------------------------------------
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
