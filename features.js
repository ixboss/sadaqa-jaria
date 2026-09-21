// ==================== Features Module ====================
// يحتاج: Motion, BookmarkManager, StorageManager (معرّفة في index.html / app.js)
'use strict';

/* ==================== 1) Haptics — الاهتزاز اللمسي ==================== */
const Haptics = {
  supported() { return 'vibrate' in navigator; },
  tap(ms = 12) { if (this.supported()) navigator.vibrate(ms); },
  success() { if (this.supported()) navigator.vibrate([18, 40, 22]); },
  celebrate() { if (this.supported()) navigator.vibrate([25, 50, 25, 50, 45]); }
};
window.Haptics = Haptics;

/* ==================== 2) Unified celebration helper ==================== */
// توحيد الاحتفالات (Tasbih / Khatmah / Athkar) في مكان واحد
window.Celebrate = function (target, opts = {}) {
  const { confetti = 40, burst = 10, ring = true, haptic = true } = opts;
  try {
    if (ring && target && window.Motion) Motion.surgeRing(target);
    if (burst && target && window.Motion) Motion.burst(target, burst, 'var(--accent)');
    if (confetti && window.Motion) Motion.confetti(confetti);
    if (haptic) Haptics.celebrate();
  } catch (e) { /* تجاهل */ }
};

/* ==================== 3) Stats Manager — الإحصائيات والسلاسل ==================== */
const StatsManager = {
  KEY: 'app_stats_v1',
  DEFAULT: { days: {}, totalTasbih: 0, totalPages: 0, athkarDays: {} },

  getAll() {
    try { const s = localStorage.getItem(this.KEY); if (s) { const p = JSON.parse(s); if (p && p.days) return p; } } catch (e) {}
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
      const d = new Date(today); d.setDate(d.getDate() - i);
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

    el.innerHTML = `
      <div class="stats-cards">
        <div class="stat-card"><div class="stat-value">${streak}</div><div class="stat-label">أيام متتالية 🔥</div></div>
        <div class="stat-card"><div class="stat-value">${this.toArabic(all.totalPages || 0)}</div><div class="stat-label">صفحات مقروءة</div></div>
        <div class="stat-card"><div class="stat-value">${this.toArabic(all.totalTasbih || 0)}</div><div class="stat-label">تسبيحات</div></div>
        <div class="stat-card"><div class="stat-value">${this.toArabic(athkarDays)}</div><div class="stat-label">أيام أذكار</div></div>
      </div>
      <div class="stats-chart-card">
        <div class="section-heading" style="margin-top:0">قراءة آخر ٧ أيام</div>
        <div class="stats-bars">
          ${week.map(w => `
            <div class="stats-bar-col">
              <div class="stats-bar-wrap"><div class="stats-bar" style="height:${Math.max(4, (w.pages / maxW) * 100)}%"><span class="stats-bar-tip">${w.pages ? this.toArabic(w.pages) : ''}</span></div></div>
              <div class="stats-bar-label">${w.label}</div>
            </div>`).join('')}
        </div>
      </div>
      <div class="occasion-note">البيانات محفوظة على جهازك فقط ولا تُرسل لأي خادم.</div>`;
  },
  toArabic(n) { return (n || 0).toString().replace(/\d/g, d => '٠١٢٣٤٥٦٧٨٩'[d]); }
};
window.StatsManager = StatsManager;

/* ==================== 5) Bookmarks view — شاشة المرجعيات ==================== */
// مساعد تهريب نص HTML لمنع حقن المحتوى عبر innerHTML
const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[c]));
window.escapeHtml = escapeHtml;

