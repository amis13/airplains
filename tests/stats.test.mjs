import test from 'node:test';
import assert from 'node:assert/strict';
import { ReceptionStats, distanceBearing, sectorOf } from '../server/stats.mjs';

const near = (actual, expected, tolerance = 0.01) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} ≉ ${expected}`);

test('cuenta líneas por segundo, rellena huecos con cero y excluye el segundo en curso', () => {
  const stats = new ReceptionStats();
  for (let i = 0; i < 5; i++) stats.record(true, 10_000);
  stats.record(false, 10_500);
  stats.record(true, 12_000);
  stats.record(true, 13_200);
  const s = stats.snapshot(13_500);
  assert.equal(s.history.length, 300);
  assert.deepEqual(s.history.slice(-3), [5, 0, 1]);
  assert.equal(s.valid, 7); assert.equal(s.invalid, 1);
  assert.equal(s.rate, 0.6);
});

test('reutiliza el búfer circular sin mezclar segundos de vueltas anteriores', () => {
  const stats = new ReceptionStats();
  for (let i = 0; i < 5; i++) stats.record(true, 10_000);
  stats.record(true, 12_000);
  stats.record(true, 310_000);
  const s = stats.snapshot(311_000);
  assert.equal(s.history.at(-1), 1);
  assert.equal(s.history.reduce((a, b) => a + b), 2);
});

test('tras más de cinco minutos sin mensajes el historial queda a cero', () => {
  const stats = new ReceptionStats();
  stats.record(true, 10_000);
  const s = stats.snapshot(10_000 + 600_000);
  assert.ok(s.history.every(v => v === 0));
  assert.equal(s.rate, 0);
  assert.equal(s.valid, 1);
});

test('calcula distancia en millas náuticas y rumbo inicial', () => {
  let r = distanceBearing([40, -3], [41, -3]);
  near(r.distance, 60.04); near(r.bearing, 0);
  r = distanceBearing([0, 0], [0, 1]);
  near(r.distance, 60.04); near(r.bearing, 90);
  r = distanceBearing([40, -3], [40.4, -3.7]);
  near(r.distance, 40.09); near(r.bearing, 307.03);
});

test('asigna sectores de 22,5° con el norte centrado en el sector 0', () => {
  assert.equal(sectorOf(0), 0);
  assert.equal(sectorOf(11.24), 0);
  assert.equal(sectorOf(11.25), 1);
  assert.equal(sectorOf(90), 4);
  assert.equal(sectorOf(348.74), 15);
  assert.equal(sectorOf(348.75), 0);
  assert.equal(sectorOf(359.9), 0);
});

test('registra el alcance por sector e ignora posiciones a más de 400 NM', () => {
  const stats = new ReceptionStats({ receiver: [40, -3] });
  stats.position('AAAAAA', 41, -3);
  stats.position('BBBBBB', 40, -1);
  stats.position('CCCCCC', 50, -3);
  const { range } = stats.snapshot(0);
  assert.equal(range.max, 92);
  assert.equal(range.maxHex, 'BBBBBB');
  assert.equal(range.sectors.length, 16);
  assert.equal(range.sectors[0], 60);
  assert.equal(range.sectors[4], 92);
  assert.equal(range.sectors.filter(Boolean).length, 2);
});

test('una posición sobre la antena no produce NaN ni cambia el alcance', () => {
  const stats = new ReceptionStats({ receiver: [40, -3] });
  stats.position('AAAAAA', 40, -3);
  const { range } = stats.snapshot(0);
  assert.deepEqual(range, { max: 0, maxHex: null, sectors: new Array(16).fill(0) });
});

test('sin antena configurada no hay alcance', () => {
  const stats = new ReceptionStats();
  stats.position('AAAAAA', 41, -3);
  assert.equal(stats.snapshot(0).range, null);
});
