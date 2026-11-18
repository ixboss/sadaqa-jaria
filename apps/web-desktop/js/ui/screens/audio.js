// ============================================================================
// audio.js — offline recitation packs + real player (Phase 4). Catalog of 18
// LIVE-verified reciters (EveryAyah) drives downloads; starter pack (Al-Fatiha
// · Alafasy) is bundled and plays offline immediately. Per-ayah files with
// next-ayah preloading; ayah-level highlight fallback (word segments land with
// a future QUL pack — documented degradation, ARCHITECTURE §7.3).
// ============================================================================
import { state, haptic, HAPTICS, nowMs, saveSetting } from '../../app-state.js';
import { navigate } from '../router.js';
import { iconSvg } from '../icons.js';
import { loadCatalog, syncReciters, downloadSurahPack, getAyahAudio, catalogFor } from '../../data/audio-catalog.js';

// ---------------------------------------------------------------------------
// global player (miniplayer lives outside #screen-root)
// ---------------------------------------------------------------------------
const player = { audio: null, nextPreload: null, nextBlobUrl: null, reciterId: null, surah: null, ayah: null, playing: false, blobUrl: null, session: 0 };

function miniplayerShow(title, sub) {
  const el = document.getElementById('miniplayer');
  el.classList.add('visible');
  el.innerHTML = `
    <div class="track"><div class="t1">${title}</div><div class="t2">${sub}</div></div>
    <button class="pbtn" id="mp-toggle" aria-label="تشغيل/إيقاف">${iconSvg(player.playing ? 'pause' : 'play', 15)}</button>
    <button class="pbtn" id="mp-stop" style="background:var(--color-surface-raised);color:var(--color-text-primary)" aria-label="إيقاف الكل">${iconSvg('stop', 14)}</button>`;
  el.querySelector('#mp-toggle').addEventListener('click', () => togglePlay());
  el.querySelector('#mp-stop').addEventListener('click', () => stopPlayback());
}

export function miniplayerHide() {
  const el = document.getElementById('miniplayer');
  el.classList.remove('visible');
  el.innerHTML = '';
}

export async function togglePlay() {
  if (!player.audio) return;
  if (player.playing) { player.audio.pause(); player.playing = false; }
  else { player.audio.play(); player.playing = true; }
  const t = document.getElementById('mp-toggle');
  if (t) t.innerHTML = iconSvg(player.playing ? 'pause' : 'play', 15);
}

export function stopPlayback() {
  player.session++;
  player.audio?.pause();
  player.audio = null;
  player.nextPreload?.pause?.();
  player.nextPreload = null;
  if (player.blobUrl) { URL.revokeObjectURL(player.blobUrl); player.blobUrl = null; }
  if (player.nextBlobUrl) { URL.revokeObjectURL(player.nextBlobUrl); player.nextBlobUrl = null; }
  player.playing = false;
  player.surah = null;
  miniplayerHide();
  haptic([10]);
}

async function playAyah(reciterId, surah, ayah) {
  const session = ++player.session;
  const s = await state.db.queryOne(`SELECT ayah_count, name_ar FROM surahs WHERE number = ?`, [surah]);
  if (session !== player.session || !s) return;
  const src = await getAyahAudio(reciterId, surah, ayah);
  if (session !== player.session) return;

  if (player.blobUrl) { URL.revokeObjectURL(player.blobUrl); player.blobUrl = null; }
  if (player.nextBlobUrl) { URL.revokeObjectURL(player.nextBlobUrl); player.nextBlobUrl = null; }
  player.nextPreload = null;
  player.audio?.pause();
  player.reciterId = reciterId;
  player.surah = surah;
  player.ayah = ayah;
  if (src.blob) {
    player.blobUrl = URL.createObjectURL(src.blob);
    player.audio = new Audio(player.blobUrl);
  } else {
    player.audio = new Audio(src.url); // online fallback (pack not installed)
  }
  player.playing = true;
  miniplayerShow(`${s.name_ar} · آية ${ayah}`, `${catalogFor(reciterId)?.name_ar ?? ''}${src.offline ? ' · دون اتصال' : ' · بث مباشر (الحزمة غير مثبتة)'}`);

  const preloadNext = (curAyah) => {
    if (curAyah >= s.ayah_count) return;
    getAyahAudio(reciterId, surah, curAyah + 1).then((n) => {
      if (session !== player.session || player.ayah !== curAyah) return;
      if (player.nextBlobUrl) { URL.revokeObjectURL(player.nextBlobUrl); player.nextBlobUrl = null; }
      let nextUrl = n.url;
      if (n.blob) {
        player.nextBlobUrl = URL.createObjectURL(n.blob);
        nextUrl = player.nextBlobUrl;
      }
      player.nextPreload = new Audio(nextUrl);
      player.nextPreload.preload = 'auto';
    }).catch(() => {});
  };
  preloadNext(ayah);

  const handleError = () => {
    stopPlayback();
    alert('تعذر تشغيل الآية — ثبّت حزمة السورة من شاشة التلاوة لتشغيلها دون اتصال.');
  };
  const handleEnded = async () => {
    if (session !== player.session) return;
    const curAyah = player.ayah ?? ayah;
    if (player.nextPreload && curAyah < s.ayah_count) {
      const nxt = player.nextPreload;
      const nxtBlob = player.nextBlobUrl;
      player.nextPreload = null;
      player.nextBlobUrl = null;
      if (player.blobUrl) { URL.revokeObjectURL(player.blobUrl); player.blobUrl = null; }
      player.blobUrl = nxtBlob;
      player.audio = nxt;
      player.ayah = curAyah + 1;
      player.playing = true;
      miniplayerShow(`${s.name_ar} · آية ${player.ayah}`, `${catalogFor(reciterId)?.name_ar ?? ''} · دون اتصال`);
      nxt.onended = handleEnded;
      nxt.onerror = handleError;
      preloadNext(player.ayah);
      nxt.play().catch(() => { player.playing = false; });
      return;
    }
    if (curAyah < s.ayah_count) await playAyah(reciterId, surah, curAyah + 1);
    else stopPlayback();
  };
  player.audio.onended = handleEnded;
  player.audio.onerror = handleError;
  await player.audio.play().catch(() => { player.playing = false; });
}

