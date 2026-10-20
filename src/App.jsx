import { useEffect, useState } from 'react';
import { AirMap } from './AirMap';
import { AircraftPanel } from './AircraftPanel';
import { ReceiverDialog } from './ReceiverDialog';
import { useAircraft } from './useAircraft';
import { demoAircraft } from './demo.mjs';
import { Plane, Signal } from './Icons';
export default function App() {
  const { data, error, loading } = useAircraft();
  const [demo, setDemo] = useState(false), [seconds, setSeconds] = useState(0), [settings, setSettings] = useState(false), [selected, setSelected] = useState(null);
  const [query, setQuery] = useState(() => new URLSearchParams(location.search).get('q') || '');
  useEffect(() => {
    const url = new URL(location.href); query ? url.searchParams.set('q', query) : url.searchParams.delete('q'); history.replaceState(null, '', url);
  }, [query]);
  useEffect(() => { if (!demo) return; setSeconds(0); const start = Date.now(); const timer = setInterval(() => setSeconds((Date.now() - start) / 1000), 1000); return () => clearInterval(timer); }, [demo]);
  function switchMode(value) { setDemo(value); setSelected(null); setQuery(''); }
  const all = demo ? demoAircraft(seconds, data?.receiver || undefined) : data?.aircraft || [];
  const aircraft = all.filter(a => `${a.hex} ${a.callsign || ''}`.toLowerCase().includes(query.toLowerCase().trim()));
  const connected = !!data?.feed.connected;
  const recentMessages = data?.feed.lastMessageAt != null && data.now - data.feed.lastMessageAt < 15000;
  const status = demo ? 'Demostración' : loading ? 'Conectando…' : error ? 'Servidor sin conexión' : !connected ? 'Sin conexión' : recentMessages ? 'Recibiendo ADS-B' : 'Conectado · sin mensajes';
  const needsNotice = demo || error || !connected || !all.length;
  return <div className="app-shell"><header className="app-header"><a className="brand" href="/" aria-label="Airplains, inicio"><Plane size={27}/><span>AIRPLAINS</span></a><span className="header-divider"/><span className="header-title">Mapa de tráfico aéreo</span><div className="header-actions"><span className="connection-state" role="status"><span className={`status-dot ${demo ? 'demo' : connected ? 'online' : ''}`}/>{status}</span><button className="button header-button" onClick={() => setSettings(true)}><span aria-hidden="true">⚙</span><span>Configurar receptor</span></button></div></header>
    <main className="workspace"><AirMap aircraft={aircraft} selected={selected} onSelect={setSelected} receiver={data?.receiver} resetKey={demo}><div className="map-toolbar"><Signal size={20}/><span>{demo ? 'Tráfico simulado' : 'Tráfico en directo'}</span><span className="toolbar-divider"/><span className="mono">1090 MHz</span></div>
      {needsNotice && <div className={`map-notice ${demo ? 'demo-notice' : ''}`}><span className="notice-icon" aria-hidden="true">{demo ? '▷' : 'i'}</span><div><strong>{demo ? 'Modo de demostración' : loading ? 'Conectando al servidor' : error ? 'Servidor local no disponible' : connected ? 'Esperando señales ADS-B' : 'Esperando al receptor'}</strong><p>{demo ? 'Vuelos simulados para explorar el mapa. No son datos recibidos por tu antena.' : error || (connected ? 'El decodificador está conectado. Los aviones aparecerán al recibir mensajes válidos.' : 'Conecta el decodificador ADS-B para ver aviones reales.')}</p><button className="button" onClick={() => switchMode(!demo)}>{demo ? 'Volver a recepción real' : '▷ Probar demostración'}</button></div></div>}
    </AirMap><AircraftPanel aircraft={aircraft} allCount={all.length} query={query} onQuery={setQuery} selected={selected} onSelect={setSelected} feed={data?.feed} demo={demo} messages={demo ? Math.floor(seconds * 10) : data?.messages}/></main>
    <footer className="app-footer"><span>{demo ? 'Demostración · datos simulados' : 'Solo recepción · ADS-B 1090 MHz'}</span><button onClick={() => demo ? switchMode(false) : switchMode(true)}>{demo ? 'Salir de la demo' : 'Probar demo'}</button></footer><ReceiverDialog open={settings} onClose={() => setSettings(false)} feed={data?.feed}/></div>;
}
