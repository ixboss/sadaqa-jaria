// timefmt.test.js — Shared 12-hour ASCII wall-clock formatting contract
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { to12h, formatTime12h } from '../engines/timefmt.js';
import { formatTime } from '../engines/prayer.js';

const ASCII_12H_RE = /^(1[0-2]|[1-9]):[0-5]\d (AM|PM)$/;

test('to12h converts 24-hour boundary and mid-day times into canonical ASCII h:mm AM/PM', () => {
  assert.equal(to12h('00:00'), '12:00 AM');
  assert.equal(to12h('00:57'), '12:57 AM');
  assert.equal(to12h('01:05'), '1:05 AM');
  assert.equal(to12h('11:59'), '11:59 AM');
  assert.equal(to12h('12:00'), '12:00 PM');
  assert.equal(to12h('12:34'), '12:34 PM');
  assert.equal(to12h('13:00'), '1:00 PM');
  assert.equal(to12h('14:34'), '2:34 PM');
  assert.equal(to12h('23:59'), '11:59 PM');
  assert.equal(to12h('05:09:42'), '5:09 AM');
});

test('to12h normalizes Arabic-Indic digits and existing 12-hour strings', () => {
  assert.equal(to12h('١٤:٣٤'), '2:34 PM');
  assert.equal(to12h('٠٠:٠٥'), '12:05 AM');
  assert.equal(to12h('2:34 pm'), '2:34 PM');
  assert.equal(to12h('12:05\u202FAM'), '12:05 AM');
});

test('to12h returns empty string on invalid/out-of-range inputs', () => {
  for (const bad of ['', '   ', null, undefined, 123, '24:00', '25:10', '12:60', '0:15 AM', '13:00 PM', 'not-a-time']) {
    assert.equal(to12h(bad), '', `expected empty for ${String(bad)}`);
  }
});

test('formatTime12h produces pure ASCII h:mm AM/PM with regular ASCII space across timezones', () => {
  const instants = [
    [Date.parse('2026-03-28T03:49:00Z'), 'Europe/London', '3:49 AM'],
    [Date.parse('2026-03-28T12:07:00Z'), 'Europe/London', '12:07 PM'],
    [Date.parse('2026-03-28T15:34:00Z'), 'Europe/London', '3:34 PM'],
    [Date.parse('2026-03-28T00:05:00Z'), 'UTC', '12:05 AM'],
    [Date.parse('2026-11-17T13:54:00Z'), 'Asia/Riyadh', '4:54 PM'], // UTC+3 → 16:54
    [Date.parse('2026-11-17T21:57:00Z'), 'Asia/Riyadh', '12:57 AM'], // UTC+3 → 00:57 next day
  ];
  for (const [ms, tz, want] of instants) {
    const out = formatTime12h(ms, tz);
    assert.equal(out, want);
    assert.match(out, ASCII_12H_RE);
    assert.ok(!out.includes('\u202F'), 'must not contain narrow no-break space U+202F');
    assert.ok(!/[٠-٩]/.test(out), 'must not contain Arabic-Indic digits');
    assert.equal(formatTime(new Date(ms), tz), want, 'prayer.formatTime delegates to formatTime12h');
  }
});

test('formatTime12h degrades safely on invalid date or timezone', () => {
  assert.equal(formatTime12h(NaN, 'UTC'), '');
  assert.equal(formatTime12h(Infinity, 'UTC'), '');
  assert.equal(formatTime12h(new Date('invalid'), 'UTC'), '');
  // Invalid timezone falls back to UTC cleanly instead of throwing
  assert.equal(formatTime12h(Date.parse('2026-03-28T15:34:00Z'), 'Mars/Olympus'), '3:34 PM');
});
