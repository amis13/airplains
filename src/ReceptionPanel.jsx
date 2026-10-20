import { Signal } from './Icons';
import { format, formatDecimal } from './format.mjs';
const STATES = { ok: ['Correcto', '✓'], warn: ['Aviso', '!'], fail: ['Fallo', '×'], unknown: ['Sin comprobar', '?'] };
export function ReceptionPanel({ demo, error, stats, chain, total, positioned }) {
  const lines = stats ? stats.valid + stats.invalid : 0;
  const body = demo ? <div className="empty-state"><Signal size={44}/><h2>Sin datos de recepción</h2><p>La demostración no simula recepción RF. Vuelve a recepción real para ver el diagnóstico.</p></div>
    : !stats || !chain ? <div className="empty-state"><Signal size={44}/><h2>{error ? 'Servidor local no disponible' : 'Conectando…'}</h2><p>{error || 'Esperando la primera respuesta del servidor.'}</p></div>
    : <>
      <section className="reception-section" aria-labelledby="chain-title"><h2 id="chain-title">Cadena de recepción</h2><ol className="chain">{chain.steps.map(step => <li key={step.id} className={`chain-step ${step.state} ${step.id === chain.firstFailure ? 'first' : ''}`}><span className="chain-icon" aria-hidden="true">{STATES[step.state][1]}</span><div><strong>{step.label}</strong><span className="chain-state">{STATES[step.state][0]}</span>{step.state !== 'ok' && <p>{step.detail}</p>}</div></li>)}</ol></section>
      <section className="reception-section" aria-labelledby="rate-title"><h2 id="rate-title">Mensajes por segundo</h2><p className="stat-value">{formatDecimal(stats.rate)}<span> msg/s · últimos 10 s</span></p>
        <dl className="reception-figures"><div><dt>Líneas válidas</dt><dd>{lines ? `${formatDecimal(stats.valid / lines * 100)} %` : '—'}</dd></div><div><dt>Descartadas</dt><dd>{format(stats.invalid)}</dd></div><div><dt>Aviones</dt><dd>{format(total)}</dd></div><div><dt>Con posición</dt><dd>{format(positioned)}</dd></div></dl></section>
      <section className="reception-section" aria-labelledby="range-title"><h2 id="range-title">Alcance</h2>{stats.range ? <><p className="stat-value">{stats.range.maxHex ? formatDecimal(stats.range.max) : '—'}<span> NM</span></p><p className="muted">{stats.range.maxHex ? `Máximo de la sesión · ${stats.range.maxHex}` : 'Aún no se ha recibido ninguna posición.'}</p></> : <p className="muted">Configura RECEIVER_LAT y RECEIVER_LON en .env para medir el alcance.</p>}</section>
    </>;
  return <div className="tab-body" role="tabpanel" id="tabpanel-reception" aria-labelledby="tab-reception"><div className="panel-heading"><h1>Recepción</h1><span className="panel-count">Sesión actual</span></div><div className="reception-scroll">{body}</div></div>;
}