const BookmarksView = {
  render() {
    const el = document.getElementById('bookmarks-container');
    if (!el) return;
    let bm = { surahs: {}, verses: [] };
    try { bm = window.BookmarkManager.getAll(); } catch (e) {}
    const surahList = Object.entries(bm.surahs || {}).sort((a, b) => b[1].timestamp - a[1].timestamp);
    const verses = (bm.verses || []).slice().reverse();
    const isEmpty = !surahList.length && !verses.length;

    if (isEmpty) {
      el.innerHTML = `<div class="occasion-empty">لا توجد مرجعيات محفوظة بعد.<br>افتح أي سورة واضغط على علامة 🔖 لحفظها.</div>`;
      return;
    }

    el.innerHTML = `
      ${surahList.length ? `<div class="section-heading">السور المحفوظة (${this.toArabic(surahList.length)})</div>` : ''}
      ${surahList.map(([num, info]) => `
        <div class="surah-row" data-magnetic onclick="window.BookmarksView.openSurah(${num})">
          <div class="surah-num">${this.toArabic(num)}</div>
          <div class="surah-info"><div class="surah-name">${escapeHtml(info.name || 'سورة')}</div>
          <div class="surah-meta">محفوظة ${this.timeAgo(info.timestamp)}</div></div>
          <button class="bm-remove" aria-label="حذف" onclick="event.stopPropagation(); window.BookmarksView.removeSurah(${num})">×</button>
        </div>`).join('')}
      ${verses.length ? `<div class="section-heading" style="margin-top:18px">الآيات المحفوظة (${this.toArabic(verses.length)})</div>` : ''}
      ${verses.map((v, i) => `
        <div class="thikr-card" style="padding:16px 20px; cursor:pointer" onclick="window.BookmarksView.openVerse(${v.surah}, ${v.ayah})">
          <div class="surah-meta" style="margin-bottom:6px">سورة ${this.surahName(v.surah)} — آية ${this.toArabic(v.ayah)}</div>
          <div class="dua-text" style="font-size:calc(var(--font-size) * 0.8)">${escapeHtml((v.text || '').slice(0, 160))}…</div>
          <button class="bm-remove" aria-label="حذف" onclick="event.stopPropagation(); window.BookmarksView.removeVerse(${v.surah}, ${v.ayah})">×</button>
        </div>`).join('')}`;
  },
  surahName(n) {
    const meta = (window.SURAH_META || []).find(m => m.number === n);
    return meta ? meta.name : `سورة ${n}`;
  },
  timeAgo(ts) {
    if (!ts) return '';
    const diff = Date.now() - ts;
    const days = Math.floor(diff / 86400000);
    if (days < 1) return 'اليوم';
    if (days === 1) return 'أمس';
    return `منذ ${this.toArabic(days)} يوم`;
  },
  toArabic(n) { return (n || 0).toString().replace(/\d/g, d => '٠١٢٣٤٥٦٧٨٩'[d]); },
  openSurah(num) { if (window.openSurah) window.openSurah(num); },
  // افتح السورة على صفحة الآية المحفوظة وحدّدها
  openVerse(s, a) { if (window.openSurah) window.openSurah(s, a); },
  removeSurah(num) {
    const el = document.getElementById('bookmarks-container');
    const play = window.Motion ? window.Motion.flipAnimate(el, '.surah-row') : null;
    try { window.BookmarkManager.removeSurahBookmark(num); } catch (e) {}
    this.render();
    if (play) play();
  },
  removeVerse(s, a) {
    const el = document.getElementById('bookmarks-container');
    const play = window.Motion ? window.Motion.flipAnimate(el, '.thikr-card') : null;
    try { window.BookmarkManager.removeVerseBookmark(s, a); } catch (e) {}
    this.render();
    if (play) play();
  }
};
window.BookmarksView = BookmarksView;

