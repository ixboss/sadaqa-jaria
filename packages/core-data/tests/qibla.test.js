import { test } from 'node:test';
import assert from 'node:assert/strict';
import { qiblaBearing, distanceKm, KAABA_COORDS } from '../engines/qibla.js';

test('qibla bearing matches widely published values (±1°)', () => {
  // Published compass references: London ≈118.97°, Cairo ≈136.88°, New York ≈58.6°.
  assert.ok(Math.abs(qiblaBearing({ lat: 51.5074, lng: -0.1278 }) - 118.97) < 1.0, 'London');
  assert.ok(Math.abs(qiblaBearing({ lat: 30.0444, lng: 31.2356 }) - 136.88) < 1.0, 'Cairo');
  assert.ok(Math.abs(qiblaBearing({ lat: 40.7128, lng: -74.0060 }) - 58.6) < 1.5, 'New York');
});

test('bearing from the Kaaba grid is well-defined and distance ≈ 0', () => {
  assert.ok(qiblaBearing(KAABA_COORDS) < 0.001 || qiblaBearing(KAABA_COORDS) > 359.999, 'kaaba self-bearing');
  assert.ok(distanceKm(KAABA_COORDS) < 0.1, 'kaaba self-distance');
});

test('range validation throws for both qiblaBearing and distanceKm', () => {
  assert.throws(() => qiblaBearing({ lat: 95, lng: 0 }), /invalid lat/);
  assert.throws(() => qiblaBearing({ lat: 0, lng: -200 }), /invalid lng/);
  assert.throws(() => qiblaBearing({ lat: NaN, lng: 0 }), /invalid lat/);
  assert.throws(() => distanceKm({ lat: 95, lng: 0 }), /invalid lat/);
  assert.throws(() => distanceKm({ lat: 0, lng: -200 }), /invalid lng/);
  assert.throws(() => distanceKm({ lat: Infinity, lng: 0 }), /invalid lat/);
  assert.throws(() => distanceKm(null), /invalid coords/);
  // Antipode of Kaaba produces a≈1; clamped haversine stays finite
  const antipodeDist = distanceKm({ lat: -KAABA_COORDS.lat, lng: KAABA_COORDS.lng - 180 });
  assert.ok(Number.isFinite(antipodeDist) && antipodeDist > 19_900 && antipodeDist < 20_100);
});

test('bearing always within [0, 360)', () => {
  for (const [lat, lng] of [[-33.9, 18.4], [64.1, -21.9], [-41.3, 174.8], [35.7, 139.7]]) {
    const b = qiblaBearing({ lat, lng });
    assert.ok(b >= 0 && b < 360, `${lat},${lng} → ${b}`);
  }
});
