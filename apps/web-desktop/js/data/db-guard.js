// ============================================================================
// db-guard.js — OPFS boot safety contract (pure, unit-tested).
// Decision matrix for "should this boot re-import the bundled seed?":
//   'keep'   — db is healthy, OR unreadable for a transient reason (multi-tab
//              lock, quota hiccup). NEVER destroys user data on a maybe.
//   'reseed' — db is PROVABLY corrupt (header tables missing / ayah count
//              wrong). The caller must stash a recoverable copy of the old
//              bytes BEFORE overwriting (see reseedOrder in db-worker.js).
//   'refuse' — a future schema_version is on disk (newer app wrote it).
//              Downgrading would misinterpret rows; keep bytes untouched and
//              surface an upgrade-required error instead.
// schema_version lives in the `meta` table (schema.sql:42) and is now actually
// read on every boot — migrations run keyed on it (see migrate()).
// ============================================================================

export const SCHEMA_VERSION = 1;

/** Verdict: 'ok' | 'corrupt' | 'unknown' (unknown ⇒ any thrown error). */
export function verifyDbSchema(db) {
  try {
    const r = db.selectObjects("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name IN ('ayahs','cities','athkar_categories')");
    if ((r?.[0]?.n ?? 0) < 3) return 'corrupt';
    const a = db.selectObjects('SELECT COUNT(*) AS n FROM ayahs');
    return (a?.[0]?.n ?? 0) >= 6236 ? 'ok' : 'corrupt';
  } catch {
    return 'unknown'; // transient (SQLITE_BUSY, mid-lock) — never treated as corruption
  }
}

/** meta.schema_version → integer, or null when unreadable/absent/invalid. */
export function readSchemaVersion(db) {
  try {
    const r = db.selectObjects("SELECT value FROM meta WHERE key = 'schema_version'");
    const n = Number(JSON.parse(r?.[0]?.value ?? ''));
    return Number.isInteger(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

/**
 * planBoot(db) → { action, reason, version, future }
 * action: 'keep' | 'reseed' | 'refuse'
 */
export function planBoot(db) {
  const verdict = verifyDbSchema(db);
  if (verdict === 'unknown') return { action: 'keep', reason: 'schema-verify-unknown', version: null, future: false };
  const version = readSchemaVersion(db);
  if (verdict === 'corrupt') return { action: 'reseed', reason: 'schema-corrupt', version, future: false };
  if (version !== null && version > SCHEMA_VERSION) {
    return { action: 'refuse', reason: 'schema-from-newer-app', version, future: true };
  }
  return { action: 'keep', reason: verdict === 'ok' ? 'healthy' : 'version-unreadable', version, future: false };
}

/**
 * migrate(db) → { from, to, applied: string[] }
 * In-place, additive migrations keyed on meta.schema_version. v1 is the seed
 * baseline — the list is empty today; future steps append here (each step runs
 * inside the caller's transaction and must be idempotent).
 */
export function migrate(db) {
  const from = readSchemaVersion(db) ?? SCHEMA_VERSION;
  const applied = [];
  let v = from;
  // while (v < SCHEMA_VERSION) { const step = MIGRATIONS[v]; ...; v++; }
  if (v < SCHEMA_VERSION) {
    try {
      db.exec(`UPDATE meta SET value = '${SCHEMA_VERSION}' WHERE key = 'schema_version'`);
      applied.push(`schema_version → ${SCHEMA_VERSION}`);
    } catch { /* surfaced by caller */ }
    v = SCHEMA_VERSION;
  }
  return { from, to: v, applied };
}
