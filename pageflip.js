/* ============================================================================
   pageflip.js — محرّك قلب صفحات المصحف
   ----------------------------------------------------------------------------
   يُربط على .mushaf-viewport. السحب الأفقي يرفع حافة الورقة (perspective +
   rotateY حول طرف الكتاب) مع ظلّ وظلال الحافة تتبع التقدّم. عند الإفلات:
   تجاوز ٣٠٪ من العرض (+ زخم العينات الأخيرة) يقلب الصفحة، وإلا ترتدّ نابضة.

   - prefers-reduced-motion: انزياح أفقي مسطّح بلا ثلاثي الأبعاد.
   - النقر الخالص (بلا سحب) يبدّل الوضعين الهادئ/النّشط — إلا على الآية
     أو الأزرار فتُترك لمعالجاتها الأصلية.
   - يمكن تعطيله (خطوة ٦: اتجاه التمرير "رأسي" يعطّله).
   ============================================================================ */

(function () {
  'use strict';

  var FLIP_THRESHOLD = 0.30;     // ٣٠٪ من عرض اللوحة لقلب الصفحة
  var MOMENTUM_MS = 140;         // نافذة قياس الزخم (مللي ثانية)
  var TAP_MAX_MOVE = 9;          // حركة أقل من هذا تعتبر نقرة
  var TAP_MAX_MS = 500;
  var LOCK_PX = 10;              // تثبيت الاتجاه بعد هذه المسافة
  var MAX_DRAG_DEG = 84;         // أقصى زاوية أثناء السحب (لا نُظهر ظهر الورقة)
  var FLIP_OUT_DEG = 96;         // زاوية إتمام القلب (بعداها تختفي الورقة)
  var PERSPECTIVE = 1400;

  var viewport = null;
  var bound = false;
  var enabled = true;
  var flipping = false;          // جاري قلب محرّك (نتجاهل أي سحب جديد)

  // حالة السحب الحالية
  var active = false;            // هل تثبّت اتجاه أفقي ودخلنا وضع القلب
  var goNext = true;             // true = الصفحة التالية (السحب لليمين: تتبع الورقة إصبعك نحو المفصل الأيمن)
  var startX = 0, startY = 0, startT = 0;
  var downTarget = null;         // عنصر النقطة الأولى (لتمييز النقر فوق الآية)
  var selectionBlock = false;    // تحديد نص قائم من إيماءة فأرة سابقة: يمنع السحب فقط
  var width = 1;
  var samples = [];              // [{x, t}]
  var curlEl = null;             // طبقة تظليل حافة الورقة المرتفعة
  var resetTimer = null;

  function isReader() {
    var st = window.state || {};
    return ['surah-view', 'khatmah-read'].indexOf(st.currentScreen) !== -1;
  }

  function reducedMotion() {
    try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
    catch (e) { return false; }
  }

  // عناصر التحكّم الحقيقية: نقراتها يجب أن تعمل (لا تُحوَّل إلى قلب/تبديل وضع).
  // ملاحظة: السحب قد يبدأ فوق نص الآية نفسها — كما في التطبيقات الحقيقية —
  // وتمييز "نقر أم سحب" يُفصل بين الاختيار والقلب (انظر onUp).
  function isControl(target) {
    if (!target || target.closest === undefined) return true; // عقدة غير عنصرية: لا نلمسها
    return !!target.closest('button, a, input, select, textarea, label, .mushaf-nav, .mushaf-topbar, [data-no-flip]');
  }
  // النقر فوق آية يتركه لمعالج الاختيار الأصلي (لا يبدّل الوضع)
  function isAyahArea(target) {
    if (!target || target.closest === undefined) return false;
    return !!target.closest('.ayah, .w');
  }

  function pageEl() {
    return viewport ? viewport.querySelector('.mushaf-page') : null;
  }

  function ensureCurl(page) {
    if (!curlEl || curlEl.parentNode !== page) {
      curlEl = document.createElement('div');
      curlEl.className = 'mushaf-curl';
      curlEl.style.cssText = 'position:absolute; inset:0; pointer-events:none; z-index:5; opacity:0;';
      page.appendChild(curlEl);
    }
    return curlEl;
  }

  function resetPage() {
    var page = pageEl();
    if (!page) return;
    page.style.transition = 'none';
    page.style.transform = '';
    page.style.transformOrigin = '';
    page.style.boxShadow = '';
    page.style.opacity = '';
    if (curlEl) curlEl.style.opacity = '0';
  }

  // زاوية/أصل الدوران لاتجاه القلب. الكتاب يمينيّ (مفصل اليمين): الورقة
  // التالية ترفع حافتها اليسرى وتنطوي يميناً نحو المفصل، فتتبع إصبعك
  // الذي يسحب من اليسار إلى اليمين. الورقة السابقة ترفع حافتها اليمنى
  // (مفصل اليسار) وتنطوي يساراً مع السحب من اليمين إلى اليسار.
  function applyDrag(p) {
    var page = pageEl();
    if (!page) return;
    var angle = Math.min(1, Math.max(0, p)) * MAX_DRAG_DEG;
    if (reducedMotion()) {
      // مسطّح: انزياح أفقي مع خفوت بسيط
      var tx = (goNext ? 1 : -1) * Math.min(1, Math.max(0, p)) * 38;
      page.style.transition = 'none';
      page.style.transform = 'translate3d(' + tx.toFixed(1) + '%, 0, 0)';
      page.style.opacity = String(1 - 0.35 * Math.min(1, Math.max(0, p)));
      page.style.boxShadow = '';
      return;
    }
    var sign = goNext ? 1 : -1;
    page.style.transition = 'none';
    page.style.transformOrigin = goNext ? 'right center' : 'left center';
    page.style.transform = 'perspective(' + PERSPECTIVE + 'px) rotateY(' + (sign * angle).toFixed(2) + 'deg)';
    page.style.opacity = String(1 - 0.25 * Math.min(1, Math.max(0, p)));
    page.style.boxShadow = '0 ' + (6 + 26 * p).toFixed(0) + 'px ' + (16 + 56 * p).toFixed(0) +
      'px rgba(0,0,0,' + (0.06 + 0.30 * p).toFixed(3) + ')';
    var curl = ensureCurl(page);
    // أقوى ظلّ عند الحافة المرتفعة
    curl.style.background = goNext
      ? 'linear-gradient(90deg, rgba(0,0,0,0.30), rgba(0,0,0,0) 46%)'
      : 'linear-gradient(270deg, rgba(0,0,0,0.30), rgba(0,0,0,0) 46%)';
    curl.style.opacity = (0.55 * Math.min(1, Math.max(0, p))).toFixed(3);
  }

  function springBack() {
    var page = pageEl();
    if (!page) return;
    page.style.transition = 'transform 260ms cubic-bezier(0.2, 1.25, 0.35, 1), opacity 200ms ease-out, box-shadow 260ms ease-out';
    page.style.transform = reducedMotion() ? 'translate3d(0,0,0)' : 'perspective(' + PERSPECTIVE + 'px) rotateY(0deg)';
    page.style.opacity = '1';
    page.style.boxShadow = '';
    if (curlEl) curlEl.style.transition = 'opacity 220ms ease-out', curlEl.style.opacity = '0';
    clearTimeout(resetTimer);
    resetTimer = setTimeout(resetPage, 300);
  }

  // إتمام القلب: تُكمل الورقة دورانها وتختفي، ثم يُرسم الصفحة الجديدة
  // وتعود الورقة لحالتها مع خفوت دخول لطيف.
  function completeFlip(dir) {
    var page = pageEl();
    if (!page) { finishFlip(); return; }
    flipping = true;
    var before = (window.state || {}).mushafPage || 0;
    var onFolded = function () {
      // بعد تجاوز ٨٤° تكون الورقة قد اختفت؛ استدعِ التنقّل (قد يكون شبكياً)
      if (window.changeMushafPage) {
        var p = window.changeMushafPage(dir);
        if (p && typeof p.then === 'function') return p.then(function () { afterRender(before, page); });
      }
      afterRender(before, page);
    };
    if (reducedMotion()) {
      page.style.transition = 'transform 200ms ease-in, opacity 200ms ease-in';
      page.style.transform = 'translate3d(' + (goNext ? 42 : -42) + '%, 0, 0)';
      page.style.opacity = '0';
    } else {
      var sign = goNext ? 1 : -1;
      page.style.transition = 'transform 190ms cubic-bezier(0.55, 0, 0.85, 0.3), opacity 170ms ease-in 40ms, box-shadow 190ms ease-in';
      page.style.transform = 'perspective(' + PERSPECTIVE + 'px) rotateY(' + (sign * FLIP_OUT_DEG) + 'deg)';
      page.style.opacity = '0';
      page.style.boxShadow = '0 30px 70px rgba(0,0,0,0.45)';
      if (curlEl) curlEl.style.opacity = '0';
    }
    setTimeout(onFolded, reducedMotion() ? 190 : 200);
  }

  function afterRender(before, page) {
    var changed = (window.state || {}).mushafPage !== before;
    if (!changed) {
      // حدّ المصحف: لا توجد صفحة في هذا الاتجاه — ترتدّ الورقة
      flipping = false;
      page.style.transition = 'none';
      page.style.opacity = '1';
      page.style.transform = '';
      springBack();
      return;
    }
    resetPage();
    page.style.transition = 'none';
    page.style.opacity = '0';
    // دع الرسم يستقرّ ثم أدخل الورقة الجديدة بخفوت
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        page.style.transition = 'opacity 240ms ease-out';
        page.style.opacity = '1';
        clearTimeout(resetTimer);
        resetTimer = setTimeout(function () { resetPage(); flipping = false; }, 280);
      });
    });
  }

  function finishFlip() { flipping = false; }

  // ---------------------------------------------------------------- gestures
  function onDown(e) {
    // حتى في الوضع العمودي (المحرّك معطّل) نتابع الإيماءة: النقرة تبقى
    // تعمل (تبديل الوضع) — السحب فقط هو الذي يُمنع داخل onMove.
    if (!isReader() || flipping) return;
    if (isControl(e.target)) return;
    // تحديد نص قائم (من إيماءة فأرة سابقة): يمنع السحب فقط، ولا يبطل النقرة
    // التالية — وإلا ظلّ التحديد يبتلع كل لمسة على الحاسوب حتى يُمسح يدوياً.
    selectionBlock = (e.pointerType === 'mouse' &&
                      !!(window.getSelection && window.getSelection().toString()));
    viewport = viewport || document.getElementById('mushaf-viewport');
    if (!viewport || !pageEl()) return;
    active = false;
    downTarget = e.target;
    startX = e.clientX; startY = e.clientY; startT = Date.now();
    // العرض المرجعي هو عرض الورقة نفسها، لا عرض المنظر كاملاً: في العرض
    // المزدوج يمثّل نصف المنظر، وإلا فلن يكتمل القلب إلا بسحب يتجاوز نصف
    // الشاشة. كذلك هو مقام زاوية الطيّ فيُبقيها متناسبة مع الورقة.
    var pg = pageEl();
    width = (pg ? pg.offsetWidth : 0) || viewport.clientWidth || 1;
    samples = [{ x: startX, t: startT }];
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerup', onUp, { once: true });
    window.addEventListener('pointercancel', onUp, { once: true });
  }

  function onMove(e) {
    var dx = e.clientX - startX, dy = e.clientY - startY;
    if (!active) {
      if (Math.abs(dx) < LOCK_PX && Math.abs(dy) < LOCK_PX) return;
      // تمرير عمودي: اتركه للمتصفح (touch-action: pan-y)
      if (Math.abs(dy) > Math.abs(dx)) { cleanup(); return; }
      // وضع التمرير العمودي: لا قلب، لكن النقرة التي بدأت الإيماءة محفوظة
      if (!enabled) { cleanup(); return; }
      // بدأ المستخدم بتحديد نص بالفأرة — لا ننازعه هذه الإيماءة
      if (selectionBlock) { cleanup(); return; }
      active = true;
      goNext = dx > 0;                       // RTL: السحب لليمين = الصفحة التالية (الورقة تتبع إصبعك نحو المفصل الأيمن)
      // إيماءة سحب واضحة الآن: تخلّص من أي تحديد مسرّب فوق النص
      var sel = window.getSelection && window.getSelection();
      if (sel && sel.toString()) sel.removeAllRanges();
    }
    samples.push({ x: e.clientX, t: Date.now() });
    if (samples.length > 24) samples.shift();
    applyDrag(Math.abs(e.clientX - startX) / width);
  }

  function onUp(e) {
    cleanup();
    if (!isReader()) return;
    var dx = e.clientX - startX, dy = e.clientY - startY, dt = Date.now() - startT;
    if (!active) {
      // نقرة خالصة → بدّل الوضع، إلا فوق الآية فيُترك الاختيار لمعالجه الأصلي
      if (Math.abs(dx) < TAP_MAX_MOVE && Math.abs(dy) < TAP_MAX_MOVE && dt < TAP_MAX_MS) {
        if (!isAyahArea(downTarget) && window.toggleMushafHUD) toggleMushafHUD();
      }
      return;
    }
    // زخم من آخر عيّنات ضمن النافذة الزمنية
    var v = 0;
    for (var i = samples.length - 1; i >= 0; i--) {
      if (Date.now() - samples[i].t <= MOMENTUM_MS) {
        var span = samples[samples.length - 1].t - samples[i].t;
        if (span > 0) v = (samples[samples.length - 1].x - samples[i].x) / span; // px/ms
        break;
      }
    }
    var projected = Math.abs(dx) + Math.abs(v) * 120;   // امتداد الزخم
    if (projected / width >= FLIP_THRESHOLD) {
      completeFlip(goNext ? 1 : -1);
    } else {
      springBack();
    }
  }

  function cleanup() {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
  }

  var Engine = {
    bind: function (vp) {
      viewport = vp || document.getElementById('mushaf-viewport');
      if (!viewport || bound) return viewport;
      bound = true;
      viewport.addEventListener('pointerdown', onDown, { passive: false });
      return viewport;
    },
    setEnabled: function (v) {
      enabled = !!v;
      if (!enabled) { cleanup(); resetPage(); flipping = false; active = false; }
    },
    isEnabled: function () { return enabled; },
    isFlipping: function () { return flipping; },
    reset: resetPage
  };
  window.PageFlipEngine = Engine;
})();
