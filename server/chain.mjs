const FRESH_MS = 15_000;

function portStep(host, result, okDetail, failDetail) {
  if (!host) return { state: 'unknown', detail: 'Sondeo desactivado: PLUTO_HOST está vacío.' };
  if (result?.ok == null) return { state: 'unknown', detail: 'Aún sin comprobar.' };
  return result.ok ? { state: 'ok', detail: okDetail } : { state: 'fail', detail: `${failDetail} (${result.error})` };
}

export function diagnose({ probe, feed, now = Date.now() }) {
  const host = probe.host, fresh = feed.lastMessageAt != null && now - feed.lastMessageAt < FRESH_MS;
  const http = { id: 'pluto-http', label: 'Pluto web', ...portStep(host, probe.http, `http://${host} responde.`, `No responde http://${host}. Comprueba en Windows que aparece el adaptador USB de red del Pluto.`) };
  const iio = { id: 'pluto-iio', label: 'Pluto IIO', ...portStep(host, probe.iio, `Servicio IIO accesible en ${host}:30431.`, `WSL no llega al servicio IIO en ${host}:30431. Si Windows abre http://${host}, revisa la ruta entre WSL y el adaptador USB de red (README).`) };
  if (http.state === 'fail' && iio.state === 'ok') http.state = 'warn';
  // Con mensajes llegando, el decodificador puede estar en otro equipo o en el propio Pluto.
  if (fresh) for (const step of [http, iio]) if (step.state === 'fail') { step.state = 'warn'; step.detail += ' Llegan mensajes, así que no impide la recepción.'; }
  const decoder = feed.connected ? { state: 'ok', detail: `Conectado a ${feed.source}.` } : { state: 'fail', detail: `No hay decodificador en ${feed.source}. Inícialo con --net${feed.error ? ` (${feed.error})` : ''}.` };
  const messages = !feed.connected ? { state: 'unknown', detail: 'Sin decodificador no se pueden recibir mensajes.' } : fresh ? { state: 'ok', detail: 'Llegan mensajes válidos.' } : { state: 'fail', detail: 'Decodificador conectado sin mensajes. Revisa la antena en RX1, su posición y la ganancia.' };
  const steps = [http, iio, { id: 'decoder', label: 'Decodificador SBS', ...decoder }, { id: 'messages', label: 'Mensajes ADS-B', ...messages }];
  return { plutoHost: host, steps, firstFailure: steps.find(step => step.state === 'fail')?.id ?? null };
}
