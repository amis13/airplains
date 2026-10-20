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
