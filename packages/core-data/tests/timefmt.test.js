// timefmt.test.js — pins the 12-hour AM/PM display contract shared by all targets.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatClock12h } from '../engines/timefmt.js';

// UTC+3 fixed offset (no DST) — civil = UTC + 3h.
const RIYADH = 'Asia/Riyadh';
// America/New_York: UTC-5 in winter (EST), UTC-4 in summer (EDT) — exercises DST-aware civil parts.
const NYC = 'America/New_York';

test('formatClock12h: golden table (Riyadh, UTC+3)', () => {
  const utc = (h, mi) => Date.UTC(2026, 10, 21, h, mi, 0);
  assert.equal(formatClock12h(utc(11, 34), RIYADH), '2:34 PM');   // 14:34 civil
  assert.equal(formatClock12h(utc(21, 57), RIYADH), '12:57 AM');  // 00:57 civil (next day)
  assert.equal(formatClock12h(utc(21, 0), RIYADH), '12:00 AM');   // midnight
  assert.equal(formatClock12h(utc(9, 0), RIYADH), '12:00 PM');    // noon
  assert.equal(formatClock12h(utc(20, 5), RIYADH), '11:05 PM');   // 23:05 civil
  assert.equal(formatClock12h(utc(22, 0), RIYADH), '1:00 AM');    // 01:00 civil
  assert.equal(formatClock12h(utc(8, 0), RIYADH), '11:00 AM');    // 11:00 civil
});

test('formatClock12h: DST-aware civil parts (New York winter/summer)', () => {
  assert.equal(formatClock12h(Date.UTC(2026, 0, 15, 0, 34), NYC), '7:34 PM');   // 19:34 EST
  assert.equal(formatClock12h(Date.UTC(2026, 6, 15, 10, 57), NYC), '6:57 AM');  // 06:57 EDT
});

test('formatClock12h: Western digits + exact spacing (no locale drift)', () => {
  const s = formatClock12h(Date.UTC(2026, 10, 21, 11, 34), RIYADH);
  assert.match(s, /^(1[0-2]|0?[1-9]):[0-5]\d (AM|PM)$/);
  assert.equal(s, '2:34 PM');
  // no Arabic-Indic digits, no narrow no-break space variants
  assert.doesNotMatch(s, /[\u0660-\u0669\u202F\u00A0]/);
});
