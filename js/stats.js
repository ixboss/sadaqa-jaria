/* stats.js — الإحصائيات وتتبّع السلاسل اليومية (مُستخرج من features.js) */
'use strict';

const StatsManager = {
  KEY: 'app_stats_v1',
  DEFAULT: { days: {}, totalTasbih: 0, totalPages: 0, athkarDays: {}, completedKhatmahs: 0, khatmahHistory: [] },

  getAll() {
    try {
      const s = localStorage.getItem(this.KEY);
      if (s) {
        const p = JSON.parse(s);
        if (p && typeof p === 'object') {
          if (!p.days || typeof p.days !== 'object') p.days = {};
          if (!p.athkarDays || typeof p.athkarDays !== 'object') p.athkarDays = {};
          if (!Array.isArray(p.khatmahHistory)) p.khatmahHistory = [];
          if (typeof p.completedKhatmahs !== 'number') p.completedKhatmahs = p.khatmahHistory.length;
          return p;
        }
      }
    } catch (e) {}
    return JSON.parse(JSON.stringify(this.DEFAULT));
  },
  save(s) { try { localStorage.setItem(this.KEY, JSON.stringify(s)); } catch (e) {} },
  today() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  },

  recordRead(pages = 1) {
    const s = this.getAll();
    const t = this.today();
    s.days[t] = (s.days[t] || 0) + pages;
    s.totalPages = (s.totalPages || 0) + pages;
    this.save(s);
  },
  recordTasbih(count = 1) {
    const s = this.getAll();
    s.totalTasbih = (s.totalTasbih || 0) + count;
    this.save(s);
  },
  recordAthkarDay() {
    const s = this.getAll();
    s.athkarDays[this.today()] = 1;
    this.save(s);
  },
  recordKhatmah(intention = '') {
    const s = this.getAll();
    s.completedKhatmahs = (s.completedKhatmahs || 0) + 1;
    if (!Array.isArray(s.khatmahHistory)) s.khatmahHistory = [];
    s.khatmahHistory.unshift({
      date: this.today(),
      intention: String(intention || '').trim().slice(0, 100)
    });
    if (s.khatmahHistory.length > 50) s.khatmahHistory.length = 50;
    this.save(s);
  },

  // السلسلة المتتالية للأيام التي قُرئ فيها
  getStreak() {
    const days = Object.keys(this.getAll().days || {}).sort();
    if (!days.length) return 0;
    const keyOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    let streak = 0;
    let cursor = new Date(); cursor.setHours(0, 0, 0, 0);
    // إن لم يُقرأ اليوم بعد، نبدأ العد من الأمس فلا تنكسر سلسلةٌ ما زالت مستمرة
    if (!days.includes(keyOf(cursor))) cursor.setDate(cursor.getDate() - 1);
    for (;;) {
      const key = keyOf(cursor);
      if (days.includes(key)) { streak++; cursor.setDate(cursor.getDate() - 1); }
      else break;
    }
    return streak;
  },
  getWeekPages() {
    const s = this.getAll().days || {};
    const out = [];
    const today = new Date(); today.setHours(0, 0, 0, 0);
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today); d.setDate(today.getDate() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      out.push({ label: ['الأحد','الإثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'][d.getDay()], pages: s[key] || 0 });
    }
    return out;
  },
  getActiveDaysCount() { return Object.keys(this.getAll().days || {}).length; },

  render() {
    const el = document.getElementById('stats-container');
    if (!el) return;
    const all = this.getAll();
    const streak = this.getStreak();
    const week = this.getWeekPages();
    const maxW = Math.max(1, ...week.map(w => w.pages));
    const athkarDays = Object.keys(all.athkarDays || {}).length;
    const khatmahCount = all.completedKhatmahs || 0;
    const history = Array.isArray(all.khatmahHistory) ? all.khatmahHistory : [];

    el.innerHTML = `
      <div class="stats-cards">
        <div class="stat-card"><div style="font-size:20px;margin-bottom:4px;">🔥</div><div class="stat-value">${this.toArabic(streak)} <small style="font-size:0.45em;font-weight:700;color:var(--text-dim);">يوم</small></div><div class="stat-label">أيام قراءة متتالية</div></div>
        <div class="stat-card"><div style="font-size:20px;margin-bottom:4px;">📖</div><div class="stat-value">${this.toArabic(all.totalPages || 0)} <small style="font-size:0.45em;font-weight:700;color:var(--text-dim);">صفحة</small></div><div class="stat-label">إجمالي الصفحات المقروءة</div></div>
        <div class="stat-card"><div style="font-size:20px;margin-bottom:4px;">📿</div><div class="stat-value">${this.toArabic(all.totalTasbih || 0)} <small style="font-size:0.45em;font-weight:700;color:var(--text-dim);">ذكر</small></div><div class="stat-label">إجمالي التسبيحات</div></div>
        <div class="stat-card"><div style="font-size:20px;margin-bottom:4px;">🛡️</div><div class="stat-value">${this.toArabic(athkarDays)} <small style="font-size:0.45em;font-weight:700;color:var(--text-dim);">يوم</small></div><div class="stat-label">أيام المواظبة على الأذكار</div></div>
        <div class="stat-card" style="grid-column: span 2;"><div style="font-size:22px;margin-bottom:4px;">🕋</div><div class="stat-value">${this.toArabic(khatmahCount)} <small style="font-size:0.45em;font-weight:700;color:var(--text-dim);">ختمة</small></div><div class="stat-label">ختمات قرآنية مكتملة</div></div>
      </div>
      <div class="stats-chart-card">
        <div class="section-heading" style="margin-top:0">قراءة آخر ٧ أيام</div>
        <div class="stats-bars">
          ${week.map((w, idx) => `
            <div class="stats-bar-col">
              <div class="stats-bar-wrap"><div class="stats-bar" data-target-h="${Math.max(4, (w.pages / maxW) * 100)}" style="height:4%; transition-delay:${idx * 55}ms"><span class="stats-bar-tip">${w.pages ? this.toArabic(w.pages) : ''}</span></div></div>
              <div class="stats-bar-label">${w.label}</div>
            </div>`).join('')}
        </div>
      </div>
      ${history.length ? `
      <div class="stats-chart-card" style="margin-top:14px">
        <div class="section-heading" style="margin-top:0">سجل الختمات المكتملة</div>
        ${history.slice(0, 10).map((item, i) => `
          <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 4px; border-bottom:1px solid var(--border); font-size:calc(var(--font-size) * 0.52)">
            <span>🕋 الختمة ${this.toArabic(history.length - i)}${item.intention ? ` — <b style="color:var(--accent)">${escapeHtml(item.intention)}</b>` : ''}</span>
            <span style="color:var(--text-dim); font-family:var(--font-num)">${escapeHtml(item.date || '')}</span>
          </div>`).join('')}
      </div>` : ''}
      <div class="occasion-note">البيانات محفوظة على جهازك فقط ولا تُرسل لأي خادم.</div>`;

    // تحريك أعمدة الرسم البياني من الصفر عند فتح الشاشة
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.querySelectorAll('.stats-bar[data-target-h]').forEach(bar => {
          bar.style.height = bar.dataset.targetH + '%';
        });
      });
    });
  },
  toArabic(n) { return (n || 0).toString().replace(/\d/g, d => '٠١٢٣٤٥٦٧٨٩'[d]); }
};
window.StatsManager = StatsManager;
