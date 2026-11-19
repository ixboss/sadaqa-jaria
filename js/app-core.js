/* app-core.js — الحالة، المحرك، الشاشات، المصحف، المناسبات، التهيئة — مُستخرج من index.html المونوليثي (v1.0.0 refactor) */

const OCCASIONS_DB={
  pre_monday:{title:"تذكير بصيام غدٍ الإثنين",icon:"⏰",summary:"غداً تُعرض الأعمال على الله",sunnahs:["تبييت النية للصيام","الاستعداد للسحور"]},
  pre_thursday:{title:"تذكير بصيام غدٍ الخميس",icon:"⏰",summary:"غداً تُرفع الأعمال إلى الله",sunnahs:["تبييت النية للصيام","الاستعداد للسحور"]},
  pre_friday:{title:"مساء الخميس: استعداد للجمعة",icon:"🕌",summary:"غداً الجمعة، عيد الأسبوع وأفضل الأيام",sunnahs:["تبييت النية لصيام الخميس","الاستعداد للسحور","تجهيز ملابس الجمعة وتطيّبها","قراءة سورة الكهف مساءً"]},
  pre_white_days:{title:"تذكير بصيام الأيام البيض",icon:"🌕",summary:"غداً تبدأ الأيام البيض",sunnahs:["تبييت النية لصيام الغد","الاستعداد للسحور"]},
  friday:{title:"سنن يوم الجمعة",icon:"🕌",summary:"يوم الجمعة عيد أسبوعي للمسلمين",sunnahs:["الاغتسال والتطيّب","السواك والتبكير للمسجد","قراءة سورة الكهف لنورٍ بين الجمعتين","الإكثار من الصلاة على النبي صلى الله عليه وسلم","تحرّي ساعة الإجابة آخر النهار"]},
  monday_thursday:{title:"صيام الاثنين والخميس",icon:"🌗",summary:"كان النبي صلى الله عليه وسلم يتحرى صيام هذين اليومين",sunnahs:["صيام اليوم تطوعاً لله","الإكثار من الذكر والاستغفار"]},
  white_days:{title:"صيام الأيام البيض",icon:"🌕",summary:"الأيام ١٣ و١٤ و١٥ من كل شهر",sunnahs:["صيام الأيام الثلاثة المباركة","التعويض لمن فاته صيام أحد الأيام"]},
  ramadan:{title:"شهر رمضان المبارك",icon:"☪️",summary:"الشهر الذي أنزل فيه القرآن هدى للناس",sunnahs:["تسحّروا فإن في السحور بركة","تعجيل الفطر على تمرات","قيام الليل والتراويح","كثرة قراءة القرآن والصدقة"]},
  ramadan_last10:{title:"العشر الأواخر من رمضان",icon:"✨",summary:"فيها ليلة القدر خير من ألف شهر",sunnahs:["الاعتكاف وإحياء الليل كله","إيقاظ الأهل والجد والاجتهاد","تحرّي ليلة القدر في الأوتار","دعاء العفو: اللهم إنك عفو تحب العفو فاعف عني"]},
  eid_fitr:{title:"عيد الفطر المبارك",icon:"🎉",summary:"يوم الفرحة والجوائز بعد الصيام",sunnahs:["الاغتسال والتطيب ولبس الجميل","الفطر على تمرات وتراً قبل الخروج للصلة","أداء زكاة الفطر قبل الصلاة","التكبير والتهنئة وصلة الأرحام"]},
  dhulhijjah_10:{title:"عشر ذي الحجة ويوم عرفة",icon:"🕋",summary:"أفضل أيام العام والأعمال فيها أحب إلى الله",sunnahs:["صيام التسع الأوائل وخاصة عرفة","الإكثار من التكبير والتهليل والتحميد","الاجتهاد في العبادة والذكر","الإمساك عن قص الشعر والأظافر للمضحي"]},
  eid_adha:{title:"عيد الأضحى المبارك",icon:"🐑",summary:"يوم النحر وأعظم الأيام عند الله",sunnahs:["صلاة العيد والاغتسال","ذبح الأضحية بعد الصلاة وتوزيعها","الأكل من الأضحية","التكبير المطلق والمقيد دبر الصلوات"]},
  new_hijri_year:{title:"العام الهجري الجديد",icon:"🌙",summary:"بداية شهر محرم الحرام",sunnahs:["مراجعة النفس وتجديد التوبة","صيام ما تيسر من شهر الله محرم","تبادل التهنئة بالعام الجديد"]},
  ashura:{title:"يوم عاشوراء",icon:"🌟",summary:"العاشر من محرم يوم نجا الله فيه موسى",sunnahs:["صيام يوم عاشوراء ليكفر سنة ماضية","صيام يوم التاسع (تاسوعاء) مخالفة لليهود"]},
  mid_shaaban:{title:"ليلة النصف من شعبان",icon:"🌛",summary:"ليلة مباركة ترفع فيها الأعمال السنوية",sunnahs:["قيام الليل بالدعاء والاستغفار","صيام اليوم الخامس عشر تطوعاً","سلامة الصدر وترك الشحناء والخصومة"]},
  isra_miraj:{title:"ليلة الإسراء والمعراج",icon:"🕌",summary:"ذكرى المعجزة والرحلة العظيمة وفرض الصلاة",sunnahs:["الإكثار من الصلاة على النبي صلى الله عليه وسلم","إحياء الليل بالذكر والعبادة","الاستغفار والصدقة وإدخال السرور على الأهل"]}
};

let hijriEngineAvailable = false; let hijriFormatter = null;
const HIJRI_MONTHS = ['محرم','صفر','ربيع الأول','ربيع الآخر','جمادى الأولى','جمادى الآخرة','رجب','شعبان','رمضان','شوال','ذو القعدة','ذو الحجة'];

function initHijri() {
  try {
    const fmt = new Intl.DateTimeFormat('en-US-u-ca-islamic-umalqura', { year: 'numeric', month: 'numeric', day: 'numeric' });
    const test = fmt.formatToParts(new Date());
    if (test.some(p => p.type === 'year' && parseInt(p.value)>1400)) { hijriFormatter = fmt; hijriEngineAvailable = true; }
  } catch(e) {}
}

function getHijriDate(date) {
  if (!hijriFormatter) return null;
  try {
    const parts = hijriFormatter.formatToParts(date);
    const d = parseInt(parts.find(p=>p.type==='day').value);
    const m = parseInt(parts.find(p=>p.type==='month').value);
    const y = parseInt(parts.find(p=>p.type==='year').value);
    return { day: d, month: m, year: y };
  } catch(e) { return null; }
}

function getActiveOccasionKeys(hijri, gregorianDayOfWeek) {
  const keys = []; const { day, month } = hijri;
  if (gregorianDayOfWeek === 0) keys.push('pre_monday');
  if (gregorianDayOfWeek === 3) keys.push('pre_thursday');
  // مساء الخميس: تذكير بسنن الجمعة (يوم الجمعة هو العيد الأسبوعي)
  if (gregorianDayOfWeek === 4) keys.push('pre_friday');
  if (day === 12) keys.push('pre_white_days');
  const FRIDAY = 5, MONDAY = 1, THURSDAY = 4;
  if (gregorianDayOfWeek === FRIDAY) keys.push('friday');
  if (gregorianDayOfWeek === MONDAY || gregorianDayOfWeek === THURSDAY) keys.push('monday_thursday');
  if (day >= 13 && day <= 15) keys.push('white_days');
  if (month === 9) { if (day >= 20) keys.push('ramadan_last10'); else keys.push('ramadan'); }
  if (month === 10 && day === 1) keys.push('eid_fitr');
  if (month === 12) { if (day >= 1 && day <= 9) keys.push('dhulhijjah_10'); if (day === 10) keys.push('eid_adha'); }
  if (month === 1) { if (day === 1) keys.push('new_hijri_year'); if (day === 9 || day === 10) keys.push('ashura'); }
  if (month === 8 && day === 15) keys.push('mid_shaaban');
  if (month === 7 && day === 27) keys.push('isra_miraj');
  return keys;
}

function todayDateKey(date) { return `${date.getFullYear()}-${date.getMonth()+1}-${date.getDate()}`; }
function getCurrentPeriod(date) {
  const h = date.getHours();
  if (h >= 4 && h < 12) return 'fajr_morning';
  if (h >= 12 && h < 15) return 'dhuhr';
  if (h >= 15 && h < 18) return 'asr';
  if (h >= 18 && h < 20) return 'maghrib';
  return 'isha_night';
}

function updateHeaderSubtitle() {
  const sub = document.getElementById('header-subtitle');
   if (state.currentScreen === 'khatmah-read' && state.khatmah) {
    if (state.khatmah.currentPage >= state.khatmah.todayWirdEnd) {
       sub.textContent = `أتممت ورد اليوم (صفحة ${toArabicNum(state.khatmah.currentPage)})`;
       sub.classList.add('subtitle-accent');
    } else {
       sub.textContent = `ورد صفحة ${toArabicNum(state.khatmah.currentPage)}`;
       sub.classList.remove('subtitle-accent');
    }
    return;
  }
  if (hijriEngineAvailable) {
    const h = getHijriDate(new Date());
    if (h && !isNaN(h.month)) {
        sub.textContent = `${toArabicNum(h.day)} ${HIJRI_MONTHS[h.month-1]} ${toArabicNum(h.year)} هـ`;
        sub.classList.remove('subtitle-accent');
        return;
    }
  }
  sub.textContent = '';
  sub.classList.remove('subtitle-accent');
}

const SURAHS_DATA = Array.from({length: 114}, (_, i) => ({number: i+1, name: `سورة ${i+1}`, numberOfAyahs: 10}));
const toArabicNum = n => n.toString().replace(/\d/g, d => '٠١٢٣٤٥٦٧٨٩'[d]);
window.toArabicNum = toArabicNum;

/* ==================== تطبيع النصوص العربية وإزالة البسملة ==================== */
/* المشكلة: واجهة الـ API تُرجع تشكيل البسملة بترتيب غير قياسي (الشدّة U+0651 قبل
   الفتحة U+064E أحياناً)، وكذلك اختلاف أشكال الألف والمدّ والتطويل بين السور.
   لذلك أي مطابقة نصية حرفية للبسملة ستفشل. الحل: تطبيع موحّد يزيل التشكيل
   ويوحّد الألف/الياء ثم مقارنة الكلمات الأربع الأولى. */
function _normArabic(s) {
  return (s || '')
    .normalize('NFKC')                       // يوحّد ترتيب الحركات المتتابعة (الفتحة/الشدّة)
    .replace(/[\u064B-\u0652\u0670\u0640\u06D6-\u06ED]/g, '') // إزالة التشكيل + المدّ U+0670 + التطويل U+0640 + علامات المصحف
    .replace(/[أإآٱ]/g, 'ا')                 // توحيد كل أشكال الألف
    .replace(/ى/g, 'ي')                      // توحيد الياء/الألف المقصورة
    .replace(/\s+/g, ' ')
    .trim();
}
// الصورة المرجعية للبسملة بعد التطبيع (بسم الله الرحمن الرحيم)
const BISMILLAH_NORMALIZED = _normArabic('بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ');

// تزيل البسملة من بداية نص الآية الأولى في السورة (إن وُجدت) مع إبقاء باقي
// كلمات الآية وتشكيلها كما هي. تُستثنى الفاتحة (البسملة فيها آية مستقلة)
// والتوبة (لا بسملة) — ويتم ذلك في أماكن الاستدعاء.
function stripBismillah(text) {
  if (!text) return text;
  if (!_normArabic(text).startsWith(BISMILLAH_NORMALIZED)) return text;
  // البسملة أربع كلمات دائماً؛ نقطفها من النص الأصلي لنبقى على تشكيل الآية سليماً
  const words = text.trim().split(/\s+/);
  if (words.length <= 4) return '';
  return words.slice(4).join(' ').trim();
}
const tabsArray = ['quran', 'athkar', 'tasbih', 'khatmah'];
let state = { currentTab: 'quran', currentScreen: 'surah-list', previousScreen: null, previousTab: null, currentSurah: null, fontScale: 1.4, currentCatIndex: null, khatmah: null, theme: 'dark', bookmark: null, scrollPositions: {}, mushafPage: 1 };
// let/const في السكربتات الكلاسيكية لا تنشئ خصائص على window؛
// features.js يقرأ window.state و window.Motion فلا بد من كشفهما صراحةً
// (الكائن يُعدَّل بالمرجع نفسه ولا يُعاد إسناده، فالمرجع المشترك يبقى صالحاً).
window.state = state;
// var وليس let: المستهلكون في features.js/khatmah.js يقرؤون window.allSurahs
// — و let العلوية في السكربتات الكلاسيكية لا تنشئ خاصية على window، فبقيت
// القائمة فارغة دائماً في بطاقة فهرس السور (audit 2026-11)
var allSurahs = [];
let contentArea, searchBar, clearBtn;

/* ==================== Motion Engine ==================== */
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const Motion = {
  // Stagger-in: takes a container element, staggers its direct children with a CSS class
  staggerIn(container, childSelector = ':scope > *', baseDelay = 0) {
    if (!container) return;
    if (prefersReducedMotion) { container.classList.add('mounted'); return; }
    container.setAttribute('data-stagger', '');
    const children = container.querySelectorAll(childSelector);
    children.forEach((child, i) => {
      const delay = baseDelay + Math.min(i, 14) * 50;
      child.style.setProperty('--reveal-delay', `${delay}ms`);
    });
    requestAnimationFrame(() => {
      requestAnimationFrame(() => container.classList.add('mounted'));
    });
  },

  // FLIP animation: smoothly transition elements from old to new positions
  flipAnimate(container, childSelector = ':scope > *', duration = 380) {
    if (!container || prefersReducedMotion) return;
    const children = container.querySelectorAll(childSelector);
    const firstRects = new Map();
    children.forEach(c => firstRects.set(c, c.getBoundingClientRect()));
    return () => {
      children.forEach(c => {
        const last = c.getBoundingClientRect();
        const first = firstRects.get(c);
        if (!first) return;
        const dx = first.left - last.left;
        const dy = first.top - last.top;
        if (dx === 0 && dy === 0) return;
        c.style.transition = 'none';
        c.style.transform = `translate(${dx}px, ${dy}px)`;
        c.classList.add('flip-anim');
        requestAnimationFrame(() => {
          c.style.transform = '';
          setTimeout(() => c.classList.remove('flip-anim'), duration + 50);
        });
      });
    };
  },

  // Smooth count-up animation: animates a number from current to target
  animateNumber(el, from, to, duration = 600) {
    if (!el || prefersReducedMotion) { if (el) el.textContent = toArabicNum(to); return; }
    const start = performance.now();
    const ease = t => 1 - Math.pow(1 - t, 3); // easeOutCubic
    el.classList.add('count-anim');
    function frame(now) {
      const t = Math.min(1, (now - start) / duration);
      const v = Math.round(from + (to - from) * ease(t));
      el.textContent = toArabicNum(v);
      if (t < 1) requestAnimationFrame(frame);
      else {
        el.classList.remove('pop');
        void el.offsetWidth;
        el.classList.add('pop');
      }
    }
    requestAnimationFrame(frame);
  },

  // Burst particles from a target element
  burst(target, count = 8, color = 'var(--accent)') {
    if (!target || prefersReducedMotion) return;
    const rect = target.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    for (let i = 0; i < count; i++) {
      const p = document.createElement('div');
      p.className = 'burst-particle';
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.5;
      const dist = 30 + Math.random() * 40;
      p.style.left = `${cx}px`;
      p.style.top = `${cy}px`;
      p.style.setProperty('--bx', `${Math.cos(angle) * dist}px`);
      p.style.setProperty('--by', `${Math.sin(angle) * dist}px`);
      p.style.background = color;
      p.style.position = 'fixed';
      document.body.appendChild(p);
      setTimeout(() => p.remove(), 750);
    }
  },

  // Confetti burst
  confetti(count = 60) {
    if (prefersReducedMotion) return;
    // حدود أصغر على الشاشات الصغيرة للأداء
    if (window.innerWidth < 500) count = Math.min(count, 50);
    // ألوان من نظام التصميم مع بدائل عند عدم توفر getComputedStyle
    const cs = getComputedStyle(document.documentElement);
    const grab = n => cs.getPropertyValue(n).trim() || undefined;
    const colors = [grab('--accent'), grab('--accent-2'), grab('--gold'), grab('--text-dim'), grab('--success'), '#4fd1a5'].filter(Boolean);
    for (let i = 0; i < count; i++) {
      const piece = document.createElement('div');
      piece.className = 'confetti-piece';
      piece.style.left = `${Math.random() * 100}vw`;
      piece.style.background = colors[Math.floor(Math.random() * colors.length)];
      piece.style.setProperty('--dx', `${(Math.random() - 0.5) * 200}px`);
      piece.style.setProperty('--dr', `${360 + Math.random() * 720}deg`);
      piece.style.animationDelay = `${Math.random() * 200}ms`;
      piece.style.animationDuration = `${1400 + Math.random() * 800}ms`;
      document.body.appendChild(piece);
      setTimeout(() => piece.remove(), 2400);
    }
  },

  // Floating "+1" label
  floater(target, text = '+1', color = 'var(--accent)') {
    if (!target || prefersReducedMotion) return;
    const rect = target.getBoundingClientRect();
    const f = document.createElement('div');
    f.className = 'floater';
    f.textContent = text;
    f.style.left = `${rect.left + rect.width / 2}px`;
    f.style.top = `${rect.top + rect.height / 2}px`;
    f.style.color = color;
    f.style.position = 'fixed';
    document.body.appendChild(f);
    setTimeout(() => f.remove(), 950);
  },

  // Surge ring (success feedback around target)
  surgeRing(target) {
    if (!target || prefersReducedMotion) return;
    const ring = document.createElement('div');
    ring.className = 'surge-ring';
    target.appendChild(ring);
    setTimeout(() => ring.remove(), 760);
  },

  // Magnetic hover effect (subtle): element follows cursor within bounds
  magnetic(target, strength = 0.2) {
    if (!target || prefersReducedMotion) return () => {};
    target.setAttribute('data-magnetic', '');
    const onMove = e => {
      const rect = target.getBoundingClientRect();
      const x = e.clientX - rect.left - rect.width / 2;
      const y = e.clientY - rect.top - rect.height / 2;
      target.style.transform = `translate(${x * strength}px, ${y * strength}px)`;
    };
    const onLeave = () => { target.style.transform = ''; };
    target.addEventListener('mousemove', onMove);
    target.addEventListener('mouseleave', onLeave);
    return () => {
      target.removeEventListener('mousemove', onMove);
      target.removeEventListener('mouseleave', onLeave);
    };
  },

  // Theme crossfade: briefly enables a global transition
  themeCrossfade() {
    if (prefersReducedMotion) return;
    document.documentElement.classList.add('theme-transitioning');
    setTimeout(() => document.documentElement.classList.remove('theme-transitioning'), 500);
  },

  // Header flash on theme switch
  // Header parallax on scroll — تحويل خفيف فقط، بلا ظلال سطرية تتغلب على الثيم
  bindHeaderParallax(scrollEl) {
    if (!scrollEl || prefersReducedMotion) return () => {};
    const h = document.getElementById('header');
    if (!h) return () => {};
    let raf = null;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        const sy = scrollEl.scrollTop;
        const offset = Math.max(-10, Math.min(0, -sy * 0.15));
        h.style.transform = `translateY(${offset}px)`;
        raf = null;
      });
    };
    scrollEl.addEventListener('scroll', onScroll, { passive: true });
    return () => scrollEl.removeEventListener('scroll', onScroll);
  }
};
window.Motion = Motion;

