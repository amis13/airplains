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
