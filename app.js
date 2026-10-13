// ==================== Advanced App Features ====================

// ==================== LocalStorage Manager ====================
class StorageManager {
  static set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      return false;
    }
  }

  static get(key, defaultValue = null) {
    try {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : defaultValue;
    } catch (e) {
      return defaultValue;
    }
  }

  static remove(key) {
    try {
      localStorage.removeItem(key);
      return true;
    } catch (e) {
      return false;
    }
  }

  static clear() {
    try {
      localStorage.clear();
      return true;
    } catch (e) {
      return false;
    }
  }
}

// ==================== Bookmark Manager ====================
class BookmarkManager {
  static STORAGE_KEY = 'islamic_bookmarks';

  static getAll() {
    const raw = StorageManager.get(this.STORAGE_KEY, {
      surahs: {},
      verses: []
    });
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return { surahs: {}, verses: Array.isArray(raw) ? raw : [] };
    }
    return {
      surahs: raw.surahs && typeof raw.surahs === 'object' ? raw.surahs : {},
      verses: Array.isArray(raw.verses) ? raw.verses : []
    };
  }

  static addSurahBookmark(surahNumber, surahName) {
    const bookmarks = this.getAll();
    bookmarks.surahs[surahNumber] = {
      name: surahName,
      timestamp: Date.now()
    };
    StorageManager.set(this.STORAGE_KEY, bookmarks);
    this.notifyChange();
    return true;
  }

  static removeSurahBookmark(surahNumber) {
    const bookmarks = this.getAll();
    delete bookmarks.surahs[surahNumber];
    StorageManager.set(this.STORAGE_KEY, bookmarks);
    this.notifyChange();
    return true;
  }

  static isSurahBookmarked(surahNumber) {
    const bookmarks = this.getAll();
    return surahNumber in bookmarks.surahs;
  }

  static addVerseBookmark(surahNumber, ayahNumber, text) {
    const s = +surahNumber;
    const a = +ayahNumber;
    const bookmarks = this.getAll();
    bookmarks.verses = bookmarks.verses.filter(v => !(Number(v.surah) === s && Number(v.ayah) === a));
    bookmarks.verses.push({
      surah: s,
      ayah: a,
      text: text,
      timestamp: Date.now()
    });
    StorageManager.set(this.STORAGE_KEY, bookmarks);
    this.notifyChange();
    return true;
  }

  static removeVerseBookmark(surahNumber, ayahNumber) {
    const s = +surahNumber;
    const a = +ayahNumber;
    const bookmarks = this.getAll();
    bookmarks.verses = bookmarks.verses.filter(v =>
      !(Number(v.surah) === s && Number(v.ayah) === a)
    );
    StorageManager.set(this.STORAGE_KEY, bookmarks);
    this.notifyChange();
    return true;
  }

  static notifyChange() {
    window.dispatchEvent(new CustomEvent('bookmarksChanged', {
      detail: this.getAll()
    }));
  }
}

// ==================== Reading Progress Manager ====================
class ReadingProgressManager {
  static STORAGE_KEY = 'reading_progress';

  static savePosition(surahNumber, surahName, ayahNumber = null, pageNumber = null) {
    const progress = {
      surah: surahNumber,
      surahName: surahName,
      ayah: ayahNumber,
      page: pageNumber,
      timestamp: Date.now(),
      readTime: new Date().toLocaleString('ar-SA')
    };
    StorageManager.set(this.STORAGE_KEY, progress);
    this.notifyChange();
    return progress;
  }

  static getLastPosition() {
    return StorageManager.get(this.STORAGE_KEY, null);
  }

  static clearPosition() {
    StorageManager.remove(this.STORAGE_KEY);
    this.notifyChange();
  }

  static notifyChange() {
    window.dispatchEvent(new CustomEvent('readingProgressChanged', {
      detail: this.getLastPosition()
    }));
  }
}

// ==================== Advanced Search ====================
class AdvancedSearch {
  static normArabic(text) {
    if (typeof window.normArabic === 'function') return window.normArabic(text);
    return String(text || '')
      .replace(/[أإآٱ]/g, 'ا')
      .replace(/ة/g, 'ه')
      .replace(/ى/g, 'ي')
      .replace(/[\u064B-\u0652\u0670\u0640\u06D6-\u06ED]/g, '');
  }

  static async searchSurahs(query, surahs) {
    if (!query || !query.trim()) return [];
    const nQuery = this.normArabic(query.trim()).toLowerCase();
    const results = [];
    for (const surah of (surahs || [])) {
      const nName = this.normArabic(surah.name || '');
      const eName = String(surah.englishName || '').toLowerCase();
      if (surah.number && surah.number.toString() === nQuery) {
        results.push({ type: 'surah', surah, matchType: 'number', relevance: 100 });
      } else if (nName.includes(nQuery) || eName.includes(nQuery)) {
        results.push({ type: 'surah', surah, matchType: 'name', relevance: 95 });
      }
    }
    return results.sort((a, b) => b.relevance - a.relevance || a.surah.number - b.surah.number);
  }
}

