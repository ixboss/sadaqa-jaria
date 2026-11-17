// backup-merge.test.js — table-driven merge algorithm cases (ARCHITECTURE §8.3)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergePayload, toPayloadGroups } from '../engines/backup-merge.js';

const T = 1_700_000_000_000; // base epoch ms

/** helper: local db state from plain objects */
function localOf(group, entities) {
  return { [group]: new Map(entities.map((e) => [e.uuid, e])) };
}
const payloadOf = (group, entities) => ({ [group]: entities });

const cases = [
  {
    name: '01 new entity → insert, added=1',
    local: localOf('dhikr', []),
    payload: payloadOf('dhikr', [{ uuid: 'u1', type: 'tasbihCounter', updatedAt: T, count: 5 }]),
    expect: { added: 1, updated: 0, conflicts: 0, skipped: 0 },
    actions: ['insert'],
  },
  {
    name: '02 identical content+time → skipped',
    local: localOf('dhikr', [{ uuid: 'u1', type: 'tasbihCounter', updatedAt: T, count: 5 }]),
    payload: payloadOf('dhikr', [{ uuid: 'u1', type: 'tasbihCounter', updatedAt: T, count: 5 }]),
    expect: { added: 0, updated: 0, conflicts: 0, skipped: 1 },
    actions: [],
  },
  {
    name: '03 same time different content → conflict (tie-break logs, keeps local)',
    local: localOf('dhikr', [{ uuid: 'u1', type: 'tasbihCounter', updatedAt: T, count: 5 }]),
    payload: payloadOf('dhikr', [{ uuid: 'u1', type: 'tasbihCounter', updatedAt: T, count: 9 }]),
    expect: { conflicts: 1 },
    actions: [],
  },
  {
    name: '04 incoming newer → apply, updated=1',
    local: localOf('dhikr', [{ uuid: 'u1', type: 'tasbihCounter', updatedAt: T, count: 5 }]),
    payload: payloadOf('dhikr', [{ uuid: 'u1', type: 'tasbihCounter', updatedAt: T + 10, count: 9 }]),
    expect: { updated: 1 },
    actions: ['apply'],
  },
  {
    name: '05 incoming older, local alive → conflict, no mutation',
    local: localOf('dhikr', [{ uuid: 'u1', type: 'tasbihCounter', updatedAt: T + 10, count: 7 }]),
    payload: payloadOf('dhikr', [{ uuid: 'u1', type: 'tasbihCounter', updatedAt: T, count: 3 }]),
    expect: { conflicts: 1 },
    actions: [],
  },
  {
    name: '06 incoming older, local tombstoned → deletion wins, skipped',
    local: localOf('dhikr', [{ uuid: 'u1', type: 'tasbihCounter', updatedAt: T + 10, deleted: true }]),
    payload: payloadOf('dhikr', [{ uuid: 'u1', type: 'tasbihCounter', updatedAt: T, count: 3 }]),
    expect: { skipped: 1 },
    actions: [],
  },
  {
    name: '07 incoming newer undeletes tombstoned local → restore',
    local: localOf('dhikr', [{ uuid: 'u1', type: 'tasbihCounter', updatedAt: T, deleted: true }]),
    payload: payloadOf('dhikr', [{ uuid: 'u1', type: 'tasbihCounter', updatedAt: T + 5, deleted: false }]),
    expect: { updated: 1 },
    actions: ['restore'],
  },
  {
    name: '08 incoming newer tombstone over live local → apply (delete propagates)',
    local: localOf('dhikr', [{ uuid: 'u1', type: 'tasbihCounter', updatedAt: T }]),
    payload: payloadOf('dhikr', [{ uuid: 'u1', type: 'tasbihCounter', updatedAt: T + 5, deleted: true }]),
    expect: { updated: 1 },
    actions: ['apply'],
  },
  {
    name: '09 group absent locally → all entities added',
    local: {},
    payload: payloadOf('reading', [
      { uuid: 'r1', type: 'bookmark', updatedAt: T, page: 2 },
      { uuid: 'r2', type: 'bookmark', updatedAt: T, page: 3 },
    ]),
    expect: { added: 2 },
    actions: ['insert', 'insert'],
  },
  {
    name: '10 mixed batch: add+skip+apply counted independently',
    local: localOf('dhikr', [
      { uuid: 'a', type: 'tasbihCounter', updatedAt: T, count: 1 },
      { uuid: 'b', type: 'tasbihCounter', updatedAt: T + 100, count: 2 },
    ]),
    payload: payloadOf('dhikr', [
      { uuid: 'a', type: 'tasbihCounter', updatedAt: T, count: 1 },           // identical → skip
      { uuid: 'b', type: 'tasbihCounter', updatedAt: T + 50, count: 9 },      // older → conflict
      { uuid: 'c', type: 'tasbihCounter', updatedAt: T + 200, count: 0 },     // new → add
      { uuid: 'd', type: 'tasbihCounter', updatedAt: T + 300, count: 4 },     // new → add
    ]),
    expect: { added: 2, conflicts: 1, skipped: 1 },
    actions: ['insert', 'insert'],
  },
  {
    name: '11 multiple groups processed independently',
    local: {
      reading: new Map([['r1', { uuid: 'r1', type: 'note', updatedAt: T, body: 'x' }]]),
      dhikr: new Map(),
    },
    payload: {
      reading: [{ uuid: 'r1', type: 'note', updatedAt: T + 1, body: 'y' }],
      dhikr: [{ uuid: 'd1', type: 'tasbihCounter', updatedAt: T, count: 0 }],
    },
    expect: { added: 1, updated: 1 },
    actions: ['apply', 'insert'],
  },
  {
    name: '12 equal timestamps equal content but different key order → skipped (canonical equal)',
    local: localOf('prefs', [{ uuid: 'p1', type: 'setting', updatedAt: T, key: 'theme', value: 'dark' }]),
    payload: payloadOf('prefs', [{ type: 'setting', value: 'dark', key: 'theme', updatedAt: T, uuid: 'p1' }]),
    expect: { skipped: 1 },
    actions: [],
  },
];