function loadState() {
  try {
    const s = localStorage.getItem('app_state');
    if (s) {
      const parsed = JSON.parse(s);
      // نسخة احتياطية مزيّفة بمفتاح __proto__ كانت تُبدّل نموذج كائن الحالة
      // عبر Object.assign — انسخ المفاتيح المعروفة فقط (audit 2026-11)
      Object.keys(parsed).forEach((k) => {
        if (k !== '__proto__' && k !== 'constructor') state[k] = parsed[k];
      });
    }
    if(!state.scrollPositions) state.scrollPositions = {};
  } catch(e) {}
  // حقول الجلسة: لا معنى لها بعد إقلاع جديد — previousScreen القديم يُفشل
  // دخول الوضع الهادئ للقارئ، و currentScreen يجب أن يطابق الشاشة الفعلية.
  state.previousScreen = null;
  state.currentScreen = 'surah-list';
  state.mushafMode = null;
}
// بيانات السورة الكاملة (currentSurahData: كل آياتها + أشكال الكلمات) حقل
// جلسة فقط — تسلسلها مع كل حفظ كان ينفخ app_state بعدة ميغابايتات
// (2026-11 audit). تُستبعد من التخزين وتُعاد جلبها عند الإقلاع.
function saveState() {
  try {
    localStorage.setItem('app_state', JSON.stringify(state, (k, v) => (k === 'currentSurahData' ? undefined : v)));
    checkBookmarkFAB();
  } catch(e) {
    // نفاد الحصة: حرّر ذاكرة صفحات المصحف (q_p_u_* — قابلة لإعادة الجلب من
    // الشبكة) وأعد المحاولة مرة واحدة، وإلا استمر التقدم بلا حفظ صامتاً
    // (audit 2026-11)
    try {
      const drops = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.indexOf('q_p_u_') === 0) drops.push(k);
      }
      drops.forEach((k) => localStorage.removeItem(k));
      localStorage.setItem('app_state', JSON.stringify(state, (k, v) => (k === 'currentSurahData' ? undefined : v)));
      checkBookmarkFAB();
      if (window.Toast) Toast.show('تم تحرير مساحة التخزين (ذاكرة صفحات المصحف) وإعادة الحفظ');
    } catch (e2) { console.warn('[state] save failed even after freeing page cache:', e2 && e2.name); }
  }
}

// تزامن بين التبويبات: تبويب آخر حفظ app_state — تبنَّ تقدم الختمة فقط حتى لا
// يعيد التبويب القديم كتابة تقدم أقدم ويضيّع التحديث (last-write-wins،
// audit 2026-11). الحقول الأخرى تبقى محلية لتفادي وميض الواجهة أثناء القراءة.
window.addEventListener('storage', (e) => {
  if (e.key !== 'app_state' || !e.newValue || !window.state) return;
  try {
    const inc = JSON.parse(e.newValue);
    if (inc && inc.khatmah) window.state.khatmah = inc.khatmah;
  } catch (err) {}
});

function applyTheme(th) {
  state.theme = th;
  const themeBtn = document.getElementById('theme-btn');
  const sunSvg = '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>';
  const moonSvg = '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>';
  if(th === 'light') { document.body.classList.add('theme-light'); if(themeBtn) { themeBtn.innerHTML = sunSvg; themeBtn.title = 'الوضع الداكن'; } }
  else { document.body.classList.remove('theme-light'); if(themeBtn) { themeBtn.innerHTML = moonSvg; themeBtn.title = 'الوضع الفاتح'; } }
  try { localStorage.setItem('theme', th); } catch(e) {}
  // ثيم الصفحة التلقائي يتبع ثيم التطبيق — أعد حله فوراً عند التبديل
  if (window.ReaderSettings) ReaderSettings.applyAll();
  // لون شريط الحالة يتطابق مع الوضع الحالي (PWA)
  const metaTheme = document.getElementById('meta-theme-color');
  if (metaTheme) metaTheme.setAttribute('content', th === 'light' ? '#F6F4EF' : '#07161B');
  saveState();
  // انتقال ناعم بين الوضعين بدل القفزة اللحظية
  Motion.themeCrossfade();
}

// نظام تكبير الخط: خمس درجات من ٨٠٪ إلى ٢٠٠٪.
// القيم نسبةً إلى --font-base. ارتفاع السطر يُشتق من الدرجة كي يبقى
// النص العربي مريحاً عند التكبير الكبير دون أن يحدث تزاحم الأسطر.
const FONT_STEPS = [
  { scale: 0.8,  label: '٨٠٪'  },
  { scale: 1.0,  label: '١٠٠٪' },
  { scale: 1.3,  label: '١٣٠٪' },
  { scale: 1.5,  label: '١٥٠٪' },
  { scale: 2.0,  label: '٢٠٠٪' },
];
// خرائط التوافق مع الإصدار السابق: الأسماء القديمة ص/م/ك → النسبة العددية
const LEGACY_FONT_SIZE = { small: 0.8, medium: 1.0, large: 1.4 };

function applyFontSize(scale) {
  const s = typeof scale === 'string' ? (LEGACY_FONT_SIZE[scale] ?? 1.0) : (+scale || 1.0);
  // قصّ النسبة إلى أقرب درجة معروفة لتفادي قيم عشوائية مُسترجَعة من تخزين قديم
  let step = FONT_STEPS.reduce((a, b) => Math.abs(b.scale - s) < Math.abs(a.scale - s) ? b : a);
  document.documentElement.style.setProperty('--font-scale', String(step.scale));
  // ارتفاع السطر ينمو مع التكبير: ٢.٠ عند الصغير حتى ٢.٩ عند ٢٠٠٪
  document.documentElement.style.setProperty('--line-height', String(2.0 + (step.scale - 0.8) * 0.75));
  // نص المصحف يتكبّر بنسبة مستقلة أهدأ (لا يتجاوز ١.٢٥) وله ارتفاع سطر خاص
  document.documentElement.style.setProperty('--mushaf-scale', String(Math.min(1.25, 0.9 + (step.scale - 0.8) * 0.35)));
  document.documentElement.style.setProperty('--mushaf-lh', step.scale >= 1.5 ? '1.95' : '2.15');
  state.fontScale = step.scale;
  try { localStorage.setItem('font_scale', String(Math.round(step.scale * 100))); } catch(e) {}
  // سجلّات تحديد الحجم القديم لا تُستخدم بعد الآن
  delete state.fontSize;
  saveState();
  // واجهة الاختيار (نافذة الخط المنبثقة)
  document.querySelectorAll('.font-step-btn').forEach(btn => {
    const isActive = +btn.dataset.scale === step.scale;
    btn.classList.toggle('active', isActive);
    if (isActive) { btn.classList.remove('pop'); void btn.offsetWidth; btn.classList.add('pop'); }
    btn.setAttribute('aria-pressed', String(isActive));
  });
  const fn = document.getElementById('font-size-btn');
  if (fn) fn.textContent = 'أ';
  // تكبير الخط يغيّر ارتفاع شريط التنقل — أعد قياس مساحة التغطية ومواءمة المصحف
  requestAnimationFrame(() => {
    if (typeof syncNavSafeArea === 'function') syncNavSafeArea();
    if (typeof fitMushafPageToViewport === 'function') fitMushafPageToViewport();
  });
  return step.scale;
}

// نافذة حجم الخط المنبثقة: تُبنى من FONT_STEPS وتُفتح/تُغلق من زر الرأس
function buildFontPopover() {
  const grid = document.getElementById('font-popover-grid');
  if (!grid || grid.childElementCount) return;
  grid.innerHTML = FONT_STEPS.map(st =>
    `<button class="font-step-btn" data-scale="${st.scale}" aria-pressed="false">${st.label}</button>`
  ).join('');
  grid.querySelectorAll('.font-step-btn').forEach(btn =>
    btn.addEventListener('click', () => applyFontSize(+btn.dataset.scale))
  );
}
function toggleFontPopover(force) {
  const pop = document.getElementById('font-popover');
  const btn = document.getElementById('font-size-btn');
  if (!pop || !btn) return;
  const show = force !== undefined ? force : pop.hidden;
  pop.hidden = !show;
  btn.setAttribute('aria-expanded', String(show));
}

// كل شاشة تنتمي لتبويب رئيسي؛ الشاشات المشتركة (الإعدادات/الإحصائيات)
// ترث التبويب الذي فُتحت منه فلا تنكسر مطابقة التبويب المضيء.
// المرجعيات تحتوي سوراً وآيات فتُنسب للقرآن.
const SCREEN_TAB = {
  'surah-list': 'quran', 'surah-view': 'quran', 'bookmarks': 'quran',
  'khatmah-main': 'khatmah', 'khatmah-read': 'khatmah',
  'athkar-list': 'athkar', 'thikr-view': 'athkar', 'dua-list': 'athkar', 'occasion-list': 'athkar',
  'tasbih': 'tasbih'
};
// مسار التنقّل الحقيقي (LIFO) — بديل عن خانة previousScreen الواحدة القابلة للتعفّن.
// يضمّ الشاشات التي *خلف* الشاشة الحالية فقط (الشاشة الحالية نفسها لا تدخله أبداً)،
// يُعاد ضبطه عند تبديل التبويب، ويبقى داخل الجلسة (لا يُحفظ في localStorage).
let screenStack = [];
// علم لتمييز تنقّلاتنا الداخلية في السجل حتى لا تعالجها معالجة التجزئة (hashchange)،
// ولا تعيد تسجيل الشاشة التي يغادرها المستخدم أثناء الرجوع.
// معلوم هنا (قبل showScreen/navigateBack) لأنه يُقرأ من داخلهما.
let _internalNav = false;

