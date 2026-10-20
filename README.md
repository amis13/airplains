# Airplains

Mapa local de aviones ADS-B de 1090 MHz para tu Pluto+ conectado por USB a Windows/WSL. Incluye mapa desplazable con zoom, lista filtrable por vuelo/ICAO, altitud, velocidad, rumbo, trazas y estado de conexión. Demo explícita para explorar la interfaz sin hardware.

```text
Antena de 1090 MHz → RX1 del Pluto+
    → USB / adaptador de red de Windows → IIO desde WSL
    → dump1090 para PlutoSDR → SBS TCP 30003
    → servidor local Node → navegador
```

La aplicación no captura IQ directamente: necesita un decodificador compatible. Está preparada para la salida SBS/BaseStation del [fork PlutoSDR/dump1090](https://github.com/PlutoSDR/dump1090), que usa libiio y libad9361 y publica SBS con `--net`. No sirve instalar una variante exclusiva para RTL-SDR.

## Abrir el mapa

Requiere Node 20.19+ (o 22.12+) y npm, ejecutados dentro de WSL.

```bash
cd /mnt/c/Users/amis13/Desktop/airplains
npm install
npm run dev
```

Abre **http://localhost:5173** desde Windows. El servidor SBS se inicia en `127.0.0.1:3001`; Vite dirige las consultas al servidor. Si 5173 está ocupado, utiliza el puerto que indique Vite. Puedes pulsar **Probar demostración** para ver cinco vuelos simulados en movimiento. Sal de la demo para ver los datos del receptor.

Producción local:

```bash
npm run build
npm start
```

Abre **http://localhost:3001**. El servidor escucha solo en loopback por defecto. No hay servicios de pago, claves API ni cuentas. La cartografía de OpenStreetMap necesita Internet; no se descargan teselas en bloque ni se hace precarga de regiones. La recepción RF puede funcionar sin Internet.

## Conectar el Pluto+ en Windows/WSL

1. Conecta una antena adecuada para 1090 MHz al puerto **RX1**, alimenta el Pluto+ según sus especificaciones y utiliza el puerto USB de datos. Coloca la antena con buena vista al cielo.
2. En Windows, comprueba que aparece el adaptador USB de red del Pluto y abre **http://192.168.2.1**. Es una dirección habitual, no una dirección detectada por esta aplicación. Usa la IP real si tu Pluto tiene otra configuración. Los controladores y firmware dependen de tu unidad; consulta el [repositorio del Pluto+](https://github.com/plutoplus/plutoplus) y la [documentación de conexión de Analog Devices](https://wiki.analog.com/university/tools/pluto/users/quick_start).
3. Dentro de WSL, instala las herramientas y bibliotecas del decodificador (Ubuntu/Debian):

   ```bash
   sudo apt update
   sudo apt install -y build-essential git libiio-dev libad9361-dev libiio-utils
   ```

4. Comprueba que WSL puede acceder al servicio IIO del Pluto:

   ```bash
   iio_info -u ip:192.168.2.1
   ```

   Debe mostrar dispositivos como `ad9361-phy` y `cf-ad9361-lpc`. Si Windows ve la página del Pluto pero WSL no llega a su IP, hay que resolver primero la ruta hacia el adaptador USB de red. La app no cambia tu red ni adjunta dispositivos automáticamente. Según tu versión y configuración de WSL puede ser necesario configurar su red o el acceso USB; no presupongas que Windows y WSL ven los mismos dispositivos. No hace falta adjuntar el USB a WSL si IIO por IP ya funciona.

5. Compila y ejecuta el decodificador:

   ```bash
   bash scripts/setup-decoder.sh
   IIOD_REMOTE=ip:192.168.2.1 ./vendor/dump1090/dump1090 --net --interactive
   ```

   `IIOD_REMOTE` selecciona el contexto de [libiio 0.x](https://github.com/analogdevicesinc/libiio/blob/v0.25/context.c). Esta guía usa las bibliotecas 0.x de Ubuntu/Debian, compatibles con el código del fork. LibIIO 1.x puede requerir adaptación del decodificador. El script descarga el fork y lo compila dentro de `vendor/`; no instala firmware ni inicia el receptor automáticamente. Limpia los objetos anteriores y compila con `-g0` para evitar referencias de depuración DWARF inválidas (`undefined reference to .LVU…`) del ensamblador antiguo de `incbin` con compiladores actuales. Revisa los mensajes de `make` si falta alguna biblioteca.

   El instalador aplica además dos ajustes locales de compatibilidad: restaura `.text` tras el ensamblador de `incbin` (evita que funciones queden en `.rodata` y fallen al arrancar en Linux) y usa `llabs` para la diferencia de tiempos CPR de 64 bits. Los ajustes son idempotentes; después de compilar se comprueba `--help` sin abrir el dispositivo.

6. Deja el decodificador abierto y ejecuta `npm run dev` en otra terminal. El mapa se conectará a `127.0.0.1:30003`. La conexión al decodificador y la recepción efectiva de mensajes tienen estados distintos en la cabecera.

## Configuración y diagnóstico

```bash
cp .env.example .env
npm run doctor
# Si tu Pluto usa otra IP:
npm run doctor -- --pluto 192.168.3.1
```

`doctor` solo consulta herramientas instaladas y puertos; no modifica el dispositivo ni la red. Retorna 1 cuando IIO o SBS no están disponibles. El acceso HTTP por sí solo no demuestra que IIO esté funcionando.

En `.env`, `SBS_HOST` y `SBS_PORT` indican dónde corre **el decodificador**, no dónde está el servicio IIO. Por ejemplo, si corre en WSL, conserva `127.0.0.1:30003`. Si corre en el propio Pluto con salida SBS habilitada, usa su IP y el puerto correspondiente. Reinicia la app después de editar la configuración. `PORT` cambia el puerto de producción; durante desarrollo el proxy espera el servidor en 3001.

`RECEIVER_LAT` y `RECEIVER_LON` son opcionales: introduce ambas para situar tu antena. Sin ellas, el mapa abre Madrid como vista inicial y lo indica; no utiliza geolocalización ni afirma haber detectado tu ubicación.

### Pestaña Recepción

El panel lateral tiene una pestaña **Recepción** para ajustar la antena sin perder el mapa de vista:

- **Cadena de recepción:** Pluto web (:80), Pluto IIO (:30431), decodificador SBS y mensajes ADS-B. Se destaca el primer paso que falla con una indicación. Si llegan mensajes, un fallo al sondear el Pluto se muestra como aviso: el decodificador puede estar en otro equipo o en el propio Pluto.
- **Mensajes por segundo:** media de los últimos 10 s, gráfico de los últimos 5 minutos, porcentaje de líneas válidas, aviones y aviones con posición.
- **Alcance:** máximo de la sesión en millas náuticas (NM) y máximo por sector de 22,5°. Requiere `RECEIVER_LAT` y `RECEIVER_LON`. Se ignoran posiciones a más de 400 NM, que suelen ser errores de decodificación.

El servidor sondea `PLUTO_HOST` (por defecto `192.168.2.1`) cada 10 segundos: abre y cierra una conexión TCP a los puertos 80 y 30431 sin enviar datos. Deja `PLUTO_HOST=` vacío para desactivarlo. `npm run doctor` usa también este valor. Las estadísticas se reinician con el servidor. La demostración no simula recepción y no muestra estas métricas.

## Estados de los datos

- Actualización de la interfaz aproximadamente cada segundo; reconexión SBS cada tres segundos.
- Un avión sin posición sigue apareciendo en la lista. Valores desconocidos se muestran como `—`.
- Posiciones sin actualizar durante 30 segundos se ocultan del mapa. Aviones sin mensajes durante 120 segundos se eliminan de la lista.
- Las trazas conservan como máximo 100 posiciones por avión; no hay persistencia ni histórico tras reiniciar. Hasta 2000 aviones simultáneos.
- La demo es independiente del servidor y usa identificadores ficticios `DEMO…`. Sus vuelos nunca se mezclan con la recepción real.
- El alcance depende de antena, ubicación, ganancia e interferencias. No todos los aviones emiten una posición ADS-B utilizable.

## Verificación

```bash
npm test
npm run build
```

Las pruebas cubren mensajes SBS parciales y fragmentados, conservación de valores desconocidos y ceros, caducidad independiente de posición y avión, límites de memoria, reconexión, API, proyección geográfica, estadísticas de recepción, sondeo del Pluto, diagnóstico de la cadena y geometría de los gráficos. Las pruebas del transporte pueden usar un socket simulado para ejecutarse en entornos que bloqueen la apertura de puertos. No sustituyen una prueba de recepción RF con el Pluto+ físico.

La primera implementación se construyó en un entorno que bloquea la red, la apertura de puertos y la comunicación con Windows. Se usaron dependencias ya disponibles localmente. La compilación y las pruebas sin hardware se verifican por separado; la captura real, el acceso desde Windows y la cartografía en línea requieren verificación en tu equipo.
