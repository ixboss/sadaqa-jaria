// ============================================================================
// athkar.js — Hisn al-Muslim reader (Phase 4). Category tiles → sequential
// counter cards: ring progress per item, tap-to-increment, auto-advance on
// target, haptic choreography (tick / complete / category-complete from design
// tokens), collapsible hadith verification, hands-free mode (timed
// auto-advance; TTS best-effort when an Arabic voice exists). State persists
// per item per local day (adhkar_state); category completion writes streaks.
// ============================================================================
import { state, haptic, HAPTICS, nowMs } from '../../app-state.js';
import { navigate } from '../router.js';

const WINDOW_BADGE = { fajr: '🌅 الصباح', duha: '☀️ الضحى', asr: '🌇 المساء', night: '🌙 الليل', after_prayer: '🕌 بعد الصلاة' };

const dayKeyOf = (ms) => new Intl.DateTimeFormat('en-CA').format(ms);
/** Estimated per-repetition seconds for hands-free pacing (length-scaled). */
const repSeconds = (text) => Math.min(14, Math.max(2.5, text.length * 0.055));

/** Streak kind for a category (solar-window → streak_days.kind). */
function streakKindFor(category) {
  if (category.solar_window === 'fajr') return 'adhkar_morning';
  if (category.solar_window === 'asr') return 'adhkar_evening';
  return null;
}

// ---------------------------------------------------------------------------
// Screen 1: category tiles
// ---------------------------------------------------------------------------
export async function renderAthkar(root) {
  const cats = await state.db.query(`SELECT c.*, (SELECT COUNT(*) FROM athkar_items i WHERE i.category_id = c.category_id) items FROM athkar_categories c ORDER BY c.sort_order`);
  const doneToday = await state.db.query(
    `SELECT item_id FROM adhkar_state WHERE day_key = ? AND completed_at IS NOT NULL`, [dayKeyOf(nowMs())]);
  const doneSet = new Set(doneToday.map((r) => r.item_id));

  root.innerHTML = `
  <div class="screen">
    <div class="screen-header"><h1>الأذكار</h1><div class="sub">حصن المسلم — ${cats.length} قسماً · العدّ بالحلقات الدائرية والانتقال التلقائي</div></div>
    <div id="cat-list">${cats.map((c) => {
      const n = Number(c.items);
      return `<div class="cat-tile" data-cat="${c.category_id}" role="button" tabindex="0" aria-label="${c.name_ar}">
        <span class="c-icon">${c.icon === 'dhikr' ? '🤲' : '📿'}</span>
        <span class="c-name">${c.name_ar}</span>
        <span class="c-meta">${WINDOW_BADGE[c.solar_window] ? WINDOW_BADGE[c.solar_window] + ' · ' : ''}${n} ${n === 1 ? 'ذكر' : 'أذكار'}</span>
      </div>`;
    }).join('')}</div>
  </div>`;

  const open = (id) => navigate('adhkar-cat', { id });
  for (const el of root.querySelectorAll('.cat-tile')) {
    el.addEventListener('click', () => open(el.dataset.cat));
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(el.dataset.cat); } });
  }
}

