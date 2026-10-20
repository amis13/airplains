export const INITIAL_CENTER = [40.4168, -3.7038];
export const TILE_SIZE = 256;
export function project(lat, lon, zoom) {
  const size = TILE_SIZE * 2 ** zoom;
  const sine = Math.sin(Math.max(-85.0511, Math.min(85.0511, lat)) * Math.PI / 180);
  return [(lon + 180) / 360 * size, (0.5 - Math.log((1 + sine) / (1 - sine)) / (4 * Math.PI)) * size];
}
export function unproject(x, y, zoom) {
  const size = TILE_SIZE * 2 ** zoom;
  return [Math.atan(Math.sinh(Math.PI * (1 - 2 * y / size))) * 180 / Math.PI, ((x / size * 360) % 360 + 360) % 360 - 180];
}
export function screenPoint(lat, lon, center, zoom, width, height) {
  const [x, y] = project(lat, lon, zoom), [cx, cy] = project(...center, zoom);
  const world = TILE_SIZE * 2 ** zoom;
  const dx = ((x - cx + world / 2) % world + world) % world - world / 2;
  return [width / 2 + dx, height / 2 + y - cy];
}