// يضيء التبويب المالك للشاشة الحالية ويحرّك المؤشر الزجاجي معه
function syncNavTab(tabId) {
  document.querySelectorAll('.nav-tab').forEach(t => {
    const on = t.dataset.tab === tabId;
    t.classList.toggle('active', on);
    t.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  state.currentTab = tabId;
  if (typeof setNavIndicator === 'function') setNavIndicator();
}

function showScreen(screenId, animClass = 'active') {
  if(state.currentScreen && ['surah-list', 'athkar-list'].includes(state.currentScreen)) state.scrollPositions[state.currentScreen] = contentArea.scrollTop;
  // احفظ موضع التمرير في القارئين أيضاً حتى يُستعاد عند الرجوع إليهما
  if(state.currentScreen && ['surah-view', 'khatmah-read'].includes(state.currentScreen)) state.scrollPositions[state.currentScreen] = mushafViewport() ? mushafViewport().scrollTop : 0;

  // سجّل الشاشة الحالية في مسار الرجوع قبل الانتقال (مرة واحدة لكل انتقال فعلي)
  // — لكن لا تسجّلها أثناء الرجوع نفسه وإلا عاد المستخدم خطوة إلى الأمام بدلاً من الخلف.
  if (state.currentScreen && state.currentScreen !== screenId && !_internalNav) screenStack.push(state.currentScreen);

  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active', 'slide-left', 'slide-right'));
  // ===== القارئ الموحّد: surah-view و khatmah-read اسمان لنفس الشاشة =====
  // كل منطق التطبيق (التبويب، الرجوع، الروابط العميقة) يرى الاسم المنطقي،
  // بينما العنصر المعروض واحد دائماً. علم الوضع يميّز المسارين للرسم.
  const isMushafReader = (screenId === 'surah-view' || screenId === 'khatmah-read');
  const target = document.getElementById(isMushafReader ? 'screen-mushaf' : `screen-${screenId}`);
  if (isMushafReader) {
    state.mushafMode = screenId;
    // الدخول لأول مرة يبدأ في الوضع الهادئ؛ التنقّل بين المسارين يحافظ على الوضع.
    // نفحص حالة الجسم الفعلية لا previousScreen: بعد «القارئ ← رجوع ← إعادة
    // الدخول» يبقى previousScreen اسم القارئ فكان يُُتخطّى دخول الوضع الهادئ
    // وتبقى الشاشة بلا وضع إطلاقاً (رأس التطبيق وشريط التنقّل ظاهرين فوق الصفحة).
    if (!document.body.classList.contains('mushaf-zen') &&
        !document.body.classList.contains('mushaf-hud')) enterZenMode();
  } else {
    // مغادرة القارئ: مسار القارئ وكل كرومه يجب أن يزولا دائماً. كان الشرط
    // السابق (previousScreen !== screenId) يتخطّى التنظيف في الرحلة الخطّية
    // جذر ← قارئ ← رجوع، فيظلّ body.mushaf-zen عالقاً فيختفي #nav و#header
    // بعد الرجوع بالمتصفح. لا حالة مشروعة تحملها هذه الأعلام خارج القارئ.
    state.mushafMode = null;
    document.body.classList.remove('mushaf-zen', 'mushaf-hud');
    // .nav-hidden لا يُضبط إلا من مستمع تمرير #content، فلا يُمسح تلقائياً —
    // لو أخفاه المستخدم قبل دخول القارئ بقي مخفياً بعد الرجوع
    const nav = document.getElementById('nav');
    if (nav) nav.classList.remove('nav-hidden');
  }
  if (target) {
    target.classList.add(animClass);
    // أزل أي transform متبقٍ بعد انتهاء حركة الدخول (يعزّز إصلاح 1.1: لا containing block للعناصر الثابتة)
    const stripTransform = () => { target.style.transform = ''; };
    if (prefersReducedMotion) { stripTransform(); }
    else { target.addEventListener('animationend', stripTransform, { once: true }); }
  }

  if (state.currentScreen !== screenId) state.previousScreen = state.currentScreen;
  state.currentScreen = screenId;
  // قرص التلاوة يظهر فقط داخل القارئ — أعد رسم موقعه هنا لأن تغيير الشاشة
  // لا يُطلق حدث AudioPlayer
  if (window.ReaderAudioPill) ReaderAudioPill.render();
  // التبويب المضيء يجب أن يمثّل الشاشة المعروضة دائماً (الشاشات المشتركة ترث أصلها)
  syncNavTab(SCREEN_TAB[screenId] || state.currentTab);
  // أخفِ شريط إجراءات الآية عند مغادرة قارئ السورة
  if (screenId !== 'surah-view' && screenId !== 'khatmah-read') hideAyahBar();
  const isSubScreen = ['surah-view', 'thikr-view', 'dua-list', 'tasbih', 'khatmah-read', 'occasion-list', 'bookmarks', 'settings', 'stats'].includes(screenId);
  const backBtn = document.getElementById('back-btn');
  if (backBtn) {
    if (isSubScreen && !backBtn.classList.contains('visible')) {
      backBtn.classList.add('visible', 'btn-spring-in');
      setTimeout(() => backBtn.classList.remove('btn-spring-in'), 400);
    } else {
      backBtn.classList.toggle('visible', isSubScreen);
    }
  }

  const titles = { 'surah-list': 'القرآن الكريم', 'surah-view': state.currentSurah?.name || 'القرآن الكريم', 'khatmah-main': 'الختمة', 'khatmah-read': 'الختمة', 'athkar-list': 'حصن المسلم', 'thikr-view': state.currentCatIndex !== null ? ATHKAR[state.currentCatIndex].name : 'الأذكار', 'dua-list': 'أدعية النبي ﷺ', 'tasbih': 'السبحة', 'occasion-list': 'المناسبات والتذكيرات', 'bookmarks': 'المرجعيات', 'settings': 'الإعدادات', 'stats': 'الإحصائيات' };
  const titleEl = document.getElementById('header-title');
  if (titleEl) {
    titleEl.textContent = titles[screenId] || 'إسلامي';
    titleEl.classList.remove('title-in'); void titleEl.offsetWidth; titleEl.classList.add('title-in');
    // عنوان التبويب يتبع الشاشة الحالية (SEO + تجربة المستخدم)
    document.title = `${titles[screenId] || 'إسلامي'} | تطبيق إسلامي`;
  }
  updateHeaderSubtitle(); updateBookmarkIcon(); checkBookmarkFAB();

  if (isMushafReader) {
    contentArea.scrollTop = 0;
    if (target) target.scrollTop = 0;
    const vpNow = mushafViewport();
    if (vpNow && !document.body.classList.contains('mushaf-scroll-vertical')) vpNow.scrollTop = 0;
  }
  setTimeout(() => {
    if(['surah-list', 'athkar-list'].includes(screenId) && state.scrollPositions[screenId]) { contentArea.scrollTop = state.scrollPositions[screenId]; }
    else if (isMushafReader) {
      const vp = mushafViewport();
      if (vp) vp.scrollTop = document.body.classList.contains('mushaf-scroll-vertical') ? (state.scrollPositions[screenId] || 0) : 0;
      contentArea.scrollTop = 0;
      if (target) target.scrollTop = 0;
    }
    else { contentArea.scrollTop = 0; }
  }, 30);

  if(['surah-view', 'khatmah-read'].includes(screenId)) document.getElementById('reading-progress-container').style.display = 'block';
  else { document.getElementById('reading-progress-container').style.display = 'none'; document.getElementById('reading-progress-bar').style.setProperty('--progress', 0); }

  // شريط تحكم الختمة أُزيل في مرحلة ٥ — القارئ الموحّد يحمل شريط الورد وزرّ الإتمام
  renderWirdChrome();

  // شاشة الذكر وحدها تحجز كامل ارتفاع المحتوى لنمط التركيز —
  // إزالة علامتها عند أي مغادرة حتى لا تتأثر بقية الشاشات.
  const isThikr = screenId === 'thikr-view';
  contentArea.classList.toggle('pager-dhikr', isThikr);
  if (!isThikr) {
    state.dhikrFavOnly = false;
    // أوقف القراءة المتتابعة وأغلق قائمة الخيارات عند مغادرة الشاشة
    if (window.stopFocusPlay) stopFocusPlay();
    if (window.toggleFocusMenu) toggleFocusMenu(false);
  }
}

// الشاشات الجذرية لكل تبويب
const TAB_ROOT_SCREEN = { quran: 'surah-list', khatmah: 'khatmah-main', athkar: 'athkar-list', tasbih: 'tasbih' };
function rootScreenOf(tab) { return TAB_ROOT_SCREEN[tab] || 'surah-list'; }

function navigateBack() {
  // ارجع إلى الشاشة الفعلية السابقة من مسار التنقّل — لا تخمين من خانات قابلة للتعفّن
  const target = screenStack.length > 0 ? screenStack.pop() : rootScreenOf(state.currentTab);
  _internalNav = true;
  window._internalNav = true;
  showScreen(target, 'slide-right');
  // ملاذ أخير: أي مسار خارج showScreen يجب ألا يُبقي كروم القارئ عالقاً.
  // showScreen ينظّف بنفسه الآن، وهذا يحمي من مسارات مستقبلية تتخطّاه.
  if (target !== 'surah-view' && target !== 'khatmah-read') {
    document.body.classList.remove('mushaf-zen', 'mushaf-hud');
    const nav = document.getElementById('nav');
    if (nav) nav.classList.remove('nav-hidden');
  }
  // أعد بناء الحالات الخاصة للشاشة التي عدنا إليها
  if (target === 'athkar-list' && typeof renderAthkarList === 'function') renderAthkarList();
  if (target === 'khatmah-main' && typeof updateKhatmahUI === 'function') updateKhatmahUI();
  // إيقاف القراءة المتتابعة عند العودة لقائمة الأذكار
  if (target === 'athkar-list' && window.stopFocusPlay) stopFocusPlay();
  saveState();
  setTimeout(() => { _internalNav = false; window._internalNav = false; }, 0);
}

/* ==================== محرك الزنبرك للمؤشر الزجاجي (Spring Physics) ==================== */
/* محاكاة فيزيائية حقيقية (Mass-Spring-Damper) بحركة طبيعية غير خطية،
   بدلاً من انتقالات CSS الثابتة. تدعم استمرار السرعة عند السحب والإفلات. */
const navIndicatorEl = document.getElementById('nav-indicator');
const navSpring = {
  x: 0, w: 0, vx: 0, vw: 0, targetX: 0, targetW: 0,
  k: 285, c: 32,            /* تخميد حرج مطابق لعدسة Apple Liquid Glass بدون اهتزاز زائد */
  raf: null, running: false, lastT: 0, traveled: 0
};

function applyNavIndicator(x, w, stretchX, squashY) {
  navIndicatorEl.style.width = `${w}px`;
  navIndicatorEl.style.transform = `translateX(${x}px) scaleX(${stretchX}) scaleY(${squashY})`;
}

function snapNavIndicator() {
  const activeTab = document.querySelector('.nav-tab.active');
  if (!activeTab) return;
  if (navSpring.raf) { cancelAnimationFrame(navSpring.raf); navSpring.running = false; }
  navSpring.x = navSpring.targetX = activeTab.offsetLeft;
  navSpring.w = navSpring.targetW = activeTab.offsetWidth;
  navSpring.vx = navSpring.vw = 0;
  applyNavIndicator(navSpring.x, navSpring.w, 1, 1);
}

function navSpringStep(now) {
  const s = navSpring;
  if (!s.lastT) s.lastT = now;
  let dt = (now - s.lastT) / 1000;
  s.lastT = now;
  if (dt <= 0) { s.raf = requestAnimationFrame(navSpringStep); return; }
  dt = Math.min(dt, 1 / 30); // منع الانفجار العددي عند الرجوع للتبويب

  // خطوات فرعية لضمان الاستقرار مع ثابت صلابة عالٍ
  const sub = 4, h = dt / sub;
  for (let i = 0; i < sub; i++) {
    s.vx += (-s.k * (s.x - s.targetX) - s.c * s.vx) * h;
    s.vw += (-s.k * (s.w - s.targetW) - s.c * s.vw) * h;
    s.x += s.vx * h;
    s.w += s.vw * h;
  }

  // التمدد الانسيابي الهادئ لعدسة الزجاج السائل (Liquid Glass Morph)
  const speed = Math.abs(s.vx);
  const stretchX = 1 + Math.min(speed / 1500, 0.065);
  const squashY = 1 - Math.min(speed / 2400, 0.035);
  applyNavIndicator(s.x, s.w, stretchX, squashY);

  // شرط الاستقرار: وصول للهدف بسرعة شبه صفرية
  if (Math.abs(s.x - s.targetX) < 0.3 && Math.abs(s.vx) < 3 && Math.abs(s.w - s.targetW) < 0.5) {
    s.x = s.targetX; s.w = s.targetW; s.vx = s.vw = 0;
    applyNavIndicator(s.x, s.w, 1, 1);
    s.running = false; s.lastT = 0;
    // وميض زجاجي خفيف عند الوصول إذا تحرك المؤشر فعلاً
    if (s.traveled > 8) {
      navIndicatorEl.classList.remove('sheen');
      void navIndicatorEl.offsetWidth;
      navIndicatorEl.classList.add('sheen');
    }
    s.traveled = 0;
    return;
  }
  s.raf = requestAnimationFrame(navSpringStep);
}

function setNavIndicator() {
  const activeTab = document.querySelector('.nav-tab.active');
  if (!activeTab || !navIndicatorEl) return;
  navSpring.targetX = activeTab.offsetLeft;
  navSpring.targetW = activeTab.offsetWidth;
  navSpring.traveled = Math.max(navSpring.traveled, Math.abs(navSpring.targetX - navSpring.x));

  if (prefersReducedMotion) {
    if (navSpring.raf) { cancelAnimationFrame(navSpring.raf); navSpring.running = false; }
    navSpring.x = navSpring.targetX; navSpring.w = navSpring.targetW; navSpring.vx = navSpring.vw = 0;
    applyNavIndicator(navSpring.x, navSpring.w, 1, 1);
    return;
  }
  if (!navSpring.running) {
    navSpring.running = true;
    navSpring.lastT = 0;
    navSpring.raf = requestAnimationFrame(navSpringStep);
  }
}

function createRipple(e) {
  const btn = e.currentTarget; if (!btn || btn.querySelector('.ripple')) return;
  const circle = document.createElement("span");
  const d = Math.max(btn.clientWidth, btn.clientHeight) * 1.2; const r = d / 2;
  circle.style.width = circle.style.height = `${d}px`;
  const cx = e.clientX || (e.touches && e.touches[0].clientX) || (btn.getBoundingClientRect().left + btn.clientWidth / 2);
  const cy = e.clientY || (e.touches && e.touches[0].clientY) || (btn.getBoundingClientRect().top + btn.clientHeight / 2);
  const rect = btn.getBoundingClientRect();
  circle.style.left = `${cx - rect.left - r}px`; circle.style.top = `${cy - rect.top - r}px`; circle.classList.add("ripple");
  btn.appendChild(circle);
  setTimeout(() => circle.remove(), 600);
}

function switchTab(tabId) {
  const oldI = tabsArray.indexOf(state.currentTab); const newI = tabsArray.indexOf(tabId);
  let anim = 'active'; if (oldI !== -1 && newI !== -1 && oldI !== newI) anim = newI > oldI ? 'slide-left' : 'slide-right';

  document.querySelectorAll('.nav-tab').forEach(t => {
    t.classList.remove('active');
    t.setAttribute('aria-selected', 'false');
  });
  const activeTab = document.querySelector(`.nav-tab[data-tab="${tabId}"]`);
  if (activeTab) { activeTab.classList.add('active'); activeTab.setAttribute('aria-selected', 'true'); }
  if (state.currentTab !== tabId) state.previousTab = state.currentTab;
  state.currentTab = tabId;

  if (tabId === 'quran') { showScreen('surah-list', anim); }
  else if (tabId === 'khatmah') { checkMissedDays(); showScreen('khatmah-main', anim); updateKhatmahUI(); }
  else if (tabId === 'tasbih') { showScreen('tasbih', anim); buildTasbih(); updateTasbihUI(); }
  else { showScreen('athkar-list', anim); renderAthkarList(); Motion.staggerIn(document.querySelector('#screen-athkar-list .quick-nav-row')); }
  // تبديل التبويب يبدأ مساراً جديداً من جذر التبويب — تخلّص من أي مسار قديم معفّن.
  // الجذر نفسه لا يُخزّن (المسار يضمّ ما خلف الشاشة الحالية فقط).
  screenStack = [];
  // إيقاف القراءة المتتابعة عند تبديل التبويب (جذر الأذكار athkar-list)
  if (window.stopFocusPlay) stopFocusPlay();
  saveState(); setNavIndicator(); checkBookmarkFAB();
}

let swipeStartX = 0; let swipeStartY = 0;
function handleSwipeStart(x, y) { swipeStartX = x; swipeStartY = y; }
function handleSwipeEnd(x, y) {
  const dx = x - swipeStartX; const dy = y - swipeStartY;
  if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 2) {
    if (['surah-view', 'thikr-view', 'dua-list', 'tasbih', 'khatmah-read', 'occasion-list', 'bookmarks', 'settings', 'stats'].includes(state.currentScreen)) return;
    const currentIndex = tabsArray.indexOf(state.currentTab);
    if (dx > 0 && currentIndex < tabsArray.length - 1) switchTab(tabsArray[currentIndex + 1]);
    else if (dx < 0 && currentIndex > 0) switchTab(tabsArray[currentIndex - 1]);
  }
}

function bindGesturesAndScroll() {
  const shouldIgnore = e => e.target.closest('select, input, option, textarea');
  contentArea.addEventListener('touchstart', e => { if (shouldIgnore(e)) return; handleSwipeStart(e.changedTouches[0].clientX, e.changedTouches[0].clientY); }, {passive: true});
  contentArea.addEventListener('touchend', e => { if (shouldIgnore(e)) return; handleSwipeEnd(e.changedTouches[0].clientX, e.changedTouches[0].clientY); }, {passive: true});
  contentArea.addEventListener('mousedown', e => { if (shouldIgnore(e)) return; if(e.button === 0) handleSwipeStart(e.clientX, e.clientY); }, {passive: true});
  contentArea.addEventListener('mouseup', e => { if (shouldIgnore(e)) return; if(e.button === 0) handleSwipeEnd(e.clientX, e.clientY); }, {passive: true});

  // Header parallax
  Motion.bindHeaderParallax(contentArea);

  let lastScrollY = 0;
  contentArea.addEventListener('scroll', () => {
    const sy = contentArea.scrollTop; const maxScroll = contentArea.scrollHeight - contentArea.clientHeight;
    const isAtBottom = sy >= maxScroll - 20;
    const nav = document.getElementById('nav'); const fab = document.getElementById('resume-fab');
    if (sy > lastScrollY && sy > 50 && !isAtBottom) {
      nav.classList.add('nav-hidden');
    } else {
      nav.classList.remove('nav-hidden');
    }
    lastScrollY = sy;
    if (['surah-view', 'khatmah-read'].includes(state.currentScreen)) { document.getElementById('reading-progress-bar').style.setProperty('--progress', maxScroll > 0 ? (sy / maxScroll).toFixed(4) : 0); }
  }, {passive: true});
  // القارئ الموحّد له نافذة تمرير خاصة — شريط التقدّم يتبعها هي
  const _mvp = mushafViewport();
  if (_mvp) _mvp.addEventListener('scroll', () => {
    if (!['surah-view', 'khatmah-read'].includes(state.currentScreen)) return;
    const sy = _mvp.scrollTop; const maxScroll = _mvp.scrollHeight - _mvp.clientHeight;
    document.getElementById('reading-progress-bar').style.setProperty('--progress', maxScroll > 0 ? Math.min(1, sy / maxScroll).toFixed(4) : 0);
  }, {passive: true});
}

// توحيد نظام المرجعيات: state.bookmark هو *مرجع* لآخر إدخال في BookmarkManager
window.toggleBookmark = function(type) {
  if (type === 'khatmah' && !state.khatmah) return;
  const btn = type === 'surah' ? document.getElementById('btn-bm-surah') : null;
  const id = type === 'surah' ? state.currentSurah.number : state.khatmah.currentPage;
  const name = type === 'surah' ? state.currentSurah.name : `صفحة ${state.khatmah.currentPage}`;
  let willActivate = true;
  if (type === 'surah' && window.BookmarkManager) {
    // مصدر الحقيقة الوحيد للسور: BookmarkManager
    const marked = BookmarkManager.isSurahBookmarked(id);
    if (marked) { BookmarkManager.removeSurahBookmark(id); willActivate = false; }
    else BookmarkManager.addSurahBookmark(id, name);
  }
  // state.bookmark مرجع لآخر إدخال (لزر المتابعة)
  if (willActivate) state.bookmark = { type, id, name };
  else if (state.bookmark && state.bookmark.type === type && state.bookmark.id === id) state.bookmark = null;
  saveState(); updateBookmarkIcon();
  if (btn) {
    btn.classList.remove('pop'); void btn.offsetWidth; btn.classList.add('pop');
    if (willActivate) Motion.burst(btn, 12, 'var(--accent)');
  }
};

function updateBookmarkIcon() {
  const btn = document.getElementById('btn-bm-surah'); if(!btn) return;
  // اقرأ الحالة من BookmarkManager (مصدر واحد) بدلاً من state.bookmark
  const isMarked = state.currentScreen === 'surah-view' && state.currentSurah && window.BookmarkManager && BookmarkManager.isSurahBookmarked(state.currentSurah.number);
  if (isMarked) { btn.style.background = 'var(--accent)'; btn.style.color = '#ffffff'; btn.classList.add('active'); }
  // الحالة غير المعلّمة: لا تفرض ألواناً سطرية — دع CSS يقرّرها حسب ثيم
  // التطبيق (تتجاوزها قاعدة .theme-light أعلاه). الخلفاء البيضاء السطرية
  // كانت تُلغي دائرة الزر على البطاقة الفاتحة.
  else { btn.style.background = ''; btn.style.color = ''; btn.classList.remove('active'); }
}

function checkBookmarkFAB() {
  const fab = document.getElementById('resume-fab');
  if (!fab) return;
  if (['surah-view', 'khatmah-read'].includes(state.currentScreen)) {
    fab.classList.remove('visible');
    return;
  }
  if (state.bookmark && ['surah-list', 'khatmah-main'].includes(state.currentScreen)) {
    fab.querySelector('span').textContent = `متابعة: ${state.bookmark.name}`;
    fab.classList.add('visible');
  } else {
    const last = window.ReadingProgressManager ? ReadingProgressManager.getLastPosition() : null;
    if (last && last.surah && state.currentScreen === 'surah-list') {
      const pageTxt = last.page ? ` (ص ${toArabicNum(last.page)})` : '';
      const ayahTxt = last.ayah ? ` — آية ${toArabicNum(last.ayah)}` : '';
      fab.querySelector('span').textContent = `متابعة: ${last.surahName || ('سورة ' + last.surah)}${ayahTxt}${pageTxt}`;
      fab.classList.add('visible');
    } else {
      fab.classList.remove('visible');
    }
  }
}

window.resumeBookmark = function() {
  if(!state.bookmark) {
    const last = window.ReadingProgressManager ? ReadingProgressManager.getLastPosition() : null;
    if (last) {
      if (last.page && !last.ayah && window.openMushafPage) { window.openMushafPage(last.page); }
      else if (last.surah) { window.openSurah(last.surah, last.ayah || null); }
    }
    return;
  }
  if(state.bookmark.type === 'surah') { window.openSurah(state.bookmark.id); }
  else if(state.bookmark.type === 'khatmah' && state.khatmah) {
    // وجِّه الجدولة لليوم الجديد قبل فتح القارئ — وإلا فُتح القارئ على وردٍ قديم
    // ويبقى lastActiveDate قديماً، فتُفقد إعادة الجدولة عند أول تبويب.
    checkMissedDays();
    state.khatmah.currentPage = state.bookmark.id; saveState(); window.openKhatmahReader();
  }
};

window.openBookmarks = function() {
  showScreen('bookmarks', 'slide-left');
  if (window.BookmarksView) BookmarksView.render();
};

window.openSettings = function() {
  showScreen('settings', 'slide-left');
  if (window.Settings) { Settings.render(); Settings.bind(); }
};

window.showStats = function() {
  showScreen('stats', 'slide-left');
  if (window.StatsManager) StatsManager.render();
};

// مُسهّل فتح السبحة من روابط مباشرة
window.openTasbih = function() {
  switchTab('tasbih');
};

function getSkeletonHTML() { return `<div style="padding:20px;"><div class="skeleton sk-card"></div><div class="skeleton sk-text"></div><div class="skeleton sk-text"></div><div class="skeleton sk-text short"></div><div class="skeleton sk-card" style="margin-top:20px"></div></div>`; }

async function loadSurahList() {
  try {
    // مهلة 8 ثوانٍ: حتى لا تبقى الهيكلية (skeleton) معلّقة للأبد عند بطء الشبكة
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    const res = await fetch('https://api.alquran.cloud/v1/surah', { signal: controller.signal });
    clearTimeout(timeoutId);
    const j = await res.json();
    // استجابة الخطأ (429/5xx) تعود JSON صالحاً بلا بيانات — اعتبرها فشلاً حتى
    // يدخل مسار الاحتياط المحلي بدل تعطيل قائمة السور نهائياً (audit 2026-11)
    if (!res.ok || !Array.isArray(j.data) || !j.data.length) throw new Error(`surah list unavailable (HTTP ${res.status})`);
    allSurahs = j.data;
  } catch(e) {
    // fallback محلي: بيانات السور الحقيقية (أسماء + عدد الآيات) تعمل دون إنترنت
    allSurahs = (window.SURAH_META && SURAH_META.length) ? SURAH_META : SURAHS_DATA;
  }
  renderSurahList(allSurahs);
}

// تهريب النصوص القادمة من الشبكة أو localStorage قبل إدراجها في innerHTML (B-5)
const escHtml = (s) => (window.escapeHtml || String)(s ?? '');

/* علامة نهاية الآية U+06DD (۝) علامة غير مُتقدِّمة (zero-advance): حين تُرسم
   بلا أرقام تتبعها — كما في نصوص الأذكار وإشراقة الآية — تتداخل مع آخر كلمة
   قبلها فتتلخبط السطر (لا ينجح رفع line-height هنا إطلاقاً). الحل: نحولها إلى
   شارة دائرية مرسومة بالـ CSS بأرقامها إن وُجدت، فتضبط المسافة بنفسها ولا
   تعتمد على خطٍ يدعم الرابط الطباعي للعلامة مع الأرقام.
   تُستدعى بعد escHtml دائماً (المدخل نص مُهرَّب، والمخرج HTML مُتحكَّم به). */
const AYAH_MARK_RE = /\u06DD(?:[\u0660-\u0669]+)?/g;
function decorateAyahMarks(escaped) {
  return escaped.replace(AYAH_MARK_RE, (m) => {
    const digits = m.slice(1);
    return digits
      ? `<span class="ayah-mark">${digits}</span>`
      : '<span class="ayah-mark ayah-mark-blank" aria-hidden="true"></span>';
  });
}
window.decorateAyahMarks = decorateAyahMarks;

/* ==================== مولّد صفحة المصحف المشترك ==================== */
// يبني ترميز الآيات لكل من قارئ السورة وقارئ الختمة من مصدر واحد موثوق
// (quran-uthmani). النص لا يُعدَّل إطلاقاً — تُضاف الأغلفة فقط حول الكلمات
// والآيات. تُجزَّأ الكلمات على الفراغات قبل التهريب حتى لا ينقسم كيان HTML
// (entity) على حدود كلمة. كل آية تُغلَّف بعنصر قابل للتحديد وللتظليل، وكل
// كلمة بـ span مستقل ليتبعها التظليل أثناء التلاوة.
// مجموعة الآيات المحفوظة (سورة:آية) لعرض علامة الحفظ على الآية نفسها
function bookmarkedVerseSet() {
  const set = new Set();
  try { if (window.BookmarkManager) (BookmarkManager.getAll().verses || []).forEach(v => set.add(v.surah + ':' + v.ayah)); } catch (e) {}
  return set;
}

function buildMushafHTML(ayahs, opts = {}) {
  const fallbackSurah = opts.surahNumber || null;
  const sNum = a => (a.surah && typeof a.surah === 'object' && a.surah.number) || fallbackSurah;
  const bms = bookmarkedVerseSet();
  return (ayahs || []).map(a => {
    const sn = sNum(a);
    let text = a.text;
    // البسملة تُحذف من بداية الآية الأولى لكل سورة عدا الفاتحة (آية مستقلة) والتوبة (لا بسملة)
    if (a.numberInSurah === 1 && sn !== 1 && sn !== 9) text = stripBismillah(text);
    const words = (text || '').trim().split(/\s+/).filter(Boolean);
    const wordsHtml = words.map(w => `<span class="w">${decorateAyahMarks(escHtml(w))}</span>`).join(' ');
    const cls = 'ayah' + (bms.has(sn + ':' + a.numberInSurah) ? ' bookmarked' : '');
    return `<span class="${cls}" data-surah="${sn}" data-ayah="${a.numberInSurah}" data-global="${a.number}">${wordsHtml}<span class="ayah-badge" title="آية ${toArabicNum(a.numberInSurah)}">${toArabicNum(a.numberInSurah)}</span></span> `;
  }).join('');
}

// يجرد النص من التشكيل ووحّد أشكال الألف والتاء حتى يطابق البحث غير المنقّط
function normArabic(text) {
  // تُوحَّد أشكال الحروف التي يكتبها المستخدم بشكل مختلف عن رسم المصحف:
  // الألف، التاء المربوطة/المفتوحة، والألف المقصورة (ى) التي يكتبها الكثيرون
  // ياءً (ي) — مثل «زدنى»/«زدني». هذا التوحيد يطال *نسخة البحث* فقط ولا يمسّ
  // نص القرآن المعروض إطلاقاً.
  return (text || '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[\u064B-\u0652\u0670\u0640\u06D6-\u06ED]/g, '');
}

// يضيء مواضع التطابق داخل نص مُهرّب مسبقاً (لا يغيّر النص نفسه)
function highlightQuery(escapedText, query) {
  if (!query) return escapedText;
  // الاستعلام مُجرَّد من التشكيل بينما النص المعروض مشكول، فاسمح بوجود علامات
  // المصحف بين حروف الاستعلام، وسوِّ أشكال الألف والتاء المربوطة/المفتوحة
  // والألف المقصورة (ى) مع الياء (ي).
  const cls = c => c === 'ا' ? '[أإآٱا]' : c === 'ه' ? '[ةه]' : c === 'ي' ? '[يى]' : c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const loose = [...query].map(cls).join('[\\u064B-\\u0652\\u0670\\u0640\\u06D6-\\u06ED]*');
  return escapedText.replace(new RegExp(`(${loose})`, 'gi'), '<span class="highlight">$1</span>');
}

function renderSurahList(list, query = '') {
  document.getElementById('surah-list-container').innerHTML = list.map(s => {
    const nameHtml = highlightQuery(escHtml(s.name), query);
    // أرقام فقط داخل onclick — استجابة API مخترقة أو كاش مسموم لا يصبح حقناً
    // (audit 2026-11)
    return `<div class="surah-row" data-magnetic onclick="openSurah(${parseInt(s.number, 10) || 0})"><div class="surah-num">${toArabicNum(s.number)}</div><div class="surah-info"><div class="surah-name">${nameHtml}</div><div class="surah-meta">${toArabicNum(s.numberOfAyahs)} آية</div></div></div>`;
  }).join('');
  Motion.staggerIn(document.getElementById('surah-list-container'));
  // أعد استخدام المراقب الدائم للعناصر الجديدة (بدل إنشاء مراقب لكل ضغطة)
  if (window.AnimationManager?.observeReveal) AnimationManager.observeReveal();
}

/* ==================== بحث نص الآيات ==================== */
// يُبنى مرّة واحدة من المصدر الموثوق نفسه (quran-uthmani) الذي يُستخدم منه
// عرض المصحف — لا يُضاف أي نص ولا تُعدَّل ألفاظه. يُخزَّن في الذاكرة فقط
// (الخدمات تكفيه للتخزين المؤقت) كي لا نضغط على حصة localStorage.
let ayahSearchIndex = null;
let ayahIndexLoading = false;

async function ensureAyahIndex() {
  if (ayahSearchIndex) return ayahSearchIndex;
  if (ayahIndexLoading) return null;
  ayahIndexLoading = true;
  try {
    const res = await fetch('https://api.alquran.cloud/v1/quran/quran-uthmani');
    const data = (await res.json()).data;
    // نقطة النهاية هذه تُعيد data.surahs (مصفوفة سور، كل منها فيها ayahs)،
    // وليس data.ayahs — لذا نفلتس السور ونُسطّح آياتها مع الحفاظ على ترتيب المصحف.
    const surahs = data && Array.isArray(data.surahs) ? data.surahs : [];
    const all = [];
    for (const s of surahs) {
      const sn = s.name, snum = s.number;
      (s.ayahs || []).forEach(a => all.push({ ...a, surah: { number: snum, name: sn } }));
    }
    ayahSearchIndex = all.map(a => ({
      s: a.surah && a.surah.number, sn: a.surah && a.surah.name,
      a: a.numberInSurah, t: a.text, n: normArabic(a.text)
    }));
  } catch (e) { ayahSearchIndex = null; }
  ayahIndexLoading = false;
  return ayahSearchIndex;
}

// اقتطع مقطعاً حول أول موضع تطابق (بالكلمات) حتى تبقى النتيجة قابلة للقراءة
function snippetAroundMatch(origText, query, side = 10) {
  const words = (origText || '').split(/\s+/).filter(Boolean);
  if (!words.length) return '';
  for (let i = 0; i < words.length; i++) {
    let acc = '';
    for (let j = i; j < Math.min(words.length, i + 40); j++) {
      acc = acc ? acc + ' ' + normArabic(words[j]) : normArabic(words[j]);
      if (acc.includes(query)) {
        const s = Math.max(0, i - side), e = Math.min(words.length, j + 1 + side);
        return (s > 0 ? '… ' : '') + words.slice(s, e).join(' ') + (e < words.length ? ' …' : '');
      }
    }
  }
  return words.slice(0, 22).join(' ');
}

function renderAyahSearchResults(hits, query) {
  const box = document.getElementById('ayah-search-container');
  if (!box) return;
  if (!hits) { box.style.display = 'none'; box.innerHTML = ''; return; }
  box.style.display = 'block';
  if (!hits.length) {
    box.innerHTML = `<div class="ayah-search-status">لا توجد نتائج في نص الآيات.</div>`;
    return;
  }
  box.innerHTML = `<div class="section-heading">نتائج الآيات (${toArabicNum(hits.length)})</div>` +
    hits.map(h => `<div class="surah-row" data-magnetic onclick="openSurah(${parseInt(h.s, 10) || 0}, ${parseInt(h.a, 10) || 0})">
      <div class="surah-num">${toArabicNum(h.s)}</div>
      <div class="surah-info">
        <div class="surah-name" style="font-size:calc(var(--font-size) * 0.62)">${highlightQuery(escHtml(snippetAroundMatch(h.t, query)), query)}</div>
        <div class="surah-meta">${escHtml(h.sn || '')} — آية ${toArabicNum(h.a)}</div>
      </div>
    </div>`).join('');
  if (window.Motion) Motion.staggerIn(box);
  if (window.AnimationManager?.observeReveal) AnimationManager.observeReveal();
}

/* ==================== القارئ الموحّد: صفحات المصحف الـ٦٠٤ ====================

   مسار بيانات واحد لقارئ السورة وقارئ الختمة: أي صفحة ١..٦٠٤ تمرّ عبر
   MushafPageManager.ensurePage() الذي يفضّل المصحف المحلّي (يعمل بلا إنترنت)
   ثم مخبأ الصفحة، ثم طلب /page/{n} مع مخبأ ٧ أيام. لا يوجد بعد اليوم تجميع
   خاص بالسورة — المصدر نفسه يُوزَّع على فهرس الصفحات عبر M.seedFromSurah(). */

// رمز طلب لتفادي سباق التحميل عند التنقّل السريع (يُلغي الرسم إن تغيّرت الصفحة)
let openSurahToken = 0;
let mushafPageToken = 0;

// الحاوية التي تُرسم فيها صفحة المصحف — واحدة دائماً (القارئ الموحّد)
function mushafContainer() {
  return document.getElementById('verses-container');
}

// نافذة عرض الصفحة (التي تتمرّر عمودياً داخلها) — مصيدة ١: ليست #content
function mushafViewport() {
  return document.getElementById('mushaf-viewport');
}

/* ===== الوضعان: الهادئ (zen) والنشط (hud) — النقر على الصفحة يبدّل + إخفاء تلقائي ===== */
let _hudAutoHideTimer = null;
function clearHudAutoHide() {
  if (_hudAutoHideTimer) { clearTimeout(_hudAutoHideTimer); _hudAutoHideTimer = null; }
}
function scheduleHudAutoHide(delayMs = 6500) {
  clearHudAutoHide();
  _hudAutoHideTimer = setTimeout(() => {
    if (!document.body.classList.contains('mushaf-hud')) return;
    // لا تُخفِ الأشرطة إذا كانت هناك نافذة منبثقة مفتوحة
    if (document.querySelector('.sheet-overlay.visible, .modal.active')) {
      scheduleHudAutoHide(delayMs);
      return;
    }
    enterZenMode();
  }, delayMs);
}
function syncBottomHudHeightVar() {
  const bh = document.getElementById('mushaf-bottom-hud');
  const sm = document.getElementById('screen-mushaf');
  if (bh && sm && bh.offsetHeight > 0) {
    sm.style.setProperty('--mushaf-bottom-hud-h', bh.offsetHeight + 'px');
  }
}
function enterZenMode() {
  clearHudAutoHide();
  document.body.classList.add('mushaf-zen');
  document.body.classList.remove('mushaf-hud');
  if (window.ReaderAudioPill) ReaderAudioPill.render();
  try {
    if (!localStorage.getItem('zen_hint_shown')) {
      localStorage.setItem('zen_hint_shown', '1');
      setTimeout(() => {
        if (window.Toast && document.body.classList.contains('mushaf-zen')) {
          Toast.show('اضغط وسط الصفحة لإظهار الأشرطة أو اسحب لقلب الصفحة');
        }
      }, 450);
    }
  } catch (e) {}
}
function exitZenMode() {
  document.body.classList.remove('mushaf-zen');
  document.body.classList.add('mushaf-hud');
  if (window.ReaderAudioPill) ReaderAudioPill.render();
  if (typeof syncMushafPageStrip === 'function' && state.mushafPage) syncMushafPageStrip(state.mushafPage);
  requestAnimationFrame(syncBottomHudHeightVar);
  scheduleHudAutoHide(6500);
}
function toggleMushafHUD() {
  if (document.body.classList.contains('mushaf-hud')) enterZenMode(); else exitZenMode();
}
window.toggleMushafHUD = toggleMushafHUD;

// ارسم صفحة المصحح n في الحاوية النشطة (مع الهيكل العظمي أثناء التحميل).
// يعيد true عند اكتمال الرسم. opts: { focusAyah, surahHeader }
async function renderMushafPage(pageNum, opts = {}) {
  const M = window.MushafPageManager;
  if (!M) return false;
  const n = M.clampPage(pageNum);
  const token = ++mushafPageToken;
  state.mushafPage = n;
  const container = mushafContainer();
  if (!container) return false;
  container.innerHTML = getSkeletonHTML();

  // رأس السورة داخل الصفحة يظهر حيث تبدأ سورة جديدة (تقليد المصحف المطبوع).
  // شريط الوضع النشط يحمل بطاقة السورة الحالية بشكل منفصل، فهما مختلفان.
  const showOpts = { surahHeader: opts.surahHeader != null ? opts.surahHeader : true, showLabel: false };
  try {
    await M.ensurePage(n);
    if (token !== mushafPageToken) return false;            // طلب أحدث طغى عليه
    container.innerHTML = M.pageHTML(n, showOpts) + mushafPageNavHTML(n);
  } catch (e) {
    if (token !== mushafPageToken) return false;
    container.innerHTML = `<div style="text-align:center; padding:20px;">خطأ في التحميل. تأكد من الإنترنت.<br><button class="btn-scale" style="margin-top:15px; width:auto; padding:10px 20px;" onclick="renderMushafPage(${n})">إعادة المحاولة 🔄</button></div>`;
    return false;
  }
  bindMushafPageNav(n);
  syncMushafChrome(n);

  const vp = mushafViewport();
  if (vp) vp.scrollTop = 0;
  // حركة دخول ناعمة لنص الصفحة
  container.classList.remove('page-entering');
  void container.offsetWidth;
  container.classList.add('page-entering');
  // مواءمة حجم الخط وارتفاع السطر تلقائياً لتسع الشاشة الصفحة كاملة بدون أي سكرول
  fitMushafPageToViewport();
  requestAnimationFrame(() => fitMushafPageToViewport());
  setTimeout(() => fitMushafPageToViewport(), 160);
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => fitMushafPageToViewport()).catch(() => {});
  }
  // العمود الثاني في العرض المزدوج الأفقي (مرحلة ٦)
  renderMushafPageNext(n);
  // التظليل الموضوعي للآيات حسب الإعداد (مرحلة ٦)
  if (window.ReaderSettings) ReaderSettings.applyTopics(container);
  // أعد ربط تظليل التلاوة بالعنصر المعروض إن وُجد على هذه الصفحة
  if (window.AudioPlayer && AudioPlayer.refreshHighlight) AudioPlayer.refreshHighlight();
  // الرابط العميق للختمة يتبع الصفحة (رابط القارئ الموحّد)، ولا يُحدَّث إلا عند
  // تغيير الشاشة — أعد تحديثه هنا حتى لا يظلّ يشير لصفحة قديمة بعد التنقّل
  if (state.currentScreen === 'khatmah-read' && window.DeepLinks) {
    try { DeepLinks.update('khatmah-read'); } catch (e) {}
  }
  if (opts.focusAyah) {
    const el = container.querySelector(`.ayah[data-ayah="${+opts.focusAyah}"]`);
    if (el) selectAyah(el, true);
    else window.selectedAyahNo = null;                       // آية غير موجودة: لا تترك قيمة عالقة في الرابط
  }
  if (window.AnimationManager?.observeReveal) AnimationManager.observeReveal();
  // تسخين الصفحات المجاورة حتى لا ينتظر القلِب على الشبكة
  M.ensurePage(n + 1).catch(() => {});
  if (n > 1) M.ensurePage(n - 1).catch(() => {});
  return true;
}