/* ==================== 6) Settings — الإعدادات ==================== */
const Settings = {
  RECITERS: [
    { id: 'ar.alafasy', name: 'مشاري العفاسي' },
    { id: 'ar.abdulbasitmurattal', name: 'عبد الباسط عبد الصمد (مرتل)' },
    { id: 'ar.husary', name: 'محمود الحصري' },
    { id: 'ar.minshawi', name: 'محمد المنشاوي' },
    { id: 'ar.muhammadayyoub', name: 'محمد أيوب' }
  ],
  TASBIH_TARGETS: [
    { v: 33, label: '٣٣ (تسبيح)' },
    { v: 99, label: '٩٩ (الاسم الأعظم)' },
    { v: 100, label: '١٠٠ (استغفار)' },
    { v: 1000, label: '١٠٠٠ (الجوامع)' }
  ],

  getReciter() { try { return localStorage.getItem('reciter') || 'ar.alafasy'; } catch (e) { return 'ar.alafasy'; } },
  setReciter(id) { try { localStorage.setItem('reciter', id); } catch (e) {} },
  getTasbihTarget() { try { return parseInt(localStorage.getItem('tasbih_target') || '33', 10); } catch (e) { return 33; } },
  setTasbihTarget(v) { try { localStorage.setItem('tasbih_target', String(v)); } catch (e) {} },
  remindersEnabled() { try { return localStorage.getItem('reminders_enabled') === '1'; } catch (e) { return false; } },
  setRemindersEnabled(v) { try { localStorage.setItem('reminders_enabled', v ? '1' : '0'); } catch (e) {} },

  render() {
    const el = document.getElementById('settings-container');
    if (!el) return;
    const curReciter = this.getReciter();
    const curTarget = this.getTasbihTarget();
    const remOn = this.remindersEnabled();

    el.innerHTML = `
      <div class="settings-card">
        <div class="settings-label">هدف السبحة</div>
        <div class="settings-targets">
          ${this.TASBIH_TARGETS.map(t => `
            <button class="settings-chip ${curTarget === t.v ? 'active' : ''}" data-target="${t.v}">${t.label}</button>`).join('')}
        </div>
      </div>

      <div class="settings-card">
        <div class="settings-label">قارئ التلاوة</div>
        <select id="settings-reciter" class="k-input" style="margin-bottom:0">
          ${this.RECITERS.map(r => `<option value="${r.id}" ${r.id === curReciter ? 'selected' : ''}>${r.name}</option>`).join('')}
        </select>
      </div>

      <div class="settings-card settings-row">
        <div>
          <div class="settings-label" style="margin-bottom:2px">تذكيرات يومية</div>
          <div class="surah-meta">تذكير بأذكار الصباح/المساء وورد الختمة. تعمل التذكيرات أثناء فتح التطبيق فقط (المتصفح لا يسمح بتذكيرات في الخلفية بدون تثبيت التطبيق).</div>
        </div>
        <button id="settings-reminders" class="settings-toggle ${remOn ? 'on' : ''}" role="switch" aria-checked="${remOn}" aria-label="تذكيرات يومية"><span class="settings-toggle-knob"></span></button>
      </div>

      <div class="settings-card settings-row" data-action="openStats" role="button" tabindex="0" aria-label="الإحصائيات">
        <div><div class="settings-label" style="margin-bottom:2px">الإحصائيات</div>
        <div class="surah-meta">السلسلة، الصفحات، والتسبيحات</div></div>
        <div class="settings-arrow">←</div>
      </div>

      <div class="occasion-note" style="margin-top:16px">تطبيق «إسلامي» — صدقة جارية. جميع بياناتك تبقى على جهازك.</div>`;
  },

  bind() {
    const el = document.getElementById('settings-container');
    if (!el || el.dataset.bound) return;
    el.dataset.bound = '1';

    el.addEventListener('click', e => {
      const chip = e.target.closest('[data-target]');
      if (chip) {
        this.setTasbihTarget(parseInt(chip.dataset.target, 10));
        Haptics.tap();
        this.render();
        if (window.rebuildTasbih) window.rebuildTasbih();
        return;
      }
      const row = e.target.closest('[data-action="openStats"]');
      if (row) { window.Settings.openStats(); }
    });

    el.addEventListener('change', e => {
      if (e.target.id === 'settings-reciter') {
        this.setReciter(e.target.value);
        if (window.AudioPlayer) AudioPlayer.refreshReciter();
      }
    });

    const tgl = el.querySelector('#settings-reminders');
    if (tgl) tgl.addEventListener('click', () => this.toggleReminders());
  },

  async toggleReminders() {
    const next = !this.remindersEnabled();
    if (next) {
      const ok = await window.Reminders.enable();
      if (!ok) { if (window.showAppDialog) await window.showAppDialog('تعذّر تفعيل الإشعارات. يمكن تفعيلها من إعدادات المتصفح.', false); return; }
    } else {
      window.Reminders.disable();
    }
    this.render();
  },

  openStats() {
    if (window.showStats) window.showStats();
  }
};
window.Settings = Settings;

