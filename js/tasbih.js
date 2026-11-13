/* tasbih.js — عدّاد السبحة، الجولات، العبارات، الحفظ — مُستخرج من index.html المونوليثي (v1.0.0 refactor) */

let tasbihCount = (() => { try { return parseInt(localStorage.getItem('tasbihCount') || '0', 10) || 0; } catch (e) { return 0; } })();
let tasbihLap = (() => { try { return parseInt(localStorage.getItem('tasbihLap') || '0', 10) || 0; } catch (e) { return 0; } })();

const TASBIH_PHRASES = [
  { id: 'subhan', short: 'سبحان الله وبحمده', text: 'سُبْحَانَ اللَّهِ وَبِحَمْدِهِ', virtue: 'من قالها مائة مرة حُطَّت خطاياه وإن كانت مثل زبد البحر (متفق عليه)' },
  { id: 'istighfar', short: 'أستغفر الله', text: 'أَسْتَغْفِرُ اللَّهَ وَأَتُوبُ إِلَيْهِ', virtue: 'كان النبي ﷺ يستغفر الله ويتوب إليه في اليوم أكثر من سبعين مرة (البخاري)' },
  { id: 'salat', short: 'الصلاة على النبي ﷺ', text: 'اللَّهُمَّ صَلِّ وَسَلِّمْ عَلَى نَبِيِّنَا مُحَمَّدٍ', virtue: 'من صلى عليَّ صلاة واحدة صلى الله عليه بها عشراً (مسلم)' },
  { id: 'hawqala', short: 'لا حول ولا قوة إلا بالله', text: 'لَا حَوْلَ وَلَا قُوَّةَ إِلَّا بِاللَّهِ', virtue: 'كلمة هي كنز من كنوز الجنة (متفق عليه)' },
  { id: 'baqiyat', short: 'الباقيات الصالحات', text: 'سُبْحَانَ اللَّهِ، وَالْحَمْدُ لِلَّهِ، وَلَا إِلَهَ إِلَّا اللَّهُ، وَاللَّهُ أَكْبَرُ', virtue: 'أحب الكلام إلى الله أربع: سبحان الله والحمد لله ولا إله إلا الله والله أكبر (مسلم)' }
];

function getTasbihPhraseId() {
  try { return localStorage.getItem('tasbih_phrase') || 'subhan'; } catch (e) { return 'subhan'; }
}
function setTasbihPhraseId(id) {
  try { localStorage.setItem('tasbih_phrase', id); } catch (e) {}
  renderTasbihPhrases();
}
function renderTasbihPhrases() {
  const chipsEl = document.getElementById('tasbih-phrase-chips');
  const curEl = document.getElementById('tasbih-phrase-current');
  const virEl = document.getElementById('tasbih-virtue');
  if (!chipsEl || !curEl || !virEl) return;
  const activeId = getTasbihPhraseId();
  const current = TASBIH_PHRASES.find(p => p.id === activeId) || TASBIH_PHRASES[0];
  chipsEl.innerHTML = TASBIH_PHRASES.map(p =>
    `<button type="button" class="tasbih-phrase-chip ${p.id === current.id ? 'active' : ''}" data-phrase-id="${p.id}">${p.short}</button>`
  ).join('');
  curEl.textContent = current.text;
  virEl.textContent = current.virtue;
}

function tasbihTarget() { return (window.Settings ? Settings.getTasbihTarget() : 33) || 33; }
// الجولات: ٣ جولات لكل هدف (دائماً ٣ للتجربة التقليدية)
function tasbihTotalLaps() { return 3; }

// تبني خرزات السبحة ونقاط الجولات حسب الهدف الحالي — دون مسّ العدّات
// سقف الخرزات البصرية ٣٣ خرزة لمنع تداخل الخرزات عند الأهداف الكبيرة (٩٩ / ١٠٠ / ١٠٠٠)
function buildTasbihBeads() {
  renderTasbihPhrases();
  const wrap = document.getElementById('tasbih-circle-wrap');
  wrap.querySelectorAll('.tasbih-bead').forEach(b => b.remove());
  const t = tasbihTarget();
  const beads = Math.min(t, 33);
  for (let i = 0; i < beads; i++) {
    const angle = (i / beads) * 2 * Math.PI - Math.PI / 2;
    const bead = document.createElement('div'); bead.className = 'tasbih-bead';
    bead.style.left = `${50 + 47 * Math.cos(angle)}%`; bead.style.top = `${50 + 47 * Math.sin(angle)}%`; wrap.appendChild(bead);
  }
  // أعد بناء نقاط الجولات
  const lapsWrap = document.getElementById('tasbih-laps');
  lapsWrap.innerHTML = '';
  for (let i = 0; i < tasbihTotalLaps(); i++) lapsWrap.appendChild(Object.assign(document.createElement('div'), { className: 'tasbih-lap-dot' }));
}

// إعادة الضبط الكامل: تُصفَّر العدّات وتُعاد الخرزات (تُستخدم عند تغيير الهدف)
window.rebuildTasbih = function() {
  tasbihCount = 0; tasbihLap = 0;
  document.getElementById('tasbih-msg').classList.remove('active');
  buildTasbihBeads();
  updateTasbihUI();
};

