const number = value => typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value)) ? Number(value) : null;

export class AircraftStore {
  constructor({ ttl = 120_000, positionTtl = 30_000, maxAircraft = 2000 } = {}) {
    this.ttl = ttl;
    this.positionTtl = positionTtl;
    this.maxAircraft = maxAircraft;
    this.aircraft = new Map();
    this.messages = 0;
    this.lastMessageAt = null;
  }

  ingest(line, now = Date.now()) {
    const f = line.trim().split(',');
    if (f.length < 22 || f[0] !== 'MSG' || !/^[1-8]$/.test(f[1]) || !/^[a-f0-9]{6}$/i.test(f[4])) return false;
    const hex = f[4].toUpperCase();
    let a = this.aircraft.get(hex);
    if (!a) {
      if (this.aircraft.size >= this.maxAircraft) this.aircraft.delete(this.aircraft.keys().next().value);
      a = { hex, callsign: null, altitude: null, speed: null, track: null, verticalRate: null, squawk: null, lat: null, lon: null, positionAt: null, trail: [], messages: 0 };
      this.aircraft.set(hex, a);
    }
    const callsign = f[10].trim();
    if (callsign && /^[\w -]{1,8}$/.test(callsign)) a.callsign = callsign;
    for (const [field, index, min, max] of [['altitude', 11, -2000, 100000], ['speed', 12, 0, 2000], ['track', 13, 0, 360], ['verticalRate', 16, -20000, 20000]]) {
      const value = number(f[index]);
      if (value !== null && value >= min && value <= max) a[field] = value;
    }
    if (/^[0-7]{4}$/.test(f[17])) a.squawk = f[17];
    const lat = number(f[14]), lon = number(f[15]);
    if (lat !== null && lon !== null && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
      if (a.positionAt !== null && now - a.positionAt > this.positionTtl) a.trail = [];
      if (a.lat !== lat || a.lon !== lon || !a.trail.length) {
        a.trail.push([lat, lon]);
        if (a.trail.length > 100) a.trail.shift();
      }
      a.lat = lat; a.lon = lon; a.positionAt = now;
    }
    a.seenAt = now;
    a.messages++;
    this.messages++;
    this.lastMessageAt = now;
    return true;
  }

  snapshot(now = Date.now()) {
    const result = [];
    for (const [hex, a] of this.aircraft) {
      if (now - a.seenAt > this.ttl) { this.aircraft.delete(hex); continue; }
      const positionFresh = a.positionAt !== null && now - a.positionAt <= this.positionTtl;
      result.push({ ...a, lat: positionFresh ? a.lat : null, lon: positionFresh ? a.lon : null, trail: positionFresh ? a.trail : [], seen: Math.max(0, (now - a.seenAt) / 1000), positionAge: a.positionAt === null ? null : Math.max(0, (now - a.positionAt) / 1000) });
    }
    return result.sort((a, b) => a.hex.localeCompare(b.hex));
  }
}