test('merge algorithm table cases', () => {
  for (const c of cases) {
    const { report, mutations } = mergePayload(c.local, c.payload, { mode: 'merge', now: T });
    for (const [k, v] of Object.entries(c.expect)) {
      assert.equal(report[k], v, `${c.name}: report.${k} expected ${v}, got ${report[k]}`);
    }
    assert.deepEqual(mutations.map((m) => m.action), c.actions ?? [], `${c.name}: action sequence`);
  }
});

test('replace mode: wipes semantics via full insert list + replaceMarker', () => {
  const local = localOf('dhikr', [{ uuid: 'old', type: 'tasbihCounter', updatedAt: T, count: 1 }]);
  const payload = payloadOf('dhikr', [
    { uuid: 'n1', type: 'tasbihCounter', updatedAt: T, count: 3 },
    { uuid: 'n2', type: 'tasbihCounter', updatedAt: T, count: 4 },
  ]);
  const { report, mutations, replaceMarker } = mergePayload(local, payload, { mode: 'replace', now: T + 999 });
  assert.equal(report.added, 2);
  assert.deepEqual(mutations.map((m) => m.action), ['insert', 'insert']);
  assert.deepEqual(mutations.map((m) => m.uuid), ['n1', 'n2']);
  assert.equal(replaceMarker.at, T + 999);
});

test('replace mode with empty payload → zero mutations (caller wipes via replaceMarker)', () => {
  const { report, mutations } = mergePayload(localOf('dhikr', [{ uuid: 'x', type: 'tasbihCounter', updatedAt: T }]), {}, { mode: 'replace' });
  assert.equal(report.added, 0);
  assert.equal(mutations.length, 0);
});

test('unknown mode throws', () => {
  assert.throws(() => mergePayload({}, {}, { mode: 'overwrite' }), /unknown merge mode/);
});

test('malformed payload group (not array) throws TypeError via Object.entries iteration safety', () => {
  // entities not an array: iteration would throw — contract requires validated payloads
  assert.throws(() => mergePayload({}, { dhikr: 'nope' }, { mode: 'merge' }), (e) => e instanceof TypeError);
});

test('toPayloadGroups: sorts by uuid and key order (stable serialization)', () => {
  const groups = toPayloadGroups({
    dhikr: new Map([
      ['b2', { uuid: 'b2', type: 'tasbihCounter', updatedAt: 2, count: 1 }],
      ['a1', { uuid: 'a1', type: 'tasbihCounter', updatedAt: 1, z: undefined, count: 0 }],
    ]),
  });
  assert.deepEqual(groups.dhikr.map((e) => e.uuid), ['a1', 'b2']);
  const keys = Object.keys(groups.dhikr[0]);
  assert.deepEqual(keys, [...keys].sort(), 'keys sorted');
  assert.ok(!('z' in groups.dhikr[0]), 'undefined values dropped');
});

// extra scenario coverage to exceed 24 distinct behaviors
test('13 empty payload over non-empty local → no-op report', () => {
  const { report, mutations } = mergePayload(localOf('dhikr', [{ uuid: 'u', type: 'tasbihCounter', updatedAt: T }]), {}, { mode: 'merge' });
  assert.deepEqual(report, { added: 0, updated: 0, conflicts: 0, skipped: 0, deleted: 0 });
  assert.equal(mutations.length, 0);
});
test('14 tombstone vs tombstone same time equal shape → skipped', () => {
  const { report } = mergePayload(
    localOf('dhikr', [{ uuid: 'u', type: 'tasbihCounter', updatedAt: T, deleted: true }]),
    payloadOf('dhikr', [{ uuid: 'u', type: 'tasbihCounter', updatedAt: T, deleted: true }]),
    { mode: 'merge' },
  );
  assert.equal(report.skipped, 1);
});
test('15 resurrection when incoming updatedAt equals local but differs in deleted flag → conflict (tie)', () => {
  const { report } = mergePayload(
    localOf('dhikr', [{ uuid: 'u', type: 'tasbihCounter', updatedAt: T, deleted: true }]),
    payloadOf('dhikr', [{ uuid: 'u', type: 'tasbihCounter', updatedAt: T, deleted: false }]),
    { mode: 'merge' },
  );
  assert.equal(report.conflicts, 1);
});
test('16 non-numeric updatedAt treated as 0 (defensive)', () => {
  const { report } = mergePayload(
    localOf('dhikr', [{ uuid: 'u', type: 'tasbihCounter', updatedAt: T }]),
    payloadOf('dhikr', [{ uuid: 'u', type: 'tasbihCounter', updatedAt: 'bogus', count: 2 }]),
    { mode: 'merge' },
  );
  assert.equal(report.conflicts, 1); // local newer than 0
});
test('17 mutation carries group and entity reference', () => {
  const { mutations } = mergePayload({}, payloadOf('meta', [{ uuid: 's1', type: 'streakDay', updatedAt: T, kind: 'tasbih', dayKey: '2026-01-01' }]), { mode: 'merge' });
  assert.equal(mutations[0].group, 'meta');
  assert.equal(mutations[0].entity.kind, 'tasbih');
});
