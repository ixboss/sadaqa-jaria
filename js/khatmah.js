/* khatmah.js — دورة حياة الختمة، الورد اليومي، التقدّم — مُستخرج من index.html المونوليثي (v1.0.0 refactor) */

function updateKhatmahUI() {
  if (!state.khatmah || !state.khatmah.active) {
    document.getElementById('khatmah-setup').style.display = 'block'; document.getElementById('khatmah-dash').style.display = 'none';
  } else {
    document.getElementById('khatmah-setup').style.display = 'none'; document.getElementById('khatmah-dash').style.display = 'block';
    const start = state.khatmah.todayWirdStart; const end = state.khatmah.todayWirdEnd;
    document.getElementById('kd-start-badge').textContent = toArabicNum(start);
    document.getElementById('kd-end-badge').textContent = toArabicNum(end);
    // أظهر طريقة الختمة (عدد الأيام إن اختيرت) ليعكس الورد الصحيح
    const startLabel = document.querySelector('#kd-start-badge');
    if (startLabel && state.khatmah.totalDays) {
      startLabel.parentElement.parentElement.title = `ختمة في ${toArabicNum(state.khatmah.totalDays)} يوم — ${toArabicNum(state.khatmah.pagesPerDay)} صفحة يومياً`;
    }
    document.getElementById('kd-last').textContent = toArabicNum(state.khatmah.lastPageRead || start - 1);
    const intBadge = document.getElementById('kd-intention-badge');
    if (intBadge) {
      if (state.khatmah.intention) {
        intBadge.textContent = `🤲 النية: ${state.khatmah.intention}`;
        intBadge.classList.add('visible');
      } else {
        intBadge.textContent = '';
        intBadge.classList.remove('visible');
      }
    }

    const progPct = Math.min(Math.round(((state.khatmah.lastPageRead || 0) / 604) * 100), 100);
    document.getElementById('kd-prog-txt').textContent = `${toArabicNum(progPct)}%`;
    document.getElementById('kd-prog-circle').style.strokeDasharray = `${progPct}, 100`;

    const ring = document.getElementById('khatmah-ring');
    if(progPct === 100) ring.classList.add('pulse-success'); else ring.classList.remove('pulse-success');

    const isDoneToday = (state.khatmah.lastPageRead >= end);
    const dashInfo = document.querySelector('.k-dash-info'); let msg = document.getElementById('k-done-msg');

    if (isDoneToday) {
        if (!msg) {
            msg = document.createElement('div'); msg.id = 'k-done-msg';
            msg.style = 'margin-top:12px; color:var(--success); font-weight:bold; font-size:calc(var(--font-size) * 0.5); text-align:center; background:rgba(76,175,125,0.1); padding:8px; border-radius:6px; border: 1px dashed var(--success);';
            msg.textContent = '🎉 لقد أتممت ورد اليوم بنجاح!'; dashInfo.appendChild(msg);
        }
    } else if (msg) { msg.remove(); }

    const resumeBtn = document.querySelector('#khatmah-dash button[onclick="openKhatmahReader()"]');
    if (resumeBtn) { resumeBtn.innerHTML = isDoneToday ? 'قراءة المزيد (إضافي) 📖' : 'متابعة القراءة 📖'; }
  }
}