// ==================== Accessibility Enhancements ====================
class AccessibilityHelper {
  static initKeyboardNavigation() {
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.closeModals();
      }
      // Ctrl/Cmd + F for search
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        const searchBar = document.getElementById('search-bar');
        if (searchBar && window.state && window.state.currentScreen === 'surah-list') {
          e.preventDefault();
          searchBar.focus();
        }
      }
      // Alt + Right/Left for navigation
      if (e.altKey && e.key === 'ArrowRight') {
        this.navigateNext();
      }
      if (e.altKey && e.key === 'ArrowLeft') {
        this.navigatePrev();
      }
    });
  }

  static closeModals() {
    if (window.BottomSheet && window.BottomSheet.overlay) {
      window.BottomSheet.close();
    }
    const modals = document.querySelectorAll('[role="dialog"], .modal, [id*="overlay"]');
    modals.forEach(modal => {
      if (modal.classList.contains('active')) {
        modal.classList.remove('active');
      }
    });
  }

  static navigateNext() {
    const nextBtn = document.querySelector('[data-action="next"], #mp-next');
    if (nextBtn && !nextBtn.disabled) nextBtn.click();
  }

  static navigatePrev() {
    const prevBtn = document.querySelector('[data-action="prev"], #mp-prev');
    if (prevBtn && !prevBtn.disabled) prevBtn.click();
  }

  static announceMessage(message) {
    const announcement = document.createElement('div');
    announcement.setAttribute('role', 'status');
    announcement.setAttribute('aria-live', 'polite');
    announcement.setAttribute('aria-atomic', 'true');
    announcement.textContent = message;
    // سرّ المنطقة عن البصر دون أن تخلق تجاوزاً أفقياً للصفحة (sr-only القياسي)
    announcement.style.cssText = 'position:absolute;width:1px;height:1px;padding:0;margin:0;border:0;overflow:hidden;clip:rect(0,0,0,0);clip-path:inset(50%);white-space:nowrap;';
    document.body.appendChild(announcement);
    setTimeout(() => announcement.remove(), 3000);
  }

  static enhanceFormAccessibility() {
    const inputs = document.querySelectorAll('input, select, textarea');
    inputs.forEach(input => {
      if (!input.getAttribute('aria-label') && !input.getAttribute('aria-labelledby')) {
        const label = document.querySelector(`label[for="${input.id}"]`);
        if (label) {
          input.setAttribute('aria-labelledby', label.id || 'label-' + input.id);
        }
      }
    });
  }

  static initScreenReaderSupport() {
    document.querySelectorAll('button').forEach(btn => {
      if (!btn.getAttribute('aria-label')) {
        const text = btn.textContent.trim() || btn.title;
        if (text) {
          btn.setAttribute('aria-label', text);
        }
      }
    });
  }

  // جعل العناصر ذات role="button" قابلة للتفعيل بلوحة المفاتيح (Enter/Space)
  static initKeyboardActivation() {
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
      const target = e.target.closest('[role="button"]');
      if (!target || target.tagName === 'BUTTON') return;
      e.preventDefault();
      e.stopPropagation();
      target.click();
    });
  }
}

// ==================== Performance Monitor ====================
class PerformanceMonitor {
  static metrics = {};

  static startMeasure(label) {
    try { performance.mark(label + '-start'); } catch (e) {}
  }

  static endMeasure(label) {
    try {
      performance.mark(label + '-end');
      performance.measure(label, label + '-start', label + '-end');
      const measure = performance.getEntriesByName(label)[0];
      if (measure) this.metrics[label] = measure.duration;
    } catch (e) {}
  }

  static getMetrics() {
    return this.metrics;
  }
}

// ==================== Initialization ====================
document.addEventListener('DOMContentLoaded', () => {
  AccessibilityHelper.initKeyboardNavigation();
  AccessibilityHelper.initScreenReaderSupport();
  AccessibilityHelper.enhanceFormAccessibility();
  AccessibilityHelper.initKeyboardActivation();
});

// ==================== Global Exports ====================
window.BookmarkManager = BookmarkManager;
window.ReadingProgressManager = ReadingProgressManager;
window.AdvancedSearch = AdvancedSearch;
window.StorageManager = StorageManager;
window.AccessibilityHelper = AccessibilityHelper;
window.PerformanceMonitor = PerformanceMonitor;

// ==================== Animation & Microinteraction Manager ====================
class AnimationManager {
  static _initialized = false;

