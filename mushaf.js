/* ==========================================================================
   mushaf.js — محرّك المصحف الموحّد (القرآن بدون إنترنت)
   ──────────────────────────────────────────────────────────────────────
   طبقة بيانات وفهرس الصفحات الـ ٦٠٤. طلب واحد لكل القرآن من المصدر
   الموثّق (alquran.cloud — نفس مزوّد النص الذي يستخدمه التطبيق)، ثم يُخزَّن
   محلياً في IndexedDB (وليس localStorage: حجم النص ≈ ١.٤ ميغابايت).

   قواعد الأمان (Phase 3):
   - لا تُكتب أي نسخة قبل اجتياز فحص السلامة (١١٤ سورة، ٦٢٣٦ آية،
     الصفحات ١..٦٠٤ كلها غير فارغة، وأعداد الآيات في كل سورة).
   - الاستبدال ذرّي: النسخة القديمة تبقى صالحة حتى تُلتزم النسخة الجديدة.
   - التنزيل تدفّقي مع نسبة تقدّم وإمكانية إلغاء وإعادة محاولة.
   - إن تعذّر IndexedDB (التصفّح الخاص على سفاري) يُستخدم localStorage
     كاحتياط، ولا تُعطّل بقية التطبيق أبداً.
   ========================================================================== */