/* ==================== 7) Audio player — التلاوة الصوتية ==================== */
// مشغّل آية بآية: كل ملف هو آية واحدة من cdn.islamic.network (نفس المزوّد
// الموثّق للنص)، فيكون موضع بداية ونهاية كل آية دقيقاً بالبناء. داخل الآية
// يُوزَّع التظليل على الكلمات حسب وزن أحرفها ويُعاد ربطه عند كل آية جديدة
// فلا تتراكم أي انحرافات. لا تتوفر بيانات توقيت موثّقة على مستوى الكلمة
// لأي قارئ من القُرّاء، لذا التظليل داخل الآية تقدير بصري متحرّك فقط.
const AudioPlayer = {
  audio: null, queue: [], qi: -1, current: null, surahName: '',
  rafId: null, curEl: null, curWords: null, curItem: null, _lastNow: -2, _errCount: 0,

  ensure() {
    if (this.audio) return;
    this.audio = new Audio();
    this.audio.addEventListener('ended', () => this.advance(false));
    this.audio.addEventListener('error', () => this.advance(true));
    this.audio.addEventListener('pause', () => this.stopClock());
    // استئناف ساعة التظليل عند العودة للصفحة (تتوقف أثناء الإخفاء لتوفير الموارد)
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && this.audio && !this.audio.paused) this.startClock();
    });
  },
  reciter() { return window.Settings ? Settings.getReciter() : 'ar.alafasy'; },
  // ملف آية واحدة: {reciter}/{الرقف العالمي للآية}.mp3
  urlForAyah(globalNo) { return `https://cdn.islamic.network/quran/audio/128/${this.reciter()}/${globalNo}.mp3`; },
  urlFor(surah) { return `https://cdn.islamic.network/quran/audio-surah/128/${this.reciter()}/${surah}.mp3`; },

  // يبني قائمة التلاوة من بيانات السورة المخزّنة في state (بدون طلبات إضافية)
  buildQueue(surah, fromAyah = 1) {
    const data = window.state && window.state.currentSurahData ? window.state.currentSurahData : null;
    const ayahs = data && Array.isArray(data.ayahs) ? data.ayahs : [];
    this.queue = ayahs.filter(a => a.numberInSurah >= fromAyah).map(a => {
      const sn = (a.surah && a.surah.number) || surah;
      let text = a.text;
      if (a.numberInSurah === 1 && sn !== 1 && sn !== 9) text = window.stripBismillah ? stripBismillah(text) : text;
      return { surah: sn, ayah: a.numberInSurah, global: a.number, text };
    });
    this.qi = this.queue.length ? 0 : -1;
  },

  // زر الرأس: يبدّل بين التشغيل/الإيقاف المؤقت للسورة الحالية، أو يبدأ من الصفحة المعروضة
  play(surah, name, fromAyah = 1) {
    this.ensure();
    if (this.current === surah && this.audio) {
      if (!this.audio.paused) { this.pause(); return; }
      if (this.audio.currentTime > 0) { this.resume(); return; }
    }
    this.current = surah;
    this.surahName = name || (window.state && window.state.currentSurah ? window.state.currentSurah.name : '');
    this.buildQueue(surah, fromAyah);
    if (this.qi < 0) { this.hide(); return; }
    this.loadCurrent();
  },

  // تشغيل مستقل بدءاً من آية محددة (من شريط إجراءات الآية)
  playFromAyah(surah, ayahNo) {
    this.ensure();
    this.current = surah;
    this.surahName = (window.state && window.state.currentSurah ? window.state.currentSurah.name : '');
    this.buildQueue(surah, ayahNo);
    if (this.qi < 0) { this.hide(); return; }
    this.loadCurrent();
  },

  loadCurrent() {
    const item = this.queue[this.qi];
    if (!item) { this.stop(); return; }
    this.curItem = item;
    this.audio.src = this.urlForAyah(item.global);
    this.audio.play().then(() => {
      this._errCount = 0;
      this.show(this.titleFor(item));
      this.setPlaying(true);
      this.bindHighlight(true);
      this.startClock();
    }).catch(() => { this.hide(); this.clearHighlight(); });
  },

  // تقدير احتياطي لمدة الآية حين يعجز المتصفح عن حسابها (ملفات بدون رأس Xing).
  // يُشتق من معدّل التلاوة الفعلي المُقاس لكل قارئ — انظر measureRate() —
  // فهو تقدير مبني على بيانات حقيقية، لا قيمة عشوائية.
  estimateDuration(wordCount) {
    const wps = this.learnedRate() || 0.95; // متوسط التلاوة المرتّلة المُقاس ~0.95 كلمة/ثانية
    return Math.max(2, wordCount / wps);
  },

  // سرعة القارئ الحالية (كلمات/ثانية) مُكتسبة من الآيات التي أفصحت عن مدتها
  learnedRate() {
    try { return parseFloat(localStorage.getItem('reciter_wps_' + this.reciter()) || '0') || 0; }
    catch (e) { return 0; }
  },

  // سُجّل السرعة الفعلية بعد انتهاء آية معروفة المدة لاستخدامها لاحقاً.
  // متوسط متحرّك (٠.٥/٠.٥) يخفّف تشوّه الآيات القصيرة المُثقلة بالسكتات.
  measureRate(wordCount, duration) {
    if (!wordCount || !duration || duration <= 0 || !isFinite(duration)) return;
    const rate = wordCount / duration;
    if (!rate || rate <= 0 || rate > 10) return;
    try {
      const key = 'reciter_wps_' + this.reciter();
      const prev = parseFloat(localStorage.getItem(key) || '0') || 0;
      const blended = prev ? prev * 0.5 + rate * 0.5 : rate;
      localStorage.setItem(key, blended.toFixed(3));
    } catch (e) {}
  },

  titleFor(item) {
    const name = this.surahName || (window.state && window.state.currentSurah ? window.state.currentSurah.name : '');
    return `${name} — آية ${window.toArabicNum ? toArabicNum(item.ayah) : item.ayah}`;
  },

  // الآية التالية (أو تخطّي عند فشل التحميل — لا تتوقف التلاوة أبداً)
  advance(fromError) {
    // سُجّل سرعة هذا القارئ من الآية المنتهية إن كانت مدتها موثوقة
    if (!fromError && this.curWords && this.curWords.length) {
      this.measureRate(this.curWords.length, this.audio.duration);
    }
    this.clearHighlight();
    if (fromError) {
      this._errCount = (this._errCount || 0) + 1;
      if (this._errCount >= 3) {
        this._errCount = 0; this.stop();
        if (window.Toast) Toast.show('تعذّر تحميل التلاوة');
        return;
      }
    } else this._errCount = 0;
    if (this.qi + 1 < this.queue.length) { this.qi++; this.loadCurrent(); }
    else { this.stop(); if (window.Toast) Toast.show('تمت التلاوة ✓'); }
  },

  // يربط تظليل الآية الجارية بعنصرها إن وُجد في الصفحة المعروضة
  bindHighlight(scroll) {
    this.curEl = null; this.curWords = null; this._lastNow = -2;
    const item = this.curItem;
    if (!item) return;
    const el = document.querySelector(`.ayah[data-global="${item.global}"]`);
    if (!el) return;
    this.curEl = el;
    this.curWords = Array.from(el.querySelectorAll('.w'));
    el.classList.add('reciting');
    if (scroll) {
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight;
      if (r.top < 130 || r.bottom > vh - 170) {
        const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        el.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'center' });
      }
    }
  },

  // يُستدعى بعد تبديل صفحة المصحف لإعادة الربط إن أصبحت الآية مرئية
  refreshHighlight() {
    if (!this.curItem) return;
    if (this.curEl && !this.curEl.isConnected) { this.curEl = null; this.curWords = null; }
    if (!this.curEl) this.bindHighlight(false);
  },

  // ساعة التظليل: تتبع موضع التشغيل داخل الآية وتحرّك تظليل الكلمات
  startClock() {
    this.stopClock();
    if (document.hidden) return;
    const tick = () => {
      if (document.hidden) { this.rafId = null; return; }
      this.syncWords();
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  },
  stopClock() { if (this.rafId) { cancelAnimationFrame(this.rafId); this.rafId = null; } },

  syncWords() {
    if (!this.curItem) return;
    if (!this.curEl || !this.curEl.isConnected) {
      this.bindHighlight(false);
      if (!this.curEl) return;
    }
    const words = this.curWords;
    if (!words || !words.length) return;
    const a = this.audio;
    // بعض ملفات الـ MP3 تُرجع مدة غير منتهية (رأس Xing مفقود) فيعجز المتصفح عن
    // حسابها. في هذه الحالة نقدّر المدة من عدد الكلمات ومعدّل التلاوة المعتاد،
    // ثم نُحاكي التقدّم عبر الزمن الفعلي المنقضي (تقدير صريح، وليس توقيتاً موثوقاً).
    const nativeDur = a && a.duration && isFinite(a.duration) ? a.duration : 0;
    const t = a && a.currentTime >= 0 ? a.currentTime : 0;
    const isEstimate = !nativeDur;
    const dur = nativeDur || this.estimateDuration(words.length);
    const frac = dur > 0 ? Math.min(1, Math.max(0, t / dur)) : 0;
    // وزّع الزمن على الكلمات تناسباً مع عدد أحرفها
    let total = 0; const ends = [];
    for (let i = 0; i < words.length; i++) {
      const len = Math.max(1, (words[i].textContent || '').trim().length);
      total += len; ends.push(total);
    }
    const target = frac * total;
    let nowIdx = -1;
    for (let i = 0; i < ends.length; i++) { if (target <= ends[i]) { nowIdx = i; break; } }
    if (frac >= 1) nowIdx = words.length - 1;
    if (this._lastNow === nowIdx) return; // لا أعد الرسم دون تغيّر
    this._lastNow = nowIdx;
    for (let i = 0; i < words.length; i++) {
      words[i].classList.toggle('reciting', i < nowIdx);
      words[i].classList.toggle('reciting-now', i === nowIdx);
    }
  },

  clearHighlight() {
    this.curEl = null; this.curWords = null; this._lastNow = -2;
    document.querySelectorAll('.ayah.reciting').forEach(a => a.classList.remove('reciting'));
    document.querySelectorAll('.w.reciting, .w.reciting-now').forEach(w => w.classList.remove('reciting', 'reciting-now'));
  },

  pause() { if (this.audio) { this.audio.pause(); this.setPlaying(false); } },
  resume() {
    if (this.audio && this.current) {
      this.audio.play().then(() => { this.setPlaying(true); this.startClock(); }).catch(() => {});
    }
  },
  setPlaying(on) {
    const bar = document.getElementById('audio-bar');
    if (!bar) return;
    bar.classList.toggle('playing', on);
    const ic = bar.querySelector('#audio-play-icon');
    if (ic) ic.textContent = on ? '⏸' : '▶';
  },
  show(name) {
    let bar = document.getElementById('audio-bar');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'audio-bar';
      bar.innerHTML = `<button id="audio-play-btn" aria-label="تشغيل/إيقاف"><span id="audio-play-icon">⏸</span></button>
        <div id="audio-title"></div>
        <button id="audio-close" aria-label="إغلاق">×</button>`;
      document.body.appendChild(bar);
      // اضبط موضع الشريط حسب حالة شريط التنقل السفلية
      const nav = document.getElementById('nav');
      if (nav) bar.classList.toggle('nav-lowered', nav.classList.contains('nav-hidden'));
      bar.querySelector('#audio-play-btn').addEventListener('click', () => {
        if (this.audio && this.audio.paused) this.resume(); else this.pause();
      });
      bar.querySelector('#audio-close').addEventListener('click', () => this.stop());
      // وسِّع مساحة شريط إجراءات الآية إن ظهر كلاهما
      const ab = document.getElementById('ayah-bar');
      if (ab) ab.classList.add('with-audio');
    }
    bar.querySelector('#audio-title').textContent = name || '';
    bar.classList.add('visible', 'playing');
    bar.querySelector('#audio-play-icon').textContent = '⏸';
  },
  hide() {
    const bar = document.getElementById('audio-bar');
    if (bar) bar.classList.remove('visible', 'playing');
    const ab = document.getElementById('ayah-bar');
    if (ab) ab.classList.remove('with-audio');
  },
  stop() {
    this.stopClock();
    if (this.audio) { this.audio.pause(); this.audio.currentTime = 0; }
    this.current = null; this.queue = []; this.qi = -1; this.curItem = null;
    this.clearHighlight();
    this.hide();
  },
  // تغيير القارئ أثناء التشغيل: أعد تحميل الآية الحالية بالقارئ الجديد
  refreshReciter() {
    if (!this.audio || this.qi < 0 || !this.queue[this.qi]) return;
    const wasPlaying = !this.audio.paused;
    this.audio.src = this.urlForAyah(this.queue[this.qi].global);
    if (wasPlaying) this.audio.play().catch(() => {});
  },
  // أضف زر التشغيل لبطاقة رأس السورة
  bindSurahHeader() {
    // استخدم class بدلاً من id مكرر، واقتصر على بطاقة رأس السورة في شاشة العرض
    const card = document.querySelector('#screen-surah-view .surah-header-card');
    if (!card || card.querySelector('.audio-play')) return;
    const btn = document.createElement('button');
    // بدون bookmark-btn حتى لا يلتقطه مفوّض المرجعيات في app.js
    btn.className = 'audio-play';
    btn.setAttribute('aria-label', 'استمع للسورة');
    btn.innerHTML = '▶';
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const st = window.state || {};
      const n = st.currentSurah ? st.currentSurah.number : null;
      const nm = st.currentSurah ? st.currentSurah.name : '';
      if (!n) return;
      // ابدأ من أول آية في الصفحة المعروضة حالياً
      const pages = st.surahPages || [];
      const idx = st.surahPageIndex || 0;
      const fromAyah = (pages[idx] && pages[idx].ayahs[0] && pages[idx].ayahs[0].numberInSurah) || 1;
      this.play(n, nm, fromAyah);
    });
    card.appendChild(btn);
  }
};
window.AudioPlayer = AudioPlayer;