// فتح شاشة السبحة: بناء الخرزات فقط. العدّات المحفوظة تُستعاد كما هي بعد
// إعادة تحميل الصفحة — تصفيرها كان يمحو تقدّم الجلسة السابقة.
function buildTasbih() {
  const wrap = document.getElementById('tasbih-circle-wrap');
  if(wrap.querySelectorAll('.tasbih-bead').length === 0) {
    buildTasbihBeads();
  }
}

let _tasbihDisplayedCount = 0;
let _tasbihAnnounceTimer = null;
function updateTasbihUI() {
  const numEl = document.getElementById('tasbih-count-num');
  // Smooth count up to new value
  if (_tasbihDisplayedCount !== tasbihCount) {
    Motion.animateNumber(numEl, _tasbihDisplayedCount, tasbihCount, 280);
    _tasbihDisplayedCount = tasbihCount;
  }
  // أعلن القيمة لقارئ الشاشة (polite) ولكن مع debouncing لتجنّب الإزعاج عند كل ضغطة
  numEl.setAttribute('aria-live', 'polite');
  clearTimeout(_tasbihAnnounceTimer);
  _tasbihAnnounceTimer = setTimeout(() => {
    numEl.textContent = toArabicNum(tasbihCount);
  }, 400);
  document.querySelectorAll('.tasbih-lap-dot').forEach((dot, i) => {
    const wasFilled = dot.classList.contains('filled');
    const shouldFill = i < tasbihLap;
    if (wasFilled !== shouldFill) {
      dot.classList.toggle('filled', shouldFill);
      if (shouldFill) { dot.classList.remove('pop'); void dot.offsetWidth; dot.classList.add('pop'); }
    }
  });
  // تنفّس هادئ عندما يكون العدد صفراً (يدعو للضغط)
  const tapBtn = document.getElementById('tasbih-tap-btn');
  tapBtn.classList.toggle('breathe', tasbihCount === 0 && !prefersReducedMotion);
  // الحلقة تمثل تقدماً نسبياً نحو الهدف (خرزات أقل من الهدف)، فيُملأ كل خرزة بنسبة تقدمه
  const goal = tasbihTarget();
  const goalMeta = document.getElementById('tasbih-goal-meta');
  if (goalMeta) goalMeta.textContent = `من ${toArabicNum(goal)} • الشوط ${toArabicNum(Math.min(tasbihTotalLaps(), tasbihLap + 1))} / ${toArabicNum(tasbihTotalLaps())}`;
  const beadsList = document.querySelectorAll('.tasbih-bead');
  const filledBeads = goal > beadsList.length ? Math.floor((tasbihCount / goal) * beadsList.length) : tasbihCount;
  beadsList.forEach((b, i) => b.classList.toggle('filled', i < filledBeads));
  try { localStorage.setItem('tasbihCount', tasbihCount); localStorage.setItem('tasbihLap', tasbihLap); } catch (e) {}
}

document.getElementById('tasbih-tap-btn').addEventListener('click', (e) => {
  const btn = e.currentTarget;
  document.getElementById('tasbih-msg').classList.remove('active');
  tasbihCount++;
  // سُجِّلت كل تسبيحة فوراً في الإحصائيات؛ سابقاً لم يكن يُسجَّل إلا الجولات الكاملة
  // فتضيع التسبيحات الناقصة عند التصفير (B-6).
  if (window.StatsManager) StatsManager.recordTasbih(1);
  // اهتزاز لمسي خفيف عند كل تسبيحة
  if (window.Haptics) Haptics.tap(10);
  // Animate the bead that just got filled (نفس النسبة في updateTasbihUI)
  const goal = tasbihTarget();
  const beads = document.querySelectorAll('.tasbih-bead');
  const filledBeads = goal > beads.length ? Math.floor((tasbihCount / goal) * beads.length) : tasbihCount;
  const target = beads[filledBeads - 1];
  if (target) { target.classList.add('flash'); setTimeout(() => target.classList.remove('flash'), 320); }
  // Floater
  Motion.floater(btn, '+1', 'var(--accent)');
  if (tasbihCount >= goal) {
    // (التسبيحات سُجِّلت بالفعل عند كل ضغطة — لا حاجة لتسجيل الجولة كاملة هنا)
    tasbihCount = 0;
    tasbihLap++;
    if (tasbihLap >= tasbihTotalLaps()) {
      tasbihLap = 0;
      document.getElementById('tasbih-msg').classList.add('active');
      document.getElementById('tasbih-msg').textContent = `أتممت ${toArabicNum(goal * tasbihTotalLaps())} تسبيحة - تقبل الله 🤲`;
      // احتفال كبير موحّد
      if (window.Celebrate) Celebrate(btn, { confetti: 80, burst: 14, ring: true, haptic: true });
      if (window.AccessibilityHelper) AccessibilityHelper.announceMessage('أتممت سبحة كاملة، تقبل الله');
    } else {
      // Lap complete: small celebration
      if (window.Celebrate) Celebrate(btn, { confetti: 0, burst: 14, ring: true, haptic: true });
      if (window.AccessibilityHelper) AccessibilityHelper.announceMessage(`جولة ${toArabicNum(tasbihLap)} مكتملة`);
    }
  } else {
    // Subtle tap pulse
    btn.classList.remove('tap-pulse'); void btn.offsetWidth; btn.classList.add('tap-pulse');
  }
  updateTasbihUI();
});
document.getElementById('tasbih-reset-btn').addEventListener('click', () => { tasbihCount = 0; tasbihLap = 0; document.getElementById('tasbih-msg').classList.remove('active'); updateTasbihUI(); });
