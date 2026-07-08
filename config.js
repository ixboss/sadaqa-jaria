// ==================== Application Configuration ====================

const APP_CONFIG = {
  // App Info
  app: {
    name: 'إسلامي',
    version: '2.0.0',
    description: 'تطبيق إسلامي شامل',
    author: 'ixboss',
    license: 'MIT'
  },

  // API Configuration
  api: {
    quran: 'https://api.alquran.cloud',
    timeout: 10000,
    retries: 3,
    retryDelay: 1000
  },

  // Performance
  performance: {
    enableServiceWorker: true,
    enableOfflineMode: true,
    enableCaching: true,
    cacheDuration: 7 * 24 * 60 * 60 * 1000, // 7 days
    imageOptimization: true
  },

  // Security
  security: {
    enableCSP: true,
    enableXFrameOptions: true,
    enableHTTPS: true,
    validateOrigin: true
  },

  // Features
  features: {
    bookmarks: true,
    readingProgress: true,
    khatmah: true,
    tasbih: true,
    athkar: true,
    dua: true,
    occasions: true,
    darkMode: true,
    search: true,
    sharing: true,
    notifications: true
  },

  // Storage
  storage: {
    localStorage: true,
    indexedDB: true,
    quotaMB: 50
  },

  // UI
  ui: {
    theme: 'dark', // 'dark' or 'light'
    fontSize: 'large', // 'small', 'medium', 'large'
    fontFamily: 'Amiri Quran',
    animationDuration: 300,
    transitionDuration: 400
  },

  // Debugging
  debug: {
    enabled: false,
    logNetworkRequests: false,
    logStorageOperations: false,
    logPerformance: false,
    showMetrics: false
  },

  // Accessibility
  accessibility: {
    enableKeyboardNavigation: true,
    enableScreenReaderSupport: true,
    enableHighContrast: false,
    fontSize: 'inherit'
  },

  // PWA
  pwa: {
    enabled: true,
    updateCheckInterval: 60 * 1000, // 1 minute
    autoUpdate: false,
    offlineFirstStrategy: true
  }
};

// Export for different environments
if (typeof module !== 'undefined' && module.exports) {
  module.exports = APP_CONFIG;
}

// Global access
window.APP_CONFIG = APP_CONFIG;

// ==================== Configuration Getters ====================
const Config = {
  get(path, defaultValue = null) {
    const keys = path.split('.');
    let value = APP_CONFIG;
    
    for (const key of keys) {
      if (value && typeof value === 'object' && key in value) {
        value = value[key];
      } else {
        return defaultValue;
      }
    }
    
    return value;
  },

  set(path, value) {
    const keys = path.split('.');
    const lastKey = keys.pop();
    let obj = APP_CONFIG;
    
    for (const key of keys) {
      if (!(key in obj)) {
        obj[key] = {};
      }
      obj = obj[key];
    }
    
    obj[lastKey] = value;
    return true;
  },

  isEnabled(feature) {
    return this.get(`features.${feature}`, false);
  },

  isDebugEnabled() {
    return this.get('debug.enabled', false);
  }
};

// Global access
window.Config = Config;

// ==================== Feature Detection ====================
const FeatureDetection = {
  serviceWorker: () => 'serviceWorker' in navigator,
  localStorage: () => {
    try {
      const test = '__test__';
      localStorage.setItem(test, test);
      localStorage.removeItem(test);
      return true;
    } catch (e) {
      return false;
    }
  },
  indexedDB: () => !!window.indexedDB,
  notification: () => 'Notification' in window,
  share: () => 'share' in navigator,
  clipboard: () => 'clipboard' in navigator,
  backgroundSync: () => 'sync' in ServiceWorkerRegistration.prototype,
  webWorkers: () => typeof (Worker) !== 'undefined',
  webSockets: () => 'WebSocket' in window,
  geolocation: () => 'geolocation' in navigator,
  mediaDevices: () => 'mediaDevices' in navigator
};

// Global access
window.FeatureDetection = FeatureDetection;

// Log feature detection
console.log('🔍 Feature Detection:', {
  serviceWorker: FeatureDetection.serviceWorker(),
  localStorage: FeatureDetection.localStorage(),
  indexedDB: FeatureDetection.indexedDB(),
  notification: FeatureDetection.notification(),
  share: FeatureDetection.share(),
  clipboard: FeatureDetection.clipboard(),
  backgroundSync: FeatureDetection.backgroundSync(),
  webWorkers: FeatureDetection.webWorkers(),
  webSockets: FeatureDetection.webSockets()
});