// ---------------------------------------------------------------------------
// Screen 2: category reader
// ---------------------------------------------------------------------------
export async function renderAthkarReader(root, args) {
  const catId = args.id;
  const cat = await state.db.queryOne(`SELECT * FROM athkar_categories WHERE category_id = ?`, [catId]);
  if (!cat) { navigate('adhkar-screen'); return; }
  const items = await state.db.query(`SELECT * FROM athkar_items WHERE category_id = ? ORDER BY sort_order`, [catId]);
  const dayKey = dayKeyOf(nowMs());
  const saved = await state.db.query(`SELECT item_id, count, completed_at FROM adhkar_state WHERE day_key = ?`, [dayKey]);
  const stateMap = new Map(saved.map((r) => [r.item_id, r]));

  let idx = items.findIndex((it) => !(stateMap.get(it.item_id)?.completed_at));
  if (idx < 0) idx = 0; // all done → review from the top (counts re-read)
  const auto = { on: false, timer: null };
  let current = idx;

  root.innerHTML = `
  <div class="screen">
    <div class="screen-header"><h1>${cat.name_ar}</h1><div class="sub">${items.length} ${items.length === 1 ? 'ذكر' : 'أذكار'} · انقر البطاقة للعدّ</div></div>
    <div class="reader-progress" id="reader-progress">
      <span id="rp-label"></span>
      <div class="bar"><i id="rp-bar" style="width:0%"></i></div>
      <button class="auto-toggle" id="auto-toggle" aria-pressed="false" title="وضع بدون استخدام اليدين">
        <span>بدون يدين</span><span class="sw" aria-hidden="true"></span>
      </button>
    </div>
    <div id="zkr-host"></div>
    <div class="card" style="text-align:center">
      <button class="btn" id="zkr-back">كل الأقسام</button>
    </div>
  </div>`;

  const host = root.querySelector('#zkr-host');
  root.querySelector('#zkr-back').addEventListener('click', () => navigate('adhkar-screen'));

  function doneCount() {
    return items.filter((it) => stateMap.get(it.item_id)?.completed_at).length;
  }
  function paintProgress() {
    const done = doneCount();
    root.querySelector('#rp-label').textContent = `${done} / ${items.length}`;
    root.querySelector('#rp-bar').style.width = `${items.length ? (done / items.length) * 100 : 0}%`;
  }

  function renderCard(pos) {
    const it = items[pos];
    const st = stateMap.get(it.item_id) ?? { count: 0, completed_at: null };
    const target = it.count_target;
    const isDone = Boolean(st.completed_at);
    const pct = target > 0 ? Math.min(100, (st.count / target) * 100) : (isDone ? 100 : 0);
    host.innerHTML = `
    <div class="zkr-card ${isDone ? 'done' : ''}" id="zkr-card" data-pos="${pos}" role="button" tabindex="0" aria-label="عدّ هذا الذكر">
      <div class="z-text">${it.text_ar}</div>
      ${target > 0 ? `
      <div class="z-count-row">
        <div class="z-ring" style="--p:${pct}"><div class="inner">${st.count}</div></div>
        <div class="z-target">الهدف: ${target} ${isDone ? '· أُتمّ ✓' : `· تبقّى ${Math.max(0, target - st.count)}`}</div>
        <div class="z-count" style="flex:1;text-align:end">${st.count} / ${target}</div>
      </div>` : `
      <div class="z-count-row"><div class="z-target">${isDone ? 'أُقرأ ✓' : 'ذكر يُقرأ مرة واحدة — انقر للمتابعة'}</div></div>`}
      ${it.source_ar || it.fadl_ar ? `
      <details class="zkr-verify">
        <summary>▸ التحقق والحكم ${it.grade ? `<span class="grade">${gradeAr(it.grade)}</span>` : ''}</summary>
        <div class="src">${it.fadl_ar ? `<div style="margin-bottom:6px">${it.fadl_ar}</div>` : ''}${it.source_ar ? `<div>الدرجة/المصدر: ${it.source_ar}</div>` : ''}</div>
      </details>` : ''}
    </div>`;
    paintProgress();

    const cardEl = host.querySelector('#zkr-card');
    cardEl.addEventListener('click', () => tick());
    cardEl.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tick(); } });
  }

  function gradeAr(g) { return g === 'sahih' ? 'صحيح' : g === 'hasan' ? 'حسن' : g === 'daif' ? 'ضعيف' : g; }

  async function persist(it, count, completedAt) {
    await state.db.write(
      `INSERT INTO adhkar_state (item_id, day_key, count, completed_at, updated_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(item_id, day_key) DO UPDATE SET count = excluded.count, completed_at = excluded.completed_at, updated_at = excluded.updated_at`,
      [it.item_id, dayKey, count, completedAt, nowMs()],
    );
  }

  function stopAuto() {
    if (auto.timer) { clearTimeout(auto.timer); auto.timer = null; }
    auto.on = false;
    root.querySelector('#auto-toggle')?.setAttribute('aria-pressed', 'false');
  }

  function scheduleAuto() {
    if (!auto.on) return;
    const it = items[current];
    const st = stateMap.get(it.item_id) ?? { count: 0 };
    const remain = it.count_target > 0 ? Math.max(1, it.count_target - st.count) : 1;
    auto.timer = setTimeout(() => tick(true), repSeconds(it.text_ar) * 1000);
  }

  function advance() {
    const nextPos = items.findIndex((it, i) => i > current && !stateMap.get(it.item_id)?.completed_at);
    if (nextPos >= 0) { current = nextPos; renderCard(current); scheduleAuto(); return true; }
    // wrapped: any open item?
    const anyOpen = items.findIndex((it) => !stateMap.get(it.item_id)?.completed_at);
    if (anyOpen >= 0 && anyOpen !== current) { current = anyOpen; renderCard(current); scheduleAuto(); return true; }
    // category complete → celebration haptic + streak write
    haptic(HAPTICS.categoryComplete);
    const kind = streakKindFor(cat);
    if (kind) {
      state.db.write(
        `INSERT OR IGNORE INTO streak_days (kind, day_key, done_at) VALUES (?, ?, ?)`,
        [kind, dayKey, nowMs()],
      ).catch(() => {});
    }
    return false;
  }

  async function tick(fromAuto = false) {
    const it = items[current];
    const st = stateMap.get(it.item_id) ?? { count: 0, completed_at: null };
    const target = it.count_target;
    if (target > 0 && st.count < target) {
      const count = st.count + 1;
      const completedAt = count >= target ? nowMs() : null;
      stateMap.set(it.item_id, { item_id: it.item_id, count, completed_at: completedAt });
      haptic(count >= target ? HAPTICS.dhikrComplete : HAPTICS.dhikrTick);
      await persist(it, count, completedAt);
      renderCard(current);
      if (count >= target) {
        setTimeout(() => { if (!advance()) stopAuto(); }, 420);
        return;
      }
    } else if (target === 0) {
      const completedAt = st.completed_at ? st.completed_at : nowMs();
      stateMap.set(it.item_id, { item_id: it.item_id, count: 1, completed_at: completedAt });
      haptic(HAPTICS.dhikrTick);
      await persist(it, 1, completedAt);
      advance();
      return;
    }
    scheduleAuto();
  }

  const toggle = root.querySelector('#auto-toggle');
  toggle.addEventListener('click', async () => {
    auto.on = !auto.on;
    toggle.setAttribute('aria-pressed', String(auto.on));
    haptic([10]);
    if (auto.on) {
      try { await speak(items[current].text_ar); } catch { /* no TTS — timed pacing still works */ }
      scheduleAuto();
    } else stopAuto();
  });

  renderCard(current);
}

/** Hands-free voice: best-effort Arabic TTS (never a hard dependency). */
async function speak(text) {
  if (!('speechSynthesis' in window)) return false;
  const voices = speechSynthesis.getVoices();
  const ar = voices.find((v) => v.lang?.startsWith('ar'));
  if (!ar) return false;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.voice = ar; u.lang = ar.lang; u.rate = 0.95;
  speechSynthesis.speak(u);
  return true;
}
