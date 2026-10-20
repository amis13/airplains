import { useEffect, useRef, useState } from 'react';
import { INITIAL_CENTER, project, unproject, screenPoint, TILE_SIZE } from './geo.mjs';
import { Plane } from './Icons';

export function AirMap({ aircraft, selected, onSelect, receiver, resetKey, children }) {
  const container = useRef(null), gesture = useRef(null);
  const [dimensions, setDimensions] = useState([1000, 750]);
  const [view, setView] = useState({ center: receiver || INITIAL_CENTER, zoom: 6 });
  const [tileState, setTileState] = useState({ loaded: false, failed: false });
  const [width, height] = dimensions;
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setDimensions([entry.contentRect.width, entry.contentRect.height]));
    observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => { setView({ center: receiver || INITIAL_CENTER, zoom: 6 }); }, [receiver?.[0], receiver?.[1], resetKey]);
  // Centrar solo al seleccionar: las actualizaciones no impiden explorar el mapa.
  useEffect(() => {
    const a = aircraft.find(a => a.hex === selected);
    if (a?.lat != null && a?.lon != null) setView(v => ({ ...v, center: [a.lat, a.lon] }));
  }, [selected]);
  const { center, zoom } = view;
  const [cx, cy] = project(...center, zoom);
  const count = 2 ** zoom;
  const tiles = [];
  const left = cx - width / 2, top = cy - height / 2;
  for (let y = Math.floor(top / TILE_SIZE); y <= Math.floor((top + height) / TILE_SIZE); y++) {
    if (y < 0 || y >= count) continue;
    for (let x = Math.floor(left / TILE_SIZE); x <= Math.floor((left + width) / TILE_SIZE); x++) {
      const tx = ((x % count) + count) % count;
      tiles.push(<img key={`${zoom}/${x}/${y}`} alt="" draggable="false" className="map-tile" width="256" height="256" src={`https://tile.openstreetmap.org/${zoom}/${tx}/${y}.png`} style={{ left: x * TILE_SIZE - left, top: y * TILE_SIZE - top }} onLoad={() => setTileState(s => s.loaded ? s : { ...s, loaded: true })} onError={() => setTileState(s => s.failed ? s : { ...s, failed: true })}/>);
    }
  }
  function changeZoom(delta) { setView(v => ({ ...v, zoom: Math.max(3, Math.min(12, v.zoom + delta)) })); }
  function move(dx, dy) {
    setView(v => { const p = project(...v.center, v.zoom), world = TILE_SIZE * 2 ** v.zoom; return { ...v, center: unproject(p[0] + dx, Math.max(0, Math.min(world, p[1] + dy)), v.zoom) }; });
  }
  const position = a => screenPoint(a.lat, a.lon, center, zoom, width, height);
  const selectedAircraft = aircraft.find(a => a.hex === selected);
  return <section ref={container} className="air-map" aria-label="Mapa de aviones" tabIndex="0" onKeyDown={e => {
    const movement = { ArrowLeft: [-100, 0], ArrowRight: [100, 0], ArrowUp: [0, -100], ArrowDown: [0, 100] };
    if (e.target !== e.currentTarget) return;
    if (movement[e.key]) { e.preventDefault(); move(...movement[e.key]); }
    if (e.key === '+' || e.key === '=') changeZoom(1);
    if (e.key === '-') changeZoom(-1);
  }} onPointerDown={e => {
    if (e.target.closest('button, a, .map-notice, .map-toolbar') || e.button !== 0) return;
    gesture.current = { x: e.clientX, y: e.clientY, center: project(...center, zoom) };
    e.currentTarget.setPointerCapture(e.pointerId);
  }} onPointerMove={e => {
    if (!gesture.current) return;
    const g = gesture.current, world = TILE_SIZE * 2 ** zoom;
    setView({ zoom, center: unproject(g.center[0] - (e.clientX - g.x), Math.max(0, Math.min(world, g.center[1] - (e.clientY - g.y))), zoom) });
  }} onPointerUp={() => { gesture.current = null; }} onPointerCancel={() => { gesture.current = null; }}>
    <div className="tiles" aria-hidden="true">{tiles}</div>
    {tileState.failed && <div className="tile-warning" role="status">Algunas teselas no se han cargado. Comprueba tu conexión a Internet.</div>}
    <svg className="tracks" width={width} height={height} aria-hidden="true">
      {selectedAircraft?.trail?.length > 1 && <polyline points={selectedAircraft.trail.map(([lat, lon]) => position({ lat, lon }).join(',')).join(' ')} fill="none" stroke="#007f83" strokeWidth="3" strokeDasharray="5 4"/>}
    </svg>
    {receiver && (() => { const [x, y] = screenPoint(...receiver, center, zoom, width, height); return <div className="receiver-marker" style={{ left: x, top: y }} title="Tu antena" aria-label="Ubicación configurada de tu antena"/>; })()}
    {aircraft.filter(a => a.lat != null && a.lon != null).map(a => {
      const [x, y] = position(a);
      return <button type="button" className={`aircraft-marker ${selected === a.hex ? 'selected' : ''}`} key={a.hex} style={{ left: x, top: y }} aria-label={`Seleccionar ${a.callsign || a.hex}`} aria-pressed={selected === a.hex} onClick={() => onSelect(a.hex)}><span className="plane-shape" style={{ transform: `rotate(${a.track ?? 0}deg)` }}><Plane size={29}/></span><span className="marker-label">{a.callsign || a.hex}</span></button>;
    })}
    {children}
    <div className="map-controls"><div className="zoom"><button aria-label="Acercar mapa" disabled={zoom === 12} onClick={() => changeZoom(1)}>+</button><button aria-label="Alejar mapa" disabled={zoom === 3} onClick={() => changeZoom(-1)}>−</button></div><button className="recenter" aria-label="Restablecer vista del mapa" onClick={() => setView({ center: receiver || INITIAL_CENTER, zoom: 6 })}>⌖</button></div>
    <div className="map-caption">{receiver ? 'Vista de tu antena' : 'Vista inicial: Madrid · ubicación de antena sin configurar'}</div>
    <div className="attribution">© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a></div>
  </section>;
}
