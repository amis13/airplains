import net from 'node:net';

export class SbsFeed {
  constructor(store, { host = '127.0.0.1', port = 30003, retryMs = 3000, connectTimeoutMs = 5000, stats = null } = {}) {
    Object.assign(this, { store, host, port, retryMs, connectTimeoutMs, stats });
    this.connected = false;
    this.error = null;
    this.stopped = true;
  }
  start() { if (!this.stopped) return; this.stopped = false; this.connect(); }
  connect() {
    if (this.stopped) return;
    let buffer = '';
    const socket = net.createConnection({ host: this.host, port: this.port });
    this.socket = socket;
    const timeout = setTimeout(() => socket.destroy(new Error('Tiempo de conexión agotado')), this.connectTimeoutMs);
    socket.setEncoding('utf8');
    socket.setKeepAlive(true, 10000);
    socket.on('connect', () => { clearTimeout(timeout); this.connected = true; this.error = null; });
    socket.on('data', chunk => {
      buffer += chunk;
      let end;
      while ((end = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, end);
        buffer = buffer.slice(end + 1);
        if (!line.trim()) continue;
        const valid = line.length <= 2048 && this.store.ingest(line);
        this.stats?.record(valid);
      }
      if (buffer.length > 2048) { this.stats?.record(false); this.error = 'Flujo incompatible: se espera SBS/BaseStation'; socket.destroy(); }
    });
    socket.on('error', error => { this.error = error.code || error.message; });
    socket.on('close', () => {
      clearTimeout(timeout);
      this.connected = false;
      if (!this.stopped) this.timer = setTimeout(() => this.connect(), this.retryMs);
    });
  }
  stop() { this.stopped = true; clearTimeout(this.timer); this.socket?.destroy(); this.connected = false; }
  status() { return { connected: this.connected, error: this.error, source: `${this.host}:${this.port}`, lastMessageAt: this.store.lastMessageAt }; }
}