/** Play-from-here entry (ayah sheet). Never silent: no pack → pack manager. */
export async function startPlayback(surah, fromAyah) {
  const reciterId = state.settings.reciter ?? 'alafasy';
  const sp = (await loadCatalog()).starterPack;
  const pack = await state.db.queryOne(
    `SELECT surahs_json FROM audio_packs_state WHERE reciter_id = ? AND scope = 'surah_subset' AND status = 'ready'`, [reciterId]);
  const surahs = new Set(JSON.parse(pack?.surahs_json ?? '[]'));
  const covered = surahs.has(Number(surah)) || (reciterId === sp.reciter_id && sp.surahs.includes(Number(surah)));
  if (!covered) {
    navigate('mushaf-audio', { hint: `${surah}` });
    return false;
  }
  await playAyah(reciterId, surah, fromAyah);
  return true;
}

// ---------------------------------------------------------------------------
// Pack manager screen
// ---------------------------------------------------------------------------
export async function renderAudio(root, args = {}) {
  await syncReciters(state.db);
  const reciters = await state.db.query(`SELECT * FROM reciters ORDER BY name_ar`);
  const packs = await state.db.query(`SELECT * FROM audio_packs_state`);
  const surahs = await state.db.query(`SELECT number, name_ar, ayah_count FROM surahs ORDER BY number`);
  const cat = await loadCatalog();

  root.innerHTML = `
  <div class="screen">
    <div class="screen-header"><h1>التلاوة الصوتية</h1>
      <div class="sub">${cat.reciters.length} قارئاً حقيقياً · التنزيل يبدأ بنقرك فقط · ${args.hint ? `سورة ${args.hint} غير مثبتة — ثبّتها لتشغيلها دون اتصال` : 'يعمل كله دون اتصال بعد التثبيت'}</div></div>
    <div class="card">
      <div class="mode-note">حزمة البداية (الفاتحة — العفاسي) مدمجة مع التطبيق وتعمل دون اتصال فوراً. اختر قارئاً ثم سورة لتنزيلها على جهازك.</div>
    </div>
    <div class="card"><div id="pack-list"></div></div>
  </div>`;

  const list = root.querySelector('#pack-list');
  list.innerHTML = reciters.map((r) => {
    const pack = packs.find((p) => p.reciter_id === r.reciter_id);
    const surahsJson = JSON.parse(pack?.surahs_json ?? '[]');
    const isStarter = r.reciter_id === cat.starterPack.reciter_id;
    const status = pack?.status === 'ready' ? `مثبت: ${surahsJson.length} سورة${isStarter ? ' (+حزمة البداية)' : ''}`
      : pack?.status === 'downloading' ? 'جاري التنزيل…'
      : pack?.status === 'partial' ? 'جزئي — أعد المحاولة' : 'غير مثبت';
    return `<div class="pack-row" data-reciter="${r.reciter_id}">
      <div style="min-width:0">
        <div style="font-weight:600">${r.name_ar}</div>
        <div style="font-size:12px;color:var(--color-text-secondary)">${r.name_en} · ${r.style === 'murattal' ? 'مرتل' : 'مجود'} · ${status}</div>
      </div>
      <div style="display:flex;gap:8px;align-items:center;flex:none">
        <select class="search-input" data-surah-picker="${r.reciter_id}" style="width:150px;padding:8px" aria-label="اختر سورة">
          ${surahs.map((s) => `<option value="${s.number}">${s.number}. ${s.name_ar}</option>`).join('')}
        </select>
        <button class="btn ${pack?.status === 'ready' ? '' : 'primary'}" data-dl="${r.reciter_id}">تنزيل</button>
      </div>
    </div>`;
  }).join('');

  for (const btn of list.querySelectorAll('button[data-dl]')) {
    btn.addEventListener('click', async () => {
      const reciterId = btn.dataset.dl;
      const picker = list.querySelector(`select[data-surah-picker="${reciterId}"]`);
      const surah = Number(picker.value);
      const s = surahs.find((x) => x.number === surah);
      btn.disabled = true;
      btn.textContent = `0 / ${s.ayah_count}`;
      haptic([10]);
      try {
        await downloadSurahPack(state.db, reciterId, surah, (a, total) => { btn.textContent = `${a} / ${total}`; });
        haptic(HAPTICS.categoryComplete);
        btn.textContent = 'تم التثبيت';
        if (!state.settings.reciter) await saveSetting('reciter', reciterId);
        setTimeout(() => { if (location.hash.startsWith('#/mushaf-audio')) navigate('mushaf-audio', { r: Date.now() }); }, 700);
      } catch (e) {
        btn.textContent = 'فشل — أعد المحاولة';
        btn.disabled = false;
        console.warn('[pack]', e.message);
      }
    });
  }
}
