// Register Service Worker with enhanced error handling
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js', { scope: './', updateViaCache: 'none' })
      .then(reg => {
        console.log('✅ SW registered:', reg.scope);
        try { reg.update(); } catch (e) {}
      })
      .catch(err => console.error('❌ SW registration failed:', err));
  });
}

// ملاحظة: تم إزالة رابط preload الثابت لملف woff2 القديم لأنه كان يعيد 404؛
// الخطوط تُحمّل وتُخزّن الآن تلقائياً عبر <link rel="stylesheet"> و Service Worker (STATIC_CACHE).

// ملاحظة: تهيئة السمة تتم بواسطة applyTheme() في DOMContentLoaded فقط
// (أزيلنا الـ IIFE الذي كان يضيف theme-light قبل تطبيق applyTheme ويسبب وميضاً)
