/* tafsir.js — التفسير الميسّر للآيات (مُستخرج ومرقّى من features.js)
 * تخزين على مستوى السورة في IndexedDB: تُجلب السورة كاملة (ar.muyassar) مرة
 * واحدة، ثم تعمل القراءة اللاحقة 100٪ أوفلاين بلا اعتماد على الشبكة.
 */
'use strict';

const TafsirManager = (() => {
  const DB_NAME = 'tafsir-muyassar';
  const DB_VERSION = 1;
  const STORE = 'surahs';
  let dbPromise = null;

  function openDB() {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        try {
          const req = indexedDB.open(DB_NAME, DB_VERSION);
          req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE); };
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        } catch (e) { reject(e); }
      });
    }
    return dbPromise;
  }

  function idbGet(surahNo) {
    return openDB().then((db) => new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(surahNo);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    })).catch(() => null);
  }

  function idbSet(surahNo, verses) {
    return openDB().then((db) => new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(verses, surahNo);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    })).catch(() => false);
  }

  function fetchWithTimeout(url, ms = 7000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    return fetch(url, { signal: controller.signal }).finally(() => clearTimeout(timer));
  }

  // جلب تفسير سورة كاملة (خريطة: رقم الآية داخل السورة → نص التفسير)
  async function fetchSurahTafsir(surahNo) {
    try {
      const res = await fetchWithTimeout(`https://api.alquran.cloud/v1/surah/${surahNo}/ar.muyassar`);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const json = await res.json();
      const ayahs = json && json.data && json.data.ayahs;
      if (!Array.isArray(ayahs)) return null;
      const map = {};
      for (const a of ayahs) map[a.numberInSurah] = String(a.text || '').trim();
      if (Object.keys(map).length) await idbSet(surahNo, map);
      return map;
    } catch (e) { return null; }
  }

  async function getAyahTafsir(surahNo, ayahNo) {
    const cached = await idbGet(surahNo);
    if (cached && cached[ayahNo]) return cached[ayahNo];
    const fresh = cached || await fetchSurahTafsir(surahNo);
    if (fresh && fresh[ayahNo]) return fresh[ayahNo];
    // احتياط: جلب آية مفردة عند فشل مستوى السورة (بلا تخزين جزئي)
    try {
      const globalNo = null; // يُحسب من SURAH_META في openForAyah عند الحاجة
      void globalNo;
      return null;
    } catch (e) { return null; }
  }

  async function openForAyah(ayahData) {
    if (!ayahData || !window.BottomSheet) return;
    const surahMeta = (window.SURAH_META || []).find(s => s.number === ayahData.surah);
    const surahName = surahMeta ? surahMeta.name : ((window.state && window.state.currentSurah && window.state.currentSurah.name) || `سورة ${ayahData.surah}`);
    const arNum = window.toArabicNum ? window.toArabicNum(ayahData.ayah) : ayahData.ayah;
    const title = `التفسير الميسّر — ${surahName} (${arNum})`;

    const sh = window.BottomSheet.open({
      title,
      customHTML: `
        <div class="tafsir-sheet-ayah">﴿ ${window.escapeHtml(ayahData.text)} ﴾</div>
        <div class="tafsir-sheet-body" id="tafsir-sheet-body"><div class="skeleton sk-text"></div><div class="skeleton sk-text short"></div></div>
        <div class="tafsir-sheet-actions">
          <button type="button" class="settings-chip" id="tafsir-copy-btn">⧉ نسخ الآية والتفسير</button>
          <button type="button" class="settings-chip" id="tafsir-card-btn">🖼 مشاركة كبطاقة</button>
        </div>`
    });

    let tafsirText = await getAyahTafsir(ayahData.surah, ayahData.ayah);
    // احتياط أخير: نقطة النهاية للآية المفردة ثم تخزينها ضمن خريطة السورة
    if (!tafsirText && ayahData.global) {
      try {
        const res = await fetchWithTimeout(`https://api.alquran.cloud/v1/ayah/${ayahData.global}/ar.muyassar`);
        if (res.ok) {
          const json = await res.json();
          const text = json && json.data && json.data.text ? String(json.data.text).trim() : null;
          if (text) {
            tafsirText = text;
            const map = (await idbGet(ayahData.surah)) || {};
            map[ayahData.ayah] = text;
            await idbSet(ayahData.surah, map);
          }
        }
      } catch (e) { /* أوفلاين */ }
    }

    const bodyEl = sh.querySelector('#tafsir-sheet-body');
    if (!bodyEl) return;
    // نص فارغ/فراغات فقط (آية ٢٨:٣٤ في المصدر) → رسالة صريحة بدل بطاقة بيضاء
    // — لا يُخترع نص بديل للمحتوى الديني (audit 2026-11)
    if (tafsirText && String(tafsirText).trim().length > 0) bodyEl.textContent = tafsirText;
    else if (tafsirText) bodyEl.textContent = 'التفسير غير متوفر لهذه الآية (فراغ في بيانات المصدر).';
    else bodyEl.textContent = 'تعذّر تحميل التفسير حالياً. تأكد من اتصالك بالإنترنت عند أول قراءة لتخزينه تلقائياً.';

    sh.querySelector('#tafsir-copy-btn')?.addEventListener('click', async () => {
      const full = `﴿ ${ayahData.text} ﴾\n[${surahName}: ${arNum}]\n\n📖 التفسير الميسّر:\n${tafsirText || ''}`;
      if (window.copyTextToClipboard) {
        const ok = await window.copyTextToClipboard(full);
        if (window.Toast) Toast.show(ok ? 'تم نسخ الآية والتفسير ✓' : 'تعذّر النسخ');
      }
    });

    sh.querySelector('#tafsir-card-btn')?.addEventListener('click', () => {
      window.BottomSheet.close();
      if (window.ShareCardGenerator) {
        window.ShareCardGenerator.share({
          badge: `${surahName} — آية ${arNum}`,
          text: `﴿ ${ayahData.text} ﴾`,
          subtext: tafsirText ? `التفسير الميسّر: ${tafsirText}` : ''
        });
      }
    });
  }

  // تسخين مسبق (اختياري): تخزين تفسير سورة قبل فتحها
  function precacheSurah(surahNo) { return idbGet(surahNo).then(c => c ? true : fetchSurahTafsir(surahNo).then(m => !!m)); }

  return { openForAyah, getAyahTafsir, precacheSurah };
})();
window.TafsirManager = TafsirManager;