window.startKhatmah = function() {
  let val = parseInt(document.getElementById('k-val').value, 10); if (isNaN(val) || val <= 0) val = 20;
  let startPage = parseInt(document.getElementById('k-start').value, 10) || 1;
  startPage = Math.min(604, Math.max(1, startPage));
  const method = (document.getElementById('k-method') || {}).value || 'pages';
  let pagesPerDay = val;
  let totalDays = null;
  // طريقة "بعدد الأيام": احسب عدد الصفحات اليومية من عدد الأيام المتبقية
  if (method === 'days') {
    totalDays = val;
    const remaining = Math.max(1, 604 - startPage + 1);
    pagesPerDay = Math.max(1, Math.ceil(remaining / totalDays));
  }
  const intention = (document.getElementById('k-intention')?.value || '').trim().slice(0, 80);
  state.khatmah = { active: true, method, totalDays, pagesPerDay, intention, currentPage: startPage, todayWirdStart: startPage, todayWirdEnd: Math.min(startPage + pagesPerDay - 1, 604), lastPageRead: startPage > 1 ? startPage - 1 : 0, lastActiveDate: getLocalToday() };
  saveState(); updateKhatmahUI();
}
window.showKhatmDua = function() {
  const duaText = `اللَّهُمَّ ارْحَمْنِي بِالْقُرْآنِ وَاجْعَلْهُ لِي إِمَامًا وَنُورًا وَهُدًى وَرَحْمَةً،
اللَّهُمَّ ذَكِّرْنِي مِنْهُ مَا نُسِّيتُ وَعَلِّمْنِي مِنْهُ مَا جَهِلْتُ وَارْزُقْنِي تِلَاوَتَهُ آنَاءَ اللَّيْلِ وَأَطْرَافَ النَّهَارِ وَاجْعَلْهُ لِي حُجَّةً يَا رَبَّ الْعَالَمِينَ.

اللَّهُمَّ أَصْلِحْ لِي دِينِي الَّذِي هُوَ عِصْمَةُ أَمْرِي، وَأَصْلِحْ لِي دُنْيَايَ الَّتِي فِيهَا مَعَاشِي، وَأَصْلِحْ لِي آخِرَتِي الَّتِي فِيهَا مَعَادِي، وَاجْعَلِ الْحَيَاةَ زِيَادَةً لِي فِي كُلِّ خَيْرٍ، وَاجْعَلِ الْمَوْتَ رَاحَةً لِي مِنْ كُلِّ شَرٍّ.

اللَّهُمَّ اجْعَلْ خَيْرَ عُمْرِي آخِرَهُ، وَخَيْرَ عَمَلِي خَوَاتِيمَهُ، وَخَيْرَ أَيَّامِي يَوْمَ أَلْقَاكَ فِيهِ.`;
  if (window.BottomSheet) {
    const sh = BottomSheet.open({
      title: '🤲 دعاء ختم القرآن الكريم',
      customHTML: `<div class="tafsir-sheet-body" style="max-height:52vh; white-space:pre-line; font-family:'Amiri Quran','Amiri',serif; font-size:calc(var(--font-size)*0.72)">${escHtml(duaText)}</div>
        <div class="tafsir-sheet-actions">
          <button type="button" class="settings-chip" id="khatm-dua-copy">⧉ نسخ الدعاء</button>
          <button type="button" class="settings-chip" id="khatm-dua-card">🖼 مشاركة كبطاقة</button>
        </div>`
    });
    sh.querySelector('#khatm-dua-copy')?.addEventListener('click', async () => {
      const ok = await copyTextToClipboard(duaText);
      Toast.show(ok ? 'تم نسخ دعاء الختم ✓' : 'تعذّر النسخ');
    });
    sh.querySelector('#khatm-dua-card')?.addEventListener('click', () => {
      BottomSheet.close();
      if (window.ShareCardGenerator) ShareCardGenerator.share({ badge: 'دعاء ختم القرآن الكريم', text: duaText });
    });
  } else if (window.showAppDialog) {
    window.showAppDialog(escHtml(duaText).replace(/\n/g, '<br>'), false);
  }
};
window.resetKhatmah = async function() {
  const confirmed = await window.showAppDialog('هل تريد بالفعل إنشاء ختمة جديدة وإلغاء الختمة الحالية؟', true);
  if(confirmed) { state.khatmah = null; saveState(); updateKhatmahUI(); }
}

// معالجة الأيام الفائتة: إذا فات المستخدم يوم أو أكثر، يُعاد جدولة الورد
function checkMissedDays() {
  if (!state.khatmah || !state.khatmah.active) return;
  const last = state.khatmah.lastActiveDate;
  if (!last || last === getLocalToday()) return;
  // أعد الجدولة من حيث توقف
  const cont = Math.max(state.khatmah.lastPageRead + 1, state.khatmah.todayWirdStart);
  state.khatmah.todayWirdStart = Math.min(cont, 604);
  state.khatmah.todayWirdEnd = Math.min(state.khatmah.todayWirdStart + state.khatmah.pagesPerDay - 1, 604);
  state.khatmah.currentPage = state.khatmah.todayWirdStart;
  state.khatmah.lastActiveDate = getLocalToday();
  saveState();
}

window.openKhatmahReader = function() { showScreen('khatmah-read', 'slide-left'); loadKhatmahPage(state.khatmah.currentPage); }

async function loadKhatmahPage(pageNum) {
  // مسار بيانات موحّد: المصحف المحلّى المحلّي أولاً ثم مخبأ الصفحة ثم الشبكة
  await renderMushafPage(pageNum, { surahHeader: true });

  // التقدّم المحفوظ لا يتراجع: سُجِّل أبعد صفحة وُصل إليها، لا آخر صفحة عُرضت.
  // الرجوع لصفحة سابقة لإعادة القراءة يجب ألّا يمحو ما تحقق.
  state.khatmah.lastPageRead = Math.max(state.khatmah.lastPageRead || 0, pageNum);
  state.khatmah.currentPage = pageNum;
  saveState(); updateKhatmahUI(); updateHeaderSubtitle();
  renderWirdChrome();
}

