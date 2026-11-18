// ============================================================================
// tasbih.js — Electronic Tasbih (Phase 4): preset counters (first-run defaults
// created lazily), big tap dial with ring-to-target, haptic tick per tap,
// per-tap session log, 7-day statistics bars, lifetime totals, daily streak
// (streak_days 'tasbih'), custom preset CRUD. Every write is bound.
// ============================================================================
import { state, haptic, HAPTICS, nowMs } from '../../app-state.js';
import { uuid7 } from '../../data/uuid7.js';
import { navigate } from '../router.js';
import { iconSvg } from '../icons.js';

const DEFAULT_PRESETS = [
  { label_ar: 'سُبْحَانَ اللّٰه', dhikr_text: 'سُبْحَانَ اللّٰهِ وَبِحَمْدِهِ', target: 33 },
  { label_ar: 'الْحَمْدُ لِلّٰه', dhikr_text: 'الْحَمْدُ لِلّٰهِ رَبِّ الْعَالَمِين', target: 33 },
  { label_ar: 'اللّٰهُ أَكْبَر', dhikr_text: 'اللّٰهُ أَكْبَرُ وَلِلّٰهِ الْحَمْد', target: 34 },
];

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const dayKeyOf = (ms) => new Intl.DateTimeFormat('en-CA').format(ms);
const dayShift = (days) => dayKeyOf(nowMs() - days * 86_400_000);

/** Current streak length for kind 'tasbih' (consecutive days ending today/yesterday). */
async function tasbihStreak() {
  const rows = await state.db.query(`SELECT day_key FROM streak_days WHERE kind = 'tasbih'`);
  const days = new Set(rows.map((r) => r.day_key));
  let streak = 0;
  let cursor = dayKeyOf(nowMs());
  if (!days.has(cursor)) cursor = dayShift(1); // today not yet marked — count from yesterday
  while (days.has(cursor)) {
    streak++;
    cursor = dayShift(streak);
  }
  return streak;
}

async function ensureDefaults(db) {
  const n = await db.queryOne(`SELECT COUNT(*) n FROM tasbih_counters WHERE deleted = 0`);
  if ((n?.n ?? 0) > 0) return;
  const now = nowMs();
  const stmts = DEFAULT_PRESETS.map((p, i) => ({
    sql: `INSERT INTO tasbih_counters (uuid, label_ar, dhikr_text, target, count, total_lifetime, sort_order, updated_at) VALUES (?, ?, ?, ?, 0, 0, ?, ?)`,
    params: [uuid7(), p.label_ar, p.dhikr_text, p.target, i, now],
  }));
  await db.batch(stmts);
}

