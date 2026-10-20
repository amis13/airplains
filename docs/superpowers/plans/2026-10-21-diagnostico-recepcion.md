# Diagnóstico de recepción — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Añadir a Airplains una pestaña «Recepción» con el estado de la cadena Pluto+ → IIO → decodificador → mensajes, el ritmo de mensajes de los últimos 5 minutos y el alcance por dirección.

**Architecture:** El servidor gana tres módulos sin dependencias (`stats.mjs` acumula recuentos y alcance, `probe.mjs` sondea el Pluto por TCP, `chain.mjs` deriva el diagnóstico) y `/api/aircraft` añade `stats` y `chain`. El cliente sigue con su sondeo de 1 s; el panel lateral gana pestañas y gráficos SVG propios.

**Tech Stack:** Node ≥ 20.19 (ESM, `node:test`), React 19, Vite 7. Sin dependencias nuevas.

**Spec:** `docs/superpowers/specs/2026-10-21-diagnostico-recepcion-design.md`

## Global Constraints

- Sin dependencias nuevas en `package.json`.
- Todo texto visible, comentario, nombre de prueba y mensaje de commit en español.
- Solo lectura sobre el Pluto: el sondeo abre y cierra TCP y nunca escribe en el socket.
- Sin persistencia: las estadísticas viven en memoria y se reinician con el servidor.
- La demo nunca muestra métricas de recepción.
- Unidades explícitas: NM, msg/s, ft, kt; valores desconocidos como `—`.
- Ventana de historial 300 s; `rate` = media de los 10 segundos completos anteriores; 16 sectores, sector 0 = N (348,75°–11,25°); posiciones a más de 400 NM no cuentan para el alcance.
- Mensajes recientes = `lastMessageAt` a menos de 15 000 ms.
- Sondeo cada 10 000 ms, tiempo límite 2 000 ms, puertos 80 y 30431; `PLUTO_HOST` por defecto `192.168.2.1`, vacío desactiva.
- Estilo de código: el del repositorio (ESM, líneas densas, sin punto y coma omitido, comillas simples, sin linter). CSS en `src/styles.css` con los tokens de `:root`.
- Colores de estado reservados, siempre con icono y texto: correcto `#0ca30c`, aviso `#fab219`, fallo `#d03b3b`, sin comprobar `#92a3b3`. No se usan en gráficos.

## Review Focus

- **Servidor inactivo más de 5 minutos:** al volver a llegar mensajes, el historial no debe mostrar recuentos antiguos de una vuelta anterior del búfer circular → prueba en Task 1.
- **Avión justo encima de la antena (distancia 0):** no debe producir `NaN` ni ensuciar el alcance → prueba en Task 1.
- **`PLUTO_HOST` con espacios** (p. ej. `PLUTO_HOST= 192.168.2.1 ` en `.env`): debe recortarse y sondear, y solo espacios debe desactivar → prueba en Task 3.
- **Historial todo a cero** (decodificador conectado sin señal): el gráfico debe dibujar una línea plana en la base, sin dividir entre cero → prueba en Task 6.
- **Cambio demo → recepción real con la pestaña Recepción abierta:** no deben aparecer datos de la demo ni quedarse el aviso de demo → comprobación manual en Task 8, paso final.

---

### Task 1: Estadísticas de recepción (`ReceptionStats`)

**Files:**
- Create: `server/stats.mjs`
- Test: `tests/stats.test.mjs`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `distanceBearing([lat, lon], [lat, lon]) → { distance: number /* NM */, bearing: number /* 0–360 */ }`
  - `sectorOf(bearing: number, sectors = 16) → number`
  - `class ReceptionStats({ receiver = null, windowSeconds = 300, sectors = 16, maxRangeNm = 400 })`
    - `record(valid: boolean, now = Date.now())`
    - `position(hex: string, lat: number, lon: number)`
    - `snapshot(now = Date.now()) → { rate: number, history: number[], valid: number, invalid: number, range: null | { max: number, maxHex: string|null, sectors: number[] } }`

- [ ] **Step 1: Escribir las pruebas que fallan**

`tests/stats.test.mjs`:

```js
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
```

- [ ] **Step 2: Ejecutar y comprobar que fallan**

Run: `node --test tests/stats.test.mjs`
Expected: FAIL con `Cannot find module '.../server/stats.mjs'`.

- [ ] **Step 3: Implementar**

`server/stats.mjs`:

```js
const EARTH_NM = 3440.065;
const rad = degrees => degrees * Math.PI / 180;
const round1 = value => Math.round(value * 10) / 10;

export function distanceBearing([lat1, lon1], [lat2, lon2]) {
  const p1 = rad(lat1), p2 = rad(lat2), dp = p2 - p1, dl = rad(lon2 - lon1);
  const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  const bearing = Math.atan2(Math.sin(dl) * Math.cos(p2), Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl)) * 180 / Math.PI;
  return { distance: 2 * EARTH_NM * Math.asin(Math.min(1, Math.sqrt(h))), bearing: (bearing + 360) % 360 };
}

export const sectorOf = (bearing, sectors = 16) => Math.floor(((bearing + 180 / sectors) % 360) / (360 / sectors));

export class ReceptionStats {
  constructor({ receiver = null, windowSeconds = 300, sectors = 16, maxRangeNm = 400 } = {}) {
    Object.assign(this, { receiver, windowSeconds, maxRangeNm });
    this.buckets = Array.from({ length: windowSeconds }, () => ({ second: -1, valid: 0, invalid: 0 }));
    this.valid = 0;
    this.invalid = 0;
    this.sectors = new Array(sectors).fill(0);
    this.max = 0;
    this.maxHex = null;
  }

  record(valid, now = Date.now()) {
    const second = Math.floor(now / 1000), bucket = this.buckets[second % this.windowSeconds];
    if (bucket.second !== second) Object.assign(bucket, { second, valid: 0, invalid: 0 });
    if (valid) { bucket.valid++; this.valid++; } else { bucket.invalid++; this.invalid++; }
  }

  position(hex, lat, lon) {
    if (!this.receiver) return;
    const { distance, bearing } = distanceBearing(this.receiver, [lat, lon]);
    // Una decodificación CPR errónea puede situar un avión a miles de millas.
    if (!(distance > 0) || distance > this.maxRangeNm) return;
    const sector = sectorOf(bearing, this.sectors.length);
    if (distance > this.sectors[sector]) this.sectors[sector] = distance;
    if (distance > this.max) { this.max = distance; this.maxHex = hex; }
  }

  snapshot(now = Date.now()) {
    const current = Math.floor(now / 1000);
    const history = Array.from({ length: this.windowSeconds }, (_, i) => {
      const second = current - this.windowSeconds + i, bucket = this.buckets[((second % this.windowSeconds) + this.windowSeconds) % this.windowSeconds];
      return bucket.second === second ? bucket.valid : 0;
    });
    const range = this.receiver ? { max: round1(this.max), maxHex: this.maxHex, sectors: this.sectors.map(round1) } : null;
    return { rate: history.slice(-10).reduce((sum, value) => sum + value, 0) / 10, history, valid: this.valid, invalid: this.invalid, range };
  }
}
```

- [ ] **Step 4: Ejecutar y comprobar que pasan**

Run: `node --test tests/stats.test.mjs`
Expected: PASS, 8 pruebas.

- [ ] **Step 5: Commit**

```bash
git add server/stats.mjs tests/stats.test.mjs
git commit -m "Estadísticas de recepción: ritmo por segundo y alcance por sector"
```

---

### Task 2: Conectar el store y el flujo SBS con las estadísticas

