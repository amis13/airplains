# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Airplains is a local ADS-B (1090 MHz) aircraft map for a Pluto+ SDR used from Windows/WSL. The UI, user-facing strings, comments, test names and docs are all in **Spanish** — keep new text in Spanish. The app does not capture IQ itself: it consumes SBS/BaseStation text over TCP from the PlutoSDR fork of dump1090 (built into `vendor/dump1090`, git-ignored).

```
Pluto+ RX1 → IIO over USB-net (ip:192.168.2.1) → dump1090 --net → SBS TCP :30003
  → Node server (server/) :3001 → /api/aircraft → React client (src/) polling every 1 s
```

## Commands

Run inside WSL. Node >= 20.19. Dependencies are only React 19 + Vite 7.

```bash
npm install
npm run dev          # scripts/dev.mjs: starts server/index.mjs (3001) AND Vite (5173, proxies /api → 3001)
npm run build        # vite build → dist/
npm start            # production: server/index.mjs serves dist/ + API on 127.0.0.1:3001
npm test             # node --test tests/*.test.mjs (Node's built-in test runner, no framework)
node --test tests/aircraft.test.mjs                       # single file
node --test --test-name-pattern="caduca" tests/*.test.mjs # single test by name
npm run doctor       # scripts/doctor.py: read-only check of tools, libiio, Pluto HTTP/IIO and SBS port (exit 1 if IIO/SBS unavailable)
bash scripts/setup-decoder.sh   # clone + patch + build PlutoSDR/dump1090 into vendor/
```

There is no linter or formatter configured. Config comes from `.env` (see `.env.example`), loaded via `node --env-file-if-exists=.env`: `SBS_HOST`/`SBS_PORT` (where the decoder runs, not the Pluto IIO address), `PORT`, `HOST`, optional `RECEIVER_LAT`/`RECEIVER_LON` (both or neither; default view is Madrid), `PLUTO_HOST` (default `192.168.2.1`; empty disables the probe; also read by `doctor`). The dev proxy is hard-coded to 3001 in `vite.config.js`.

The repo lives on `/mnt/c` (Windows drive under WSL): Vite's file watcher does not see edits there, so restart `npm run dev` after changing `src/` instead of relying on HMR. The user often has their own `npm run dev` (3001/5173) and `dump1090` (30003) running; for verification run a separate server/Vite on other ports instead of killing theirs.

## Architecture

**Server (`server/`, plain Node ESM, no deps)**
- `aircraft.mjs` — `AircraftStore`: parses SBS `MSG,1-8` lines (22 fields, 6-hex ICAO), merges fields per aircraft keeping previous values when a field is empty, range-validates each value, and keeps trails (max 100 points). Two independent expiries: position hidden after 30 s (`positionTtl`), aircraft removed after 120 s (`ttl`, pruned lazily in `snapshot()`). Capacity 2000, evicting oldest-inserted. Unknown values are `null`, never `0` — tests assert that zeros are preserved and empties are not coerced.
- `feed.mjs` — `SbsFeed`: TCP client to the decoder with line reassembly across chunks, 2048-char line/buffer guard (destroys the socket as "incompatible stream"), 5 s connect timeout, 3 s reconnect. `status()` exposes `connected`, `error`, `source`, `lastMessageAt`.
- `stats.mjs` — `ReceptionStats`: 300 s ring buffer of valid/invalid lines per second (fed by `SbsFeed`) and max range per 22.5° sector from `RECEIVER_LAT/LON` (fed by `AircraftStore`'s `onPosition`); positions > 400 NM ignored.
- `probe.mjs` — `PlutoProbe`: TCP connect-only check of `PLUTO_HOST` :80 and :30431 every 10 s; never writes. Empty `PLUTO_HOST` disables it.
- `chain.mjs` — `diagnose()`: pure function turning probe + feed status into the four-step chain (`pluto-http`, `pluto-iio`, `decoder`, `messages`) and `firstFailure`. Probe failures downgrade to `warn` while messages are flowing.
- `index.mjs` — `createApp({store, feed, stats, probe, receiver})` returns an `http.Server` (GET only): `/api/aircraft` JSON snapshot including `stats` and `chain` (`no-store`), other `/api/*` 404, else static files from `dist/` with path-traversal check. `stats` and `probe` default to inert instances so tests can omit them. The listen block only runs when executed directly, so tests import `createApp` without side effects.

**Client (`src/`, React 19, JSX via esbuild automatic runtime)**
- `useAircraft.js` — non-overlapping poll loop (next request scheduled after the previous finishes, 4 s abort). On any failure it sets `data: null` so stale real data is never shown.
- `App.jsx` — owns mode (real vs demo), search query (persisted in `?q=`), selection, and derives the status label. Filtering is applied once and the same list feeds both map and panel.
- `AirMap.jsx` + `geo.mjs` — hand-rolled slippy map on OpenStreetMap tiles (no Leaflet; Web Mercator `project`/`unproject`/`screenPoint` with antimeridian wrap). Map recenters only when selection changes, not on data updates.
- `demo.mjs` — simulated `DEMO…` flights computed client-side, independent of the server; recentred on the configured receiver.
- `ReceiverDialog.jsx` uses native `<dialog>`.
- `AircraftPanel.jsx` has two tabs (Aviones / Recepción). `ReceptionPanel.jsx` renders the chain and figures; `ReceptionCharts.jsx` the SVG rate and polar charts, with geometry in `charts.mjs` (unit-tested) and shared number formatting in `format.mjs`.

## Invariants (from DESIGN.md / README)

- Never present simulated flights as real; demo data must never mix with received data, and demo identifiers stay `DEMO…`.
- Keep connection states distinct: server unreachable, decoder disconnected, decoder connected but no messages (>15 s since last message), receiving, demo.
- Units are explicit (ft, kt, °, ft/min); unknown values render as `—`.
- Design tokens live in `src/styles.css :root` (canonical); `DESIGN.md` records their intent. No gradients; mobile layout below 760 px puts the panel under the map.
- No paid services, API keys, geolocation, bulk tile download, or persistence across restarts. Server binds to loopback by default.

## Decoder build notes

`scripts/patch-decoder.py` applies idempotent fixes to the old fork: restores `.text` after the `INCBIN` asm (otherwise functions land in `.rodata` and crash) and uses `llabs` for 64-bit CPR time differences. `setup-decoder.sh` runs `make clean` then builds with `-g0` to avoid invalid DWARF `.LVU…` references. Targets libiio 0.x (Ubuntu/Debian packages); libiio 1.x may need decoder changes. Run with `IIOD_REMOTE=ip:192.168.2.1 ./vendor/dump1090/dump1090 --net --interactive`.

Tests do not cover real RF reception; `tests/feed-api.test.mjs` mocks `net.createConnection` so it runs where opening ports is blocked.