// خطوة التنقّل: صفحتان في العرض المزدوج الأفقي، صفحة واحدة خلاف ذلك
// (مرحلة ٦). يقرأها changeMushafPage وكلاها يعمل لمحرّك القلب والأزرار.
function mushafPageStep() {
  return (document.body.classList.contains('mushaf-layout-double') &&
          window.matchMedia('(orientation: landscape)').matches) ? 2 : 1;
}

// العمود الثاني: يعرض صفحة n+1 في الوضع المزدوج الأفقي فقط. لا أزرار
// تنقّل ولا معرّفات مكرَّرة — أزرار العمود الأول تتنقّل بصفحتين فتُغطيه.
function renderMushafPageNext(n) {
  const M = window.MushafPageManager;
  const next = document.getElementById('mushaf-page-next');
  if (!next || !M) return;
  const show = mushafPageStep() === 2;
  if (!show) { next.innerHTML = ''; return; }
  const m = M.clampPage(n + 1);
  if (m <= n) { next.innerHTML = ''; return; }
  M.ensurePage(m).then(() => {
    // قلب المستخدم الصفحة أثناء الجلب: لا تكتب في عمود متخلّف
    if (state.mushafPage !== n) return;
    // تغيّر الوضع (عمودي/مفرد) أثناء الجلب — لا تكتب عموداً لن يُعرض
    if (mushafPageStep() !== 2) return;
    next.innerHTML = M.pageHTML(m, { surahHeader: true, showLabel: false }) +
      `<div class="mushaf-page-foot">${toArabicNum(m)}</div>`;
    if (window.ReaderSettings) ReaderSettings.applyTopics(next);
    if (window.AnimationManager?.observeReveal) AnimationManager.observeReveal();
  }).catch(() => { next.innerHTML = ''; });
}