**Files:**
- Modify: `server/aircraft.mjs` (constructor y rama de posición de `ingest`)
- Modify: `server/feed.mjs` (opciones y bucle de líneas del evento `data`)
- Test: `tests/aircraft.test.mjs`, `tests/feed-api.test.mjs`

**Interfaces:**
- Consumes: `ReceptionStats.record(valid)` (Task 1), aunque el flujo solo necesita un objeto con `record`.
- Produces:
  - `new AircraftStore({ ..., onPosition = null })`; `onPosition(hex, lat, lon, now)` se llama solo al aceptar una posición válida.
  - `new SbsFeed(store, { ..., stats = null })`; llama a `stats.record(true|false)` por cada línea no vacía.

- [ ] **Step 1: Escribir las pruebas que fallan**

Añadir al final de `tests/aircraft.test.mjs`:

```js
test('notifica solo las posiciones válidas', () => {
  const calls = [];
  const store = new AircraftStore({ onPosition: (...args) => calls.push(args) });
  store.ingest(message({ lat: '40.4', lon: '-3.7' }), 1000);
  store.ingest(message({ lat: '91', lon: '-3.7' }), 2000);
  store.ingest(message({ speed: '400' }), 3000);
  assert.deepEqual(calls, [['ABC123', 40.4, -3.7, 1000]]);
});
```

Añadir a `tests/feed-api.test.mjs`, antes de la función `request`:

```js
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
```

- [ ] **Step 2: Ejecutar y comprobar que fallan**

Run: `node --test tests/aircraft.test.mjs tests/feed-api.test.mjs`
Expected: FAIL en «notifica solo las posiciones válidas» (`calls` vacío) y en «cuenta líneas…» (`recorded` vacío).

- [ ] **Step 3: Implementar**

En `server/aircraft.mjs`, sustituir el constructor:

```js
  constructor({ ttl = 120_000, positionTtl = 30_000, maxAircraft = 2000, onPosition = null } = {}) {
    this.ttl = ttl;
    this.positionTtl = positionTtl;
    this.maxAircraft = maxAircraft;
    this.onPosition = onPosition;
    this.aircraft = new Map();
    this.messages = 0;
    this.lastMessageAt = null;
  }
```

y en la rama de posición sustituir `a.lat = lat; a.lon = lon; a.positionAt = now;` por:

```js
      a.lat = lat; a.lon = lon; a.positionAt = now;
      this.onPosition?.(hex, lat, lon, now);
```

En `server/feed.mjs`, sustituir la primera línea del constructor:

```js
  constructor(store, { host = '127.0.0.1', port = 30003, retryMs = 3000, connectTimeoutMs = 5000, stats = null } = {}) {
    Object.assign(this, { store, host, port, retryMs, connectTimeoutMs, stats });
```

y sustituir el manejador `data` completo:

```js
    socket.on('data', chunk => {
      buffer += chunk;
      let end;
      while ((end = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, end);
        buffer = buffer.slice(end + 1);
        if (!line.trim()) continue;
        this.stats?.record(line.length <= 2048 && this.store.ingest(line));
      }
      if (buffer.length > 2048) { this.stats?.record(false); this.error = 'Flujo incompatible: se espera SBS/BaseStation'; socket.destroy(); }
    });
```

- [ ] **Step 4: Ejecutar y comprobar que pasan**

Run: `npm test`
Expected: PASS en todas las pruebas, incluidas las existentes.

- [ ] **Step 5: Commit**

```bash
git add server/aircraft.mjs server/feed.mjs tests/aircraft.test.mjs tests/feed-api.test.mjs
git commit -m "Notificar posiciones y contar líneas válidas y descartadas"
```

---

### Task 3: Sondeo del Pluto (`PlutoProbe`)

**Files:**
- Create: `server/probe.mjs`
- Test: `tests/probe.test.mjs`

**Interfaces:**
- Consumes: `net.createConnection` de `node:net` (se importa como `import net from 'node:net'` para que las pruebas puedan simularlo, igual que `feed.mjs`).
- Produces:
  - `class PlutoProbe({ host, intervalMs = 10000, timeoutMs = 2000, ports = { http: 80, iio: 30431 } })`
    - `start()`, `stop()`, `check() → Promise<void>`
    - `status() → { host: string, http: Port, iio: Port } | { host: null, http: null, iio: null }`, con `Port = { ok: boolean|null, error: string|null, checkedAt: number|null }`

- [ ] **Step 1: Escribir las pruebas que fallan**

`tests/probe.test.mjs`:

```js
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
```

- [ ] **Step 2: Ejecutar y comprobar que fallan**

Run: `node --test tests/probe.test.mjs`
Expected: FAIL con `Cannot find module '.../server/probe.mjs'`.

- [ ] **Step 3: Implementar**

`server/probe.mjs`:

```js
import net from 'node:net';

// Solo abre y cierra conexiones TCP: nunca envía datos al Pluto.
export class PlutoProbe {
  constructor({ host, intervalMs = 10000, timeoutMs = 2000, ports = { http: 80, iio: 30431 } } = {}) {
    Object.assign(this, { host: host?.trim() || null, intervalMs, timeoutMs, ports });
    this.results = Object.fromEntries(Object.keys(ports).map(name => [name, { ok: null, error: null, checkedAt: null }]));
    this.sockets = new Set();
    this.running = false;
    this.checking = false;
  }
  start() {
    if (!this.host || this.running) return;
    this.running = true;
    this.check();
    this.timer = setInterval(() => this.check(), this.intervalMs);
  }
  async check() {
    if (!this.host || this.checking) return;
    this.checking = true;
    try {
      await Promise.all(Object.entries(this.ports).map(async ([name, port]) => { this.results[name] = { ...await this.connect(port), checkedAt: Date.now() }; }));
    } finally { this.checking = false; }
  }
  connect(port) {
    return new Promise(resolve => {
      const socket = net.createConnection({ host: this.host, port });
      this.sockets.add(socket);
      let done = false;
      const finish = result => { if (done) return; done = true; clearTimeout(timer); this.sockets.delete(socket); socket.destroy(); resolve(result); };
      const timer = setTimeout(() => finish({ ok: false, error: 'ETIMEDOUT' }), this.timeoutMs);
      socket.once('connect', () => finish({ ok: true, error: null }));
      socket.once('error', error => finish({ ok: false, error: error.code || error.message }));
      socket.once('close', () => finish({ ok: false, error: 'ECONNRESET' }));
    });
  }
  stop() { this.running = false; clearInterval(this.timer); for (const socket of this.sockets) socket.destroy(); }
  status() { return this.host ? { host: this.host, ...this.results } : { host: null, http: null, iio: null }; }
}
```

- [ ] **Step 4: Ejecutar y comprobar que pasan**

Run: `node --test tests/probe.test.mjs`
Expected: PASS, 4 pruebas.

- [ ] **Step 5: Commit**

```bash
git add server/probe.mjs tests/probe.test.mjs
git commit -m "Sondeo TCP de solo lectura del Pluto (HTTP e IIO)"
```

---

### Task 4: Diagnóstico de la cadena (`diagnose`)

**Files:**
- Create: `server/chain.mjs`
- Test: `tests/chain.test.mjs`

**Interfaces:**
- Consumes: forma de `PlutoProbe.status()` (Task 3) y de `SbsFeed.status()` (`{ connected, error, source, lastMessageAt }`, ya existente).
- Produces: `diagnose({ probe, feed, now = Date.now() }) → { plutoHost: string|null, steps: Step[], firstFailure: string|null }`, con `Step = { id: 'pluto-http'|'pluto-iio'|'decoder'|'messages', label: string, state: 'ok'|'warn'|'fail'|'unknown', detail: string }`.

- [ ] **Step 1: Escribir las pruebas que fallan**

`tests/chain.test.mjs`:

