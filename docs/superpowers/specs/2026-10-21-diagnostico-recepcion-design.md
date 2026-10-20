# Diagnóstico de recepción — diseño

Fecha: 2026-10-21

## Objetivo

Dos usos, ambos con el mapa visible:

1. **Ajustar antena, ubicación o ganancia** viendo en vivo si la recepción mejora: ritmo de mensajes, proporción de líneas válidas, aviones con posición y alcance por dirección.
2. **Localizar el fallo** en la cadena Pluto+ → IIO → decodificador → SBS → mensajes sin tener que ejecutar `npm run doctor`.

Restricciones heredadas: todo local, solo lectura sobre el Pluto (nunca se modifica), sin persistencia entre reinicios, interfaz en español, la demo nunca presenta datos simulados como reales.

Fuera de alcance: capa de cobertura sobre el mapa, histórico persistente, configuración del Pluto o del decodificador desde la app, métricas de RF (nivel de señal, ganancia).

## Enfoque

Ampliar la respuesta de `/api/aircraft` con `stats` y `chain`. El servidor acumula estadísticas aunque no haya navegador abierto; el cliente mantiene su único bucle de sondeo de 1 s.

## 1. Servidor

### `server/stats.mjs` — `ReceptionStats`

```js
new ReceptionStats({ receiver = null, windowSeconds = 300, sectors = 16, maxRangeNm = 400 })
```

- `record(valid, now = Date.now())`: suma 1 a `valid` o `invalid` del segundo `Math.floor(now / 1000)` en un búfer circular de `windowSeconds` segundos. Mantiene totales `valid` e `invalid` desde el arranque.
- `position(hex, lat, lon)`: si `receiver` es `[lat, lon]`, calcula distancia de gran círculo en millas náuticas (radio terrestre 3440.065 NM) y rumbo inicial desde la antena. Si la distancia es > `maxRangeNm`, se ignora (protege frente a errores de decodificación CPR). Sector: `Math.floor(((bearing + 11.25) % 360) / 22.5)`; sector 0 = N. Actualiza el máximo del sector y el máximo global con su `hex`. Sin `receiver` no hace nada.
- `snapshot(now = Date.now())`:
  - `rate`: suma de válidas de los 10 segundos completos anteriores al segundo actual, dividida entre 10, con un decimal.
  - `history`: array de `windowSeconds` enteros (válidas por segundo), el más antiguo primero, terminando en el último segundo completo; los segundos sin datos o fuera de ventana valen 0.
  - `valid`, `invalid`: totales.
  - `range`: `null` sin `receiver`; si no, `{ max, maxHex, sectors }` con `max` en NM redondeado a 1 decimal (`0` y `maxHex: null` hasta la primera posición) y `sectors` de 16 valores (0 = sin posiciones).

### Integración

- `SbsFeed` recibe la opción `stats`. En el bucle de líneas: si la línea supera 2048 caracteres → `stats?.record(false)`; si no → `stats?.record(this.store.ingest(line))`. Las líneas vacías (solo espacios o `\r`) se ignoran sin contarse.
- `AircraftStore` acepta la opción `onPosition(hex, lat, lon, now)`, invocada solo tras aceptar una posición válida.
- `index.mjs` crea `ReceptionStats` con `receiverPosition()` y conecta `onPosition` → `stats.position`.

### `server/probe.mjs` — `PlutoProbe`

```js
new PlutoProbe({ host, intervalMs = 10000, timeoutMs = 2000, ports = { http: 80, iio: 30431 } })
```

- `start()` comprueba inmediatamente y después cada `intervalMs`; `stop()` cancela temporizador y sockets abiertos.
- Cada comprobación abre `net.createConnection` a cada puerto en paralelo; en `connect` → `ok: true` y `socket.destroy()`; en `error` o tiempo agotado → `ok: false`, `error: code || message`. Nunca escribe en el socket. No solapa comprobaciones.
- `status()`: `{ host, http: { ok, error, checkedAt }, iio: { ok, error, checkedAt } }`; antes de la primera comprobación, `ok: null`.
- Con `host` vacío o nulo: `start()` no abre conexiones y `status()` devuelve `{ host: null, http: null, iio: null }`.
- Configuración: `PLUTO_HOST` (por defecto `192.168.2.1`; vacío desactiva el sondeo). Es la misma variable que ya lee `scripts/doctor.py`.

### `server/chain.mjs` — `diagnose({ probe, feed, now })`

Función pura. Entradas: `probe.status()`, `feed.status()`, `now`. Mensajes recientes = `feed.lastMessageAt != null && now - feed.lastMessageAt < 15000` (mismo umbral que la cabecera actual).

Pasos en orden, cada uno `{ id, state, label, detail }`, `state ∈ ok | fail | warn | unknown`:

