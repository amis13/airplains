export function niceMax(value) {
  if (!(value > 0)) return 1;
  const step = 10 ** Math.floor(Math.log10(value));
  return [1, 2, 2.5, 5, 10].map(m => m * step).find(m => m >= value);
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
