import test from 'node:test';
import assert from 'node:assert/strict';
import { niceMax, linePoints, pathOf, polarPoint, wedgePath, perMinute, ringLabels } from '../src/charts.mjs';
import { format, formatDecimal } from '../src/format.mjs';

test('redondea el máximo del eje a 1, 2, 2,5 o 5 por potencia de diez', () => {
  assert.equal(niceMax(0), 1);
  assert.equal(niceMax(7), 10);
  assert.equal(niceMax(40), 50);
  assert.equal(niceMax(100), 100);
  assert.equal(niceMax(101), 200);
  assert.equal(niceMax(209.9), 250);
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

test('las etiquetas de los anillos polares no redondean a enteros', () => {
  assert.deepEqual(ringLabels(25), ['12,5', '25']);
  assert.deepEqual(ringLabels(2.5), ['1,25', '2,5']);
  assert.deepEqual(ringLabels(1), ['0,5', '1']);
});
