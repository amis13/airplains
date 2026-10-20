import test from 'node:test';
import assert from 'node:assert/strict';
import { project, unproject, screenPoint } from '../src/geo.mjs';
import { demoAircraft } from '../src/demo.mjs';

test('la proyección conserva las coordenadas y centra correctamente', () => {
  for (const point of [[40.4, -3.7], [0, 0], [-34, 151], [80, -179]]) {
    const restored = unproject(...project(...point, 8), 8);
    restored.forEach((value, i) => assert.ok(Math.abs(value - point[i]) < 1e-8));
    assert.deepEqual(screenPoint(...point, point, 8, 800, 600), [400, 300]);
  }
});
test('los puntos cruzan el antimeridiano por el lado próximo', () => {
  const [x] = screenPoint(0, -179.9, [0, 179.9], 6, 800, 600);
  assert.ok(x > 400 && x < 420);
});
test('la demostración se mueve a velocidad plausible y se centra en la antena configurada', () => {
  const a = demoAircraft(0), b = demoAircraft(60);
  assert.equal(a.length, 5);
  assert.ok(a.every(a => a.callsign.startsWith('DEMO')));
  assert.notEqual(a[0].lon, b[0].lon);
  assert.ok(Math.abs(a[0].lon - b[0].lon) < 0.2);
  const relocated = demoAircraft(0, [50.4168, -3.7038]);
  assert.ok(Math.abs(relocated[0].lat - a[0].lat - 10) < 1e-8);
});