// أزرار التنقّل أسفل الصفحة (مرحلة ٢: سيحلّ محلّها محرّك القلب ثلاثي الأبعاد)
function mushafPageNavHTML(n) {
  const M = window.MushafPageManager;
  // في قارئ الختمة يوجد شريط التحكم الخاص بها، فلا حاجة لتنقّل السور هنا
  const number = state.currentScreen === 'khatmah-read' ? 0 : (state.currentSurah ? state.currentSurah.number : 0);
  let html = `<div class="mushaf-nav">
    <button class="btn-scale mushaf-nav-btn" id="mp-prev" ${n <= 1 ? 'disabled' : ''}>→ السابقة</button>
    <span class="mushaf-nav-pos">صفحة ${toArabicNum(n)} / ${toArabicNum(604)}</span>
    <button class="btn-scale mushaf-nav-btn" id="mp-next" ${n >= 604 ? 'disabled' : ''}>التالية ←</button>
  </div>`;
  // تنقّل بين السور من داخل القارئ — لا حاجة للعودة للقائمة الرئيسية
  if (number) {
    html += `<div class="mushaf-nav surah-nav">
      <button class="btn-scale mushaf-nav-btn" id="sp-prev" ${number <= 1 ? 'disabled' : ''}>→ السورة السابقة</button>
      <span class="mushaf-nav-pos">${toArabicNum(number)} / ١١٤</span>
      <button class="btn-scale mushaf-nav-btn" id="sp-next" ${number >= 114 ? 'disabled' : ''}>السورة التالية ←</button>
    </div>`;
  }
  return html;
}

// يعتمد على M.pageAyahs/M.juzOf اللتين تُملآن أثناء ensurePage.
// الذراعان العلويان (اسم السورة / الجزء) والتذييل المركزي برقم الصفحة.
// مواءمة تلقائية ذكية لصفحة المصحف بحيث تسع الشاشة الواحدة كامل الصفحة (١٥ سطراً + العنوان + البسملة + رقم الصفحة) بدون أي سكرول عمودي
let _prevStripPage = 1;
function rememberPreviousPage(fromPage, toPage) {
  if (fromPage && toPage && fromPage !== toPage) {
    _prevStripPage = fromPage;
  }
}
function fitMushafPageToViewport() {
  const page = document.getElementById('mushaf-page');
  const vp = mushafViewport();
  const bodyEl = document.getElementById('verses-container');
  const footEl = document.getElementById('mushaf-page-foot');
  if (!page || !vp || !bodyEl) return;
  if (document.body.classList.contains('mushaf-scroll-vertical')) {
    page.style.removeProperty('--mushaf-fit-size');
    page.style.removeProperty('--mushaf-fit-lh');
    bodyEl.style.justifyContent = '';
    return;
  }
  // استخدام offsetHeight/offsetWidth بدلاً من getBoundingClientRect لأن الدوران ثلاثي الأبعاد (rotateY في PageFlipEngine)
  // يضخّم getBoundingClientRect().height بنسبة ~1.38x فيؤدي لتصغير الخط وترك فراغ سفلي!
  const pageH = page.offsetHeight || vp.clientHeight || window.innerHeight;
  const pageW = page.offsetWidth || vp.clientWidth || window.innerWidth;
  if (pageH < 180) return;

  const cs = getComputedStyle(page);
  const padTop = parseFloat(cs.paddingTop) || 28;
  const padBottom = parseFloat(cs.paddingBottom) || 4;
  const footH = footEl ? (footEl.offsetHeight + (parseFloat(getComputedStyle(footEl).marginTop) || 0)) : 16;
  const targetH = Math.max(120, pageH - padTop - padBottom - footH - 8);
  const textW = Math.max(200, pageW - (parseFloat(cs.paddingLeft) || 8) - (parseFloat(cs.paddingRight) || 8) - 2);

  // لقياس الارتفاع الطبيعي الفعلي للنص بدون تمدد أو انكماش flex:
  const prevFlex = bodyEl.style.flex;
  const prevH = bodyEl.style.height;
  bodyEl.style.flex = '0 0 auto';
  bodyEl.style.height = 'auto';

  const measureH = () => bodyEl.offsetHeight;
  const curPageNum = (window.state && window.state.mushafPage) || 1;
  const isLandscape = pageW > pageH * 1.15;

  // الصفحتان الاستفتاحيتان (الفاتحة ١ وأول البقرة ٢) قصيرتان بطبيعتهما (٧-٨ أسطر)
  // والملاءمة التلقائية تحترم اختيار المستخدم (--mushaf-scale) بدل تجاهله
  const userScale = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--mushaf-scale')) || 1;
  if (curPageNum <= 2) {
    let fSize = isLandscape
      ? Math.min(24, Math.max(14, Math.round(pageH * 0.062 * 10) / 10))
      : Math.min(31, Math.max(21, Math.round(textW * 0.075 * 10) / 10));
    fSize *= userScale;
    let lh = isLandscape ? 1.65 : 2.12;
    page.style.setProperty('--mushaf-fit-size', fSize + 'px');
    page.style.setProperty('--mushaf-fit-lh', String(lh));
    let g = 0;
    while (measureH() > targetH && g < 28) {
      g++;
      if (fSize > 13) fSize = +(fSize - 0.5).toFixed(1);
      else if (lh > 1.32) lh = +(lh - 0.05).toFixed(2);
      page.style.setProperty('--mushaf-fit-size', fSize + 'px');
      page.style.setProperty('--mushaf-fit-lh', String(lh));
    }
    bodyEl.style.flex = prevFlex;
    bodyEl.style.height = prevH;
    bodyEl.style.justifyContent = 'center';
    return;
  }

  // باقي صفحات المصحف (٣..٦٠٤):
  // المرحلة ١: إيجاد أكبر حجم خط واضح يملأ عرض الصفحة ويسع ارتفاع الشاشة بدون قصّ
  const baseLh = isLandscape ? 1.38 : 1.56;
  const maxF = isLandscape
    ? Math.min(25, Math.max(13, Math.round(pageH * 0.062 * 10) / 10))
    : Math.min(34, Math.max(20, Math.round(textW * 0.082 * 10) / 10));
  const minF = isLandscape ? 11.0 : 15.0;
  let bestF = minF;
  page.style.setProperty('--mushaf-fit-lh', String(baseLh));

  for (let f = maxF; f >= minF; f = +(f - 0.3).toFixed(1)) {
    page.style.setProperty('--mushaf-fit-size', f + 'px');
    if (measureH() <= targetH) {
      bestF = f;
      break;
    }
  }
  // احترام اختيار المستخدم من إعدادات الخط (--mushaf-scale): القياس التلقائي
  // وحده كان يتجاهله فيمس الخط لا يتغيّر على صفحة المصحف — حلّ تقليص السطر
  // التالي يمتصّ أي فيض بسيط بعد التكبير
  page.style.setProperty('--mushaf-fit-size', (bestF * userScale) + 'px');

  let lh = baseLh;
  let shrinkGuard = 0;
  while (measureH() > targetH && lh > 1.26 && shrinkGuard < 20) {
    shrinkGuard++;
    lh = +(lh - 0.02).toFixed(2);
    page.style.setProperty('--mushaf-fit-lh', String(lh));
  }

  // المرحلة ٢: توزيع السطور رأسياً بدقة لملء الشاشة بالكامل حتى رقم الصفحة بالأسفل (بدون أي فراغ سفلي)
  const curH = measureH();
  if (curH < targetH - 2) {
    let lo = lh, hi = 3.50, bestLh = lh;
    for (let step = 0; step < 12; step++) {
      const mid = +((lo + hi) / 2).toFixed(3);
      page.style.setProperty('--mushaf-fit-lh', String(mid));
      if (measureH() <= targetH) {
        bestLh = mid;
        lo = mid;
      } else {
        hi = mid;
      }
    }
    page.style.setProperty('--mushaf-fit-lh', String(bestLh));
  }

  bodyEl.style.flex = prevFlex;
  bodyEl.style.height = prevH;
  bodyEl.style.justifyContent = 'space-between';
}
window.fitMushafPageToViewport = fitMushafPageToViewport;
if (document.fonts && document.fonts.addEventListener) {
  document.fonts.addEventListener('loadingdone', () => {
    if (window.state && (window.state.currentScreen === 'surah-view' || window.state.currentScreen === 'khatmah-read')) {
      fitMushafPageToViewport();
    }
  });
}

// بناء وتحديث شريط مصغّرات الصفحات السفلي (Page Scrubber Carousel)
function syncMushafPageStrip(n, surahName) {
  const track = document.getElementById('mushaf-strip-track');
  const titleEl = document.getElementById('mushaf-strip-surah');
  const curNumEl = document.getElementById('mushaf-strip-cur-num');
  const retNumEl = document.getElementById('mushaf-strip-ret-num');
  const prevBtn = document.getElementById('mbh-prev-page');
  const nextBtn = document.getElementById('mbh-next-page');
  const M = window.MushafPageManager;
  const juz = M ? M.juzOf(n) : null;
  const sLabel = surahName || (state.currentSurah && state.currentSurah.name) || 'القرآن الكريم';
  if (titleEl) {
    titleEl.textContent = `${sLabel}${juz ? ' • الجزء ' + toArabicNum(juz) : ''} • ص ${toArabicNum(n)} ▾`;
  }
  if (curNumEl) curNumEl.textContent = toArabicNum(n);
  if (retNumEl) retNumEl.textContent = toArabicNum(_prevStripPage || n);
  if (prevBtn) prevBtn.disabled = (n <= 1);
  if (nextBtn) nextBtn.disabled = (n >= 604);
  if (!track) return;

  // نافذة مصغرات حول الصفحة الحالية (من n-16 إلى n+16) لأداء فوري وسلس
  const startP = Math.max(1, n - 16);
  const endP = Math.min(604, n + 16);
  let html = '';
  for (let p = startP; p <= endP; p++) {
    const isAct = p === n;
    html += `<button type="button" class="mbh-thumb ${isAct ? 'active' : ''}" data-strip-page="${p}" aria-label="صفحة ${toArabicNum(p)}">
      <div class="mbh-thumb-page"><i></i><i></i><i></i><i></i></div>
      <span class="mbh-thumb-num">${toArabicNum(p)}</span>
    </button>`;
  }
  track.innerHTML = html;
  requestAnimationFrame(() => {
    syncBottomHudHeightVar();
    const activeThumb = track.querySelector('.mbh-thumb.active');
    if (activeThumb && track.clientWidth > 0) {
      const targetLeft = activeThumb.offsetLeft - (track.clientWidth - activeThumb.offsetWidth) / 2;
      track.scrollLeft = targetLeft;
    }
  });
}

// نافذة الانتقال السريع داخل المصحف (سورة / جزء / صفحة) بيد واحدة دون مغادرة القارئ
const JUZ_START_PAGES = [1, 22, 42, 62, 82, 102, 121, 142, 162, 182, 201, 222, 242, 262, 282, 302, 322, 342, 362, 382, 402, 422, 442, 462, 482, 502, 522, 542, 562, 582];
window.openMushafJumpSheet = function(initialTab = 'surah') {
  if (!window.BottomSheet) return;
  clearHudAutoHide();
  const M = window.MushafPageManager;
  const curPage = state.mushafPage || 1;
  const curSurah = (state.currentSurah && state.currentSurah.number) || 1;
  const curJuz = (M && M.juzOf(curPage)) || 1;

  BottomSheet.open({
    title: 'الانتقال السريع في المصحف',
    items: [],
    onPick: () => {}
  });
  const sheet = BottomSheet.overlay ? BottomSheet.overlay.querySelector('.bottom-sheet') : null;
  if (!sheet) return;

  sheet.innerHTML = `
    <div class="sheet-title">الانتقال السريع في المصحف</div>
    <div class="mushaf-jump-tabs" role="tablist">
      <button type="button" class="mushaf-jump-tab" data-jtab="surah">السور (١١٤)</button>
      <button type="button" class="mushaf-jump-tab" data-jtab="juz">الأجزاء (٣٠)</button>
      <button type="button" class="mushaf-jump-tab" data-jtab="page">الصفحات (٦٠٤)</button>
    </div>
    <input type="search" class="mushaf-jump-search" id="mushaf-jump-q" placeholder="ابحث باسم السورة، رقم الجزء (١-٣٠)، أو الصفحة (١-٦٠٤)...">
    <div id="mushaf-jump-body"></div>
    <div style="display:flex; gap:8px; margin-top:10px; padding-top:8px; border-top:1px solid var(--border);">
      <button type="button" class="sheet-item" id="mj-goto-list" style="margin:0; justify-content:center; font-weight:700; color:var(--accent); flex:1;">☰ قائمة السور الرئيسية</button>
      <button type="button" class="sheet-item" id="mj-close" style="margin:0; justify-content:center; flex:0 0 90px;">إغلاق</button>
    </div>
  `;

  let activeTab = initialTab;
  const bodyEl = sheet.querySelector('#mushaf-jump-body');
  const searchInput = sheet.querySelector('#mushaf-jump-q');

  function renderTab() {
    sheet.querySelectorAll('.mushaf-jump-tab').forEach(b => b.classList.toggle('active', b.dataset.jtab === activeTab));
    const rawQ = (searchInput.value || '').trim();
    const asciiQ = rawQ.replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
    const normQ = normArabic(rawQ);

    if (activeTab === 'surah') {
      const list = (window.allSurahs || []).filter(s => !rawQ || normArabic(s.name).includes(normQ) || String(s.number) === asciiQ);
      bodyEl.innerHTML = `<div class="mushaf-jump-list">` + list.map(s => {
        const startP = M ? M.firstPageOfSurah(s.number) : '';
        const isAct = s.number === curSurah;
        return `<button type="button" class="sheet-item ${isAct ? 'active' : ''}" data-jump-surah="${s.number}" style="margin-bottom:2px; padding:10px 12px;">
          <span><b>${toArabicNum(s.number)}. ${escHtml(s.name)}</b> <small style="color:var(--text-dim)">(${toArabicNum(s.numberOfAyahs || 0)} آية)</small></span>
          <span class="sheet-tick">${startP ? 'ص ' + toArabicNum(startP) : '➔'}</span>
        </button>`;
      }).join('') + `</div>`;
    } else if (activeTab === 'juz') {
      let html = `<div class="mushaf-jump-grid">`;
      for (let j = 1; j <= 30; j++) {
        if (rawQ && String(j) !== asciiQ && !(`الجزء ${j}`).includes(rawQ)) continue;
        const p = JUZ_START_PAGES[j - 1] || 1;
        const isAct = j === curJuz;
        html += `<button type="button" class="mushaf-jump-chip ${isAct ? 'active' : ''}" data-jump-page="${p}">
          <span>الجزء ${toArabicNum(j)}</span>
          <small>صفحة ${toArabicNum(p)}</small>
        </button>`;
      }
      html += `</div>`;
      bodyEl.innerHTML = html;
    } else {
      const numP = parseInt(asciiQ, 10);
      const presets = [
        { label: 'أول المصحف', p: 1 },
        { label: 'سورة الكهف', p: 293 },
        { label: 'سورة يس', p: 440 },
        { label: 'سورة الملك', p: 562 },
        { label: 'جزء عمّ', p: 582 },
        { label: 'آخر المصحف', p: 604 }
      ];
      let html = '';
      if (numP >= 1 && numP <= 604) {
        html += `<button type="button" class="sheet-item active" data-jump-page="${numP}" style="justify-content:center; font-weight:700; margin-bottom:8px;">انتقال مباشر إلى صفحة ${toArabicNum(numP)} ➔</button>`;
      }
      html += `<div class="mushaf-jump-grid">` + presets.map(pr => `
        <button type="button" class="mushaf-jump-chip ${curPage === pr.p ? 'active' : ''}" data-jump-page="${pr.p}">
          <span>${pr.label}</span>
          <small>صفحة ${toArabicNum(pr.p)}</small>
        </button>
      `).join('');
      const winStart = Math.max(1, curPage - 14);
      const winEnd = Math.min(604, curPage + 15);
      for (let p = winStart; p <= winEnd; p++) {
        html += `<button type="button" class="mushaf-jump-chip ${curPage === p ? 'active' : ''}" data-jump-page="${p}">
          <span>صفحة ${toArabicNum(p)}</span>
          <small>الجزء ${toArabicNum((M && M.juzOf(p)) || 1)}</small>
        </button>`;
      }
      html += `</div>`;
      bodyEl.innerHTML = html;
    }
  }

  renderTab();
  sheet.querySelectorAll('.mushaf-jump-tab').forEach(btn => {
    btn.addEventListener('click', () => { activeTab = btn.dataset.jtab; renderTab(); });
  });
  searchInput.addEventListener('input', () => {
    const v = searchInput.value.trim().replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
    if (/^\d+$/.test(v) && +v > 114 && +v <= 604 && activeTab === 'surah') activeTab = 'page';
    renderTab();
  });
  bodyEl.addEventListener('click', (e) => {
    const sBtn = e.target.closest('[data-jump-surah]');
    if (sBtn) {
      const sNo = parseInt(sBtn.dataset.jumpSurah, 10);
      RememberAndClose(() => window.openSurah(sNo));
      return;
    }
    const pBtn = e.target.closest('[data-jump-page]');
    if (pBtn) {
      const pNo = parseInt(pBtn.dataset.jumpPage, 10);
      RememberAndClose(() => window.gotoMushafPage(pNo));
    }
  });
  function RememberAndClose(fn) {
    if (state.mushafPage) _prevStripPage = state.mushafPage;
    BottomSheet.close();
    fn();
  }
  sheet.querySelector('#mj-goto-list')?.addEventListener('click', () => {
    BottomSheet.close();
    switchTab('quran');
    showScreen('surah-list', 'slide-right');
  });
  sheet.querySelector('#mj-close')?.addEventListener('click', () => BottomSheet.close());
};

