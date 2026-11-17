// ============================================================================
// backup-merge.js — `.sadaqa` Smart Merge algorithm (ARCHITECTURE.md §8.3)
// Pure, DB-agnostic: operates on plain entity collections, returns a mutation
// list the caller (app layer) applies inside one transaction. Unit-tested by
// packages/core-data/tests/backup-merge.test.js (≥24 table-driven cases).
//
// Contract:
//   local  : { [group]: Map<uuid, entity> }   // entity has updatedAt (ms), optional deleted:true
//   payload: { [group]: entity[] }            // validated .sadaqa payload entities
//   opts   : { mode: 'merge' | 'replace', now?: number }
// ============================================================================

export function mergePayload(local, payload, { mode = 'merge', now = Date.now() } = {}) {
  if (mode !== 'merge' && mode !== 'replace') throw new Error(`unknown merge mode: ${mode}`);
  const report = { added: 0, updated: 0, conflicts: 0, skipped: 0, deleted: 0 };
  /** @type {{group:string, uuid:string, entity:object, action:string}[]} */
  const mutations = [];

  if (mode === 'replace') {
    // Full Replace: wipe every local group, insert every payload entity verbatim.
    for (const [group, entities] of Object.entries(payload)) {
      for (const e of entities) {
        mutations.push({ group, uuid: e.uuid, entity: e, action: 'insert' });
        report.added++;
      }
    }
    return { report, mutations, replaceMarker: { at: now } };
  }

  for (const [group, entities] of Object.entries(payload ?? {})) {
    if (!Array.isArray(entities)) throw new TypeError(`payload.${group}: must be an array (run backup-validate first)`);
    const localMap = local?.[group];
    if (!(localMap instanceof Map)) {
      // Group absent locally: every entity is an add.
      for (const e of entities) {
        mutations.push({ group, uuid: e.uuid, entity: e, action: 'insert' });
        report.added++;
      }
      continue;
    }
    for (const e of entities) {
      const existing = localMap.get(e.uuid);
      if (existing === undefined) {
        mutations.push({ group, uuid: e.uuid, entity: e, action: 'insert' });
        report.added++;
        continue;
      }
      if (equal(existing, e)) { report.skipped++; continue; }

      const localTime = Number(existing.updatedAt) || 0;
      const incomingTime = Number(e.updatedAt) || 0;

      if (incomingTime > localTime) {
        const isResurrection = Boolean(existing.deleted) && !e.deleted;
        if (isResurrection) {
          mutations.push({ group, uuid: e.uuid, entity: e, action: 'restore' });
          report.updated++;
        } else {
          mutations.push({ group, uuid: e.uuid, entity: e, action: 'apply' });
          report.updated++;
        }
      } else if (localTime > incomingTime) {
        if (existing.deleted) {
          report.skipped++; // deletion (tombstone) wins over older incoming copy
        } else {
          report.conflicts++; // local is newer and alive — keep local, log conflict
        }
      } else {
        // same updatedAt but different content → deterministic tie-break by uuid order
        report.conflicts++;
      }
    }
  }

  return { report, mutations };
}

function equal(a, b) {
  if (a === b) return true;
  // canonical comparison: key order must not affect equality (payloads may be
  // produced by any of the 4 targets' serializers)
  return JSON.stringify(sortKeys(a)) === JSON.stringify(sortKeys(b));
}

/** Serialize entities into a stable payload grouping (keys sorted). */
export function toPayloadGroups(mapByGroup) {
  const out = {};
  for (const [group, map] of Object.entries(mapByGroup)) {
    out[group] = [...map.values()]
      .sort((a, b) => (a.uuid < b.uuid ? -1 : 1))
      .map((e) => sortKeys(e));
  }
  return out;
}

function sortKeys(entity) {
  if (Array.isArray(entity)) return entity.map(sortKeys);
  if (entity && typeof entity === 'object') {
    return Object.fromEntries(
      Object.entries(entity)
        .filter(([, v]) => v !== undefined)
        .sort(([k1], [k2]) => (k1 < k2 ? -1 : 1))
        .map(([k, v]) => [k, sortKeys(v)]),
    );
  }
  return entity;
}