| id | label | ok | fail | unknown |
|---|---|---|---|---|
| `pluto-http` | Pluto web | conexión :80 correcta | :80 falla | sondeo desactivado o aún sin comprobar |
| `pluto-iio` | Pluto IIO | conexión :30431 correcta | :30431 falla | sondeo desactivado o aún sin comprobar |
| `decoder` | Decodificador SBS | `feed.connected` | no conectado | — |
| `messages` | Mensajes ADS-B | mensajes recientes | sin mensajes recientes | — |

Reglas:

- `pluto-http` en fallo nunca es bloqueante: se presenta como `warn` si `pluto-iio` está `ok`.
- Si hay mensajes recientes, cualquier `fail` de `pluto-http` o `pluto-iio` pasa a `warn` (el decodificador puede estar en otro equipo o en el propio Pluto).
- `messages` es `unknown` (no `fail`) cuando `decoder` está en `fail`: no se puede saber.
- `firstFailure`: `id` del primer paso con `state === 'fail'`, o `null`.
- `detail` contiene el consejo en español, por ejemplo:
  - `pluto-iio` fail: «WSL no llega al servicio IIO en {host}:30431. Si Windows abre http://{host}, revisa la ruta entre WSL y el adaptador USB de red (README).»
  - `decoder` fail: «No hay decodificador en {source}. Inícialo con --net ({error}).»
  - `messages` fail: «Decodificador conectado sin mensajes. Revisa la antena en RX1, su posición y la ganancia.»

## 2. API

`GET /api/aircraft` conserva los campos actuales (`now`, `aircraft`, `messages`, `receiver`, `feed`) y añade:

```js
stats: { rate, history, valid, invalid, range },   // ReceptionStats.snapshot()
chain: { plutoHost, steps, firstFailure }          // plutoHost = probe.status().host
```

`createApp({ store, feed, stats, probe, receiver })`. `useAircraft` considera la respuesta no válida si faltan `stats` o `chain`.

## 3. Interfaz

- `AircraftPanel` gana pestañas **Aviones** | **Recepción** (`role="tablist"`, `tab`, `tabpanel`, `aria-selected`, flechas izquierda/derecha). Estado `tab` en `App`, por defecto Aviones, no persistido. El resumen inferior del panel se mantiene en ambas.
- `src/ReceptionPanel.jsx`:
  1. **Cadena**: lista de los cuatro pasos con punto de estado (ok verde, warn ámbar, fail rojo, unknown gris). El paso `firstFailure` se destaca con su `detail`; los `warn` muestran su `detail` en texto secundario.
  2. **Ritmo**: `rate` en msg/s grande; gráfico de línea SVG de `history` (5 min, eje temporal implícito, máximo del eje visible); válidas frente a descartadas en porcentaje; aviones totales frente a con posición (calculado de `aircraft`).
  3. **Alcance**: `max` NM y `maxHex`; gráfico polar SVG de 16 sectores con anillos de distancia, norte arriba, etiquetas N/E/S/O. Sin `range`: «Configura RECEIVER_LAT y RECEIVER_LON en .env para medir el alcance».
- Demo: la pestaña muestra «La demostración no simula recepción RF» y ninguna métrica.
- Servidor sin conexión: solo el aviso de error existente; ninguna métrica antigua.
- Cabecera: nuevo estado «Pluto no accesible» cuando `!feed.connected` y `chain.firstFailure` es `pluto-http` o `pluto-iio` (si ambos puertos fallan, el primer fallo es `pluto-http`); el resto de estados no cambia.
- `ReceiverDialog`: una línea que remite a la pestaña Recepción.
- Estilos con los tokens existentes de `src/styles.css`; línea del gráfico en el acento; sin gradientes. Cargar la skill `dataviz` antes de escribir los gráficos.

## 4. Pruebas y documentación

- `tests/stats.test.mjs`: recuento por segundo, ceros en huecos, ventana acotada a 300, `rate` de 10 s; distancia y rumbo con valores conocidos; asignación de sectores incluidos los bordes 348,75°/11,25°; descarte > 400 NM; `range` nulo sin antena.
- `tests/probe.test.mjs` (con `net.createConnection` simulado): ok, error con código, tiempo agotado, nunca escribe, sin conexiones con host vacío, sin solapamiento.
- `tests/chain.test.mjs`: todo correcto; Pluto inaccesible; Pluto accesible y decodificador parado; decodificador sin mensajes; Pluto inaccesible con mensajes (warn); sondeo desactivado; HTTP falla con IIO correcto.
- `tests/feed-api.test.mjs`: la API devuelve `stats` y `chain`; una línea basura incrementa `invalid`.
- `tests/aircraft.test.mjs`: `onPosition` solo con posición válida.
- Interfaz sin pruebas automáticas (no hay entorno de componentes): verificación con `npm run build` y en la app.
- Documentación: `PLUTO_HOST` en `.env.example`; README (pestaña Recepción, sondeo TCP cada 10 s sin enviar datos, límite de 400 NM); `DESIGN.md` (propiedad de pestañas y estados); `CLAUDE.md` (módulos nuevos).
