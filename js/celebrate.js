/* celebrate.js — محرك الاحتفالات الموحّد (مُستخرج من features.js) */
'use strict';

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

