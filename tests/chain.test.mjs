import test from 'node:test';
import assert from 'node:assert/strict';
import { diagnose } from '../server/chain.mjs';

const now = 100_000;
const ok = { ok: true, error: null, checkedAt: 1 }, fail = { ok: false, error: 'EHOSTUNREACH', checkedAt: 1 }, pending = { ok: null, error: null, checkedAt: null };
const probe = (http = ok, iio = ok) => ({ host: '192.168.2.1', http, iio });
const feed = (connected, lastMessageAt = null) => ({ connected, error: connected ? null : 'ECONNREFUSED', source: '127.0.0.1:30003', lastMessageAt });
const states = result => Object.fromEntries(result.steps.map(step => [step.id, step.state]));
const step = (result, id) => result.steps.find(s => s.id === id);

test('todo correcto', () => {
  const result = diagnose({ probe: probe(), feed: feed(true, now - 1000), now });
  assert.deepEqual(states(result), { 'pluto-http': 'ok', 'pluto-iio': 'ok', decoder: 'ok', messages: 'ok' });
  assert.deepEqual(result.steps.map(s => s.label), ['Pluto web', 'Pluto IIO', 'Decodificador SBS', 'Mensajes ADS-B']);
  assert.equal(result.firstFailure, null);
  assert.equal(result.plutoHost, '192.168.2.1');
});

test('Pluto inaccesible y sin decodificador', () => {
  const result = diagnose({ probe: probe(fail, fail), feed: feed(false), now });
  assert.deepEqual(states(result), { 'pluto-http': 'fail', 'pluto-iio': 'fail', decoder: 'fail', messages: 'unknown' });
  assert.equal(result.firstFailure, 'pluto-http');
  assert.match(step(result, 'pluto-iio').detail, /WSL/);
  assert.match(step(result, 'pluto-iio').detail, /EHOSTUNREACH/);
});

test('Pluto accesible y decodificador parado', () => {
  const result = diagnose({ probe: probe(), feed: feed(false), now });
  assert.equal(result.firstFailure, 'decoder');
  assert.match(step(result, 'decoder').detail, /127\.0\.0\.1:30003/);
  assert.match(step(result, 'decoder').detail, /--net/);
  assert.match(step(result, 'decoder').detail, /ECONNREFUSED/);
});

test('decodificador conectado sin mensajes recientes', () => {
  for (const last of [null, now - 20_000]) {
    const result = diagnose({ probe: probe(), feed: feed(true, last), now });
    assert.equal(step(result, 'messages').state, 'fail');
    assert.equal(result.firstFailure, 'messages');
    assert.match(step(result, 'messages').detail, /antena/);
  }
});

test('si llegan mensajes, un Pluto inaccesible solo es un aviso', () => {
  const result = diagnose({ probe: probe(fail, fail), feed: feed(true, now - 1000), now });
  assert.deepEqual(states(result), { 'pluto-http': 'warn', 'pluto-iio': 'warn', decoder: 'ok', messages: 'ok' });
  assert.equal(result.firstFailure, null);
});

test('HTTP caído con IIO correcto no bloquea', () => {
  const result = diagnose({ probe: probe(fail, ok), feed: feed(true, now - 20_000), now });
  assert.equal(step(result, 'pluto-http').state, 'warn');
  assert.equal(result.firstFailure, 'messages');
});

test('sondeo desactivado o pendiente', () => {
  let result = diagnose({ probe: { host: null, http: null, iio: null }, feed: feed(true, now - 1000), now });
  assert.equal(step(result, 'pluto-http').state, 'unknown');
  assert.match(step(result, 'pluto-iio').detail, /PLUTO_HOST/);
  assert.equal(result.plutoHost, null);
  result = diagnose({ probe: probe(pending, pending), feed: feed(false), now });
  assert.equal(step(result, 'pluto-iio').state, 'unknown');
  assert.equal(result.firstFailure, 'decoder');
});