```js
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
```

- [ ] **Step 2: Ejecutar y comprobar que fallan**

Run: `node --test tests/chain.test.mjs`
Expected: FAIL con `Cannot find module '.../server/chain.mjs'`.

- [ ] **Step 3: Implementar**

`server/chain.mjs`:

```js
const FRESH_MS = 15_000;

function portStep(host, result, okDetail, failDetail) {
  if (!host) return { state: 'unknown', detail: 'Sondeo desactivado: PLUTO_HOST está vacío.' };
  if (result?.ok == null) return { state: 'unknown', detail: 'Aún sin comprobar.' };
  return result.ok ? { state: 'ok', detail: okDetail } : { state: 'fail', detail: `${failDetail} (${result.error})` };
}

export function diagnose({ probe, feed, now = Date.now() }) {
  const host = probe.host, fresh = feed.lastMessageAt != null && now - feed.lastMessageAt < FRESH_MS;
  const http = { id: 'pluto-http', label: 'Pluto web', ...portStep(host, probe.http, `http://${host} responde.`, `No responde http://${host}. Comprueba en Windows que aparece el adaptador USB de red del Pluto.`) };
  const iio = { id: 'pluto-iio', label: 'Pluto IIO', ...portStep(host, probe.iio, `Servicio IIO accesible en ${host}:30431.`, `WSL no llega al servicio IIO en ${host}:30431. Si Windows abre http://${host}, revisa la ruta entre WSL y el adaptador USB de red (README).`) };
  if (http.state === 'fail' && iio.state === 'ok') http.state = 'warn';
  // Con mensajes llegando, el decodificador puede estar en otro equipo o en el propio Pluto.
  if (fresh) for (const step of [http, iio]) if (step.state === 'fail') { step.state = 'warn'; step.detail += ' Llegan mensajes, así que no impide la recepción.'; }
  const decoder = feed.connected ? { state: 'ok', detail: `Conectado a ${feed.source}.` } : { state: 'fail', detail: `No hay decodificador en ${feed.source}. Inícialo con --net${feed.error ? ` (${feed.error})` : ''}.` };
  const messages = !feed.connected ? { state: 'unknown', detail: 'Sin decodificador no se pueden recibir mensajes.' } : fresh ? { state: 'ok', detail: 'Llegan mensajes válidos.' } : { state: 'fail', detail: 'Decodificador conectado sin mensajes. Revisa la antena en RX1, su posición y la ganancia.' };
  const steps = [http, iio, { id: 'decoder', label: 'Decodificador SBS', ...decoder }, { id: 'messages', label: 'Mensajes ADS-B', ...messages }];
  return { plutoHost: host, steps, firstFailure: steps.find(step => step.state === 'fail')?.id ?? null };
}
```

- [ ] **Step 4: Ejecutar y comprobar que pasan**

Run: `node --test tests/chain.test.mjs`
Expected: PASS, 7 pruebas.

- [ ] **Step 5: Commit**

```bash
git add server/chain.mjs tests/chain.test.mjs
git commit -m "Diagnóstico de la cadena de recepción"
```

---

### Task 5: API, arranque del servidor y configuración

**Files:**
- Modify: `server/index.mjs` (imports, `createApp`, bloque de arranque)
- Modify: `src/useAircraft.js` (validación de la respuesta)
- Modify: `.env.example`, `scripts/doctor.py`
- Test: `tests/feed-api.test.mjs` (primera prueba)

**Interfaces:**
- Consumes: `ReceptionStats` (Task 1), `AircraftStore({ onPosition })` y `SbsFeed({ stats })` (Task 2), `PlutoProbe` (Task 3), `diagnose` (Task 4).
- Produces: `createApp({ store, feed, receiver = receiverPosition(), stats = new ReceptionStats({ receiver }), probe = new PlutoProbe() })`; `GET /api/aircraft` añade `stats` (`ReceptionStats.snapshot()`) y `chain` (`diagnose(...)`).

- [ ] **Step 1: Escribir la prueba que falla**

En la primera prueba de `tests/feed-api.test.mjs`, añadir el import:

```js
import { ReceptionStats } from '../server/stats.mjs';
```

sustituir `const store = new AircraftStore(), feed = new SbsFeed(store, { retryMs: 5 });` por:

```js
  const stats = new ReceptionStats({ receiver: [40, -3] });
  const store = new AircraftStore({ onPosition: (hex, lat, lon) => stats.position(hex, lat, lon) }), feed = new SbsFeed(store, { retryMs: 5, stats });
```

sustituir `const app = createApp({ store, feed, receiver: [40, -3] });` por:

```js
  const app = createApp({ store, feed, stats, receiver: [40, -3] });
```

y añadir después de `assert.equal(result.headers['Cache-Control'], 'no-store');`:

```js
  assert.equal(data.stats.valid, 2);
  assert.equal(data.stats.invalid, 0);
  assert.equal(data.stats.history.length, 300);
  assert.equal(data.stats.range.maxHex, 'ABC123');
  assert.equal(data.stats.range.sectors[14], 40.1);
  assert.equal(data.chain.plutoHost, null);
  assert.deepEqual(data.chain.steps.map(s => s.state), ['unknown', 'unknown', 'ok', 'ok']);
  assert.equal(data.chain.firstFailure, null);
```

- [ ] **Step 2: Ejecutar y comprobar que falla**

Run: `node --test tests/feed-api.test.mjs`
Expected: FAIL en «reconstruye mensajes SBS…» con `Cannot read properties of undefined (reading 'valid')`.

- [ ] **Step 3: Implementar**

En `server/index.mjs`, añadir los imports:

```js
import { ReceptionStats } from './stats.mjs';
import { PlutoProbe } from './probe.mjs';
import { diagnose } from './chain.mjs';
```

sustituir la firma de `createApp` y la rama `/api/aircraft`:

```js
export function createApp({ store, feed, receiver = receiverPosition(), stats = new ReceptionStats({ receiver }), probe = new PlutoProbe() }) {
```

```js
    if (pathname === '/api/aircraft') {
      const now = Date.now(), feedStatus = feed.status();
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ now, aircraft: store.snapshot(now), messages: store.messages, receiver, feed: feedStatus, stats: stats.snapshot(now), chain: diagnose({ probe: probe.status(), feed: feedStatus, now }) }));
      return;
    }
```

y sustituir el cuerpo del bloque de arranque desde `const store = new AircraftStore();` hasta el final del bloque:

```js
  const receiver = receiverPosition();
  const stats = new ReceptionStats({ receiver });
  const store = new AircraftStore({ onPosition: (hex, lat, lon) => stats.position(hex, lat, lon) });
  const feed = new SbsFeed(store, { host: process.env.SBS_HOST || '127.0.0.1', port: feedPort, stats });
  const probe = new PlutoProbe({ host: process.env.PLUTO_HOST ?? '192.168.2.1' });
  const server = createApp({ store, feed, stats, probe, receiver });
  const stop = () => { feed.stop(); probe.stop(); };
  server.on('error', error => { console.error(error.message); stop(); process.exitCode = 1; });
  server.listen(port, process.env.HOST || '127.0.0.1', () => { feed.start(); probe.start(); console.log(`Airplains: http://${process.env.HOST || '127.0.0.1'}:${port} · SBS ${feed.host}:${feed.port} · Pluto ${probe.host || 'sin sondeo'}`); });
  for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => { stop(); server.close(); server.closeAllConnections(); });
}
```

En `src/useAircraft.js`, sustituir la validación:

```js
        if (!Array.isArray(data.aircraft) || !data.feed || !data.stats || !data.chain) throw new Error('Respuesta del receptor no válida');
