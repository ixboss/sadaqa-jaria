// ==================== Advanced App Features ====================

// ==================== LocalStorage Manager ====================
class StorageManager {
  static set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.warn('Storage error:', e);
      return false;
    }
  }

  static get(key, defaultValue = null) {
    try {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : defaultValue;
    } catch (e) {
      console.warn('Storage retrieval error:', e);
      return defaultValue;
    }
  }

  static remove(key) {
    try {
      localStorage.removeItem(key);
      return true;
    } catch (e) {
      console.warn('Storage removal error:', e);
      return false;
    }
  }

  static clear() {
    try {
      localStorage.clear();
      return true;
    } catch (e) {
      console.warn('Storage clear error:', e);
      return false;
    }
  }
}

// ==================== Bookmark Manager ====================
class BookmarkManager {
  static STORAGE_KEY = 'islamic_bookmarks';

  static getAll() {
    return StorageManager.get(this.STORAGE_KEY, {
      surahs: {},
      verses: []
    });
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
    const bookmarks = this.getAll();
    bookmarks.verses.push({
      surah: surahNumber,
      ayah: ayahNumber,
      text: text,
      timestamp: Date.now()
    });
    StorageManager.set(this.STORAGE_KEY, bookmarks);
    this.notifyChange();
    return true;
  }

  static removeVerseBookmark(surahNumber, ayahNumber) {
    const bookmarks = this.getAll();
    bookmarks.verses = bookmarks.verses.filter(v => 
      !(v.surah === surahNumber && v.ayah === ayahNumber)
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
  static async searchSurahs(query, surahs) {
    if (!query.trim()) return [];

    const lowerQuery = query.toLowerCase().trim();
    const results = [];

    for (const surah of surahs) {
      // Search by name
      if (surah.name.includes(query) || surah.englishName.toLowerCase().includes(lowerQuery)) {
        results.push({
          type: 'surah',
          surah: surah,
          matchType: 'name',
          relevance: 100
        });
      }
      // Search by number
      else if (surah.number.toString() === lowerQuery) {
        results.push({
          type: 'surah',
          surah: surah,
          matchType: 'number',
          relevance: 100
        });
      }
      // Fuzzy search
      else if (this.fuzzyMatch(surah.name, query)) {
        results.push({
          type: 'surah',
          surah: surah,
          matchType: 'fuzzy',
          relevance: 50
        });
      }
    }

    return results.sort((a, b) => b.relevance - a.relevance);
  }

  static fuzzyMatch(str, pattern) {
    const lowerStr = str.toLowerCase();
    const lowerPattern = pattern.toLowerCase();
    let strIndex = 0;
    let patternIndex = 0;

    while (strIndex < lowerStr.length && patternIndex < lowerPattern.length) {
      if (lowerStr[strIndex] === lowerPattern[patternIndex]) {
        patternIndex++;
      }
      strIndex++;
    }

    return patternIndex === lowerPattern.length;
  }

  static highlightText(text, query) {
    if (!query.trim()) return text;

    const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    return text.replace(regex, '<span class="highlight">$1</span>');
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
        e.preventDefault();
        const searchBar = document.getElementById('search-bar');
        if (searchBar) searchBar.focus();
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
    const modals = document.querySelectorAll('[role="dialog"], .modal, [id*="overlay"]');
    modals.forEach(modal => {
      if (modal.classList.contains('active')) {
        modal.classList.remove('active');
      }
    });
  }

  static navigateNext() {
    const nextBtn = document.querySelector('[data-action="next"]');
    if (nextBtn) nextBtn.click();
  }

  static navigatePrev() {
    const prevBtn = document.querySelector('[data-action="prev"]');
    if (prevBtn) prevBtn.click();
  }

  static announceMessage(message) {
    const announcement = document.createElement('div');
    announcement.setAttribute('role', 'status');
    announcement.setAttribute('aria-live', 'polite');
    announcement.setAttribute('aria-atomic', 'true');
    announcement.textContent = message;
    announcement.style.cssText = 'position:absolute;left:-9999px;height:1px;overflow:hidden;';
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
    // Add ARIA labels to buttons and interactive elements
    document.querySelectorAll('button').forEach(btn => {
      if (!btn.getAttribute('aria-label')) {
        const text = btn.textContent.trim() || btn.title;
        if (text) {
          btn.setAttribute('aria-label', text);
        }
      }
    });
  }
}

// ==================== Performance Monitor ====================
class PerformanceMonitor {
  static metrics = {};

  static startMeasure(label) {
    performance.mark(label + '-start');
  }

  static endMeasure(label) {
    performance.mark(label + '-end');
    try {
      performance.measure(label, label + '-start', label + '-end');
      const measure = performance.getEntriesByName(label)[0];
      this.metrics[label] = measure.duration;
      console.log(`📊 ${label}: ${measure.duration.toFixed(2)}ms`);
    } catch (e) {
      console.warn('Performance measurement error:', e);
    }
  }

  static getMetrics() {
    return this.metrics;
  }

  static reportWebVitals() {
    if ('web-vital' in window) {
      window.addEventListener('web-vital', (e) => {
        console.log('Web Vital:', e.detail);
      });
    }
  }
}

// ==================== Service Worker Registration ====================
class ServiceWorkerManager {
  static async register() {
    if (!('serviceWorker' in navigator)) {
      console.log('Service Workers not supported');
      return false;
    }

    try {
      const registration = await navigator.serviceWorker.register('./sw.js', {
        scope: './',
        updateViaCache: 'none'
      });

      console.log('✅ Service Worker registered:', registration);

      // Listen for updates
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            this.notifyUpdate();
          }
        });
      });

      // Check for updates periodically
      setInterval(() => {
        registration.update().catch(() => {});
      }, 60000); // Check every minute

      return true;
    } catch (err) {
      console.error('❌ Service Worker registration failed:', err);
      return false;
    }
  }

  static notifyUpdate() {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('إسلامي', {
        body: 'تحديث جديد متاح! أعد تحميل الصفحة.',
        tag: 'app-update'
      });
    }
  }

  static static async requestNotificationPermission() {
    if (!('Notification' in window)) return false;
    if (Notification.permission === 'granted') return true;
    if (Notification.permission !== 'denied') {
      const permission = await Notification.requestPermission();
      return permission === 'granted';
    }
    return false;
  }
}

