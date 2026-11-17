// ============================================================================
// uuid7.js — UUIDv7 helpers shared by user-data writes and the .sadaqa
// pipeline. The backup validator (packages/core-data/engines/backup-validate.js)
// only accepts UUIDv7-shaped ids, so:
//   uuid7()        — fresh time-ordered id for new rows
//   synthUuid7(k)  — DETERMINISTIC id derived from a natural key (or a legacy
//                    v4 uuid at export time): same key → same id across
//                    devices/exports, which is what makes Smart Merge dedupe.
// ============================================================================

const HEX = (n, l) => n.toString(16).padStart(l, '0');

function shapeToV7(h, t = Date.now()) {
  // h: 32 hex chars (128 bits) → UUIDv7-shaped: version nibble = 7, variant = [89ab]
  const ts = HEX(t, 12).slice(-12); // 48-bit ms timestamp in the high bits
  return `${ts.slice(0, 8)}-${ts.slice(8, 12)}-7${h.slice(0, 3)}-${'b'}${h.slice(3, 6)}-${h.slice(6, 18)}`;
}

/** Fresh time-ordered UUIDv7 (crypto-random). */
export function uuid7(now = Date.now()) {
  const b = new Uint8Array(10);
  crypto.getRandomValues(b);
  let h = '';
  for (const x of b) h += HEX(x, 2);
  return shapeToV7(h, now);
}

/**
 * Deterministic UUIDv7-shaped id from an arbitrary key (sync, stable).
 * `now` is injectable so parity fixtures can pin the timestamp — native ports
 * (iOS/Android) must reproduce these ids byte-for-byte. Note: the FNV loop
 * iterates UTF-16 code units (JS strings); the natural keys used in practice
 * (`setting:<key>`, `adhkar:<item>:<day>`, `streak:<kind>:<day>`, `row:<uuid>`)
 * are ASCII by construction, where code units == UTF-8 bytes.
 */
export function synthUuid7(key, now = Date.now()) {
  // FNV-1a ×4 with distinct seeds → 128 bits
  const seeds = [0x811c9dc5, 0x0193dc47, 0x9e3779b9, 0x85ebca6b];
  const out = seeds.map((s) => {
    let h = s >>> 0;
    for (let i = 0; i < key.length; i++) {
      h ^= key.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return HEX(h >>> 0, 8);
  });
  const hex = (out[0] + out[1] + out[2] + out[3]).slice(0, 32);
  return shapeToV7(hex, now);
}