```

En `.env.example`, añadir al final:

```
# IP del Pluto+ para el sondeo de diagnóstico (TCP a :80 y :30431, sin enviar datos). Vacía desactiva el sondeo.
PLUTO_HOST=192.168.2.1
```

En `scripts/doctor.py`, mover la lectura de `.env` antes del `argparse` y usarla como valor por defecto de `--pluto`. Sustituir desde `parser = argparse.ArgumentParser(description=__doc__)` hasta `config[key.strip()] = value.strip().strip('\"\'')` por:

```python
    config = {}
    env_file = Path(__file__).resolve().parents[1] / '.env'
    if env_file.exists():
        for line in env_file.read_text().splitlines():
            if '=' in line and not line.lstrip().startswith('#'):
                key, value = line.split('=', 1)
                config[key.strip()] = value.strip().strip('\"\'')
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--pluto', default=os.getenv('PLUTO_HOST') or config.get('PLUTO_HOST') or '192.168.2.1')
    args = parser.parse_args()
```

- [ ] **Step 4: Ejecutar y comprobar que pasan**

Run: `npm test && python3 scripts/doctor.py --help`
Expected: todas las pruebas PASS; `doctor.py --help` muestra la ayuda sin error.

Run: `PORT=3099 SBS_PORT=39999 PLUTO_HOST= timeout 3 node server/index.mjs; curl -s 127.0.0.1:3099/api/aircraft` (en dos terminales, o con `&` y `sleep 1` antes de curl)
Expected: el log muestra `· Pluto sin sondeo`; el JSON contiene `"stats":{` y `"chain":{` con `"firstFailure":"decoder"`. Si el entorno bloquea la apertura de puertos, anotarlo y confiar en la prueba de la API.

- [ ] **Step 5: Commit**

```bash
git add server/index.mjs src/useAircraft.js .env.example scripts/doctor.py tests/feed-api.test.mjs
git commit -m "Publicar estadísticas y diagnóstico en /api/aircraft"
```

---

### Task 6: Utilidades de formato y geometría de gráficos

**Files:**
- Create: `src/format.mjs`
- Create: `src/charts.mjs`
- Modify: `src/AircraftPanel.jsx:2` (usar `format` compartido)
- Test: `tests/charts.test.mjs`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `format(value) → string` (entero es-ES o `—`), `formatDecimal(value) → string` (un decimal es-ES o `—`)
  - `niceMax(value) → number` (1, 2 o 5 × 10ⁿ ≥ value; 1 si value ≤ 0)
  - `linePoints(values, width, height, max = niceMax(Math.max(...values))) → [x, y][]`
  - `pathOf(points) → string` (comandos `M`/`L` con un decimal)
  - `polarPoint(bearing, distance, radius, max) → [x, y]` (norte arriba, y negativa)
  - `wedgePath(index, distance, radius, max, sectors = 16) → string` (`''` si distance ≤ 0)
  - `perMinute(history) → { label: string, mean: number, max: number }[]` (bloques de 60 s, el más antiguo primero)

- [ ] **Step 1: Escribir las pruebas que fallan**

`tests/charts.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { niceMax, linePoints, pathOf, polarPoint, wedgePath, perMinute } from '../src/charts.mjs';
import { format, formatDecimal } from '../src/format.mjs';

test('redondea el máximo del eje a 1, 2 o 5 por potencia de diez', () => {
  assert.equal(niceMax(0), 1);
  assert.equal(niceMax(7), 10);
  assert.equal(niceMax(40), 50);
  assert.equal(niceMax(100), 100);
  assert.equal(niceMax(101), 200);
});

test('coloca la línea de izquierda a derecha y desde la base', () => {
  assert.deepEqual(linePoints([0, 5, 10], 100, 50), [[0, 50], [50, 25], [100, 0]]);
  assert.equal(pathOf([[0, 50], [50, 25]]), 'M0.0,50.0L50.0,25.0');
});

test('un historial a cero es una línea plana en la base', () => {
  const points = linePoints(new Array(300).fill(0), 300, 96);
  assert.ok(points.every(([x, y]) => Number.isFinite(x) && y === 96));
});

test('el gráfico polar tiene el norte arriba y el este a la derecha', () => {
  const [nx, ny] = polarPoint(0, 10, 100, 10), [ex, ey] = polarPoint(90, 5, 100, 10);
  assert.ok(Math.abs(nx) < 1e-9); assert.equal(ny, -100);
  assert.ok(Math.abs(ex - 50) < 1e-9); assert.ok(Math.abs(ey) < 1e-9);
});

test('cada sector es una cuña centrada en su rumbo', () => {
  assert.equal(wedgePath(0, 0, 100, 10), '');
  assert.equal(wedgePath(0, 10, 100, 10), 'M0,0L-19.5,-98.1A100.0,100.0 0 0 1 19.5,-98.1Z');
});

test('resume el historial por minuto', () => {
  const history = [...new Array(240).fill(0), ...new Array(60).fill(3)];
  history[0] = 60;
  const rows = perMinute(history);
  assert.equal(rows.length, 5);
  assert.deepEqual(rows[0], { label: 'Hace 5–4 min', mean: 1, max: 60 });
  assert.deepEqual(rows[4], { label: 'Último minuto', mean: 3, max: 3 });
});

test('formatea en español con raya para desconocidos', () => {
  assert.equal(format(null), '—');
  assert.equal(format(12345), '12.345');
  assert.equal(formatDecimal(41.25), '41,3');
  assert.equal(formatDecimal(undefined), '—');
});
```

- [ ] **Step 2: Ejecutar y comprobar que fallan**

Run: `node --test tests/charts.test.mjs`
Expected: FAIL con `Cannot find module '.../src/charts.mjs'`.

- [ ] **Step 3: Implementar**

`src/format.mjs`:

```js
const integer = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 }), decimal = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 });
export const format = value => value == null ? '—' : integer.format(value);
export const formatDecimal = value => value == null ? '—' : decimal.format(value);
```

Nota: `Intl` es-ES no agrupa números de 4 cifras (`1234`), sí de 5 (`12.345`); es el comportamiento actual del panel.

`src/charts.mjs`:

```js
export function niceMax(value) {
  if (!(value > 0)) return 1;
  const step = 10 ** Math.floor(Math.log10(value));
  return [1, 2, 5, 10].map(m => m * step).find(m => m >= value);
}
export function linePoints(values, width, height, max = niceMax(Math.max(...values))) {
  const dx = values.length > 1 ? width / (values.length - 1) : 0;
  return values.map((value, i) => [i * dx, height - value / max * height]);
}
export const pathOf = points => points.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join('');
export function polarPoint(bearing, distance, radius, max) {
  const r = distance / max * radius, angle = bearing * Math.PI / 180;
  return [r * Math.sin(angle), -r * Math.cos(angle)];
}
export function wedgePath(index, distance, radius, max, sectors = 16) {
  if (!(distance > 0)) return '';
  const width = 360 / sectors, start = index * width - width / 2, r = (distance / max * radius).toFixed(1);
  const [x0, y0] = polarPoint(start, distance, radius, max), [x1, y1] = polarPoint(start + width, distance, radius, max);
  return `M0,0L${x0.toFixed(1)},${y0.toFixed(1)}A${r},${r} 0 0 1 ${x1.toFixed(1)},${y1.toFixed(1)}Z`;
}
export function perMinute(history) {
  const minutes = Math.ceil(history.length / 60);
  return Array.from({ length: minutes }, (_, i) => {
    const block = history.slice(i * 60, (i + 1) * 60), ago = minutes - i;
    return { label: ago === 1 ? 'Último minuto' : `Hace ${ago}–${ago - 1} min`, mean: Math.round(block.reduce((a, b) => a + b, 0) / block.length * 10) / 10, max: Math.max(...block) };
  });
}
```

En `src/AircraftPanel.jsx`, sustituir la línea 2 (`const format = …`) por:

```js
import { format } from './format.mjs';
```

- [ ] **Step 4: Ejecutar y comprobar que pasan**

Run: `npm test && npm run build`
Expected: todas las pruebas PASS; build sin errores.

- [ ] **Step 5: Commit**

```bash
git add src/format.mjs src/charts.mjs src/AircraftPanel.jsx tests/charts.test.mjs
git commit -m "Utilidades de formato y geometría para los gráficos de recepción"
```

---

### Task 7: Pestañas del panel, cadena y cifras de recepción

**Files:**
- Create: `src/ReceptionPanel.jsx`
- Modify: `src/AircraftPanel.jsx` (archivo completo)
- Modify: `src/App.jsx` (estado `tab`, estado de cabecera, props del panel)
- Modify: `src/ReceiverDialog.jsx` (párrafo de remisión)
- Modify: `src/styles.css` (añadir al final)

**Interfaces:**
- Consumes: `format`, `formatDecimal` (Task 6); `data.stats` y `data.chain` (Task 5).
- Produces:
  - `AircraftPanel({ aircraft, allCount, positionedCount, query, onQuery, selected, onSelect, feed, demo, messages, tab, onTab, stats, chain, error })`
  - `ReceptionPanel({ demo, error, stats, chain, total, positioned })`; Task 8 añade `RateChart` y `RangeChart` dentro.

- [ ] **Step 1: Crear `src/ReceptionPanel.jsx`**

```jsx
import { Signal } from './Icons';
import { format, formatDecimal } from './format.mjs';
const STATES = { ok: ['Correcto', '✓'], warn: ['Aviso', '!'], fail: ['Fallo', '×'], unknown: ['Sin comprobar', '?'] };
export function ReceptionPanel({ demo, error, stats, chain, total, positioned }) {
  const lines = stats ? stats.valid + stats.invalid : 0;
  const body = demo ? <div className="empty-state"><Signal size={44}/><h2>Sin datos de recepción</h2><p>La demostración no simula recepción RF. Vuelve a recepción real para ver el diagnóstico.</p></div>
    : !stats || !chain ? <div className="empty-state"><Signal size={44}/><h2>{error ? 'Servidor local no disponible' : 'Conectando…'}</h2><p>{error || 'Esperando la primera respuesta del servidor.'}</p></div>
    : <>
      <section className="reception-section" aria-labelledby="chain-title"><h2 id="chain-title">Cadena de recepción</h2><ol className="chain">{chain.steps.map(step => <li key={step.id} className={`chain-step ${step.state} ${step.id === chain.firstFailure ? 'first' : ''}`}><span className="chain-icon" aria-hidden="true">{STATES[step.state][1]}</span><div><strong>{step.label}</strong><span className="chain-state">{STATES[step.state][0]}</span>{step.state !== 'ok' && <p>{step.detail}</p>}</div></li>)}</ol></section>
      <section className="reception-section" aria-labelledby="rate-title"><h2 id="rate-title">Mensajes por segundo</h2><p className="stat-value">{formatDecimal(stats.rate)}<span> msg/s · últimos 10 s</span></p>
        <dl className="reception-figures"><div><dt>Líneas válidas</dt><dd>{lines ? `${formatDecimal(stats.valid / lines * 100)} %` : '—'}</dd></div><div><dt>Descartadas</dt><dd>{format(stats.invalid)}</dd></div><div><dt>Aviones</dt><dd>{format(total)}</dd></div><div><dt>Con posición</dt><dd>{format(positioned)}</dd></div></dl></section>
      <section className="reception-section" aria-labelledby="range-title"><h2 id="range-title">Alcance</h2>{stats.range ? <><p className="stat-value">{stats.range.maxHex ? formatDecimal(stats.range.max) : '—'}<span> NM</span></p><p className="muted">{stats.range.maxHex ? `Máximo de la sesión · ${stats.range.maxHex}` : 'Aún no se ha recibido ninguna posición.'}</p></> : <p className="muted">Configura RECEIVER_LAT y RECEIVER_LON en .env para medir el alcance.</p>}</section>
    </>;
  return <div className="tab-body" role="tabpanel" id="tabpanel-reception" aria-labelledby="tab-reception"><div className="panel-heading"><h1>Recepción</h1><span className="panel-count">Sesión actual</span></div><div className="reception-scroll">{body}</div></div>;
}
```

- [ ] **Step 2: Reescribir `src/AircraftPanel.jsx`**

```jsx
import { Plane, Signal } from './Icons';
import { format } from './format.mjs';
import { ReceptionPanel } from './ReceptionPanel';
const TABS = [['aircraft', 'Aviones'], ['reception', 'Recepción']];
export function AircraftPanel({ aircraft, allCount, positionedCount, query, onQuery, selected, onSelect, feed, demo, messages, tab, onTab, stats, chain, error }) {
  const current = aircraft.find(a => a.hex === selected);
  function onTabKey(e) {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const index = TABS.findIndex(([id]) => id === tab), next = TABS[(index + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length][0];
    onTab(next);
    document.getElementById(`tab-${next}`).focus();
  }
  return <aside className="aircraft-panel" aria-label="Panel de aviones y recepción">
    <div className="panel-tabs" role="tablist" aria-label="Vista del panel" onKeyDown={onTabKey}>{TABS.map(([id, label]) => <button key={id} id={`tab-${id}`} role="tab" aria-selected={tab === id} aria-controls={`tabpanel-${id}`} tabIndex={tab === id ? 0 : -1} className="panel-tab" onClick={() => onTab(id)}>{label}</button>)}</div>
    {tab === 'reception' ? <ReceptionPanel demo={demo} error={error} stats={stats} chain={chain} total={allCount} positioned={positionedCount}/> : <div className="tab-body" role="tabpanel" id="tabpanel-aircraft" aria-labelledby="tab-aircraft">
    <div className="panel-heading"><h1>Aviones <span>({allCount})</span></h1><span className="panel-count">{aircraft.filter(a => a.lat != null).length} en mapa</span></div>
    <div className="search-wrap"><span aria-hidden="true">⌕</span><input aria-label="Buscar vuelo o ICAO" type="search" placeholder="Buscar vuelo o ICAO" value={query} onChange={e => onQuery(e.target.value)}/></div>
    <div className="aircraft-scroll">
      {aircraft.length ? <><div className="list-labels"><span>Vuelo / ICAO</span><span>Altitud · ft</span></div><ul className="aircraft-list">{aircraft.map(a => <li key={a.hex}><button aria-pressed={a.hex === selected} onClick={() => onSelect(a.hex)} className={`aircraft-row ${a.hex === selected ? 'active' : ''}`}><Plane size={20}/><span><strong>{a.callsign || a.hex}</strong><small>{a.hex} {a.lat == null ? '· sin posición' : ''}</small></span><span className="altitude">{format(a.altitude)}<small>{format(a.speed)} kt</small></span></button></li>)}</ul></> : <div className="empty-state"><Plane size={52}/><h2>{query ? 'Sin coincidencias' : 'Aún no hay aviones'}</h2><p>{query ? 'Prueba con otro vuelo o código ICAO.' : 'Los vuelos recibidos aparecerán aquí.'}</p>{query && <button className="button" onClick={() => onQuery('')}>Limpiar búsqueda</button>}</div>}
      {current && <section className="flight-detail" aria-label="Detalles del avión"><div className="detail-title"><h2>{current.callsign || current.hex}</h2><button className="icon-button" aria-label="Cerrar detalles del avión" onClick={() => onSelect(null)}>×</button></div><p className="muted">{demo ? 'Vuelo simulado' : 'Datos recibidos por ADS-B'}</p><dl><div><dt>Altitud</dt><dd>{format(current.altitude)} ft</dd></div><div><dt>Velocidad</dt><dd>{format(current.speed)} kt</dd></div><div><dt>Rumbo</dt><dd>{format(current.track)}°</dd></div><div><dt>Último mensaje</dt><dd>{format(current.seen)} s</dd></div><div><dt>Ascenso / descenso</dt><dd>{format(current.verticalRate)} ft/min</dd></div><div><dt>Squawk</dt><dd>{current.squawk || '—'}</dd></div></dl><p className="coordinates">{current.lat == null ? 'Sin posición reciente. Se oculta del mapa tras 30 s.' : `${current.lat.toFixed(4)}°, ${current.lon.toFixed(4)}°`}</p></section>}
    </div></div>}
    <div className="receiver-summary"><Signal size={29}/><div><strong>{demo ? 'Demostración · ADS-B' : 'Pluto+ · ADS-B'}</strong><p className="source">{demo ? 'Datos simulados, sin recepción RF' : `SBS ${feed?.source || '127.0.0.1:30003'}`}</p><p>{format(messages)} mensajes · actualización cada segundo</p></div></div>
  </aside>;
}
```

- [ ] **Step 3: Modificar `src/App.jsx`**

Después de la línea de `const [query, setQuery] = …`, añadir:

```jsx
  const [tab, setTab] = useState('aircraft');
```

Sustituir en la línea de `const status =` el tramo `: !connected ? 'Sin conexión'` por:

```jsx
: !connected ? (/^pluto-/.test(data.chain.firstFailure) ? 'Pluto no accesible' : 'Sin conexión')
```

Sustituir `<AircraftPanel aircraft={aircraft} allCount={all.length}` por:

```jsx
<AircraftPanel aircraft={aircraft} allCount={all.length} positionedCount={all.filter(a => a.lat != null).length} tab={tab} onTab={setTab} stats={data?.stats} chain={data?.chain} error={error}
```

- [ ] **Step 4: Modificar `src/ReceiverDialog.jsx`**

Insertar justo antes de `<p className="muted">Ejecuta <code>npm run doctor</code>`:

```jsx
<p className="muted">La pestaña <strong>Recepción</strong> del panel muestra cada paso de la cadena, el ritmo de mensajes y el alcance.</p>
```

- [ ] **Step 5: Añadir estilos al final de `src/styles.css`**

```css
.panel-tabs{display:flex;gap:4px;padding:12px 22px 0;border-bottom:1px solid var(--border);flex-shrink:0}.panel-tab{border:0;border-bottom:3px solid transparent;background:transparent;margin-bottom:-1px;padding:10px 12px;font-size:13px;font-weight:600;color:var(--muted)}.panel-tab:hover{color:var(--ink)}.panel-tab[aria-selected=true]{color:var(--ink);border-bottom-color:var(--accent)}.tab-body{flex:1;display:flex;flex-direction:column;min-height:0}.reception-scroll{flex:1;overflow-y:auto;min-height:0;scrollbar-gutter:stable}.reception-section{padding:4px 22px 22px;border-bottom:1px solid #e7edf2}.reception-section+.reception-section{padding-top:20px}.reception-section h2{font-size:11px;text-transform:uppercase;letter-spacing:.7px;color:var(--muted);margin-bottom:12px}.chain{list-style:none;padding:0;margin:0;display:grid;gap:10px}.chain-step{display:flex;gap:11px;align-items:flex-start;font-size:13px;padding:8px 10px;margin:0 -10px;border-radius:5px}.chain-icon{width:20px;height:20px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:#fff;background:#92a3b3;flex-shrink:0}.chain-step.ok .chain-icon{background:#0ca30c}.chain-step.warn .chain-icon{background:#fab219;color:var(--ink)}.chain-step.fail .chain-icon{background:#d03b3b}.chain-state{margin-left:8px;font-size:11px;color:var(--muted)}.chain-step p{margin-top:4px;color:var(--muted);line-height:1.5;font-size:12px}.chain-step.first{background:#fbeeee}.chain-step.first p{color:var(--ink)}.stat-value{font-size:28px;font-weight:600;letter-spacing:-.5px}.stat-value span{font-size:12px;font-weight:400;color:var(--muted);letter-spacing:0}.reception-figures{display:grid;grid-template-columns:1fr 1fr;gap:14px 12px;margin:16px 0 0}.reception-figures dt{font-size:11px;color:var(--muted);margin-bottom:4px}.reception-figures dd{margin:0;font-size:14px}
@media(max-width:760px){.panel-tabs{padding:10px 20px 0}.reception-scroll{min-height:180px;max-height:420px}.reception-section{padding-left:20px;padding-right:20px}}
@media(forced-colors:active){.chain-icon{border:2px solid CanvasText}.panel-tab[aria-selected=true]{border-bottom-color:Highlight}}
```

- [ ] **Step 6: Verificar**

Run: `npm test && npm run build`
Expected: todas las pruebas PASS; build sin errores.

Run: `npm run dev`, abrir http://localhost:5173 y comprobar:
- Pestañas Aviones/Recepción; flechas izquierda/derecha cambian de pestaña con foco visible.
- Sin decodificador: la cabecera dice «Sin conexión» o «Pluto no accesible» y la pestaña Recepción marca el primer fallo con fondo rojo claro y su consejo.
- «Probar demostración» con la pestaña Recepción abierta: aparece «Sin datos de recepción»; al volver a recepción real reaparece la cadena sin datos de la demo.
- A menos de 760 px el panel queda bajo el mapa y la pestaña Recepción se desplaza.
Si no puedes abrir el navegador, anótalo en el informe de la tarea.

- [ ] **Step 7: Commit**

```bash
git add src/ReceptionPanel.jsx src/AircraftPanel.jsx src/App.jsx src/ReceiverDialog.jsx src/styles.css
git commit -m "Pestaña Recepción con la cadena de diagnóstico y cifras de recepción"
```

---

### Task 8: Gráficos de ritmo y alcance

**Files:**
- Create: `src/ReceptionCharts.jsx`
- Modify: `src/ReceptionPanel.jsx` (import y dos inserciones)
- Modify: `src/styles.css` (añadir al final)

**Interfaces:**
- Consumes: `niceMax`, `linePoints`, `pathOf`, `polarPoint`, `wedgePath`, `perMinute` (Task 6); `format`, `formatDecimal` (Task 6); `stats.history` y `stats.range.sectors` (Task 5).
- Produces: `RateChart({ history: number[] })`, `RangeChart({ sectors: number[] })`.

Reglas de dataviz aplicadas: una sola serie por gráfico, sin leyenda (el título de la sección la nombra); línea de 2 px en el acento con relleno al 10 %; rejilla de 1 px recesiva; cruz con tooltip por puntero y por teclado; tabla equivalente en `<details>`; texto con tokens de texto, nunca con el color de la serie; huecos de 2 px en color de superficie entre cuñas.

- [ ] **Step 1: Crear `src/ReceptionCharts.jsx`**

```jsx
import { useState } from 'react';
import { niceMax, linePoints, pathOf, polarPoint, wedgePath, perMinute } from './charts.mjs';
import { format, formatDecimal } from './format.mjs';
const W = 300, H = 96, R = 100;
const SECTORS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSO', 'SO', 'OSO', 'O', 'ONO', 'NO', 'NNO'];

export function RateChart({ history }) {
  const [hover, setHover] = useState(null);
  const last = history.length - 1, max = niceMax(Math.max(...history)), points = linePoints(history, W, H, max), line = pathOf(points);
  function move(e) { const box = e.currentTarget.getBoundingClientRect(); setHover(Math.max(0, Math.min(last, Math.round((e.clientX - box.left) / box.width * last)))); }
  function key(e) {
    const step = { ArrowLeft: -10, ArrowRight: 10 }[e.key];
    if (e.key === 'Home') setHover(0); else if (e.key === 'End') setHover(last); else if (step) setHover(v => Math.max(0, Math.min(last, (v ?? last) + step))); else return;
    e.preventDefault();
  }
  const pct = hover == null ? 0 : hover / last * 100;
  return <figure className="chart">
    <div className="chart-plot" tabIndex={0} role="img" aria-label={`Mensajes válidos por segundo durante los últimos 5 minutos. Máximo ${format(Math.max(...history))}. Usa las flechas para recorrer el gráfico.`} onPointerMove={move} onPointerLeave={() => setHover(null)} onKeyDown={key} onBlur={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
        <line className="chart-grid" x1="0" x2={W} y1="0" y2="0"/><line className="chart-grid" x1="0" x2={W} y1={H / 2} y2={H / 2}/><line className="chart-axis" x1="0" x2={W} y1={H} y2={H}/>
        <path className="chart-area" d={`${line}L${W},${H}L0,${H}Z`}/>
        <path className="chart-line" d={line} vectorEffect="non-scaling-stroke"/>
        {hover != null && <line className="chart-crosshair" x1={points[hover][0]} x2={points[hover][0]} y1="0" y2={H} vectorEffect="non-scaling-stroke"/>}
      </svg>
      <span className="chart-tick" style={{ top: 0 }}>{format(max)}</span><span className="chart-tick" style={{ top: '50%' }}>{formatDecimal(max / 2)}</span><span className="chart-tick" style={{ top: '100%' }}>0</span>
      {hover != null && <div className="chart-tooltip" style={{ left: `${pct}%`, transform: `translate(-${pct}%, -100%)` }}><strong>{format(history[hover])} msg/s</strong><span>hace {history.length - hover} s</span></div>}
    </div>
    <div className="chart-x" aria-hidden="true"><span>−5 min</span><span>ahora</span></div>
    <details className="chart-table"><summary>Ver como tabla</summary><table><thead><tr><th>Periodo</th><th>Media msg/s</th><th>Máximo</th></tr></thead><tbody>{perMinute(history).map(row => <tr key={row.label}><th scope="row">{row.label}</th><td>{formatDecimal(row.mean)}</td><td>{format(row.max)}</td></tr>)}</tbody></table></details>
  </figure>;
}

export function RangeChart({ sectors }) {
  const [hover, setHover] = useState(null);
  const max = niceMax(Math.max(...sectors)), n = sectors.length;
  const describe = i => sectors[i] ? `${formatDecimal(sectors[i])} NM` : 'Sin posiciones';
  function key(e) {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!step) return;
    e.preventDefault();
    setHover(v => ((v ?? (step > 0 ? -1 : 0)) + step + n) % n);
  }
  return <figure className="chart">
    <div className="polar" tabIndex={0} role="img" aria-label={`Alcance máximo por dirección; anillo exterior ${format(max)} NM. Usa las flechas para recorrer los sectores.`} onKeyDown={key} onBlur={() => setHover(null)} onPointerLeave={() => setHover(null)}>
      <svg viewBox="-125 -125 250 250" aria-hidden="true">
        {[0.25, 0.5, 0.75, 1].map(f => <circle key={f} className="chart-grid" r={R * f}/>)}
        <line className="chart-grid" x1="0" y1={-R} x2="0" y2={R}/><line className="chart-grid" x1={-R} y1="0" x2={R} y2="0"/>
        {sectors.map((d, i) => <path key={i} className={`polar-wedge ${hover === i ? 'active' : ''}`} d={wedgePath(i, d, R, max, n)}/>)}
        {sectors.map((_, i) => <path key={i} className="polar-hit" d={wedgePath(i, max, R, max, n)} onPointerEnter={() => setHover(i)}/>)}
        {[0.5, 1].map(f => <text key={f} className="polar-label" x="3" y={-R * f + 10}>{format(max * f)}</text>)}
        {[['N', 0], ['E', 90], ['S', 180], ['O', 270]].map(([label, bearing]) => { const [x, y] = polarPoint(bearing, 113, R, R); return <text key={label} className="polar-compass" x={x} y={y} textAnchor="middle" dominantBaseline="middle">{label}</text>; })}
      </svg>
      {hover != null && <div className="chart-tooltip polar-tooltip"><strong>{describe(hover)}</strong><span>Sector {SECTORS[hover]}</span></div>}
    </div>
    <details className="chart-table"><summary>Ver como tabla</summary><table><thead><tr><th>Sector</th><th>Alcance máximo</th></tr></thead><tbody>{sectors.map((_, i) => <tr key={i}><th scope="row">{SECTORS[i]}</th><td>{describe(i)}</td></tr>)}</tbody></table></details>
  </figure>;
}
```

- [ ] **Step 2: Insertar los gráficos en `src/ReceptionPanel.jsx`**

Añadir el import después de `import { format, formatDecimal } from './format.mjs';`:

```jsx
import { RateChart, RangeChart } from './ReceptionCharts';
```

Insertar `<RateChart history={stats.history}/>` justo después del `</p>` de la cifra de mensajes por segundo (antes de `<dl className="reception-figures">`).

Sustituir en la sección de alcance el tramo `'Aún no se ha recibido ninguna posición.'}</p></>` por:

```jsx
'Aún no se ha recibido ninguna posición.'}</p><RangeChart sectors={stats.range.sectors}/></>
```

- [ ] **Step 3: Añadir estilos al final de `src/styles.css`**

```css
.chart{margin:14px 0 0}.chart-plot{position:relative;height:96px;margin-left:34px;touch-action:none}.chart-plot svg{display:block;width:100%;height:100%;overflow:visible}.chart-grid{stroke:var(--border);stroke-width:1;fill:none;vector-effect:non-scaling-stroke}.chart-axis{stroke:#a5b5c2;stroke-width:1;vector-effect:non-scaling-stroke}.chart-line{stroke:var(--accent);stroke-width:2;fill:none;stroke-linejoin:round;stroke-linecap:round}.chart-area{fill:#007f831a}.chart-crosshair{stroke:var(--muted);stroke-width:1}.chart-tick{position:absolute;right:calc(100% + 6px);transform:translateY(-50%);font:10px Consolas,'Liberation Mono',monospace;color:var(--muted)}.chart-x{display:flex;justify-content:space-between;margin:5px 0 0 34px;font-size:10px;color:var(--muted)}.chart-tooltip{position:absolute;top:-6px;background:#fff;border:1px solid var(--border);box-shadow:0 2px 8px #132b4220;border-radius:5px;padding:6px 8px;font-size:11px;white-space:nowrap;pointer-events:none;z-index:1}.chart-tooltip strong{display:block;font-size:13px;font-family:Consolas,'Liberation Mono',monospace}.chart-tooltip span{color:var(--muted)}.chart-table{margin-top:10px;font-size:12px}.chart-table summary{cursor:pointer;color:var(--accent);width:max-content}.chart-table table{border-collapse:collapse;width:100%;margin-top:8px}.chart-table th,.chart-table td{text-align:left;padding:4px 6px;border-bottom:1px solid #e7edf2;font-weight:400}.chart-table thead th{color:var(--muted);font-size:11px}.chart-table td{font-family:Consolas,'Liberation Mono',monospace}.polar{position:relative;max-width:250px;margin:4px auto 0}.polar:focus-visible,.chart-plot:focus-visible{outline:3px solid #0b9fba;outline-offset:3px}.polar svg{display:block;width:100%;height:auto}.polar-wedge{fill:var(--accent);fill-opacity:.7;stroke:var(--surface);stroke-width:2}.polar-wedge.active{fill-opacity:1}.polar-hit{fill:transparent}.polar-label{font:9px Consolas,'Liberation Mono',monospace;fill:var(--muted)}.polar-compass{font:600 11px Arial,Helvetica,sans-serif;fill:var(--ink)}.polar-tooltip{top:0;right:0}
@media(forced-colors:active){.chart-line{stroke:CanvasText}.polar-wedge{fill:CanvasText}}
```

- [ ] **Step 4: Verificar**

Run: `npm test && npm run build`
Expected: todas las pruebas PASS; build sin errores.

Run: `npm run dev`. Para ver datos sin Pluto, en otra terminal emitir SBS sintético en el puerto 30003:

```bash
node -e "require('net').createServer(s=>{let i=0;setInterval(()=>{for(let k=0;k<20;k++){const a=40.4+Math.sin(i/50+k)*1.2,o=-3.7+Math.cos(i/50+k)*1.5;s.write('MSG,3,1,1,'+(0xABC000+k).toString(16).toUpperCase()+',1,,,,,,32000,,,'+a.toFixed(4)+','+o.toFixed(4)+',,,,,,\r\n')}i++},250)}).listen(30003,'127.0.0.1')"
```

con `RECEIVER_LAT=40.4168` y `RECEIVER_LON=-3.7038` en `.env`. Comprobar en la pestaña Recepción:
- La línea sube a unos 80 msg/s, la cruz y el tooltip siguen al puntero y a las flechas, y el tooltip no se sale por los bordes.
- El gráfico polar muestra cuñas en varias direcciones, con N arriba; el tooltip responde al puntero y a las flechas.
- «Ver como tabla» muestra 5 filas por minuto y 16 sectores.
- Sin `RECEIVER_LAT/LON` se ve el aviso de configuración en lugar del gráfico polar.
- Revisar solapes de etiquetas y desbordes a 350 px y a menos de 760 px de ancho.
Si no puedes abrir el navegador, anótalo en el informe de la tarea.

- [ ] **Step 5: Commit**

```bash
git add src/ReceptionCharts.jsx src/ReceptionPanel.jsx src/styles.css
git commit -m "Gráficos de ritmo de mensajes y alcance por sector"
```

---

### Task 9: Documentación

**Files:**
- Modify: `README.md` (sección «Configuración y diagnóstico» y «Verificación»)
- Modify: `DESIGN.md` (sección «Propiedad de comportamientos»)
- Modify: `CLAUDE.md` (sección «Architecture» y «Commands»)

**Interfaces:**
- Consumes: el comportamiento de las tareas 1–8.
- Produces: nada de código.

- [ ] **Step 1: README**

Añadir al final de la sección «Configuración y diagnóstico», antes de «## Estados de los datos»:

```markdown
### Pestaña Recepción

El panel lateral tiene una pestaña **Recepción** para ajustar la antena sin perder el mapa de vista:

- **Cadena de recepción:** Pluto web (:80), Pluto IIO (:30431), decodificador SBS y mensajes ADS-B. Se destaca el primer paso que falla con una indicación. Si llegan mensajes, un fallo al sondear el Pluto se muestra como aviso: el decodificador puede estar en otro equipo o en el propio Pluto.
- **Mensajes por segundo:** media de los últimos 10 s, gráfico de los últimos 5 minutos, porcentaje de líneas válidas, aviones y aviones con posición.
- **Alcance:** máximo de la sesión en millas náuticas (NM) y máximo por sector de 22,5°. Requiere `RECEIVER_LAT` y `RECEIVER_LON`. Se ignoran posiciones a más de 400 NM, que suelen ser errores de decodificación.

El servidor sondea `PLUTO_HOST` (por defecto `192.168.2.1`) cada 10 segundos: abre y cierra una conexión TCP a los puertos 80 y 30431 sin enviar datos. Deja `PLUTO_HOST=` vacío para desactivarlo. `npm run doctor` usa también este valor. Las estadísticas se reinician con el servidor. La demostración no simula recepción y no muestra estas métricas.
```

En «## Verificación», sustituir la frase que empieza por «Las pruebas cubren mensajes SBS parciales» por:

```markdown
Las pruebas cubren mensajes SBS parciales y fragmentados, conservación de valores desconocidos y ceros, caducidad independiente de posición y avión, límites de memoria, reconexión, API, proyección geográfica, estadísticas de recepción, sondeo del Pluto, diagnóstico de la cadena y geometría de los gráficos.
```

- [ ] **Step 2: DESIGN.md**

Añadir al final de «## Propiedad de comportamientos»:

```markdown
- Pestañas del panel: App; Aviones por defecto, no persistida, flechas para cambiar. Recepción muestra cadena (`server/chain.mjs`), ritmo y alcance (`server/stats.mjs`). En demo no muestra métricas; con el servidor caído, solo el error.
- Estados de la cadena: correcto, aviso, fallo y sin comprobar, siempre con icono y texto además del color (#0ca30c, #fab219, #d03b3b, #92a3b3). Estos colores no se usan en gráficos. El primer fallo se destaca con fondo rojo claro y su consejo.
- Gráficos SVG propios en `src/ReceptionCharts.jsx`: una serie, sin leyenda; línea de 2 px en el acento con relleno al 10 %; cuñas polares con hueco de 2 px en color de superficie; tooltip por puntero y teclado; tabla equivalente en un desplegable.
```

- [ ] **Step 3: CLAUDE.md**

En «**Server**», añadir después de la viñeta de `feed.mjs`:

```markdown
- `stats.mjs` — `ReceptionStats`: 300 s ring buffer of valid/invalid lines per second (fed by `SbsFeed` via `stats.record(store.ingest(line))`) and max range per 22.5° sector from `RECEIVER_LAT/LON` (fed by `AircraftStore`'s `onPosition`); positions > 400 NM ignored.
- `probe.mjs` — `PlutoProbe`: TCP connect-only check of `PLUTO_HOST` :80 and :30431 every 10 s; never writes. Empty `PLUTO_HOST` disables it.
- `chain.mjs` — `diagnose()`: pure function turning probe + feed status into the four-step chain (`pluto-http`, `pluto-iio`, `decoder`, `messages`) and `firstFailure`. Probe failures downgrade to `warn` while messages are flowing.
```

y sustituir la viñeta de `index.mjs` por:

```markdown
- `index.mjs` — `createApp({store, feed, stats, probe, receiver})` returns an `http.Server` (GET only): `/api/aircraft` JSON snapshot including `stats` and `chain` (`no-store`), other `/api/*` 404, else static files from `dist/` with path-traversal check. `stats` and `probe` default to inert instances so tests can omit them. The listen block only runs when executed directly.
```

En «**Client**», añadir:

```markdown
- `AircraftPanel.jsx` has two tabs (Aviones / Recepción). `ReceptionPanel.jsx` renders the chain and figures; `ReceptionCharts.jsx` the SVG rate and polar charts, with geometry in `charts.mjs` (unit-tested) and shared number formatting in `format.mjs`.
```

En «## Commands», en el párrafo de configuración, añadir `PLUTO_HOST` (default `192.168.2.1`, empty disables the probe; also read by `doctor`) a la lista de variables.

- [ ] **Step 4: Verificar**

Run: `npm test && npm run build`
Expected: PASS y build sin errores (la documentación no cambia código, pero confirma el estado final).

- [ ] **Step 5: Commit**

```bash
git add README.md DESIGN.md CLAUDE.md
git commit -m "Documentar la pestaña Recepción y el sondeo del Pluto"
```
