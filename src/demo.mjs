import { INITIAL_CENTER } from './geo.mjs';
const flights = [
  ['DE0001', 'DEMO101', 40.9, -4.4, 95, 35000, 435],
  ['DE0002', 'DEMO202', 39.7, -3.1, 310, 28000, 390],
  ['DE0003', 'DEMO303', 41.7, -1.9, 225, 38000, 460],
  ['DE0004', 'DEMO404', 39.3, -5.2, 65, 21000, 325],
  ['DE0005', 'DEMO505', 40.6, -2.5, 180, 31500, 410],
];
export function demoAircraft(elapsed, center = INITIAL_CENTER) {
  return flights.map(([hex, callsign, lat, lon, track, altitude, speed]) => {
    const angle = track * Math.PI / 180;
    // Velocidad en nudos -> desplazamiento geográfico aproximado para la demo.
    const position = seconds => [lat + center[0] - INITIAL_CENTER[0] + Math.cos(angle) * speed * seconds / 216000, lon + center[1] - INITIAL_CENTER[1] + Math.sin(angle) * speed * seconds / (216000 * Math.cos(lat * Math.PI / 180))];
    const [newLat, newLon] = position(elapsed);
    return { hex, callsign, lat: newLat, lon: newLon, track, altitude, speed, seen: 0, verticalRate: 0, squawk: null, messages: Math.floor(elapsed * 2) + 1, trail: Array.from({ length: 20 }, (_, i) => position(elapsed - (19 - i) * 4)) };
  });
}