(function () {
  'use strict';

  var TOTAL_PAGES = 604;
  var TOTAL_AYAHS = 6236;        // العدد الصحيح للآيات (العد المدني)
  var STORE_KEY = 'mushaf_quran_v2';   // مفتاح الاحتياط في localStorage
  var STORE_VERSION = 2;         // v2 يخزّن أسماء السور من المصدر (نص مُشكَّل) ليتطابق العرض مع مسار الشبكة
  var STATUS_KEY = 'mushaf_status';
  var API_FULL = 'https://api.alquran.cloud/v1/quran/quran-uthmani';
  var DB_NAME = 'mushaf-quran';
  var DB_VERSION = 1;
  var STORE_NAME = 'corpus';

  var M = {
    TOTAL_PAGES: TOTAL_PAGES,
    ready: false,
    source: '',            // 'local' | 'network' | 'none'
    ayahs: [],             // مسطّحة ومرتّبة: ayah.number = الترتيب العام (يبدأ من ١)
    pages: [],             // pages[1..604] = مصفوفة الآيات؛ pages[0] فارغة لتطابق الترقيم
    juzOfPage: [],         // رقم الجزء لكل صفحة
    surahFirstPage: [],    // 1..114 -> أول صفحة تبدأ فيها السورة
    surahLastPage: [],     // 1..114 -> آخر صفحة تحتوي شيئاً منها
    surahMeta: {},         // رقم السورة -> { name, englishName, numberOfAyahs }
    currentPage: 1,
    _loadPromise: null,
    _listeners: [],
    _abort: null           // AbortController للتنزيل الجاري
  };

  /* ---------- التخزين المحلي (قد يرمي في التصفّح الخاص) ---------- */
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) {} }

  /* ==================== IndexedDB ==================== */
  var _db = null;
  function dbOpen() {
    return new Promise(function (resolve) {
      if (_db) return resolve(_db);
      if (!('indexedDB' in window)) return resolve(null);
      try {
        var req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = function () {
          var d = req.result;
          if (!d.objectStoreNames.contains(STORE_NAME)) d.createObjectStore(STORE_NAME);
        };
        req.onsuccess = function () { _db = req.result; resolve(_db); };
        req.onerror = function () { resolve(null); };
      } catch (e) { resolve(null); }
    });
  }

  function dbGet(key) {
    return dbOpen().then(function (db) {
      if (!db) return null;
      return new Promise(function (resolve) {
        try {
          var tx = db.transaction(STORE_NAME, 'readonly');
          var req = tx.objectStore(STORE_NAME).get(key);
          req.onsuccess = function () { resolve(req.result || null); };
          req.onerror = function () { resolve(null); };
        } catch (e) { resolve(null); }
      });
    });
  }

  /* كتابة ذرّية للنسخة الجديدة في معاملة واحدة — النسخة القديمة
     تبقى مقروءة حتى تُلتزم هذه المعاملة بنجاح. */
  function dbPutBoth(meta, payload) {
    return dbOpen().then(function (db) {
      if (!db) return false;
      return new Promise(function (resolve) {
        try {
          var tx = db.transaction(STORE_NAME, 'readwrite');
          var os = tx.objectStore(STORE_NAME);
          os.put(meta, 'meta');
          os.put(payload, 'payload');
          tx.oncomplete = function () { resolve(true); };
          tx.onerror = function () { resolve(false); };
          tx.onabort = function () { resolve(false); };
        } catch (e) { resolve(false); }
      });
    });
  }

  function dbClear() {
    return dbOpen().then(function (db) {
      if (!db) return false;
      return new Promise(function (resolve) {
        try {
          var tx = db.transaction(STORE_NAME, 'readwrite');
          tx.objectStore(STORE_NAME).clear();
          tx.oncomplete = function () { resolve(true); };
          tx.onerror = function () { resolve(false); };
        } catch (e) { resolve(false); }
      });
    });
  }

  /* ==================== فحص السلامة ==================== */
  /* يُطبَّق على حمولة المصدر الخام قبل تخزينها. يعيد {ok} أو {ok:false, reason}.
     لا يُكتب أي شيء قبل اجتياز هذا الفحص. */
  function verifyPayload(surahs) {
    if (!Array.isArray(surahs) || surahs.length !== 114)
      return { ok: false, reason: 'عدد السور لا يساوي ١١٤' };
    var total = 0;
    var pages = {};
    for (var i = 0; i < surahs.length; i++) {
      var s = surahs[i];
      if (!s || typeof s.number !== 'number' || s.number !== i + 1)
        return { ok: false, reason: 'ترتيب السور غير سليم عند السورة ' + (i + 1) };
      var ay = s.ayahs;
      if (!Array.isArray(ay) || ay.length === 0)
        return { ok: false, reason: 'السورة ' + s.number + ' بلا آيات' };
      // عدد الآيات في كل سورة يجب أن يطابق الفهرس المحلي الموثوق
      var meta = (window.SURAH_META || []).find(function (m2) { return m2.number === s.number; });
      if (meta && meta.numberOfAyahs && meta.numberOfAyahs !== ay.length)
        return { ok: false, reason: 'عدد آيات السورة ' + s.number + ' لا يطابق الفهرس' };
      for (var k = 0; k < ay.length; k++) {
        var a = ay[k];
        if (!a || typeof a.text !== 'string' || !a.text)
          return { ok: false, reason: 'آية فارغة في السورة ' + s.number };
        if (typeof a.page !== 'number' || a.page < 1 || a.page > TOTAL_PAGES)
          return { ok: false, reason: 'رقم صفحة غير سليم' };
        pages[a.page] = true;
        total++;
      }
    }
    if (total !== TOTAL_AYAHS)
      return { ok: false, reason: 'مجموع الآيات ' + total + ' لا يساوي ' + TOTAL_AYAHS };
    for (var p = 1; p <= TOTAL_PAGES; p++) {
      if (!pages[p]) return { ok: false, reason: 'الصفحة ' + p + ' فارغة' };
    }
    return { ok: true, ayahCount: total };
  }

  /* ==================== الفهرسة ==================== */
  function indexAyahs(flat) {
    M.ayahs = flat;
    M.pages = new Array(TOTAL_PAGES + 1);
    M.juzOfPage = new Array(TOTAL_PAGES + 1);
    for (var i = 0; i < flat.length; i++) {
      var a = flat[i];
      var p = a.page;
      if (!(p >= 1 && p <= TOTAL_PAGES)) continue;
      if (!M.pages[p]) M.pages[p] = [];
      M.pages[p].push(a);
      if (!M.juzOfPage[p]) M.juzOfPage[p] = a.juz || null;
    }
    for (var q = 1; q <= TOTAL_PAGES; q++) if (!M.pages[q]) M.pages[q] = [];

    M.surahFirstPage = new Array(115).fill(0);
    M.surahLastPage = new Array(115).fill(0);
    for (var j = 0; j < flat.length; j++) {
      var b = flat[j];
      var sn = b.surah && b.surah.number;
      if (!sn || sn < 1 || sn > 114) continue;
      if (!M.surahFirstPage[sn]) M.surahFirstPage[sn] = b.page;
      M.surahLastPage[sn] = b.page;
    }
  }

  /* ==================== التحويل إلى الشكل المختصر ==================== */
  function toCompact(surahs) {
    // [[رقم السورة, اسمها, اسمها الإنجليزي, [[رقم الآية في السورة, صفحة, جزء, سجدة, نص], ...]], ...]
    // الاسم من المصدر نفسه (مُشكَّل) ليتطابق رأس السورة مع مسار الشبكة تماماً.
    var out = [];
    for (var i = 0; i < surahs.length; i++) {
      var s = surahs[i];
      var rows = [];
      var ay = s.ayahs || [];
      for (var k = 0; k < ay.length; k++) {
        rows.push([ay[k].numberInSurah, ay[k].page, ay[k].juz, ay[k].sajda ? 1 : 0, ay[k].text]);
      }
      out.push([s.number, s.name, s.englishName, rows]);
    }
    return { v: STORE_VERSION, ts: Date.now(), surahs: out };
  }

  function fromCompact(blob) {
    if (!blob || blob.v !== STORE_VERSION || !Array.isArray(blob.surahs)) return null;
    var flat = [];
    for (var i = 0; i < blob.surahs.length; i++) {
      var entry = blob.surahs[i];
      var sn = entry[0];
      var nm = entry[1];
      var en = entry[2];
      var rows = entry[3] || [];
      var meta = M.surahMeta[sn] || { number: sn, name: 'سورة ' + sn, englishName: '', numberOfAyahs: rows.length };
      var surahObj = { number: sn, name: nm || meta.name, englishName: en || meta.englishName };
      for (var r = 0; r < rows.length; r++) {
        var row = rows[r];
        flat.push({
          number: flat.length + 1,
          numberInSurah: row[0],
          page: row[1],
          juz: row[2],
          sajda: !!row[3],
          text: row[4],
          surah: surahObj
        });
      }
    }
    return flat.length ? flat : null;
  }

  function loadSurahMeta() {
    M.surahMeta = {};
    var list = (typeof window !== 'undefined' && window.SURAH_META) || null;
    for (var i = 0; list && i < list.length; i++) {
      M.surahMeta[list[i].number] = list[i];
    }
  }

  /* ==================== الحالة (للواجهة) ==================== */
  function getStatus() {
    try { return JSON.parse(lsGet(STATUS_KEY)) || { state: 'none' }; }
    catch (e) { return { state: 'none' }; }
  }
  function setStatus(st) { lsSet(STATUS_KEY, JSON.stringify(st)); emit('status', st); }
  M.getStatus = getStatus;

  /* ==================== التحميل من التخزين المحلي ==================== */
  function loadFromLocal() {
    var raw = lsGet(STORE_KEY);
    if (raw) {
      // احتياط localStorage فقط (التصفّح الخاص): تحقّق ثم استخدم
      try {
        var parsed = JSON.parse(raw);
        var flat = fromCompact(parsed);
        if (flat && flat.length === TOTAL_AYAHS) {
          indexAyahs(flat); M.source = 'local'; return true;
        }
      } catch (e) {}
    }
    return false;
  }

  function loadFromIDB() {
    return dbGet('payload').then(function (blob) {
      if (!blob) return false;
      var flat = fromCompact(blob);
      if (!flat || flat.length !== TOTAL_AYAHS) return false;
      indexAyahs(flat);
      M.source = 'local';
      return true;
    }).catch(function () { return false; });
  }

  /* ==================== التنزيل من الشبكة ==================== */
  /* تنزيل تدفّقي مع نسبة تقدّم وإلغاء. يعيد Promise يُحلّ عند اكتمال
     التخزين، ويُرفض عند الفشل أو الإلغاء. */
  M.download = function (opts) {
    opts = opts || {};
    if (M._abort) return Promise.reject(new Error('تنزيل جارٍ بالفعل'));
    var abort = new AbortController();
    M._abort = abort;
    setStatus({ state: 'downloading', bytes: 0, total: 0, ts: Date.now() });

    var onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : function () {};
    var received = 0;

    return fetch(API_FULL, { signal: abort.signal })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        var total = Number(res.headers.get('content-length')) || 0;
        if (!res.body || typeof res.body.getReader !== 'function') return res.json();
        // قراءة تدفّقية لتحديث نسبة التقدّم فعلياً
        var reader = res.body.getReader();
        var chunks = [];
        var decoder = new TextDecoder('utf-8');
        var text = '';
        function pump() {
          return reader.read().then(function (r) {
            if (r.done) return text + decoder.decode();
            var chunk = r.value;
            received += chunk.length;
            text += decoder.decode(chunk, { stream: true });
            onProgress({ bytes: received, total: total });
            setStatus({ state: 'downloading', bytes: received, total: total, ts: Date.now() });
            return pump();
          });
        }
        return pump().then(function (t) { return JSON.parse(t); });
      })
      .then(function (json) {
        var surahs = json && json.data && json.data.surahs;
        var check = verifyPayload(surahs);
        if (!check.ok) throw new Error('فحص السلامة فشل: ' + check.reason);

        // خزّن النسخة الجديدة — القديمة تبقى صالحة حتى تلتزم هذه
        var compact = toCompact(surahs);
        loadSurahMeta();
        var flat = [];
        for (var i = 0; i < surahs.length; i++) {
          var s = surahs[i];
          var surahObj = { number: s.number, name: s.name, englishName: s.englishName };
          var ay = s.ayahs || [];
          for (var k = 0; k < ay.length; k++) {
            flat.push({
              number: flat.length + 1,
              numberInSurah: ay[k].numberInSurah,
              page: ay[k].page,
              juz: ay[k].juz,
              sajda: !!ay[k].sajda,
              text: ay[k].text,
              surah: surahObj
            });
          }
        }
        indexAyahs(flat);
        var meta = { v: STORE_VERSION, ts: Date.now(), ayahCount: check.ayahCount, bytes: received, source: API_FULL };

        return dbPutBoth(meta, compact).then(function (idbOk) {
          if (!idbOk) {
            // احتياط localStorage فقط (لا يتوفر IndexedDB)
            if (!lsSet(STORE_KEY, JSON.stringify(compact)))
              throw new Error('تعذّر تخزين المصحف (الذاكرة غير متاحة)');
          }
          M.source = 'network';
          M.ready = true;
          setStatus({ state: 'ready', ts: meta.ts, bytes: received, ayahs: check.ayahCount, storage: idbOk ? 'idb' : 'ls' });
          emit('data');
          return true;
        });
      })
      .catch(function (err) {
        if (err && err.name === 'AbortError') {
          setStatus({ state: 'none', cancelled: true });
          throw new Error('cancelled');
        }
        setStatus({ state: 'error', error: String(err && err.message || err), ts: Date.now() });
        throw err;
      })
      .then(function (r) { M._abort = null; return r; },
            function (e) { M._abort = null; throw e; });
  };

  M.cancelDownload = function () {
    if (M._abort) { try { M._abort.abort(); } catch (e) {} }
  };

  M.erase = function () {
    return dbClear().then(function () {
      lsDel(STORE_KEY);
      lsDel(STATUS_KEY);
      M.ready = false; M.source = ''; M.ayahs = []; M.pages = [];
      emit('data');   // الواجهة تقرأ الحالة فتُعيد الرسم إلى «غير منزَّل»
      return true;
    });
  };

  /* load(): الحَمْل الأول — يقرأ المخبأ المحلي فوراً إن وُجد.
     إن لم يوجد يبقى التطبيق يعمل على الشبكة (لا تنزيل تلقائي:
     المستخدم يختار تنزيل القرآن كاملاً من الإعدادات). */
  M.load = function (opts) {
    opts = opts || {};
    if (M.ready) return Promise.resolve(true);
    if (M._loadPromise) return M._loadPromise;

    loadSurahMeta();
    M._loadPromise = loadFromIDB().then(function (ok) {
      if (!ok) ok = loadFromLocal();
      if (ok) { M.ready = true; emit('data'); return true; }
      M._loadPromise = null;
      return false;
    }).catch(function () { M._loadPromise = null; return false; });
    return M._loadPromise;
  };

  /* إعادة الجلب القسري من الشبكة (زر إعادة المحاولة) */
  M.reload = function () {
    M.ready = false; M.source = ''; M.ayahs = []; M.pages = [];
    return M.download();
  };

  /* ==================== استعلامات ==================== */
  M.pageAyahs = function (n) {
    n = Math.max(1, Math.min(TOTAL_PAGES, n | 0));
    return M.pages[n] || [];
  };
  M.clampPage = function (n) { return Math.max(1, Math.min(TOTAL_PAGES, n | 0)); };
  M.firstPageOfSurah = function (n) { return M.surahFirstPage[n] || 1; };
  M.pageOfAyah = function (globalNo) {
    var a = M.ayahs[(globalNo | 0) - 1];
    return a ? a.page : 0;
  };
  M.juzOf = function (n) { return M.juzOfPage[M.clampPage(n)] || null; };
  M.surahMetaOf = function (n) { return M.surahMeta[n] || null; };
  M.isValidPage = function (n) { n = n | 0; return n >= 1 && n <= TOTAL_PAGES; };

  /* الآيات مقسّمة إلى كتل متتالية لكل سورة داخل الصفحة — لرؤوس السور */
  M.surahRunsOnPage = function (n) {
    var ayahs = M.pageAyahs(n);
    var runs = [];
    for (var i = 0; i < ayahs.length; i++) {
      var sn = ayahs[i].surah.number;
      if (!runs.length || runs[runs.length - 1].surahNumber !== sn) {
        runs.push({ surahNumber: sn, startIndex: i, ayahs: [] });
      }
      runs[runs.length - 1].ayahs.push(ayahs[i]);
    }
    return runs;
  };

  /* ==================== الأحداث ==================== */
  M.on = function (fn) { if (typeof fn === 'function') M._listeners.push(fn); return fn; };
  M.off = function (fn) {
    var i = M._listeners.indexOf(fn);
    if (i >= 0) M._listeners.splice(i, 1);
  };
  function emit(type, payload) {
    for (var i = 0; i < M._listeners.length; i++) {
      try { M._listeners[i](type, payload); } catch (e) { /* لا تُسقط مستمعاً واحداً البقية */ }
    }
  }
  M.emit = emit;

  /* ==================== بناء HTML صفحة واحدة ==================== */
  /* opts: { showLabel, surahHeader, bismillah, pageNo } */
  M.pageHTML = function (pageNum, opts) {
    opts = opts || {};
    var n = M.clampPage(pageNum);
    var runs = M.surahRunsOnPage(n);
    var html = '';
    // مولّد الآيات المشترك في index.html؛ احتياط آمن (نص مُهرّب) إن لم يُحمَّل بعد
    var build = (typeof window.buildMushafHTML === 'function') ? window.buildMushafHTML : function (ayahs) {
      return (ayahs || []).map(function (a) { return '<span class="ayah">' + escapeHtml(a.text) + '</span> '; }).join('');
    };

    if (opts.showLabel !== false) {
      var juz = M.juzOf(n);
      html += '<div class="mushaf-page-label">صفحة ' + toArabicNum(n) + (juz ? ' — الجزء ' + toArabicNum(juz) : '') + '</div>';
    }
    if (!runs.length) {
      html += '<div class="mushaf-block" data-page="' + n + '"></div>';
      return html;
    }
    for (var i = 0; i < runs.length; i++) {
      var run = runs[i];
      var meta = M.surahMetaOf(run.surahNumber);
      // اسم السورة من المصدر نفسه أولاً (مُشكَّل)، ثم الفهرس المحلي
      var name = (run.ayahs[0].surah && run.ayahs[0].surah.name)
        || (meta && meta.name) || ('سورة ' + run.surahNumber);
      // نفس منطق مسار الشبكة في loadKhatmahPage: الرأس للسورة الأولى يظهر
      // إن بدأت الصفحة بها، ولأي سورة تليها داخل الصفحة يظهر دائماً.
      var startsHere = run.ayahs[0].numberInSurah === 1;
      if (opts.surahHeader !== false && (startsHere || i > 0)) {
        html += '<div class="surah-header-card"><div class="surah-h-name">' + escapeHtml(name) + '</div></div>';
      }
      if (startsHere && run.surahNumber !== 1 && run.surahNumber !== 9) {
        html += '<div class="bismillah">بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ</div>';
      }
      html += '<div class="mushaf-block" data-page="' + n + '" data-surah="' + run.surahNumber + '">'
        + build(run.ayahs, { surahNumber: run.surahNumber })
        + '</div>';
    }
    return html;
  };

  /* ==================== أدوات مشتركة ==================== */
  function toArabicNum(n) { return String(n).replace(/\d/g, function (d) { return '٠١٢٣٤٥٦٧٨٩'[d]; }); }
  function escapeHtml(s) {
    if (window.escapeHtml) return window.escapeHtml(s);
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }
  M.toArabicNum = toArabicNum;

  /* ==================== الرسم داخل الحاوية الحالية ==================== */
  M.renderInto = function (container, pageNum, opts) {
    opts = opts || {};
    container.innerHTML = M.pageHTML(pageNum, opts);
    if (window.AudioPlayer && AudioPlayer.refreshHighlight) AudioPlayer.refreshHighlight();
    if (window.AnimationManager && AnimationManager.observeReveal) AnimationManager.observeReveal();
  };

  M.renderErrorInto = function (container, message) {
    container.innerHTML = '<div style="text-align:center; padding:20px;">' + escapeHtml(message || 'خطأ في التحميل. تأكد من الإنترنت.')
      + '<br><button class="btn-scale" style="margin-top:15px; width:auto; padding:10px 20px;" onclick="window.MushafPageManager.retryRender()">إعادة المحاولة 🔄</button></div>';
  };

  /* ==================== التنقّل بين الصفحات ==================== */
  M.renderFn = null;
  M.setRenderer = function (fn) { M.renderFn = fn; };

  M.setPage = function (n) {
    var c = M.clampPage(n);
    M.currentPage = c;
    emit('page', c);
    return c;
  };
  M.moveBy = function (dir) {
    var c = M.setPage(M.currentPage + dir);
    if (M.renderFn) M.renderFn(c);
    return c;
  };
  M.gotoPage = function (n) {
    var c = M.setPage(n);
    if (M.renderFn) M.renderFn(c);
    return c;
  };
  M.retryRender = function () {
    if (!M.renderFn) return;
    M.reload()
      .then(function () { M.renderFn(M.currentPage, { retry: true }); })
      .catch(function () { M.renderFn(M.currentPage, { failed: true }); });
  };

  window.MushafPageManager = M;
  window.MushafTotalPages = TOTAL_PAGES;
})();
