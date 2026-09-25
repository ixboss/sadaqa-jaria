// ==================== Local Backup Manager — النسخ الاحتياطي المحلي ====================
// جميع بيانات المستخدم تبقى على جهازه. هذه الوحدة تنشئ ملفاً يختاره المستخدم
// بنفسه (تنزيل/اختيار ملف) — لا تُرفع أي بيانات إلى أي خادم، ولا يُطلب أي اتصال.
// القاعدة الذهبية: لا يُقيَّم أي نص مستورد أبداً (لا eval ولا Function ولا new Function).
// التحقق من الشكل والنوع فقط، ثم كتابة مباشرة في localStorage.

const BackupManager = {
  SCHEMA: 'islami-backup',
  VERSION: 1,
  APP_NAME: 'islami',

  // مفاتيح بيانات المستخدم القابلة للنسخ الاحتياطي:
  //   'json' = مخزّن كـ JSON
  //   'raw'  = مخزّن كنص خام (string)
  // المفاتيح المؤقتة التالية لا تُنسخ احتياطياً لأنها قابلة لإعادة التوليد:
  //   ath_<تاريخ>_<فئة>_<ذكر>  (تقدّم الأذكار اليومي، يُمحى كل يوم)
  //   q_s_u_<سورة>             (ذاكرة النص القرآني، TTL ٧ أيام)
  //   reciter_wps_<قارئ>       (سرعة تقديرية تُعاد معايرتها تلقائياً)
  //   occasion_popup_last_period
  KEYS: {
    app_state: 'json',            // حالة الختمة والإشارات والتمرير
    app_stats_v1: 'json',         // السلسلة والإحصائيات
    islamic_bookmarks: 'json',    // المرجعيات
    reading_progress: 'json',     // موضع القراءة الأخير
    athkar_favs: 'json',          // الأذكار المفضلة
    tasbihCount: 'raw',           // عدّاد التسبيح
    tasbihLap: 'raw',             // عدد الجولات
    tasbih_target: 'raw',         // هدف السبحة
    adhkar_auto_advance: 'raw',   // تقدّم تلقائي بين الأذكار
    font_scale: 'raw',            // مقياس الخط
    reciter: 'raw',               // القارئ
    reminders_enabled: 'raw',     // التذكيرات
    theme: 'raw'                  // الوضع الداكن/الفاتح
  },

  // القيم المسموحة للمفاتيح الخام الحرجة (حماية من قيم غريبة في ملف مستورد)
  RAW_ALLOW: {
    tasbih_target: ['33', '99', '100', '1000'],
    adhkar_auto_advance: ['0', '1'],
    reminders_enabled: ['0', '1'],
    theme: ['light', 'dark']
  },

  // أوصاف عربية للمعاينة قبل الاستعادة
  LABELS: {
    app_state: 'حالة الختمة',
    app_stats_v1: 'الإحصائيات والسلسلة',
    islamic_bookmarks: 'المرجعيات',
    reading_progress: 'موضع القراءة',
    athkar_favs: 'الأذكار المفضلة',
    tasbihCount: 'عدّاد التسبيح',
    tasbihLap: 'جولات التسبيح',
    tasbih_target: 'هدف السبحة',
    adhkar_auto_advance: 'التقدّم التلقائي للأذكار',
    font_scale: 'حجم الخط',
    reciter: 'القارئ',
    reminders_enabled: 'التذكيرات',
    theme: 'المظهر'
  },

  // ─── أدوات مساعدة ───
  isPlainObject(v) { return typeof v === 'object' && v !== null && !Array.isArray(v); },

  esc(s) {
    // أي نص يأتي من الملف المستورد لا يُحقن أبداً في innerHTML مباشرة
    return String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  },

  // ─── التحقق من شكل القيمة لكل مفتاح ───
  // يعيد true فقط إذا كانت القيمة سليمة النوع والشكل، وإلا تُرفض القيمة (لا الملف كله).
  validValue(key, value) {
    const kind = this.KEYS[key];
    if (kind === 'json') {
      switch (key) {
        case 'app_state':
        case 'app_stats_v1':
        case 'reading_progress':
          return this.isPlainObject(value);
        case 'islamic_bookmarks':
          // كل مرجعية должны أن تكون كائناً عادياً يحوي رقماً للسورة
          return Array.isArray(value) && value.every(b => this.isPlainObject(b) && typeof b.surah === 'number');
        case 'athkar_favs':
          return Array.isArray(value) && value.every(f => typeof f === 'string');
        default:
          return false;
      }
    }
    // raw: نص خام
    if (typeof value !== 'string') return false;
    const allow = this.RAW_ALLOW[key];
    if (allow) return allow.includes(value);
    if (key === 'tasbihCount' || key === 'tasbihLap') return /^\d+$/.test(value);
    if (key === 'font_scale') { const n = Number(value); return /^\d+$/.test(value) && n >= 80 && n <= 140; }
    if (key === 'reciter') {
      // القارئ يجب أن يكون معروفاً في قائمة التطبيق (إن وُجدت)
      if (window.Settings && Array.isArray(window.Settings.RECITERS))
        return window.Settings.RECITERS.some(r => r.id === value);
      return /^[a-z0-9._-]+$/i.test(value);
    }
    return false;
  },

  // ─── الإنشاء: جمع البيانات الحالية في حمولة نسخ احتياطي ───
  build() {
    const data = {};
    const skipped = [];
    for (const key of Object.keys(this.KEYS)) {
      try {
        const raw = localStorage.getItem(key);
        if (raw === null || raw === '') continue; // المفتاح غير موجود — لا يُضمَّن
        if (this.KEYS[key] === 'json') {
          const parsed = JSON.parse(raw); // مفتاح معطوب يُرمى للخارج فيُسجَّل متخطّى
          if (!this.validValue(key, parsed)) { skipped.push(key); continue; }
          data[key] = parsed;
        } else {
          if (!this.validValue(key, raw)) { skipped.push(key); continue; }
          data[key] = raw;
        }
      } catch (e) {
        // مفتاح معطوب لا يوقف النسخ الاحتياطي لبقية البيانات
        skipped.push(key);
      }
    }
    const payload = {
      schema: this.SCHEMA,
      version: this.VERSION,
      app: this.APP_NAME,
      created: new Date().toISOString(),
      data
    };
    return { payload, skipped };
  },

  // ─── التحقق من غلاف الملف المستورد ───
  // يعيد { ok: true, data } أو { ok: false, reason } — لا يرمي أبداً.
  parse(text) {
    let parsed;
    try {
      parsed = JSON.parse(text); // فشل التحليل = ملف تالف
    } catch (e) {
      return { ok: false, reason: 'الملف ليس JSON صالحاً.' };
    }
    if (!this.isPlainObject(parsed))
      return { ok: false, reason: 'بنية الملف غير صحيحة.' };
    if (parsed.schema !== this.SCHEMA)
      return { ok: false, reason: 'هذا الملف ليس نسخة احتياطية من تطبيق «إسلامي».' };
    if (typeof parsed.version !== 'number' || !Number.isFinite(parsed.version) || parsed.version < 1)
      return { ok: false, reason: 'رقم إصدار الملف غير صالح.' };
    if (parsed.version > this.VERSION)
      return { ok: false, reason: 'هذا الملف أحدث من نسخة التطبيق. حدِّث التطبيق أولاً ثم أعد الاستيراد.' };
    if (!this.isPlainObject(parsed.data))
      return { ok: false, reason: 'لا توجد بيانات قابلة للاستعادة في الملف.' };

    // تصفية المفاتيح: ما نعرفه نتحقق منه، وما لا نعرفه نتجاهله (أمان للمخططات المستقبلية)
    const data = {};
    const ignored = [];
    const rejected = [];
    for (const key of Object.keys(parsed.data)) {
      if (!Object.prototype.hasOwnProperty.call(this.KEYS, key)) { ignored.push(key); continue; }
      if (!this.validValue(key, parsed.data[key])) { rejected.push(key); continue; }
      data[key] = parsed.data[key];
    }
    if (Object.keys(data).length === 0)
      return { ok: false, reason: 'لا توجد أي قيمة سليمة للاستعادة في الملف.' };
    return { ok: true, data, ignored, rejected };
  },

  // ─── الكتابة: تطبيق البيانات المُتحقَّق منها على localStorage ───
  apply(data) {
    const applied = [];
    const failed = [];
    for (const key of Object.keys(data)) {
      try {
        const v = data[key];
        if (this.KEYS[key] === 'json') localStorage.setItem(key, JSON.stringify(v));
        else localStorage.setItem(key, v);
        applied.push(key);
      } catch (e) {
        // نفاد الحصة أو تخزين غير متاح: لا نوقف باقي المفاتيح
        failed.push(key);
      }
    }
    return { applied, failed };
  },

  // ─── معاينة عربية لما سيُستعاد ───
  previewText(data) {
    const lines = Object.keys(data).map(key => {
      const label = this.LABELS[key] || key;
      let detail = '';
      if (key === 'islamic_bookmarks') detail = ` (${data[key].length})`;
      else if (key === 'athkar_favs') detail = ` (${data[key].length})`;
      else if (key === 'app_state' && data[key].khatmah) detail = ' (ختمة نشطة)';
      else if (key === 'reading_progress' && data[key].surah) detail = ` (سورة ${this.esc(data[key].surah)})`;
      return `• ${label}${detail}`;
    });
    return lines.join('<br>');
  },

  // ─── الإجراءات (تستخدم نوافذ التأكيد الحالية في التطبيق) ───
  async export() {
    try {
      const { payload, skipped } = this.build();
      if (Object.keys(payload.data).length === 0) {
        if (window.showAppDialog) await window.showAppDialog('لا توجد بيانات محفوظة لإنشاء نسخة احتياطية.', false);
        return false;
      }
      const json = JSON.stringify(payload, null, 2);
      const stamp = new Date().toISOString().slice(0, 10);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `islami-backup-${stamp}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      if (skipped.length && window.showAppDialog) {
        await window.showAppDialog(
          `تم إنشاء النسخة الاحتياطية.<br>` +
          `<span style="font-size:calc(var(--font-size) * 0.5); color:var(--text-dim)">تم تخطّي ${this.esc(skipped.length)} مفتاح تالف أو غير معروف.</span>`,
          false);
      }
      return true;
    } catch (e) {
      if (window.showAppDialog) await window.showAppDialog('تعذّر إنشاء النسخة الاحتياطية.', false);
      return false;
    }
  },

  async importFromFile(file) {
    let text;
    try {
      text = await file.text();
    } catch (e) {
      if (window.showAppDialog) await window.showAppDialog('تعذّر قراءة الملف المختار.', false);
      return false;
    }
    const result = this.parse(text);
    if (!result.ok) {
      if (window.showAppDialog) await window.showAppDialog(this.esc(result.reason), false);
      return false;
    }

    // تأكيد صريح قبل استبدال أي بيانات، مع معاينة المحتوى
    const confirmMsg =
      `سيتم استبدال بياناتك الحالية بما يلي:<br><br>` +
      `<span style="font-size:calc(var(--font-size) * 0.54)">${this.previewText(result.data)}</span><br><br>` +
      `<span style="font-size:calc(var(--font-size) * 0.5); color:var(--text-dim)">` +
      (result.rejected.length ? `رُفضت ${this.esc(result.rejected.length)} قيمة غير سليمة.<br>` : '') +
      (result.ignored.length ? `تجاهلت التطبيق ${this.esc(result.ignored.length)} مفاتيح غير معروفة (مخطط أحدث).<br>` : '') +
      `سيُعاد تحميل التطبيق لتطبيق التغييرات.</span>`;

    const confirmed = window.showAppDialog ? await window.showAppDialog(confirmMsg, true) : false;
    if (!confirmed) return false;

    this.apply(result.data);

    if (window.showAppDialog) {
      await window.showAppDialog(
        `تمت الاستعادة بنجاح.<br>` +
        `<span style="font-size:calc(var(--font-size) * 0.5); color:var(--text-dim)">يُعاد تحميل التطبيق الآن…</span>`, false);
    }

    // كل الحالة تُعاد بناؤها من localStorage عند الإقلاع، فالإعادة تضمن الاتساق
    setTimeout(() => { try { location.reload(); } catch (e) {} }, 1200);
    return true;
  },

  async clearAll() {
    // إفصاح كامل عن النطاق قبل المسح: ما الذي سيُحذف وما الذي يبقى
    const { payload } = this.build();
    const userKeys = Object.keys(payload.data);
    const detail = userKeys.length
      ? userKeys.map(k => `• ${this.LABELS[k] || k}`).join('<br>')
      : 'لا توجد بيانات محفوظة حالياً.';
    const msg =
      `سيتم حذف <b>جميع بياناتك على هذا الجهاز</b> نهائياً:<br><br>` +
      `<span style="font-size:calc(var(--font-size) * 0.54)">${detail}</span><br><br>` +
      `<span style="font-size:calc(var(--font-size) * 0.5); color:var(--text-dim)">` +
      `تبقى ذاكرة النص القرآني المؤقتة والخطوط كما هي (قابلة لإعادة التوليد).<br>` +
      `أنشئ نسخة احتياطية أولاً إن أردت الاحتفاظ بهذه البيانات.</span>`;
    const confirmed = window.showAppDialog ? await window.showAppDialog(msg, true) : false;
    if (!confirmed) return false;

    const failed = [];
    for (const key of Object.keys(this.KEYS)) {
      try { localStorage.removeItem(key); } catch (e) { failed.push(key); }
    }
    if (window.showAppDialog) {
      await window.showAppDialog(
        `تم مسح البيانات.${failed.length ? `<br><span style="font-size:calc(var(--font-size) * 0.5); color:var(--text-dim)">تعذّر مسح ${this.esc(failed.length)} مفتاح.</span>` : ''}<br>` +
        `<span style="font-size:calc(var(--font-size) * 0.5); color:var(--text-dim)">يُعاد تحميل التطبيق الآن…</span>`, false);
    }
    setTimeout(() => { try { location.reload(); } catch (e) {} }, 1500);
    return true;
  }
};
window.BackupManager = BackupManager;
