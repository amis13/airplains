import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import net from 'node:net';
import { PlutoProbe } from '../server/probe.mjs';

class Socket extends EventEmitter {
  constructor(options) { super(); this.options = options; this.writes = []; }
  write(data) { this.writes.push(data); }
  destroy() { if (this.destroyed) return; this.destroyed = true; this.emit('close'); }
}
function mockNet(t) {
  const sockets = [];
  t.mock.method(net, 'createConnection', options => { const socket = new Socket(options); sockets.push(socket); return socket; });
  return sockets;
}

test('comprueba HTTP e IIO en paralelo, cierra sin escribir y registra errores', async t => {
  const sockets = mockNet(t);
  const probe = new PlutoProbe({ host: '192.168.2.1' });
  const pending = probe.check();
  assert.deepEqual(sockets.map(s => s.options), [{ host: '192.168.2.1', port: 80 }, { host: '192.168.2.1', port: 30431 }]);
  sockets[0].emit('connect');
  sockets[1].emit('error', Object.assign(new Error('refused'), { code: 'ECONNREFUSED' }));
  await pending;
  const status = probe.status();
  assert.equal(status.host, '192.168.2.1');
  assert.equal(status.http.ok, true); assert.equal(status.http.error, null); assert.equal(typeof status.http.checkedAt, 'number');
  assert.equal(status.iio.ok, false); assert.equal(status.iio.error, 'ECONNREFUSED');
  assert.ok(sockets.every(s => s.destroyed && s.writes.length === 0));
});

test('agota el tiempo sin respuesta y no solapa comprobaciones', async t => {
  const sockets = mockNet(t);
  const probe = new PlutoProbe({ host: 'pluto', timeoutMs: 10 });
  const first = probe.check();
  probe.check();
  assert.equal(sockets.length, 2);
  await first;
  assert.equal(probe.status().http.error, 'ETIMEDOUT');
  assert.equal(probe.status().iio.ok, false);
  assert.ok(sockets.every(s => s.destroyed));
});

test('start comprueba al momento una sola vez y stop cierra los sockets pendientes', t => {
  const sockets = mockNet(t);
  const probe = new PlutoProbe({ host: 'pluto', intervalMs: 60_000 });
  probe.start(); probe.start();
  assert.equal(sockets.length, 2);
  assert.equal(probe.status().http.ok, null);
  probe.stop();
  assert.ok(sockets.every(s => s.destroyed));
});

test('recorta PLUTO_HOST y lo desactiva si está vacío', t => {
  const sockets = mockNet(t);
  assert.equal(new PlutoProbe({ host: ' 192.168.2.1 ' }).status().host, '192.168.2.1');
  for (const host of ['', '   ', null, undefined]) {
    const probe = new PlutoProbe({ host });
    probe.start(); probe.check();
    assert.deepEqual(probe.status(), { host: null, http: null, iio: null });
  }
  assert.equal(sockets.length, 0);
});