function syncMushafChrome(n) {
  const M = window.MushafPageManager;
  const ayahs = M ? M.pageAyahs(n) : [];
  const first = ayahs && ayahs.length ? ayahs[0] : null;
  const surahName = (first && first.surah && (first.surah.name || first.surah.englishName)) ||
                    (state.currentSurah && state.currentSurah.name) || 'القرآن الكريم';
  const juz = M ? M.juzOf(n) : null;
  const gSurah = document.getElementById('mushaf-ghost-surah');
  const gJuz = document.getElementById('mushaf-ghost-juz');
  if (gSurah) gSurah.textContent = surahName;
  if (gJuz) gJuz.textContent = juz ? `الجزء ${toArabicNum(juz)}` : '';
  // اسم السورة في شريط الوضع النشط يتبع الصفحة المعروضة دائماً
  const nameEl = document.getElementById('surah-view-name');
  if (nameEl) nameEl.textContent = surahName;
  // سطر المعلومات أسفل اسم السورة في شريط الوضع النشط
  const meta = document.getElementById('surah-view-meta');
  if (meta) {
    const parts = [];
    if (first && first.surah && first.surah.numberOfAyahs) parts.push(`${toArabicNum(first.surah.numberOfAyahs)} آية`);
    else if (state.currentSurah && state.currentSurah.numberOfAyahs) parts.push(`${toArabicNum(state.currentSurah.numberOfAyahs)} آية`);
    if (juz) parts.push(`الجزء ${toArabicNum(juz)}`);
    meta.textContent = parts.join(' • ');
  }
  const foot = document.getElementById('mushaf-page-foot');
  if (foot) foot.innerHTML = juz
    ? `<span class="mpf-page">${toArabicNum(n)}</span><span class="mpf-juz">الجزء ${toArabicNum(juz)}</span>`
    : `<span class="mpf-page">${toArabicNum(n)}</span>`;
  syncMushafPageStrip(n, surahName);
  if (window.ReaderAudioPill) ReaderAudioPill.render();
}

function bindMushafPageNav(n) {
  const prev = document.getElementById('mp-prev');
  const next = document.getElementById('mp-next');
  if (prev) prev.addEventListener('click', () => changeMushafPage(-1));
  if (next) next.addEventListener('click', () => changeMushafPage(1));
  const number = state.currentSurah ? state.currentSurah.number : 0;
  const spPrev = document.getElementById('sp-prev');
  const spNext = document.getElementById('sp-next');
  if (spPrev) spPrev.addEventListener('click', () => { if (number > 1) window.openSurah(number - 1); });
  if (spNext) spNext.addEventListener('click', () => { if (number < 114) window.openSurah(number + 1); });
}

// تنقّل صفحة واحدة في أي قارئ (السورة أو الختمة) — أو صفحتين في العرض
// المزدوج الأفقي (مرحلة ٦)
window.changeMushafPage = async function(dir) {
  const M = window.MushafPageManager;
  if (!M || !state.mushafPage) return;
  const n = M.clampPage(state.mushafPage + dir * mushafPageStep());
  if (n === state.mushafPage) return;
  hideAyahBar();
  await gotoMushafPage(n);
  // التلاوة الجارية تتّبع صفحة المستخدم اليدوية (لا تنافسها)
  if (window.AudioPlayer && AudioPlayer.repointForPage) AudioPlayer.repointForPage(n);
};

// الانتقال لصفحة محددة (مسار مشترك للتنقّل اليدوي والقلب الآلي للتلاوة).
// لا حركة هنا: الرسم الفوري هو ما يسمح للتلاوة المتواصلة بالعبور دون انتظار.
window.gotoMushafPage = async function(n) {
  const M = window.MushafPageManager;
  if (!M) return;
  n = M.clampPage(n);
  if (n === state.mushafPage) {
    if (window.AudioPlayer && AudioPlayer.refreshHighlight) AudioPlayer.refreshHighlight();
    return;
  }
  rememberPreviousPage(state.mushafPage, n);
  if (state.currentScreen === 'khatmah-read') {
    state.khatmah.currentPage = n; saveState();
    await loadKhatmahPage(n);
  } else {
    await renderMushafPage(n);
    syncSurahForPage(n);
    recordReadingPosition();
    if (window.DeepLinks) try { DeepLinks.update('surah-view'); } catch (e) {}
  }
};

// عند عبور حدود السورة داخل القارئ الموحّد، حدّث سياق السورة (العنوان،
// المرجع الصوتي، أيقونة الحفظ) ليبقى متوافقاً مع ما يراه المستخدم
async function syncSurahForPage(n) {
  const M = window.MushafPageManager;
  if (!M) return;
  const ayahs = M.pageAyahs(n);
  const sn = ayahs.length && ayahs[0].surah ? ayahs[0].surah.number : 0;
  if (!sn) return;
  if (state.currentSurah && state.currentSurah.number === sn) return;
  const meta = (window.allSurahs || []).find(s => s.number === sn)
    || { number: sn, name: (ayahs[0].surah && ayahs[0].surah.name) || (`سورة ${sn}`), numberOfAyahs: 0 };
  state.currentSurah = meta;
  const nameEl = document.getElementById('surah-view-name');
  if (nameEl) nameEl.textContent = meta.name;
  updateBookmarkIcon();
  // أثناء التلاوة الفعلية لا نلمس قائمة التلاوة — مرحلة الصوت تتولّى المزامنة
  if (window.AudioPlayer && AudioPlayer.audio && !AudioPlayer.audio.paused) return;
  // املأ بيانات السورة لقائمة التلاوة في الخلفية (مخبّأة، سريعة)
  fetchSurahData(sn).then(d => { if (d) state.currentSurahData = d; }).catch(() => {});
}

// بيانات سورة كاملة (قائمة التلاوة) مع مخبأ ٧ أيام — مُستخدَم من مسارات متعددة
async function fetchSurahData(number) {
  // الروابط العميقة قد تحمل نصاً مُصنَّعاً — يُحوَّل الرقم ويُرفض ما خارج
  // ١–١١٤ قبل أن يصل إلى عنوان الطلب أو مفتاح المخبأ (تحصين نقطة الطلب).
  const sn = Math.trunc(Number(number));
  if (!Number.isFinite(sn) || sn < 1 || sn > 114) return null;
  try {
    const cached = localStorage.getItem(`q_s_u_${sn}`);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Date.now() - (parsed._ts || 0) < 7 * 24 * 60 * 60 * 1000) return parsed.data;
      localStorage.removeItem(`q_s_u_${sn}`);
    }
    const res = await fetch(`https://api.alquran.cloud/v1/surah/${sn}/quran-uthmani`);
    const data = (await res.json()).data;
    if (data && data.ayahs) localStorage.setItem(`q_s_u_${sn}`, JSON.stringify({ data, _ts: Date.now() }));
    return data;
  } catch (e) { return null; }
}

// فتح القارئ عند صفحة خام (رابط #/page/{n} أو "قفزة لآخر ما قُرئ"): يعيّن سياق
// السورة من بيانات الصفحة ذاتها، ويملأ بيانات السورة لقائمة التلاوة في الخلفية
window.openMushafPage = async function(page) {
  const M = window.MushafPageManager;
  if (!M) return;
  window.selectedAyahNo = null;
  // إن كانت ختمة جارية فالرابط يعيدها إلى قارئ الختمة (نفس الرابط الموحّد)
  if (state.khatmah && state.khatmah.currentPage) {
    // نفس ضمان مسار المرجعية (openSurahFromBookmark): جدولة اليوم أولاً —
    // ثم تربط الصفحة المطلوبة صراحةً فوق أساس الجدولة (audit 2026-11)
    checkMissedDays();
    state.khatmah.currentPage = M.clampPage(page); saveState();
    window.openKhatmahReader();
    return;
  }
  showScreen('surah-view', 'slide-left');
  document.getElementById('verses-container').innerHTML = getSkeletonHTML();
  await renderMushafPage(page);
  await syncSurahForPage(page);
  recordReadingPosition();
  if (window.DeepLinks) try { DeepLinks.update('surah-view'); } catch (e) {}
};

window.openSurah = async function(number, focusAyah = null) {
  const token = ++openSurahToken;
  number = +number;
  // الانتقال لسورة أخرى أثناء التشغيل يوقف قائمة التلاوة القديمة
  // حتى لا تُربط شاشة التظليل بسورة مختلفة عن المسار الصوتي
  if (window.AudioPlayer && state.currentSurah && state.currentSurah.number !== number) { try { AudioPlayer.stop(); } catch (e) {} }
  // موضع التمرير القديم يعود لسورة أخرى — امحُه حتى تبدأ الجديدة من الأعلى
  if (state.currentSurah && state.currentSurah.number !== number) { delete state.scrollPositions['surah-view']; }
  state.currentSurah = allSurahs.find(s => s.number === number) || { name: `سورة ${number}`, number: number, numberOfAyahs: 0 };
  // عيّن الآية المستهدفة قبل showScreen حتى يعكس الرابط العميق قيمتها من البداية
  window.selectedAyahNo = focusAyah ? +focusAyah : null;
  showScreen('surah-view', 'slide-left');
  const container = document.getElementById('verses-container'); container.innerHTML = getSkeletonHTML();
  document.getElementById('surah-view-name').textContent = state.currentSurah.name; updateBookmarkIcon();
  if (window.AudioPlayer) AudioPlayer.bindSurahHeader();

  let surahData = null;
  try {
    surahData = await fetchSurahData(number);
    if (surahData && state.currentSurah.numberOfAyahs && surahData.ayahs && surahData.ayahs.length !== state.currentSurah.numberOfAyahs) {
        localStorage.removeItem(`q_s_u_${number}`);
        throw new Error("بيانات غير مطابقة");
    }
  } catch(e) {
    // لا تعرض خطأً قديماً إذا كان المستخدم قد انتقل لسورة أخرى
    if (token !== openSurahToken) return;
    container.innerHTML = `<div style="text-align:center; padding:20px;">خطأ في التحميل. تأكد من الإنترنت.<br><button class="btn-scale" style="margin-top:15px; width:auto; padding:10px 20px;" onclick="openSurah(${number})">إعادة المحاولة 🔄</button></div>`;
    return;
  }

  // ألغِ الرسم إذا بدّل المستخدم السورة أثناء التحميل
  if (token !== openSurahToken) return;
  if (!surahData) {
    // لا توجد بيانات سورة (لا إنترنت ولم تُخزّن من قبل): اعرض الصفحة الأولى المتاحة
    if (window.MushafPageManager) {
      const page = MushafPageManager.firstPageOfSurah(number);
      await renderMushafPage(page, { focusAyah: focusAyah || null });
      recordReadingPosition(focusAyah || null);
    }
    if (window.DeepLinks) try { DeepLinks.update('surah-view'); } catch (e) {}
    return;
  }

  // خزّن بيانات السورة ليتمكن مشغّل التلاوة من بناء القائمة منها
  state.currentSurahData = surahData;
  // وزّع آيات السورة على فهرس صفحات المصحف (من المصدر نفسه، دون طلب إضافي)
  // فتعمل بقية المحرّك كأن المصحف الكامل محلّياً
  if (window.MushafPageManager) MushafPageManager.seedFromSurah(surahData);

  // حلّ الصفحة المستهدفة: آية محددة، وإلا أول صفحة في السورة
  let page = 1;
  if (focusAyah) {
    const a = surahData.ayahs.find(x => x.numberInSurah === +focusAyah);
    if (a && typeof a.page === 'number') page = a.page;
  } else if (surahData.ayahs.length && typeof surahData.ayahs[0].page === 'number') {
    page = surahData.ayahs[0].page;
  } else if (window.MushafPageManager) {
    page = MushafPageManager.firstPageOfSurah(number);
  }
  await renderMushafPage(page, { focusAyah: focusAyah || null });
  recordReadingPosition(focusAyah || null);
  // حدّث الرابط العميق بعد اكتمال الرسم (يعكس تنقّل الصفحات وتغيّر التحديد)
  if (window.DeepLinks) try { DeepLinks.update('surah-view'); } catch (e) {}
}

// حفظ موضع القراءة الحالي لإمكانية العودة إليه (سورة + آية + صفحة)
function recordReadingPosition(ayahNo = null) {
  try {
    if (!window.ReadingProgressManager || !state.currentSurah) return;
    const M = window.MushafPageManager;
    const pg = M && state.mushafPage ? M.pageAyahs(state.mushafPage) : [];
    const lastAyah = ayahNo || window.selectedAyahNo || (pg.length ? pg[pg.length - 1].numberInSurah : null);
    ReadingProgressManager.savePosition(state.currentSurah.number, state.currentSurah.name, lastAyah, state.mushafPage || null);
  } catch (e) {}
}

// اسم مستعار للتوافق مع الأزرار والاختبارات القديمة
window.goSurahPage = function(dir) { changeMushafPage(dir); };

/* ==================== تفاعل الآية: تحديد + نسخ + تشغيل + حفظ ==================== */
let selectedAyahEl = null;

// يعيد نص الآية كما يراه المستخدم (كلماتها مفصولة بفراغات)
function ayahPlainText(el) {
  if (!el) return '';
  return Array.from(el.querySelectorAll('.w')).map(w => w.textContent).join(' ');
}

function getAyahDataFromEl(el) {
  if (!el) return null;
  return { surah: +el.dataset.surah, ayah: +el.dataset.ayah, global: +el.dataset.global, text: ayahPlainText(el) };
}

// تحديد آية وعرض شريط الإجراءات
window.selectAyah = function(el, scroll = false) {
  if (!el) return;
  document.querySelectorAll('.ayah.selected').forEach(a => a.classList.remove('selected'));
  el.classList.add('selected');
  selectedAyahEl = el;
  window.selectedAyahNo = +el.dataset.ayah;
  // الآية المحددة هي موضع القراءة الحالي — سجّله بدقة
  recordReadingPosition(+el.dataset.ayah);
  showAyahBar();
  if (scroll && document.body.classList.contains('mushaf-scroll-vertical')) {
    const r = el.getBoundingClientRect();
    const vh = window.innerHeight;
    if (r.top < 130 || r.bottom > vh - 170) {
      const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      el.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'center' });
    }
  }
};

function positionAyahBar(bar, targetEl) {
  if (!bar || !targetEl) return;
  const r = targetEl.getBoundingClientRect();
  if (!r || (r.width === 0 && r.height === 0)) return;
  const vw = window.innerWidth || 390;
  const vh = window.innerHeight || 844;
  const barW = Math.min(bar.offsetWidth || 310, vw - 16);
  const barH = bar.offsetHeight || 42;
  let top = r.top - barH - 8;
  if (top < 54) {
    top = Math.min(vh - barH - 16, r.bottom + 8);
  }
  const cx = Math.max(barW / 2 + 8, Math.min(vw - barW / 2 - 8, r.left + r.width / 2));
  bar.style.top = Math.round(top) + 'px';
  bar.style.bottom = 'auto';
  bar.style.left = Math.round(cx) + 'px';
}

function showAyahBar() {
  let bar = document.getElementById('ayah-bar');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'ayah-bar';
    bar.innerHTML = `<button data-act="play">▶ تلاوة</button>
      <button data-act="tafsir">📖 تفسير</button>
      <button data-act="copy">⧉ نسخ</button>
      <button data-act="share-card">🖼 بطاقة</button>
      <button data-act="bookmark">🔖 حفظ</button>
      <button class="ayah-close" data-act="close" aria-label="إغلاق">✕</button>`;
    document.body.appendChild(bar);
    bar.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      onAyahBarAction(b.dataset.act);
    });
  }
  const audioBar = document.getElementById('audio-bar');
  bar.classList.toggle('with-audio', !!(audioBar && audioBar.classList.contains('visible')));
  bar.classList.add('visible');
  if (selectedAyahEl) {
    requestAnimationFrame(() => positionAyahBar(bar, selectedAyahEl));
  }
}

function hideAyahBar() {
  const bar = document.getElementById('ayah-bar');
  if (bar) bar.classList.remove('visible');
  if (selectedAyahEl) { selectedAyahEl.classList.remove('selected'); selectedAyahEl = null; }
  window.selectedAyahNo = null;
}
window.hideAyahBar = hideAyahBar;