/* ==================== 8) Reminders — التذكيرات المحلية ==================== */
const Reminders = {
  timers: [],
  async enable() {
    if (!('Notification' in window)) return false;
    if (Notification.permission === 'denied') return false;
    if (Notification.permission !== 'granted') {
      const p = await Notification.requestPermission();
      if (p !== 'granted') return false;
    }
    Settings.setRemindersEnabled(true);
    this.scheduleAll();
    return true;
  },
  disable() {
    Settings.setRemindersEnabled(false);
    this.timers.forEach(t => clearTimeout(t));
    this.timers = [];
  },
  scheduleAll() {
    this.timers.forEach(t => clearTimeout(t));
    this.timers = [];
    // أوقات التذكير (بالتوقيت المحلي): 6:30 صباحاً، 17:00 مساءً، 20:30 ورد الختمة
    [[6, 30, 'أذكار الصباح 🌅 — ابدأ يومك بالذكر'], [17, 0, 'حان وقت أذكار المساء 🌙'], [20, 30, 'لم تكمل ورد الختمة اليوم 📖']].forEach(([h, m, body]) => {
      this.scheduleDaily(h, m, body);
    });
  },
  scheduleDaily(hour, minute, body) {
    const now = new Date();
    let fire = new Date(); fire.setHours(hour, minute, 0, 0);
    if (fire <= now) fire.setDate(fire.getDate() + 1);
    const ms = fire - now;
    const t = setTimeout(() => {
      try {
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification('إسلامي', { body, tag: 'reminder-' + hour, icon: './icons/icon-192.png' });
        }
      } catch (e) {}
      // أعد الجدولة لليوم التالي
      this.scheduleDaily(hour, minute, body);
    }, ms);
    this.timers.push(t);
  },
  init() {
    if (this.remindersEnabled() && 'Notification' in window && Notification.permission === 'granted') {
      this.scheduleAll();
    }
  },
  remindersEnabled() { return Settings.remindersEnabled(); }
};
window.Reminders = Reminders;

