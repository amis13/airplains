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