  static init() {
    if (this._initialized) {
      this.observeReveal();
      return;
    }
    this._initialized = true;
    this.setupReducedMotion();
    this.initReveal();
    this.initDelegation();
  }

  static setupReducedMotion() {
    try {
      if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        document.documentElement.classList.add('reduce-motion');
      }
    } catch (e) {}
  }

  static ensureObservers() {
    if (this._revealIO && this._listIO) return;
    if (!('IntersectionObserver' in window)) return;
    // مراقب واحد دائم يُعاد استخدامه عبر جميع عمليات إعادة الرسم
    this._revealIO = new IntersectionObserver((entries, obs) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('in');
          obs.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });
    this._listIO = new IntersectionObserver((entries, o) => {
      entries.forEach(en => {
        if (en.isIntersecting) {
          en.target.classList.add('mounted');
          o.unobserve(en.target);
        }
      });
    }, { threshold: 0.05 });
  }

  static initReveal() {
    this.ensureObservers();
    this.observeReveal();
  }

  static observeReveal() {
    // ضمان وجود المراقب قبل الاستخدام حتى لو استُدعي observeReveal قبل اكتمال init()
    this.ensureObservers();
    if (!this._revealIO || !this._listIO) return;

    const selector = '.surah-row, .mushaf-block, .thikr-card, .dua-card, .quick-nav-card, .occasion-card, .k-dash-card, .stat-card, .settings-card';
    const items = Array.from(document.querySelectorAll(selector)).filter(el => !el.dataset.revealObserved);
    items.forEach((el, i) => {
      if (!el.classList.contains('reveal-hidden')) el.classList.add('reveal-hidden');
      el.style.setProperty('--reveal-delay', (i % 12 * 60) + 'ms');
      el.dataset.revealObserved = '1';
      this._revealIO.observe(el);
    });

    document.querySelectorAll('[data-stagger]:not([data-stagger-observed])').forEach(list => {
      list.dataset.staggerObserved = '1';
      Array.from(list.children).forEach((c, idx) => c.style.setProperty('--stagger-delay', (idx * 40) + 'ms'));
      this._listIO.observe(list);
    });
  }

  static initDelegation() {
    // Bookmark toggle (delegation)
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('.bookmark-btn');
      // #btn-bm-surah له معالجه الخاص في index.html (toggleBookmark) — تجنّب الازدواج
      if (btn && btn.id !== 'btn-bm-surah') {
        try {
          let surahNum = btn.dataset.surah || btn.getAttribute('data-surah');
          if (!surahNum) {
            const surahEl = btn.closest('[data-surah]');
            if (surahEl) surahNum = surahEl.dataset.surah;
          }
          if (!surahNum || surahNum === '0') return;
          const isActive = btn.classList.toggle('active');
          btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
          const surahName = document.getElementById('surah-view-name')?.textContent?.trim() || btn.title || 'سورة';
          if (isActive) BookmarkManager.addSurahBookmark(surahNum, surahName);
          else BookmarkManager.removeSurahBookmark(surahNum);
          this.bounce(btn);
        } catch (err) {}
      }

      // Ripple for interactive elements
      const rippleTarget = e.target.closest('.header-btn, .btn-scale, .nav-tab, .nav-indicator, .bookmark-btn');
      if (rippleTarget) {
        this.ripple(e, rippleTarget);
      }
    }, { passive: true });

    // Pointerdown ripple for better responsiveness
    document.addEventListener('pointerdown', (e) => {
      const target = e.target.closest('.btn-scale, .header-btn, .nav-tab, .bookmark-btn');
      if (target) this.ripple(e, target);
    }, { passive: true });
  }

  static ripple(e, el) {
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const r = document.createElement('span');
    r.className = 'ripple';
    const size = Math.max(rect.width, rect.height) * 1.2;
    r.style.width = r.style.height = size + 'px';
    const clientX = (e.touches && e.touches[0]) ? e.touches[0].clientX : e.clientX;
    const clientY = (e.touches && e.touches[0]) ? e.touches[0].clientY : e.clientY;
    r.style.left = (clientX - rect.left - size / 2) + 'px';
    r.style.top = (clientY - rect.top - size / 2) + 'px';
    el.style.position = getComputedStyle(el).position === 'static' ? 'relative' : getComputedStyle(el).position;
    el.appendChild(r);
    setTimeout(() => r.remove(), 520);
  }

  static bounce(el) {
    if (!el) return;
    el.classList.remove('pop');
    void el.offsetWidth;
    el.classList.add('pop');
  }
}

window.AnimationManager = AnimationManager;

if (document.readyState === 'complete' || document.readyState === 'interactive') {
  AnimationManager.init();
} else {
  document.addEventListener('DOMContentLoaded', () => AnimationManager.init());
}
