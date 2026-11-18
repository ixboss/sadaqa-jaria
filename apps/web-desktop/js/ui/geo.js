// ============================================================================
// geo.js — GPS fix → nearest offline city → persisted location.
// Persists BOTH the matched city row (lat/lng/tz = prayer-times source) and
// the exact live GPS fix (location.gps — Qibla source), so the compass never
// degenerates to a city-center or the Mecca default. Never prompts silently:
// every failure surfaces a typed Arabic message via the reject text.
// ============================================================================
import { state, saveSetting } from '../app-state.js';

const GPS_OPTS = { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 };

export function gpsErrorMessage(code) {
  if (code === 1) return 'رُفض إذن الموقع — فعّله من إعدادات النظام ثم أعد المحاولة.';
  if (code === 2) return 'خدمة الموقع غير متاحة حالياً — تحقق من تشغيل GPS ثم أعد المحاولة.';
  return 'انتهت مهلة تحديد الموقع — توثّب أو افتح نافذة سماء ثم أعد المحاولة.';
}

/** Promisified geolocation fix; rejects with the Arabic user message. */
export function getGpsFix() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('الموقع التلقائي غير مدعوم في هذا المتصفح — اختر مدينتك من القائمة.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }),
      (err) => reject(new Error(gpsErrorMessage(err?.code))),
      GPS_OPTS,
    );
  });
}

/** Nearest preseeded city by equirectangular proximity (offline, SQL-side). */
export async function findNearestCity(db, lat, lng) {
  const cosLat2 = Math.pow(Math.cos((lat * Math.PI) / 180), 2);
  return db.queryOne(
    `SELECT city_id, name_ar, country_ar, lat, lng, timezone
     FROM cities
     ORDER BY ((lat - ?) * (lat - ?)) + ((lng - ?) * (lng - ?) * ?) ASC
     LIMIT 1`,
    [lat, lat, lng, lng, cosLat2],
  );
}

/**
 * Persist the selected city (+ the live GPS fix when available) as the
 * `location` setting: { cityId, lat, lng, tz, name_ar, gps: {lat, lng, at} }.
 */
export async function persistLocation(row, gps) {
  const prev = state.settings.location ?? {};
  const value = {
    cityId: row.city_id,
    lat: row.lat,
    lng: row.lng,
    tz: row.timezone,
    name_ar: row.name_ar,
  };
  if (gps) value.gps = { lat: gps.lat, lng: gps.lng, at: Date.now() };
  else if (prev.gps && prev.cityId === row.city_id) value.gps = prev.gps;
  await saveSetting('location', value);
  return value;
}

/**
 * Launch auto-detect: only runs when geolocation permission is ALREADY
 * granted (no permission prompt on boot) and no city was ever chosen.
 * Returns the persisted city row, or null when it declined silently.
 */
export async function autoLocateCity(db) {
  if (state.settings.location?.cityId) return null;
  try {
    if (!navigator.permissions?.query) return null;
    const st = await navigator.permissions.query({ name: 'geolocation' });
    if (st.state !== 'granted') return null;
  } catch { return null; }
  try {
    const fix = await getGpsFix();
    const nearest = await findNearestCity(db, fix.lat, fix.lng);
    if (!nearest) return null;
    // re-check: a manual pick made while the fix was in flight wins
    if (state.settings.location?.cityId) return null;
    await persistLocation(nearest, fix);
    return nearest;
  } catch { return null; }
}