function onAyahBarAction(act) {
  const el = selectedAyahEl;
  if (!el) { hideAyahBar(); return; }
  const d = getAyahDataFromEl(el);
  if (act === 'close') { hideAyahBar(); return; }
  if (act === 'play') {
    hideAyahBar();
    // ابدأ من الصفحة المعروضة ومن الآية المحددة بالضبط — يعمل من مسارَي
    // السورة والختمة على حد سواء (القائمة تُبنى من آيات الصفحة نفسها)
    if (window.AudioPlayer && d) {
      const st = window.state || {};
      if (st.mushafPage && window.MushafPageManager && d.global) {
        AudioPlayer.playFromPage(st.mushafPage, { fromGlobal: d.global });
      } else {
        AudioPlayer.playFromAyah(d.surah, d.ayah);
      }
    }
    return;
  }
  if (act === 'tafsir') {
    if (window.TafsirManager && d) TafsirManager.openForAyah(d);
    return;
  }
  if (act === 'share-card') {
    if (window.ShareCardGenerator && d) {
      const sName = (state.currentSurah && state.currentSurah.name) || `سورة ${d.surah}`;
      ShareCardGenerator.share({
        badge: `${sName} — آية ${toArabicNum(d.ayah)}`,
        text: `﴿ ${d.text} ﴾`
      });
    }
    return;
  }
  if (act === 'copy') {
    copyAyah(d).then(ok => Toast.show(ok ? 'تم نسخ الآية ✓' : 'تعذّر النسخ'));
    return;
  }
  if (act === 'bookmark') {
    try {
      if (window.BookmarkManager && d) {
        const exists = BookmarkManager.getAll().verses.some(v => v.surah === d.surah && v.ayah === d.ayah);
        if (exists) {
          // إزالة الحفظ من الآية نفسها (تبديل حقيقي، لا مجرد رسالة)
          BookmarkManager.removeVerseBookmark(d.surah, d.ayah);
          el.classList.remove('bookmarked');
          Toast.show('أُلغيت الإشارة من الآية');
        } else {
          BookmarkManager.addVerseBookmark(d.surah, d.ayah, d.text);
          el.classList.add('bookmarked');
          Toast.show('تم حفظ الآية 🔖');
        }
      }
    } catch (e) { Toast.show('تعذّر الحفظ'); }
    // نقاط المرجعيات على مسار الورد تُعاد رسمها فوراً بعد أي تبديل
    if (state.mushafMode === 'khatmah-read') renderWirdChrome();
  }
}

