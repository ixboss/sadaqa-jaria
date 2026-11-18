// ==================== تسجيل Service Worker + استراتيجية التحديث (Prompt) ====================
// الضمانات:
//  - أوفلاين أولاً: لا يُستدعى update() إلا عندما navigator.onLine = true (صامت خلاف ذلك)
//  - بلا مقاطعة: لا إعادة تحميل تلقائية — تظهر بطاقة منبثقة غير مزعجة وزر "تحديث" يقرر المستخدم
//  - iOS: فحص احتياطي كل ٣٠ دقيقة، يتوقف عن العمل أثناء التفاعل النشط وبلا اتصال
//  - عشوائية الطلب: لا طلبات خلفية إطلاقاً عندما يكون التطبيق أوفلاين
if ('serviceWorker' in navigator) {
  const UPDATE_INTERVAL_MS = 30 * 60 * 1000;   // iOS لا يطلق visibilitychange دائماً — فحص احتياطي
  const MIN_CHECK_GAP_MS = 30 * 1000;          // خانقة: حد أقصى فحص واحد كل نصف دقيقة
  const IDLE_AFTER_MS = 60 * 1000;             // توقف عن الفحص أثناء تفاعل حديث (تمرير/لمس)
  const DISMISS_KEY = 'sw-update-dismissed';   // إخفاء البطاقة لبقية الجلسة عند "لاحقاً"

  let lastCheck = 0;
  let lastInteraction = 0;
  let pendingUpdate = false;   // صحيح فقط بعد عرض البطاقة — يمنع reload عند claim الـSW الأول
  let reloading = false;
  let promptWorker = null;     // العامل المنتظر المعروضة ببطاقته الحالية

  const markInteraction = () => { lastInteraction = Date.now(); };
  ['pointerdown', 'keydown', 'scroll', 'touchstart'].forEach(ev =>
    window.addEventListener(ev, markInteraction, { passive: true, capture: true }));

  // عندما يتفعّل عامل جديد بعد موافقة المستخدم: أعد التحميل مرة واحدة فقط
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!pendingUpdate || reloading) return;
    reloading = true;
    location.reload();
  });

  // العامل الجديد (v57): يُبلِغ عن إخفاق التخزين المسبق بعد تفعيله — بطاقة
  // زجاجية صامتة غير مزعجة، تُخفى بالنقر (وضع الأوفلاين مثبَّت جزئياً).
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'PRECACHE_INCOMPLETE' && Array.isArray(event.data.urls)) {
      showPrecacheToast(event.data.urls.length);
    }
  });

  function showPrecacheToast(count) {
    if (!count || document.getElementById('sw-precache-toast')) return;
    const el = document.createElement('div');
    el.id = 'sw-precache-toast';
    el.setAttribute('role', 'status');
    el.innerHTML = '<span class="sw-upd-msg">تم تثبيت وضع الأوفلاين جزئياً — افتح التطبيق مع اتصال لإكماله</span>';
    el.addEventListener('click', () => el.remove());
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add('visible'));
    setTimeout(() => el.remove(), 12000);
  }

  // بطاقة التحديث: زجاجية، غير مزعجة، تظهر أعلى شريط التنقل
  function showUpdateToast(worker) {
    if (document.getElementById('sw-update-toast') || sessionStorage.getItem(DISMISS_KEY)) return;
    promptWorker = worker;
    pendingUpdate = true;
    const el = document.createElement('div');
    el.id = 'sw-update-toast';
    el.setAttribute('role', 'status');
    el.innerHTML =
      '<span class="sw-upd-msg">يتوفر إصدار جديد من التطبيق</span>' +
      '<button type="button" class="sw-upd-later">لاحقاً</button>' +
      '<button type="button" class="sw-upd-now">تحديث</button>';
    el.querySelector('.sw-upd-now').addEventListener('click', () => {
      hideUpdateToast();
      worker.postMessage({ type: 'SKIP_WAITING' }); // controllerchange يعيد التحميل
    });
    el.querySelector('.sw-upd-later').addEventListener('click', () => {
      try { sessionStorage.setItem(DISMISS_KEY, worker.scriptURL); } catch (e) {}
      hideUpdateToast();
    });
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add('visible'));
  }

  function hideUpdateToast() {
    const el = document.getElementById('sw-update-toast');
    if (!el) return;
    el.classList.remove('visible');
    setTimeout(() => el.remove(), 300);
  }

  function checkForUpdates(reg) {
    if (!navigator.onLine) return;               // أوفلاين: صامت تماماً، بلا طلبات
    const now = Date.now();
    if (now - lastCheck < MIN_CHECK_GAP_MS) return;
    lastCheck = now;
    reg.update().catch(() => {});
  }

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js', { scope: './', updateViaCache: 'none' })
      .then(reg => {
        // العامل الجديد المنتظر (عودة إلى التطبيق بينما التحديث جاهز)
        if (reg.waiting && navigator.serviceWorker.controller && !sessionStorage.getItem(DISMISS_KEY)) {
          showUpdateToast(reg.waiting);
        }

        // استراتيجية prompt: العامل المثبَّت ينتظر — لا skipWaiting تلقائي (في sw.js)
        reg.addEventListener('updatefound', () => {
          const w = reg.installing;
          if (!w) return;
          w.addEventListener('statechange', () => {
            if (w.state === 'installed' && navigator.serviceWorker.controller) {
              showUpdateToast(w);
            }
          });
        });

        // فحص أول عند الإقلاع (أونلاين فقط)
        checkForUpdates(reg);

        // ١) العودة للمقدمة: افحص التحديث — فقط مع اتصال فعّال
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') checkForUpdates(reg);
        });

        // ٢) iOS الاحتياطي: كل ٣٠ دقيقة — يتخطى الفحص أوفلاين/بالخلفية/أثناء تفاعل نشط
        setInterval(() => {
          if (!navigator.onLine) return;
          if (document.visibilityState !== 'visible') return;
          if (Date.now() - lastInteraction < IDLE_AFTER_MS) return; // متفاعل الآن: مهّل
          checkForUpdates(reg);
        }, UPDATE_INTERVAL_MS);
      })
      .catch(err => console.error('❌ SW registration failed:', err));
  });
}

// ملاحظة: تم إزالة رابط preload الثابت لملف woff2 القديم لأنه كان يعيد 404؛
// الخطوط تُحمّل وتُخزّن الآن تلقائياً عبر <link rel="stylesheet"> و Service Worker (STATIC_CACHE).

// ملاحظة: تهيئة السمة تتم بواسطة applyTheme() في DOMContentLoaded فقط
// (أزيلنا الـ IIFE الذي كان يضيف theme-light قبل تطبيق applyTheme ويسبب وميضاً)