export async function renderTasbih(root) {
  await ensureDefaults(state.db);
  const counters = await state.db.query(`SELECT * FROM tasbih_counters WHERE deleted = 0 ORDER BY sort_order`);
  const streak = await tasbihStreak();
  const totals = await state.db.query(
    `SELECT counter_uuid, COUNT(*) taps, SUM(count_delta) sum FROM tasbih_sessions GROUP BY counter_uuid`);
  const sessionsByCounter = new Map(totals.map((r) => [r.counter_uuid, r]));

  root.innerHTML = `
  <div class="screen">
    <div class="screen-header"><h1>السبحة</h1><div class="sub">العدّ الإلكتروني — الإحصاءات والسلاسل اليومية</div></div>
    <div class="card" id="tasbih-pick">
      <h3 style="margin:0 0 10px;font-size:15px">اختر الورد</h3>
      ${counters.map((c) => `
        <div class="plan-row tasbih-pick-row" data-uuid="${c.uuid}" style="padding:9px 0;border-bottom:1px solid var(--color-border)">
          <div>
            <div style="font-weight:600">${esc(c.label_ar)}</div>
            <div style="font-size:12px;color:var(--color-text-secondary)">${esc(c.dhikr_text)}${c.target ? ` · الهدف ${c.target}` : ' · بلا هدف'}</div>
          </div>
          <div style="text-align:end">
            <div style="font-size:13px;font-weight:700;font-variant-numeric:tabular-nums">${c.count}${c.target ? ` / ${c.target}` : ''}</div>
            <div style="font-size:11px;color:var(--color-text-secondary);font-variant-numeric:tabular-nums">الإجمالي ${sessionsByCounter.get(c.uuid)?.sum ?? c.total_lifetime}</div>
          </div>
        </div>`).join('')}
      <div class="row-actions" style="margin-top:10px">
        <button class="btn" id="tb-new">ورد جديد</button>
        <button class="btn" id="tb-stats">الإحصاءات</button>
      </div>
    </div>
    <div class="card" id="tasbih-stats" hidden></div>
    <div id="tasbih-dial-host"></div>
    <div class="card" id="tasbih-edit" hidden></div>
  </div>`;

  const dialHost = root.querySelector('#tasbih-dial-host');
  const statsCard = root.querySelector('#tasbih-stats');
  const editCard = root.querySelector('#tasbih-edit');
  let active = counters[0];

  function renderDial(c) {
    if (!c) { dialHost.innerHTML = ''; return; }
    const pct = c.target ? Math.min(100, (c.count / c.target) * 100) : 0;
    dialHost.innerHTML = `
    <div class="card" data-active="${c.uuid}">
      <div class="tasbih-dial" id="tb-dial" role="button" tabindex="0" aria-label="عدّ ${esc(c.label_ar)}" style="--p:${pct}">
        <div>
          <div class="t-count" id="tb-count">${c.count}</div>
          <div class="t-label">${esc(c.dhikr_text)}</div>
        </div>
        ${c.target ? `<div class="t-of">الهدف ${c.target}</div>` : ''}
      </div>
      <div class="tasbih-actions">
        <button class="btn" id="tb-reset">تصفير العدّة</button>
        <button class="btn" id="tb-edit">تعديل الورد</button>
        <button class="btn text-danger" id="tb-del">حذف</button>
      </div>
    </div>`;
    const dial = dialHost.querySelector('#tb-dial');
    const tap = () => {
      // synchronous local increment FIRST — rapid taps each see the exact
      // next count (DB uses count+1 server-side; no async read-modify race)
      const count = c.count + 1;
      c.count = count;
      haptic(count === c.target ? HAPTICS.dhikrComplete : HAPTICS.dhikrTick);
      state.db.batch([
        { sql: `UPDATE tasbih_counters SET count = count + 1, total_lifetime = total_lifetime + 1, updated_at = ? WHERE uuid = ?`, params: [nowMs(), c.uuid] },
        { sql: `INSERT INTO tasbih_sessions (uuid, counter_uuid, count_delta, occurred_at) VALUES (?, ?, 1, ?)`, params: [uuid7(), c.uuid, nowMs()] },
        ...(count === c.target
          ? [{ sql: `INSERT OR IGNORE INTO streak_days (kind, day_key, done_at) VALUES ('tasbih', ?, ?)`, params: [dayKeyOf(nowMs()), nowMs()] }]
          : []),
      ]).catch((e) => console.warn('[tasbih]', e.message));
      const el = dialHost.querySelector('#tb-count');
      const dialEl = dialHost.querySelector('#tb-dial');
      if (el) el.textContent = String(count);
      if (dialEl && c.target) dialEl.style.setProperty('--p', String(Math.min(100, (count / c.target) * 100)));
    };
    dial.addEventListener('click', tap);
    dial.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tap(); } });
    dialHost.querySelector('#tb-reset').addEventListener('click', async () => {
      await state.db.write(`UPDATE tasbih_counters SET count = 0, updated_at = ? WHERE uuid = ?`, [nowMs(), c.uuid]);
      c.count = 0; renderDial(c); haptic([15]);
    });
    dialHost.querySelector('#tb-edit').addEventListener('click', () => renderEditor(c));
    dialHost.querySelector('#tb-del').addEventListener('click', async () => {
      if (!confirm(`حذف «${c.label_ar}»؟`)) return;
      await state.db.write(`UPDATE tasbih_counters SET deleted = 1, updated_at = ? WHERE uuid = ?`, [nowMs(), c.uuid]);
      navigate('tasbih-screen', { r: Date.now() }); // re-render fresh
    });
  }

  function renderStats() {
    const show = statsCard.hidden;
    statsCard.hidden = !show;
    if (!show) return;
    // last 7 days totals (all counters)
    const days = [...Array(7)].map((_, i) => dayShift(6 - i));
    statsCard.innerHTML = `<h3 style="margin:0 0 6px;font-size:15px">آخر ٧ أيام</h3><div class="week-bars" id="wk"></div>
      <div style="margin-top:10px" id="wk-nums"></div>`;
    const wk = statsCard.querySelector('#wk');
    (async () => {
      const per = new Map();
      for (const d of days) {
        const r = await state.db.queryOne(
          `SELECT SUM(count_delta) s FROM tasbih_sessions WHERE occurred_at >= ? AND occurred_at < ?`,
          [Date.parse(`${d}T00:00:00`), Date.parse(`${d}T00:00:00`) + 86_400_000]);
        per.set(d, r?.s ?? 0);
      }
      const max = Math.max(1, ...per.values());
      wk.innerHTML = days.map((d) => {
        const v = per.get(d) ?? 0;
        return `<div class="wb ${v ? '' : 'empty'}"><i style="height:${Math.round((v / max) * 100)}%"></i><span>${d.slice(5)}</span></div>`;
      }).join('');
      const streakNow = await tasbihStreak();
      const lifetime = await state.db.queryOne(`SELECT SUM(count_delta) s FROM tasbih_sessions`);
      statsCard.querySelector('#wk-nums').innerHTML = `
        <div class="stat-row"><span>السلسلة الحالية</span><span class="v">${iconSvg('flame', 15)}<span>${streakNow} ${streakNow === 1 ? 'يوم' : 'أيام'}</span></span></div>
        <div class="stat-row"><span>الإجمالي الكلي</span><span class="v">${lifetime?.s ?? 0}</span></div>`;
    })();
  }

  function renderEditor(c) {
    editCard.hidden = false;
    editCard.innerHTML = `
      <h3 style="margin:0 0 8px;font-size:15px">${c ? 'تعديل الورد' : 'ورد جديد'}</h3>
      <div class="field"><label>الاسم</label><input id="te-label" value="${esc(c?.label_ar ?? '')}" maxlength="60"></div>
      <div class="field"><label>نص الذكر</label><input id="te-text" value="${esc(c?.dhikr_text ?? '')}" maxlength="200"></div>
      <div class="field"><label>الهدف (اتركه فارغاً = بلا هدف)</label><input id="te-target" type="number" min="1" max="100000" value="${c?.target ?? ''}"></div>
      <div class="row-actions">
        <button class="btn primary" id="te-save">حفظ</button>
        <button class="btn" id="te-cancel">إلغاء</button>
      </div>`;
    editCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    editCard.querySelector('#te-cancel').addEventListener('click', () => { editCard.hidden = true; });
    editCard.querySelector('#te-save').addEventListener('click', async () => {
      const label = editCard.querySelector('#te-label').value.trim();
      const text = editCard.querySelector('#te-text').value.trim() || label;
      const targetRaw = editCard.querySelector('#te-target').value;
      const target = targetRaw ? Math.max(1, Math.min(100000, Number(targetRaw))) : null;
      if (!label) { editCard.querySelector('#te-label').focus(); return; }
      if (c) {
        await state.db.write(
          `UPDATE tasbih_counters SET label_ar = ?, dhikr_text = ?, target = ?, updated_at = ? WHERE uuid = ?`,
          [label, text, target, nowMs(), c.uuid]);
      } else {
        const maxSort = await state.db.queryOne(`SELECT COALESCE(MAX(sort_order), -1) m FROM tasbih_counters`);
        await state.db.write(
          `INSERT INTO tasbih_counters (uuid, label_ar, dhikr_text, target, count, total_lifetime, sort_order, updated_at)
           VALUES (?, ?, ?, ?, 0, 0, ?, ?)`,
          [uuid7(), label, text, target, (maxSort?.m ?? -1) + 1, nowMs()]);
      }
      editCard.hidden = true;
      navigate('tasbih-screen', { r: Date.now() });
    });
  }

  for (const row of root.querySelectorAll('.tasbih-pick-row')) {
    row.addEventListener('click', () => {
      active = counters.find((c) => c.uuid === row.dataset.uuid) ?? active;
      for (const r of root.querySelectorAll('.tasbih-pick-row')) r.style.outline = '';
      row.style.outline = '1.5px solid var(--color-accent)';
      renderDial(active);
    });
  }
  root.querySelector('#tb-new').addEventListener('click', () => renderEditor(null));
  root.querySelector('#tb-stats').addEventListener('click', renderStats);
  if (counters.length) renderDial(active);
}