// ==================== Data Sync Manager ====================
class DataSyncManager {
  static async sync() {
    if (!navigator.onLine) {
      console.log('Offline - skipping sync');
      return false;
    }

    if ('serviceWorker' in navigator && 'SyncManager' in window) {
      try {
        await navigator.serviceWorker.ready;
        await registration.sync.register('sync-data');
        console.log('✅ Background sync registered');
        return true;
      } catch (err) {
        console.warn('Background sync not available:', err);
        return false;
      }
    }
    return false;
  }
}

// ==================== Initialization ====================
document.addEventListener('DOMContentLoaded', async () => {
  // Initialize all managers
  ServiceWorkerManager.register();
  AccessibilityHelper.initKeyboardNavigation();
  AccessibilityHelper.initScreenReaderSupport();
  AccessibilityHelper.enhanceFormAccessibility();
  DataSyncManager.sync();

  // Setup event listeners
  window.addEventListener('online', () => {
    console.log('🌐 Back online!');
    DataSyncManager.sync();
  });

  window.addEventListener('offline', () => {
    console.log('📵 Going offline');
  });

  // Performance monitoring
  if (window.PerformanceObserver) {
    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          console.log('Performance:', entry.name, entry.duration);
        }
      });
      observer.observe({ entryTypes: ['measure', 'navigation'] });
    } catch (e) {
      console.warn('PerformanceObserver not supported');
    }
  }

  // Request notification permission
  ServiceWorkerManager.requestNotificationPermission().catch(() => {});
});

// ==================== Global Exports ====================
window.BookmarkManager = BookmarkManager;
window.ReadingProgressManager = ReadingProgressManager;
window.AdvancedSearch = AdvancedSearch;
window.StorageManager = StorageManager;
window.AccessibilityHelper = AccessibilityHelper;
window.PerformanceMonitor = PerformanceMonitor;