// نسخ نص عربي بحت (بدون HTML أو علامات اتجاه) عبر الحافظة أو execCommand
window.copyTextToClipboard = copyTextToClipboard;
async function copyTextToClipboard(text) {
  try {
    if (navigator.clipboard && window.isSecureContext && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (e) {}
  const ta = document.createElement('textarea');
  ta.setAttribute('readonly', '');
  ta.dir = 'rtl';
  ta.value = text;
  ta.style.cssText = 'position:fixed;top:-1000px;opacity:0';
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch (e) {}
  ta.remove();
  return ok;
}

// نص الآية + سطر المرجع بالعربية فقط حتى لا يختلط اتجاه النص عند اللصق
async function copyAyah(d) {
  if (!d) return false;
  const surahName = (state.currentSurah && state.currentSurah.name) || `سورة ${d.surah}`;
  return copyTextToClipboard(`${d.text}\nسورة ${surahName} — آية ${toArabicNum(d.ayah)}`);
}

// تنبيه عابر خفيف (بديل للحوار الثقيل لرسائل مثل "تم النسخ")
const Toast = {
  timer: null,
  show(msg) {
    let t = document.getElementById('app-toast');
    if (!t) { t = document.createElement('div'); t.id = 'app-toast'; document.body.appendChild(t); }
    t.textContent = msg;
    t.classList.add('visible');
    clearTimeout(this.timer);
    this.timer = setTimeout(() => t.classList.remove('visible'), 2400);
  }
};
window.Toast = Toast;
window.showAppToast = (msg) => Toast.show(msg);




let currentOccasionKeys = [];
function initOccasionSystem() {
  if (!hijriEngineAvailable) return;
  const now = new Date(); const hijri = getHijriDate(now); if (!hijri) return;
  currentOccasionKeys = getActiveOccasionKeys(hijri, now.getDay());

  const navRow = document.getElementById('occasion-nav-row'); const navLabel = document.getElementById('occasion-nav-label');
  if (currentOccasionKeys.length > 0) { navRow.style.display = ''; navLabel.textContent = currentOccasionKeys.length > 1 ? 'سنن وتذكيرات اليوم' : (OCCASIONS_DB[currentOccasionKeys[0]]?.title || 'سنن المناسبة'); }
  else { navRow.style.display = 'none'; }

  if (currentOccasionKeys.length > 0) {
    const periodKey = `${todayDateKey(now)}_${getCurrentPeriod(now)}`;
    if (localStorage.getItem('occasion_popup_last_period') !== periodKey) {
      const body = document.getElementById('occasion-modal-body'); document.getElementById('occasion-modal-title').textContent = currentOccasionKeys.length > 1 ? 'مناسبات وتذكيرات اليوم' : (OCCASIONS_DB[currentOccasionKeys[0]]?.title || 'مناسبة اليوم');
      body.innerHTML = currentOccasionKeys.map(k => {
        const o = OCCASIONS_DB[k];
        if (!o) return '';
        if (currentOccasionKeys.length === 1) {
          const sunnahHtml = (o.sunnahs && o.sunnahs.length) ? `<div style="margin-top:8px;font-size:12.5px;color:var(--text-muted);line-height:1.7;">${o.sunnahs.map(s => '• ' + s).join('<br>')}</div>` : '';
          return `<div class="occasion-modal-item"><div style="font-weight:700;color:var(--text);font-size:15px;margin-bottom:4px;">${o.summary}</div>${sunnahHtml}</div>`;
        }
        return `<div class="occasion-modal-item"><b>${o.icon} ${o.title}</b><br>${o.summary}</div>`;
      }).join('');
      document.getElementById('occasion-overlay').classList.add('active'); document.body.classList.add('modal-open'); localStorage.setItem('occasion_popup_last_period', periodKey);
    }
  }
}

function renderOccasionPage(keys) {
  const container = document.getElementById('occasion-list-container');
  if (!keys || keys.length === 0) { container.innerHTML = `<div class="occasion-empty">لا توجد مناسبة دينية خاصة مسجلة لهذا اليوم.</div>`; return; }
  container.innerHTML = keys.map(k => {
    const o = OCCASIONS_DB[k]; if (!o) return '';
    return `<div class="occasion-card" data-magnetic><div class="occasion-card-title">${o.icon} ${o.title}</div>${o.sunnahs.map(s => `<div class="occasion-sunnah-item">• ${s}</div>`).join('')}</div>`;
  }).join('') + `<div class="occasion-note">التاريخ الهجري المعروض محسوب فلكياً داخل التطبيق.</div>`;
  Motion.staggerIn(container, '.occasion-card');
}

document.addEventListener('DOMContentLoaded', () => {
  const localTodayStr = getLocalToday();
  Object.keys(localStorage).forEach(key => { if (key.startsWith('ath_') && !key.includes(localTodayStr)) localStorage.removeItem(key); });

  // شاشة البداية تُخفى عند جاهزية البيانات (انظر نهاية التهيئة)

  contentArea = document.getElementById('content');
  searchBar = document.getElementById('search-bar');
  clearBtn = document.getElementById('clear-search');

  // ملاحظة: تحديد الآية أصبح بالضغط المطوّل (Hold) فقط داخل PageFlipEngine،
  // بينما الضغطة الواحدة تبدّل أشرطة القارئ العائمة (Overlay HUD) كما في تطبيق Ayah.
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => {
      if (window.state && window.state.mushafPage && typeof fitMushafPageToViewport === 'function') {
        fitMushafPageToViewport();
      }
    }).catch(() => {});
  }

  initHijri(); loadState();
  // إن وُجد المصحف الكامل مخزّناً محلياً فاجعله جاهزاً للعرض بلا إنترنت.
  // القراءة من IndexedDB فقط — لا طلبات شبكة هنا.
  if (window.MushafPageManager && MushafPageManager.load) {
    MushafPageManager.load().catch(() => {});
  }
  // تسجيل Service Worker يتم مرة واحدة فقط في نهاية <body> (تجنّب التسجيل المزدوج)

  // حافظي على state.bookmark متزامناً مع BookmarkManager (نظام موحد للمرجعيات)
  window.addEventListener('bookmarksChanged', () => {
    if (state.bookmark?.type === 'surah' && window.BookmarkManager && !BookmarkManager.isSurahBookmarked(state.bookmark.id)) {
      state.bookmark = null; saveState(); checkBookmarkFAB();
    }
    updateBookmarkIcon();
  });

  // الوضع المحفوظ له الأولوية، وإلا فاتبع وضع النظام (مع التخلف للداكن)
  const initialTheme = state.theme
    || (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
  applyTheme(initialTheme);
  
  // تطبيق مقياس الخط من الإعدادات (افتراضي 100%) — عبر applyFontSize الموحّد
  applyFontSize(state.fontScale ?? LEGACY_FONT_SIZE[state.fontSize] ?? 1.4);

  // نافذة حجم الخط المنبثقة: بناء + ربط + إغلاق بالنقر خارجها
  buildFontPopover();
  document.getElementById('font-size-btn').addEventListener('click', (e) => { e.stopPropagation(); toggleFontPopover(); });
  document.addEventListener('click', (e) => {
    const pop = document.getElementById('font-popover');
    if (pop && !pop.hidden && !pop.contains(e.target) && e.target.id !== 'font-size-btn') toggleFontPopover(false);
  });
  document.getElementById('theme-btn').addEventListener('click', () => applyTheme(state.theme === 'dark' ? 'light' : 'dark'));

  // ─── شريحة فلتر المفضلة في قائمة خيارات نمط التركيز ───
  document.getElementById('dhikr-fav-chip').addEventListener('click', () => window.toggleDhikrFavFilter());

  // Reduced-motion: استجب للتغيير أثناء التشغيل وليس مرة واحدة فقط
  const rmMedia = window.matchMedia('(prefers-reduced-motion: reduce)');
  rmMedia.addEventListener?.('change', (e) => {
    if (e.matches) snapNavIndicator();
  });

  // Magnetic hover فقط للأزرار الرئيسية وعلى أجهزة المؤشر الدقيق
  if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
    document.querySelectorAll('.btn-scale.primary, .quick-nav-card').forEach(el => Motion.magnetic(el, 0.08));
  }

  document.getElementById('share-btn').addEventListener('click', async () => {
    // شارك المحتوى الحالي إن وُجد، وإلا شارك التطبيق
    let text = 'جرب تطبيق إسلامي، صدقة جارية خفيف وسريع لقراءة القرآن الكريم، متابعة الختمة، وأذكار المسلم 🤍';
    if (state.currentScreen === 'surah-view' && state.currentSurah) {
      text = `﴿${state.currentSurah.name}﴾ — من تطبيق إسلامي 🤍`;
    } else if (state.currentScreen === 'thikr-view' && state.currentCatIndex !== null && ATHKAR[state.currentCatIndex]) {
      text = `${ATHKAR[state.currentCatIndex].name} — من تطبيق إسلامي 🤍\n${window.location.href}`;
    } else if (state.currentScreen === 'dua-list') {
      text = `أدعية النبي ﷺ — من تطبيق إسلامي 🤍`;
    }
    const shareData = { title: 'تطبيق إسلامي', text, url: window.location.href };
    try {
      if (navigator.share) await navigator.share(shareData);
      else {
        await navigator.clipboard.writeText(`${text}\n${shareData.url}`);
        await window.showAppDialog('تم نسخ الرابط بنجاح! 🤍<br><span style="font-size:calc(var(--font-size) * 0.5); color:var(--text-dim)">يمكنك الآن لصقه ومشاركته.</span>', false);
      }
    } catch (err) {}
  });

  // ===== نسخ نص الأذكار/الأدعية (تفويض الأحداث ليعمل على البطاقات المُعادة رسمها) =====
  document.addEventListener('click', async (e) => {
    const copyBtn = e.target.closest('.copy-btn');
    if (!copyBtn) return;
    const selector = copyBtn.dataset.copyFrom;
    const card = copyBtn.closest('.thikr-card, .dhikr-card, .dua-card');
    const textEl = card && selector ? card.querySelector(selector) : null;
    if (!textEl) return;
    const text = textEl.textContent.trim();
    const setDone = (ok) => {
      copyBtn.classList.toggle('copied', ok);
      copyBtn.setAttribute('aria-label', ok ? 'تم النسخ' : 'نسخ');
      setTimeout(() => copyBtn.classList.remove('copied'), 1600);
    };
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        setDone(true);
      } else {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed'; ta.style.top = '-9999px'; ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand('copy');
        ta.remove();
        setDone(ok);
      }
    } catch (err) {
      setDone(false);
    }
  });

  document.getElementById('back-btn').addEventListener('click', navigateBack);
  // زرّا الرجوع في القارئ: شريط الوضع النشط، وشبح الوضع الهادئ — كلاهما
  // يستخدم مسار الرجوع نفسه (navigateBack) دون مسار منفصل.
  document.getElementById('mt-back').addEventListener('click', navigateBack);
  document.getElementById('ghost-back').addEventListener('click', navigateBack);
  // أزرار شريط الوضع النشط في القارئ الموحّد
  document.getElementById('mt-index').addEventListener('click', () => { if (window.openMushafJumpSheet) window.openMushafJumpSheet('surah'); else { switchTab('quran'); showScreen('surah-list', 'slide-right'); } });
  document.getElementById('mt-search').addEventListener('click', () => {
    switchTab('quran'); showScreen('surah-list', 'slide-right');
    setTimeout(() => { const sb = document.getElementById('search-bar'); if (sb) { sb.focus(); sb.select(); } }, 60);
  });
  // ⚙ يفتح ورقة إعدادات القارئ (مرحلة ٦): اتجاه التمرير، تصميم الصفحة،
  // العرض الأفقي، الثيم، التظليل الموضوعي
  document.getElementById('mt-settings').addEventListener('click', () => { if (window.openReaderSettings) window.openReaderSettings(); });
  document.getElementById('bookmarks-btn').addEventListener('click', () => window.openBookmarks());
  document.getElementById('settings-btn')?.addEventListener('click', () => window.openSettings());
  document.getElementById('tasbih-phrase-chips')?.addEventListener('click', (e) => {
    const chip = e.target.closest('[data-phrase-id]');
    if (chip) {
      if (window.Haptics) Haptics.tap();
      setTasbihPhraseId(chip.dataset.phraseId);
    }
  });
  document.addEventListener('click', (e) => {
    const shareCardBtn = e.target.closest('.share-card-btn');
    if (!shareCardBtn || !window.ShareCardGenerator) return;
    const card = shareCardBtn.closest('.dhikr-card, .dua-card, .thikr-card');
    const sel = shareCardBtn.dataset.shareFrom || '.thikr-text, .dua-text';
    const textEl = card ? card.querySelector(sel) : null;
    if (!textEl) return;
    const badge = shareCardBtn.dataset.shareBadge || 'أذكار المسلم';
    ShareCardGenerator.share({ badge, text: textEl.textContent.trim() });
  });
  document.getElementById('nav-dua-card').addEventListener('click', () => { showScreen('dua-list', 'slide-left'); document.getElementById('dua-list-container').innerHTML = DUA_LIST.map(d => `<div class="dua-card" data-magnetic><button class="copy-btn" data-copy-from=".dua-text" aria-label="نسخ الدعاء" title="نسخ"><span aria-hidden="true">⧉</span> نسخ</button><button class="share-card-btn" data-share-badge="${escHtml(d.occasion)}" data-share-from=".dua-text" aria-label="مشاركة الدعاء كبطاقة" title="مشاركة كصورة"><span aria-hidden="true">🖼</span> بطاقة</button><div class="dua-occasion">${d.occasion}</div><div class="dua-text">${d.text}</div></div>`).join(''); Motion.staggerIn(document.getElementById('dua-list-container')); });
  document.getElementById('nav-tasbih-card').addEventListener('click', () => { showScreen('tasbih', 'slide-left'); buildTasbih(); updateTasbihUI(); });
  document.getElementById('nav-custom-athkar-card')?.addEventListener('click', () => { if (window.CustomAthkarManager) CustomAthkarManager.openModal(); });
  document.getElementById('nav-occasion-card').addEventListener('click', () => { showScreen('occasion-list', 'slide-left'); renderOccasionPage(currentOccasionKeys); });

  document.getElementById('occasion-modal-ok').addEventListener('click', () => { document.getElementById('occasion-overlay').classList.remove('active'); document.body.classList.remove('modal-open'); });
  document.getElementById('occasion-overlay').addEventListener('click', (e) => { if (e.target === e.currentTarget) { e.currentTarget.classList.remove('active'); document.body.classList.remove('modal-open'); } });
  document.getElementById('occasion-modal-goto').addEventListener('click', () => { document.getElementById('occasion-overlay').classList.remove('active'); document.body.classList.remove('modal-open'); switchTab('athkar'); showScreen('occasion-list', 'slide-left'); renderOccasionPage(currentOccasionKeys); });

  document.querySelectorAll('.nav-tab').forEach(t => {
    t.addEventListener('pointerdown', createRipple);
    t.addEventListener('click', () => switchTab(t.dataset.tab));
    t.id = 'nav-tab-' + t.dataset.tab;
    t.setAttribute('aria-controls', 'screen-' + (t.dataset.tab === 'quran' ? 'surah-list' : t.dataset.tab === 'khatmah' ? 'khatmah-main' : t.dataset.tab === 'tasbih' ? 'tasbih' : 'athkar-list'));
  });
  // تنقل بين التبويبات بأسهم لوحة المفاتيح
  // إمكانية الوصول: تفعيل بطاقة رأس المصحف بلوحة المفاتيح (Enter/Space)
  {
    const topbarCard = document.getElementById('mushaf-topbar-card');
    if (topbarCard) {
      topbarCard.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
          e.preventDefault();
          if (!e.target.closest || !e.target.closest('button')) window.openMushafJumpSheet && window.openMushafJumpSheet();
        }
      });
    }
  }

  document.getElementById('nav').addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const tabs = tabsArray;
    const cur = tabs.indexOf(state.currentTab);
    // RTL: السهم الأيمن يذهب للتبويب السابق
    const next = e.key === 'ArrowRight' ? (cur + tabs.length - 1) % tabs.length : (cur + 1) % tabs.length;
    e.preventDefault();
    switchTab(tabs[next]);
    document.querySelector(`.nav-tab[data-tab="${tabs[next]}"]`)?.focus();
  });

  // debouncing للبحث (150ms) لتفادي إعادة الرسم المتكرر على الأجهزة الضعيفة
  let _searchDebounce = null;
  searchBar.addEventListener('input', e => {
    const val = e.target.value.trim();
    if (val) { if (!clearBtn.style.display || clearBtn.style.display === 'none') { clearBtn.style.display = 'block'; clearBtn.style.transform = 'translateY(-50%) scale(0.7)'; requestAnimationFrame(() => clearBtn.style.transform = 'translateY(-50%) scale(1)'); } }
    else { clearBtn.style.transform = 'translateY(-50%) scale(0.7)'; setTimeout(() => clearBtn.style.display = 'none', 200); }
    clearTimeout(_searchDebounce);
    _searchDebounce = setTimeout(async () => {
      // يشمل علامات المصحف كلها (مدّ U+0670، تطويل U+0640، النقطة العليا U+06E1
      // التي يستخدمها خط المصحف) — سابقاً كان النطاق يتوقف عند U+065F فلا
      // تطابق أسماء مثل «الكوثر».
      const tdBox = document.getElementById('daily-tadabbur-container');
      if (tdBox) tdBox.style.display = val ? 'none' : '';
      // دعم صيغة البحث السريع «سورة:آية» (مثل 2:255 أو ١٨:١٠ — مستوحاة من تطبيق آية)
      const asciiVal = val.replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
      const colonMatch = asciiVal.match(/^(\d{1,3})\s*[:：/\-]\s*(\d{1,3})$/);
      if (colonMatch) {
        const sNo = parseInt(colonMatch[1], 10);
        const aNo = parseInt(colonMatch[2], 10);
        const targetSurah = allSurahs.find(s => s.number === sNo);
        if (targetSurah && aNo >= 1 && aNo <= (targetSurah.numberOfAyahs || 286)) {
          renderSurahList([targetSurah], '');
          const box = document.getElementById('ayah-search-container');
          if (box) {
            box.style.display = 'block';
            box.innerHTML = `<div class="section-heading">انتقال فوري للآية</div>
              <div class="surah-row" onclick="openSurah(${sNo}, ${aNo})">
                <div class="surah-num">${toArabicNum(sNo)}</div>
                <div class="surah-info">
                  <div class="surah-name">${escHtml(targetSurah.name)} — آية ${toArabicNum(aNo)}</div>
                  <div class="surah-meta">اضغط للفتح المباشر على الآية ➔</div>
                </div>
              </div>`;
          }
          return;
        }
      }
      const nVal = normArabic(val);
      const filtered = allSurahs.filter(s => normArabic(s.name).includes(nVal) || s.number.toString() === asciiVal);
      renderSurahList(filtered, nVal);
      // ابحث في نص الآيات أيضاً (بعد تحميل الفهرس من المصدر الموثوق)
      const box = document.getElementById('ayah-search-container');
      if (val.length < 3) { if (box) { box.style.display = 'none'; box.innerHTML = ''; } return; }
      if (box && !ayahSearchIndex) {
        box.style.display = 'block';
        box.innerHTML = `<div class="ayah-search-status">جارٍ تجهيز بحث الآيات…</div>`;
      }
      const idx = await ensureAyahIndex();
      if (searchBar.value.trim() !== val) return; // تغيّر الاستعلام أثناء التحميل
      if (!idx || !box) { if (box) box.innerHTML = `<div class="ayah-search-status">تعذّر تحميل فهرس الآيات — تحقّق من اتصال الإنترنت.</div>`; return; }
      const hits = [];
      for (let i = 0; i < idx.length && hits.length < 30; i++) {
        if (idx[i].n.includes(nVal)) hits.push(idx[i]);
      }
      renderAyahSearchResults(hits, nVal);
    }, 150);
  });
  clearBtn.addEventListener('click', () => { searchBar.value = ''; const tdBox = document.getElementById('daily-tadabbur-container'); if (tdBox) tdBox.style.display = ''; clearBtn.style.transform = 'translateY(-50%) scale(0.7)'; setTimeout(() => clearBtn.style.display = 'none', 200); renderSurahList(allSurahs); const box = document.getElementById('ayah-search-container'); if (box) { box.style.display = 'none'; box.innerHTML = ''; } searchBar.focus(); });

  // ─── بحث فوري داخل الأذكار والأدعية والرقية ───
  const athkarSearchBar = document.getElementById('athkar-search-bar');
  const athkarSearchBox = document.getElementById('athkar-search-results');
  if (athkarSearchBar && athkarSearchBox) {
    athkarSearchBar.addEventListener('input', (e) => {
      const q = e.target.value.trim();
      if (!q) {
        athkarSearchBox.style.display = 'none';
        athkarSearchBox.innerHTML = '';
        return;
      }
      const nq = normArabic(q);
      const hits = [];
      ATHKAR.forEach((cat, ci) => {
        cat.items.forEach((it, ii) => {
          if (normArabic(cat.name).includes(nq) || normArabic(it.text).includes(nq)) {
            hits.push({ type: 'thikr', ci, ii, title: `${cat.icon} ${cat.name} — ذكر ${toArabicNum(ii + 1)}`, text: it.text });
          }
        });
      });
      DUA_LIST.forEach((d) => {
        if (normArabic(d.occasion).includes(nq) || normArabic(d.text).includes(nq)) {
          hits.push({ type: 'dua', title: `🤲 ${d.occasion}`, text: d.text });
        }
      });
      athkarSearchBox.style.display = 'block';
      if (!hits.length) {
        athkarSearchBox.innerHTML = `<div class="ayah-search-status">لا توجد أذكار أو أدعية مطابقة لـ «${escHtml(q)}».</div>`;
        return;
      }
      athkarSearchBox.innerHTML = `<div class="section-heading" style="margin-top:0">نتائج البحث (${toArabicNum(hits.length)})</div>` +
        hits.slice(0, 15).map(h => `
          <div class="dua-card" style="padding:42px 16px 14px; cursor:${h.type === 'thikr' ? 'pointer' : 'default'}" ${h.type === 'thikr' ? `onclick="if(!event.target.closest('button')) openCategory(${h.ci})"` : ''}>
            <button class="copy-btn" data-copy-from=".dua-text" aria-label="نسخ"><span aria-hidden="true">⧉</span> نسخ</button>
            <button class="share-card-btn" data-share-badge="${escHtml(h.title)}" data-share-from=".dua-text" aria-label="بطاقة"><span aria-hidden="true">🖼</span> بطاقة</button>
            <div class="dua-occasion">${highlightQuery(escHtml(h.title), nq)}</div>
            <div class="dua-text" style="font-size:calc(var(--font-size)*0.72)">${highlightQuery(escHtml(h.text.slice(0, 220)) + (h.text.length > 220 ? '…' : ''), nq)}</div>
          </div>`).join('');
    });
  }

  window.addEventListener('resize', () => { syncNavSafeArea(); snapNavIndicator(); });
  // الدوران أو تغيير حجم النافذة يعيد ضبط ملاءمة الصفحة والعمود الثاني
  const onViewportResize = () => {
    syncBottomHudHeightVar();
    if (window.state && window.state.mushafPage) {
      fitMushafPageToViewport();
      renderMushafPageNext(window.state.mushafPage);
    }
  };
  window.addEventListener('resize', onViewportResize);
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', onViewportResize);
  }
  document.getElementById('mushaf-strip-track')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-strip-page]');
    if (!btn) return;
    const targetPage = parseInt(btn.dataset.stripPage, 10);
    if (!targetPage || targetPage === state.mushafPage) return;
    _prevStripPage = state.mushafPage || 1;
    if (window.Haptics) Haptics.tap();
    gotoMushafPage(targetPage);
  });
  document.getElementById('mushaf-strip-return')?.addEventListener('click', () => {
    if (window.Haptics) Haptics.tap();
    if (_prevStripPage && _prevStripPage !== state.mushafPage) {
      const backTo = _prevStripPage;
      _prevStripPage = state.mushafPage || 1;
      gotoMushafPage(backTo);
    } else if (state.mushafPage > 1) {
      changeMushafPage(-1);
    }
  });
  ['mushaf-topbar', 'mushaf-bottom-hud', 'mushaf-audio-pill'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('pointerdown', () => scheduleHudAutoHide(6500), { passive: true });
      el.addEventListener('scroll', () => scheduleHudAutoHide(6500), { passive: true });
    }
  });
  window.addEventListener('readingProgressChanged', () => checkBookmarkFAB());
  bindGesturesAndScroll();
  // محرّك قلب الصفحات على لوحة القارئ الموحّد
  if (window.PageFlipEngine) PageFlipEngine.bind();
  // زر إتمام الورد في قارئ الختمة
  const wirdFab = document.getElementById('mushaf-wird-fab');
  if (wirdFab) wirdFab.addEventListener('click', () => { if (window.completeWird) completeWird(); });

  // اضبط الفراغ البصري لشريط التنقل حسب منطقة الأمان الفعلية للجهاز.
  // CSS لا يستطيع قياس env() كرقم، لذا نقيسه هنا مرة واحدة عند البدء
  // وعند أي تغيير في المقاس أو الاتجاه.
  //
  // هذه الدالة هي المالك الوحيد لـ --nav-gap. لا تضبطه في @media داخل CSS:
  // الكتابة هنا تذهب كـ inline style على <html>، وهي تتغلّب على قواعد
  // :root داخل @media — فأي قيمة هناك ستكون ميتة.
  function syncNavSafeArea() {
    // ضبط الارتفاع الفعلي للـ WebView في تطبيقات APK و IPA لتجنب أي خلل في الأبعاد (100dvh vs WebView frame)
    const vvh = (window.visualViewport && window.visualViewport.height) || window.innerHeight;
    if (vvh > 0) {
      document.documentElement.style.setProperty('--app-h', Math.round(vvh) + 'px');
    }
    document.documentElement.style.setProperty('--nav-gap', '6px');
    const nav = document.getElementById('nav');
    if (nav) {
      const h = nav.getBoundingClientRect().height;
      if (h > 0) document.documentElement.style.setProperty('--nav-h-actual', h + 'px');
    }
    const header = document.getElementById('header');
    if (header) {
      const h = header.getBoundingClientRect().height;
      if (h > 0) document.documentElement.style.setProperty('--header-h-actual', h + 'px');
    }
  }
  syncNavSafeArea();

  snapNavIndicator();
  // زر الرجوع المادي (أندرويد/المتصفح): ما دام هناك مسار داخلي نرجع داخله،
  // وإلا يُترك للمتصفح خروجه الطبيعي. ندفع مدخلاً حارساً واحداً في السجل
  // ونلتقط popstate — URL يبقى كما هو فلا تتولّد hashchange مزعجة.
  try {
    history.pushState({ guard: true }, '');
    window.addEventListener('popstate', () => {
      if (screenStack.length > 0) {
        navigateBack();
        try { history.pushState({ guard: true }, ''); } catch (e) {}
      }
    });
  } catch (e) {}
  // شاشة البداية تحدّد التبويب المضيء، والمسار يبدأ فارغاً (جذر التبويب يُسنَد أدناه)
  const bootTab = state.currentTab || 'quran';
  state.currentScreen = rootScreenOf(bootTab);
  initOccasionSystem(); switchTab(bootTab);
  checkBookmarkFAB();

  // هيكل تحميل (Skeleton) للقائمة الرئيسية حتى جلب البيانات
  document.getElementById('surah-list-container').innerHTML = getSkeletonHTML();
  // أخفِ شاشة البداية بعد أن تبقى ظاهرة مدة كافية لتُدرَك (≈1.5 ثانية)
  // loadSurahList() قد تكتمل أسرع بكثير من ذلك، لذا نفرض حداً أدنى للمدة
  // بدل إخفاء الشاشة فور جاهزية البيانات.
  const _splash = document.getElementById('splash-screen');
  let _seenSplash = false; try { _seenSplash = sessionStorage.getItem('splash_seen') === '1'; sessionStorage.setItem('splash_seen', '1'); } catch(e) {}
  const SPLASH_MIN_MS = _seenSplash ? 250 : 750;   // سريعة عند الزيارات المتكررة
  const SPLASH_MAX_MS = 4000;   // حد أقصى احتياطي: لا ننتظر البيانات للأبد
  const _splashStart = performance.now();
  let _splashHidden = false;
  const hideSplash = () => {
    if (_splashHidden || !_splash || _splash.style.display === 'none') return;
    // انتظر ما تبقّى من المدة الدنيا قبل البدء بالتلاشي
    const elapsed = performance.now() - _splashStart;
    const remaining = Math.max(0, SPLASH_MIN_MS - elapsed);
    setTimeout(() => {
      if (_splashHidden) return;
      _splashHidden = true;
      _splash.style.opacity = '0';
      _splash.style.transform = 'scale(1.06)';
      setTimeout(() => { _splash.style.display = 'none'; }, 500);
    }, remaining);
  };
  loadSurahList().then(hideSplash).catch(hideSplash);
  setTimeout(hideSplash, SPLASH_MAX_MS); // حد أقصى احتياطي

  let isDraggingNav = false; let navStartX = 0; let indicatorStartX = 0;
  let navDragLastX = 0, navDragLastT = 0;
  const navBar = document.getElementById('nav'); const navIndicator = document.getElementById('nav-indicator');

  function getClientX(e) { return e.touches ? e.touches[0].clientX : e.clientX; }
  function handleDragStart(e) {
    if (e.target.closest('#nav')) {
      const activeTab = document.querySelector('.nav-tab.active'); if(!activeTab) return;
      // أوقف أي حركة زنبركية جارية أثناء السحب
      if (navSpring.raf) { cancelAnimationFrame(navSpring.raf); navSpring.running = false; }
      isDraggingNav = true; navStartX = getClientX(e); indicatorStartX = activeTab.offsetLeft;
      navDragLastX = indicatorStartX; navDragLastT = performance.now();
      navSpring.x = indicatorStartX; navSpring.w = activeTab.offsetWidth;
      applyNavIndicator(indicatorStartX, activeTab.offsetWidth, 0.96, 0.94);
    }
  }
  function handleDragMove(e) {
    if(!isDraggingNav) return;
    const dx = getClientX(e) - navStartX; let newX = indicatorStartX + dx;
    const minX = 0; const maxX = navBar.offsetWidth - navIndicator.offsetWidth;
    if (newX < minX) newX = minX - Math.pow(minX - newX, 0.7);
    if (newX > maxX) newX = maxX + Math.pow(newX - maxX, 0.7);
    const stretch = 1 + Math.min(Math.abs(dx) / 400, 0.22);
    applyNavIndicator(newX, navSpring.w, stretch, 0.92);
    // تتبع السرعة اللحظية لتسليمها للزنبرك عند الإفلات
    const now = performance.now();
    const dtMs = now - navDragLastT;
    if (dtMs > 0) { navSpring.vx = (newX - navDragLastX) / dtMs * 1000; }
    navDragLastX = newX; navDragLastT = now;
    navSpring.x = newX;
  }
  function handleDragEnd(e) {
    if(!isDraggingNav) return;
    isDraggingNav = false;
    const currentTransformMatch = navIndicator.style.transform.match(/translateX\(([^p]+)px\)/);
    const currentTransformX = currentTransformMatch ? parseFloat(currentTransformMatch[1]) : indicatorStartX;
    navSpring.x = currentTransformX;
    // حدّد السرعة القصوى لتجنب رد فعل عنيف
    navSpring.vx = Math.max(-1600, Math.min(1600, navSpring.vx));
    const indicatorCenter = currentTransformX + (navIndicator.offsetWidth / 2);
    let closestTab = null; let minDistance = Infinity;
    document.querySelectorAll('.nav-tab').forEach(tab => {
      const tabCenter = tab.offsetLeft + (tab.offsetWidth / 2); const dist = Math.abs(indicatorCenter - tabCenter);
      if(dist < minDistance) { minDistance = dist; closestTab = tab; }
    });
    // تبديل التبويب بالسحب مسموح فقط من الشاشات الجذرية — لا من القارئ أو الشاشات المتداخلة
    const isTabRoot = ['surah-list', 'khatmah-main', 'athkar-list', 'tasbih'].includes(state.currentScreen);
    if (closestTab && closestTab.dataset.tab !== state.currentTab && isTabRoot) switchTab(closestTab.dataset.tab); else setNavIndicator();
  }

  navBar.addEventListener('touchstart', handleDragStart, {passive: true});
  navBar.addEventListener('touchmove', handleDragMove, {passive: true});
  navBar.addEventListener('touchend', handleDragEnd);
  navBar.addEventListener('mousedown', handleDragStart);
  window.addEventListener('mousemove', handleDragMove);
  window.addEventListener('mouseup', handleDragEnd);

  window.showAppDialog = function(message, isConfirm = false) {
    return new Promise((resolve) => {
      const overlay = document.getElementById('custom-dialog-overlay');
      const msgEl = document.getElementById('custom-dialog-text');
      const btnOk = document.getElementById('custom-dialog-ok');
      const btnCancel = document.getElementById('custom-dialog-cancel');
      if (typeof message === 'string') { msgEl.innerHTML = message; }
      else { msgEl.textContent = ''; msgEl.appendChild(message); }
      btnCancel.style.display = isConfirm ? 'block' : 'none';
      btnOk.textContent = isConfirm ? 'موافق' : 'حسناً';
      overlay.classList.add('active');

      // نضمن إنهاء الـ Promise دائماً (زر، خلفية، أو Escape) حتى لا يعلق الكود
      let settled = false;
      const dismiss = (result) => {
        if (settled) return;
        settled = true;
        overlay.classList.remove('active');
        document.removeEventListener('keydown', onKey);
        resolve(result);
      };
      const onKey = (e) => { if (e.key === 'Escape') dismiss(isConfirm ? false : true); };
      document.addEventListener('keydown', onKey);

      btnOk.onclick = () => dismiss(true);
      btnCancel.onclick = () => dismiss(false);
      overlay.onclick = (e) => { if (e.target === overlay) dismiss(isConfirm ? false : true); };
    });
  };
});
