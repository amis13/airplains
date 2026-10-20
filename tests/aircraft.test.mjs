import test from 'node:test';
import assert from 'node:assert/strict';
import { AircraftStore } from '../server/aircraft.mjs';

export function message({ hex = 'ABC123', subtype = '3', callsign = '', altitude = '', speed = '', track = '', lat = '', lon = '', rate = '', squawk = '' } = {}) {
  return ['MSG', subtype, '1', '1', hex, '1', '', '', '', '', callsign, altitude, speed, track, lat, lon, rate, squawk, '', '', '', ''].join(',');
}

test('conserva campos entre mensajes y no convierte campos vacíos a cero', () => {
  const store = new AircraftStore();
  store.ingest(message({ callsign: 'TEST123', altitude: '32000', lat: '40.4', lon: '-3.7' }), 1000);
  store.ingest(message({ subtype: '4', speed: '420', track: '0', rate: '0' }), 2000);
  const [a] = store.snapshot(3000);
  assert.equal(a.callsign, 'TEST123');
  assert.equal(a.altitude, 32000);
  assert.equal(a.speed, 420);
  assert.equal(a.track, 0);
  assert.equal(a.verticalRate, 0);
  assert.equal(a.squawk, null);
  assert.equal(a.lat, 40.4);
  assert.equal(a.seen, 1);
  assert.equal(a.messages, 2);
});

test('acepta coordenadas cero y rechaza coordenadas inválidas o incompletas', () => {
  const store = new AircraftStore();
  store.ingest(message({ lat: '0', lon: '0', altitude: '0', speed: '0' }), 1000);
  store.ingest(message({ lat: '91', lon: '50', speed: '-1', track: '999', altitude: 'NaN' }), 2000);
  store.ingest(message({ lat: '25', lon: '' }), 3000);
  const [a] = store.snapshot(4000);
  assert.equal(a.lat, 0); assert.equal(a.lon, 0); assert.equal(a.positionAt, 1000);
  assert.equal(a.speed, 0); assert.equal(a.altitude, 0); assert.equal(a.track, null);
});

test('la posición caduca aunque sigan llegando mensajes de velocidad', () => {
  const store = new AircraftStore();
  store.ingest(message({ lat: '40', lon: '-3' }), 1000);
  store.ingest(message({ speed: '400' }), 32000);
  const [a] = store.snapshot(32000);
  assert.equal(a.lat, null); assert.deepEqual(a.trail, []); assert.equal(a.seen, 0);
  assert.equal(store.snapshot(152001).length, 0);
});

test('acota la traza y la reinicia después de perder la posición', () => {
  const store = new AircraftStore();
  for (let i = 0; i < 150; i++) store.ingest(message({ lat: String(40 + i / 10000), lon: '-3' }), i * 1000);
  assert.equal(store.snapshot(149000)[0].trail.length, 100);
  store.ingest(message({ lat: '41', lon: '-3' }), 181000);
  assert.equal(store.snapshot(181000)[0].trail.length, 1);
});

test('rechaza datos malformados y acota el número de aviones', () => {
  const store = new AircraftStore({ maxAircraft: 2 });
  for (const line of ['*8DABC123;', 'MSG,3', message({ hex: '<test>' }), message({ subtype: '9' })]) assert.equal(store.ingest(line), false);
  for (const hex of ['000001', '000002', '000003']) store.ingest(message({ hex }), 1000);
  assert.equal(store.messages, 3);
  assert.deepEqual(store.snapshot(1000).map(a => a.hex), ['000002', '000003']);
});
