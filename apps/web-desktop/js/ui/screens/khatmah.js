// ============================================================================
// khatmah.js — Khatmah planner (REA_SPEC §4.2 math): deadline rescale,
// rate mode, explicit completed-page SET (khatmah_page_log), streaks.
// ============================================================================
import { state, haptic, HAPTICS } from '../../app-state.js';
import { navigate } from '../router.js';

const isoOf = (d) => {
  const p = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  return p;
};
const todayIso = () => isoOf(new Date());
const inclusiveDays = (a, b) => Math.max(1, Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000) + 1);

async function activePlan() {
  const p = await state.db.queryOne(`SELECT p.*, (SELECT COUNT(*) FROM khatmah_page_log l WHERE l.plan_uuid = p.uuid) AS completed
    FROM khatmah_plans p WHERE p.deleted = 0 AND p.active = 1 ORDER BY p.created_at DESC LIMIT 1`);
  if (!p) return null;
  const rows = await state.db.query(`SELECT page FROM khatmah_page_log WHERE plan_uuid = ?`, [p.uuid]);
  const done = new Set(rows.map((r) => r.page));
  let next = 1;
  while (done.has(next) && next <= 604) next++;
  return { ...p, next_page: next, doneSet: done };
}

export async function renderKhatmah(root) {
  const plan = await activePlan();
  root.innerHTML = `
  <div class="screen">
    <div class="screen-header"><h1>الختمة</h1><div class="sub">خطة قراءة على صفحات المصحف — التاريخ والرياضيات تعمل دون اتصال</div></div>
    <div id="khatmah-content"></div>
  </div>`;
  const content = root.querySelector('#khatmah-content');
  if (!plan) return renderPlanner(content);
  return renderPlan(content, plan);
}

function renderPlanner(content) {
  content.innerHTML = `
  <div class="card">
    <div class="field"><label>النمط</label>
      <select id="k-mode"><option value="deadline">موعد نهائي (يوم محدد للختم)</option><option value="rate">معدل ثابت (صفحات/يوم)</option></select>
    </div>
    <div class="field" id="k-deadline-field"><label>تاريخ الختم</label><input type="date" id="k-end"></div>
    <div class="field" id="k-rate-field" style="display:none"><label>صفحات في اليوم (1–604)</label><input type="number" id="k-daily" min="1" max="604" value="4"></div>
    <button class="btn primary" id="k-start">ابدأ الختمة</button>
  </div>`;
  const mode = content.querySelector('#k-mode');
  mode.addEventListener('change', () => {
    content.querySelector('#k-deadline-field').style.display = mode.value === 'deadline' ? '' : 'none';
    content.querySelector('#k-rate-field').style.display = mode.value === 'rate' ? '' : 'none';
  });
  content.querySelector('#k-start').addEventListener('click', async () => {
    const m = mode.value;
    const endDate = content.querySelector('#k-end')?.value || null;
    const daily = Number(content.querySelector('#k-daily')?.value || 4);
    if (m === 'deadline' && !endDate) return alert('اختر تاريخ الختم أولاً');
    await state.db.write(`INSERT INTO khatmah_plans (uuid, name_ar, mode, start_date, end_date, daily_pages, active, created_at, updated_at)
      VALUES (?, 'ختمتي', ?, ?, ?, ?, 1, ?, ?)`, [crypto.randomUUID(), m, todayIso(), endDate, m === 'rate' ? daily : null, Date.now(), Date.now()]);
    haptic(HAPTICS.bookmarkSaved);
    renderKhatmah(document.getElementById('screen-root'));
  });
}

function renderPlan(content, plan) {
  const remaining = 604 - plan.completed;
  const today = todayIso();
  const dailyTarget = plan.mode === 'deadline'
    ? Math.max(1, Math.ceil(remaining / inclusiveDays(today, plan.end_date)))
    : plan.daily_pages;
  const done = plan.completed;
  const pct = Math.min(100, Math.round((done / 604) * 100));
  const late = plan.mode === 'deadline' && today > plan.end_date;

  content.innerHTML = `
  <div class="card">
    <div class="plan-row">
      <div class="progress-ring" style="--p:${pct}"><div class="inner">${pct}%</div></div>
      <div>
        <div style="font-weight:600">${done} / 604 صفحة</div>
        <div style="font-size:13px;color:var(--color-text-secondary);margin-top:4px">
          ${plan.mode === 'deadline' ? `الختم في ${plan.end_date}${late ? ' · متأخرة — الهدف اليومي أُعيد الحساب' : ''}` : `معدل ${plan.daily_pages} صفحة/يوم`}
        </div>
        <div style="font-size:13px;color:var(--color-text-secondary)">هدف اليوم: <strong>${dailyTarget}</strong> صفحة${late ? ' (كل المتبقي مستحق)' : ''}</div>
      </div>
    </div>
    <div class="sheet-actions">
      <button class="btn primary" id="k-read">اقرأ ورد اليوم (${dailyTarget} صفحات من ${plan.next_page})</button>
      <button class="btn" id="k-complete" ${plan.doneSet.has(plan.next_page) ? 'disabled' : ''}>أكملت صفحة ${plan.next_page}</button>
      <button class="btn" id="k-end-plan">إنهاء الخطة</button>
    </div>
  </div>
  <div class="card"><div style="font-size:13px;color:var(--color-text-secondary)">
    تُحسب الخطة من مجموعة صفحات مكتملة صريحة (khatmah_page_log) — لا عدّادات مشتقة، ويمكن استئنافها عبر ملف .sadaqa على أي جهاز.
  </div></div>`;

  content.querySelector('#k-read').addEventListener('click', () => {
    navigate('mushaf-page', { page: plan.next_page });
  });
  content.querySelector('#k-complete').addEventListener('click', async (e) => {
    await state.db.write(`INSERT INTO khatmah_page_log (plan_uuid, page, completed_at) VALUES (?, ?, ?)`, [plan.uuid, plan.next_page, Date.now()]);
    await state.db.write(`INSERT INTO streak_days (kind, day_key, done_at) VALUES ('khatmah', ?, ?)
      ON CONFLICT(kind, day_key) DO NOTHING`, [todayIso(), Date.now()]);
    haptic(HAPTICS.dhikrComplete);
    e.target.disabled = true;
    renderKhatmah(document.getElementById('screen-root'));
  });
  content.querySelector('#k-end-plan').addEventListener('click', async () => {
    await state.db.write(`UPDATE khatmah_plans SET active = 0, updated_at = ? WHERE uuid = ?`, [Date.now(), plan.uuid]);
    renderKhatmah(document.getElementById('screen-root'));
  });
}
