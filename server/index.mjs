import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AircraftStore } from './aircraft.mjs';
import { SbsFeed } from './feed.mjs';
import { ReceptionStats } from './stats.mjs';
import { PlutoProbe } from './probe.mjs';
import { diagnose } from './chain.mjs';

const root = resolve(fileURLToPath(new URL('../dist/', import.meta.url)));
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
function receiverPosition() {
  const lat = process.env.RECEIVER_LAT, lon = process.env.RECEIVER_LON;
  if (!lat?.trim() || !lon?.trim()) return null;
  const pair = [Number(lat), Number(lon)];
  return pair.every(Number.isFinite) && Math.abs(pair[0]) <= 90 && Math.abs(pair[1]) <= 180 ? pair : null;
}
export function createApp({ store, feed, receiver = receiverPosition(), stats = new ReceptionStats({ receiver }), probe = new PlutoProbe() }) {
  return http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    if (req.method !== 'GET') { res.writeHead(405, { Allow: 'GET' }); res.end(); return; }
    let pathname;
    try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); } catch { res.writeHead(400); res.end(); return; }
    if (pathname === '/api/aircraft') {
      const now = Date.now(), feedStatus = feed.status();
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ now, aircraft: store.snapshot(now), messages: store.messages, receiver, feed: feedStatus, stats: stats.snapshot(now), chain: diagnose({ probe: probe.status(), feed: feedStatus, now }) }));
      return;
    }
    if (pathname.startsWith('/api/')) { res.writeHead(404); res.end(); return; }
    const path = resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!path.startsWith(root + sep)) { res.writeHead(403); res.end(); return; }
    try {
      const body = await readFile(path);
      res.writeHead(200, { 'Content-Type': mime[extname(path)] || 'application/octet-stream', 'Cache-Control': pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache' });
      res.end(body);
    } catch { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Recurso no disponible. Para desarrollo: npm run dev. Para producción: npm run build y npm start.'); }
  });
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 3001);
  const feedPort = Number(process.env.SBS_PORT || 30003);
  if (![port, feedPort].every(p => Number.isInteger(p) && p > 0 && p <= 65535)) throw new Error('PORT y SBS_PORT deben estar entre 1 y 65535');
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
