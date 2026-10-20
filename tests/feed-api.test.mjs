import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import net from 'node:net';
import { AircraftStore } from '../server/aircraft.mjs';
import { SbsFeed } from '../server/feed.mjs';
import { createApp } from '../server/index.mjs';
import { ReceptionStats } from '../server/stats.mjs';

const line = 'MSG,3,1,1,ABC123,1,,,,,TEST123,32000,,,40.4,-3.7,,,,,,\r\n';
class Socket extends EventEmitter {
  setEncoding() {} setKeepAlive() {}
  destroy(error) { if (this.destroyed) return; this.destroyed = true; if (error) this.emit('error', error); this.emit('close'); }
}
test('reconstruye mensajes SBS fragmentados, publica la API y reconecta', async t => {
  const sockets = [];
  t.mock.method(net, 'createConnection', () => { const socket = new Socket(); sockets.push(socket); return socket; });
  const stats = new ReceptionStats({ receiver: [40, -3] });
  const store = new AircraftStore({ onPosition: (hex, lat, lon) => stats.position(hex, lat, lon) }), feed = new SbsFeed(store, { retryMs: 5, stats });
  t.after(() => feed.stop());
  feed.start();
  sockets[0].emit('connect');
  sockets[0].emit('data', line.slice(0, 25));
  assert.equal(store.messages, 0);
  sockets[0].emit('data', line.slice(25) + line);
  assert.equal(store.messages, 2);
  const app = createApp({ store, feed, stats, receiver: [40, -3] });
  t.after(() => app.close());
  const result = await request(app, '/api/aircraft');
  assert.equal(result.status, 200);
  const data = JSON.parse(result.body);
  assert.equal(data.feed.connected, true);
  assert.equal(data.aircraft[0].callsign, 'TEST123');
  assert.equal(data.aircraft[0].lat, 40.4);
  assert.deepEqual(data.receiver, [40, -3]);
  assert.equal(result.headers['Cache-Control'], 'no-store');
  assert.equal(data.stats.valid, 2);
  assert.equal(data.stats.invalid, 0);
  assert.equal(data.stats.history.length, 300);
  assert.equal(data.stats.range.maxHex, 'ABC123');
  assert.equal(data.stats.range.sectors[14], 40.1);
  assert.equal(data.chain.plutoHost, null);
  assert.deepEqual(data.chain.steps.map(s => s.state), ['unknown', 'unknown', 'ok', 'ok']);
  assert.equal(data.chain.firstFailure, null);
  sockets[0].destroy(Object.assign(new Error('refused'), { code: 'ECONNREFUSED' }));
  assert.equal(feed.status().connected, false);
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(sockets.length, 2);
  sockets[1].emit('connect');
  assert.equal(feed.status().error, null);
});

test('limita entradas sin saltos de línea y cancela reintentos al parar', async t => {
  const socket = new Socket();
  t.mock.method(net, 'createConnection', () => socket);
  const feed = new SbsFeed(new AircraftStore(), { retryMs: 5 });
  t.after(() => feed.stop());
  feed.start(); socket.emit('connect'); socket.emit('data', 'x'.repeat(3000));
  assert.equal(socket.destroyed, true);
  assert.match(feed.status().error, /SBS/);
  feed.stop();
  await new Promise(resolve => setTimeout(resolve, 15));
  assert.equal(net.createConnection.mock.callCount(), 1);
});

test('la API rechaza escritura, rutas desconocidas y escapes del directorio estático', async t => {
  const app = createApp({ store: new AircraftStore(), feed: { status: () => ({ connected: false }) } });
  t.after(() => app.close());
  assert.equal((await request(app, '/api/aircraft', 'POST')).status, 405);
  assert.equal((await request(app, '/api/no-existe')).status, 404);
  assert.equal((await request(app, '/%2e%2e%2fpackage.json')).status, 403);
  assert.equal((await request(app, '/%FF')).status, 400);
});

test('cuenta líneas válidas y descartadas e ignora las vacías', t => {
  const socket = new Socket();
  t.mock.method(net, 'createConnection', () => socket);
  const recorded = [];
  const feed = new SbsFeed(new AircraftStore(), { stats: { record: valid => recorded.push(valid) } });
  t.after(() => feed.stop());
  feed.start(); socket.emit('connect');
  socket.emit('data', line + 'basura\r\n\r\n' + 'x'.repeat(2100) + '\n');
  assert.deepEqual(recorded, [true, false, false]);
});

function request(app, url, method = 'GET') {
  return new Promise(resolve => {
    const response = { headers: {}, status: 200, setHeader(k, v) { this.headers[k] = v; }, writeHead(status, headers = {}) { this.status = status; Object.assign(this.headers, headers); }, end(body = '') { resolve({ status: this.status, headers: this.headers, body: body.toString() }); } };
    app.emit('request', { url, method }, response);
  });
}