// شريط ورد الختمة + مسار النطاق + زر الإتمام داخل القارئ الموحّد.
// تُستدعى عند فتح الصفحة وعند أي تغيير للشاشة حتى لا يبقى شيء منها معلّقاً.
function renderWirdChrome() {
  const k = state.khatmah;
  const isKhatmah = state.mushafMode === 'khatmah-read' && !!(k && k.active);
  const banner = document.getElementById('mushaf-wird-banner');
  const ghostWird = document.getElementById('mushaf-ghost-wird');
  const fab = document.getElementById('mushaf-wird-fab');
  if (banner) banner.classList.toggle('visible', isKhatmah);
  if (ghostWird) ghostWird.classList.toggle('visible', isKhatmah);
  const container = document.getElementById('reading-progress-container');
  if (container) container.classList.toggle('wird-mode', isKhatmah);
  if (!isKhatmah) {
    if (fab) fab.classList.remove('visible');
    if (ghostWird) ghostWird.textContent = '';
    return;
  }
  const s = k.todayWirdStart || 1, e = k.todayWirdEnd || s, cur = k.currentPage || s;
  const remain = Math.max(0, e - cur);
  const range = document.getElementById('mwb-range');
  if (range) range.textContent = `صفحات ${toArabicNum(s)} – ${toArabicNum(e)}`;
  const rem = document.getElementById('mwb-remain');
  if (rem) rem.textContent = remain > 0 ? `${toArabicNum(remain)} صفحة متبقية` : 'أتممت ورد اليوم ✓';
  if (ghostWird) {
    ghostWird.textContent = remain > 0
      ? `ورد ${toArabicNum(s)}–${toArabicNum(e)} • باقي ${toArabicNum(remain)}`
      : `ورد ${toArabicNum(s)}–${toArabicNum(e)} ✓`;
  }
  if (fab) fab.classList.toggle('visible', cur >= e);
  // مسار النطاق: النسبة من ٦٠٤ صفحة
  const r = document.getElementById('wird-range');
  if (r) { r.style.left = (s / 604 * 100).toFixed(2) + '%'; r.style.width = ((e - s + 1) / 604 * 100).toFixed(2) + '%'; }
  const cursor = document.getElementById('wird-cursor');
  if (cursor) cursor.style.left = (Math.min(cur, 604) / 604 * 100).toFixed(2) + '%';
  renderWirdDots();
}

// نقاط المرجعيات على مسار الورد: صفحات تحوي آية محفوظة
function renderWirdDots() {
  const dots = document.getElementById('wird-dots');
  if (!dots) return;
  dots.innerHTML = '';
  const M = window.MushafPageManager;
  if (!M || !window.BookmarkManager) return;
  let verses = [];
  try { verses = BookmarkManager.getAll().verses || []; } catch (e) { return; }
  // الرقم العالمي للآية = مجموع آيات السور السابقة + رقمها داخل سورتها
  const list = window.allSurahs || [];
  for (const v of verses) {
    let g = 0;
    for (let i = 0; i < v.surah - 1 && i < list.length; i++) g += list[i].numberOfAyahs || 0;
    g += v.ayah || 0;
    let p = 0;
    if (M.ayahs && M.ayahs.length) p = M.pageOfAyah(g) || 0;   // فهرس المصحف الكامل إن توفر
    if (!p) {
      // وإلا فابحث في الصفحات المحمّلة فعلاً
      for (let q = 1; q <= 604; q++) {
        const arr = M.pages[q];
        if (arr && arr.some(a => a.number === g)) { p = q; break; }
      }
    }
    if (p > 0) {
      const d = document.createElement('i');
      d.className = 'wird-dot';
      d.style.left = (p / 604 * 100).toFixed(2) + '%';
      dots.appendChild(d);
    }
  }
}

window.changeKhatmahPage = function(dir) {
  // القارئ الموحّد يتولّى التنقّل (قلب الصفحة أو الأزرار) — المسار واحد لكلا القارئين
  if (!state.khatmah) return;
  gotoMushafPage((state.khatmah.currentPage || 1) + dir);
};

window.completeWird = async function() {
  const nx = Math.max(state.khatmah.todayWirdEnd, state.khatmah.lastPageRead) + 1;
  // تسجيل القراءة في الإحصائيات
  if (window.StatsManager) {
    const pagesRead = Math.max(1, (state.khatmah.lastPageRead || nx - 1) - (state.khatmah.todayWirdStart || nx - 1) + 1);
    StatsManager.recordRead(pagesRead);
  }
  if (nx > 604) {
      const finishedIntention = state.khatmah.intention || '';
      if (window.StatsManager && StatsManager.recordKhatmah) StatsManager.recordKhatmah(finishedIntention);
      window.Celebrate ? Celebrate(null, { confetti: 120, burst: 0, ring: false }) : Motion.confetti(120);
      await new Promise(r => setTimeout(r, 300));
      const intLine = finishedIntention ? `<br><span style="font-size:calc(var(--font-size) * 0.56); color:var(--accent)">النية: ${escHtml(finishedIntention)}</span>` : '';
      await window.showAppDialog(`مبارك عليك ختم القرآن الكريم! 🤲${intLine}<br><span style="font-size:calc(var(--font-size) * 0.54); font-weight:normal; color:var(--text-dim)">تقبل الله منك صالح الأعمال، وسُجّلت الختمة في إحصائياتك.</span>`, false);
      state.khatmah = null; saveState(); navigateBack();
  } else {
      // احتفال صغير بإتمام الورد
      if (window.Celebrate) Celebrate(null, { confetti: 30, burst: 0, ring: false, haptic: true });
      await new Promise(r => setTimeout(r, 100));
      state.khatmah.currentPage = nx; state.khatmah.todayWirdStart = nx; state.khatmah.todayWirdEnd = Math.min(nx + state.khatmah.pagesPerDay - 1, 604);
      state.khatmah.lastPageRead = nx - 1; state.khatmah.lastActiveDate = getLocalToday(); saveState(); navigateBack();
  }
}