/* ==================== 9) Deep links — روابط مباشرة (hash) ==================== */
const DeepLinks = {
  init() {
    window.addEventListener('hashchange', () => this.apply(location.hash));
    // ربط التحديث عند تغيير الشاشة
    const origShow = window.showScreen;
    if (typeof origShow === 'function') {
      window.showScreen = function (id, anim) {
        const r = origShow.apply(this, arguments);
        try { DeepLinks.update(id); } catch (e) {}
        return r;
      };
    }
    this.apply(location.hash);
  },
  apply(hash) {
    if (!hash || hash.length < 2) return;
    // تتغيّر التجزئة فتبدأ بـ "#/" — أزِل الـ "#" وأي شرطة مائلة شاغرة قبل التقسيم
    const parts = hash.slice(1).replace(/^\/+/, '').split('/'); // ["surah", "18"]
    const route = parts[0];
    if (route === 'surah' && parts[1] && window.openSurah) {
      const ayahNo = parts[2] ? parseInt(parts[2], 10) : null;
      window.openSurah(parseInt(parts[1], 10), ayahNo);
    }
    else if (route === 'khatmah' && window.switchTab) { window.switchTab('khatmah'); }
    else if (route === 'athkar' && window.switchTab) { window.switchTab('athkar'); }
    else if (route === 'tasbih' && window.openTasbih) { window.openTasbih(); }
    else if (route === 'bookmarks' && window.openBookmarks) { window.openBookmarks(); }
    else if (route === 'stats' && window.showStats) { window.showStats(); }
    else if (route === 'settings' && window.openSettings) { window.openSettings(); }
  },
  update(screenId) {
    const map = {
      // تشمل الآية المحددة إن وُجدت حتى يُعاد فتح الرابط على نفسها
      'surah-view': (window.state && window.state.currentSurah)
        ? '#/surah/' + window.state.currentSurah.number + (window.selectedAyahNo ? '/' + window.selectedAyahNo : '')
        : '#/quran',
      'khatmah-main': '#/khatmah', 'khatmah-read': '#/khatmah',
      'athkar-list': '#/athkar', 'thikr-view': '#/athkar',
      'tasbih': '#/tasbih', 'surah-list': '#/quran',
      'bookmarks': '#/bookmarks', 'stats': '#/stats', 'settings': '#/settings'
    };
    const h = map[screenId];
    if (h && location.hash !== h) history.replaceState(null, '', h);
  }
};
window.DeepLinks = DeepLinks;

/* ==================== 10) Boot ==================== */
// ملاحظة: التذكيرات تعتمد على setTimeout فتعمل فقط أثناء فتح التطبيق؛
// لا يمكن للمتصفح إطلاقها في الخلفية بدون تثبيت PWA + Periodic Sync.
document.addEventListener('DOMContentLoaded', () => {
  Reminders.init();
  // انتظر حتى تصبح showScreen متاحة (ترتيب التحميل غير المضمون مع السكربتات المؤجلة)
  const initDeepLinks = () => {
    if (typeof window.showScreen === 'function') {
      DeepLinks.init();
    } else {
      // أعد المحاولة في الإطار التالي حتى تتوفر الدالة
      requestAnimationFrame(initDeepLinks);
    }
  };
  if ('requestIdleCallback' in window) {
    requestIdleCallback(initDeepLinks);
  } else {
    initDeepLinks();
  }
});
