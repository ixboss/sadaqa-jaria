// ============================================================================
// qibla.js — great-circle Qibla bearing (pure math, zero-dep)
// Kaaba: 21.4225°N, 39.8262°E (standard published coordinates).
// ============================================================================

const KAABA = { lat: 21.4225, lng: 39.8262 };
const rad = (deg) => (deg * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;

/** Initial great-circle bearing (degrees, 0=N, clockwise) from {lat,lng} to the Kaaba. */
export function qiblaBearing({ lat, lng }) {
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) throw new Error(`invalid lat: ${lat}`);
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) throw new Error(`invalid lng: ${lng}`);
  const φ1 = rad(lat), φ2 = rad(KAABA.lat), Δλ = rad(KAABA.lng - lng);
  const θ = Math.atan2(
    Math.sin(Δλ) * Math.cos(φ2),
    Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ),
  );
  return (deg(θ) + 360) % 360;
}

/** Great-circle distance in km (haversine) — used to pick the dial fallback threshold.
 *  Same validation as qiblaBearing: a NaN/garbage GPS fix used to silently
 *  return NaN (every NaN threshold comparison is false → silent compass
 *  degradation) or out-of-range garbage — throwing surfaces the bad fix
 *  (audit 2026-11-21). */
export function distanceKm({ lat, lng }) {
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) throw new Error(`invalid lat: ${lat}`);
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) throw new Error(`invalid lng: ${lng}`);
  const R = 6371.0088;
  const φ1 = rad(lat), φ2 = rad(KAABA.lat);
  const Δφ = rad(KAABA.lat - lat), Δλ = rad(KAABA.lng - lng);
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export const KAABA_COORDS = KAABA;
