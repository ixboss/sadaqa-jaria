/* haptics.js — الاهتزاز اللمسي (مُستخرج من features.js) */
'use strict';

/* ==================== 1) Haptics — الاهتزاز اللمسي ==================== */
const Haptics = {
  supported() { return 'vibrate' in navigator; },
  tap(ms = 12) { if (this.supported()) navigator.vibrate(ms); },
  success() { if (this.supported()) navigator.vibrate([18, 40, 22]); },
  celebrate() { if (this.supported()) navigator.vibrate([25, 50, 25, 50, 45]); }
};
window.Haptics = Haptics;
