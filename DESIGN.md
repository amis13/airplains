# Airplains

Mapa local de tráfico aéreo recibido con Pluto+, en español. La tarea principal es ver posiciones ADS-B y consultar cada avión. El estado de recepción debe ser inequívoco; nunca se presentan vuelos simulados como reales.

## Dirección visual

Instrumentación de aviación: cabecera azul tinta, cartografía de OpenStreetMap como superficie principal y panel blanco de aviones. Sin página de marketing. Referencia inicial: `docs/design-concept.png`, generada con Image Gen; la cartografía y los controles se implementan en código. La referencia usa un mapa convencional; se ha implementado cartografía con teselas nativas para evitar una dependencia adicional no disponible en el entorno sin red.

## Tokens y propiedad

Modelo B: `src/styles.css :root` es la fuente canónica de tokens. Este documento registra su intención: tinta #132b42; fondo #eef3f6; superficie #ffffff; texto secundario #5d7083; borde #d4dfe7; acento #007f83. Aviones ámbar #d99319, selección turquesa. Sin gradientes. Radios de 5–7 px, sombra ligera solo para controles sobre el mapa y diálogo.

Arial/Helvetica para controles y contenido; Consolas/Liberation Mono para identificadores y telemetría. Títulos de panel de 23 px, texto de 13–14 px, telemetría de 11–14 px. Retícula de 4 px. Cabecera de 72 px, pie de 35 px, panel lateral de 350 px; bajo 760 px el panel aparece debajo del mapa y el documento se desplaza de forma natural.

## Propiedad de comportamientos

- Selección y búsqueda: App; búsqueda guardada en `?q=`, selección transitoria. Filtrado idéntico en mapa y lista. Lista acotada a 2000 aviones en el servidor y con desplazamiento interno.
- Diálogo: ReceiverDialog, elemento nativo dialog para foco, Escape y fondo inerte.
- Estado asíncrono: useAircraft; consulta sin solapamientos, cancelación y reintento automático. Los fallos del servidor vacían la vista real para no mostrar datos antiguos.
- Desplazamiento y foco: estilos globales, scrollbars visibles y anillo de foco. Movimiento reducido respetado.
- Empty state, sin coincidencias, servidor desconectado, decodificador conectado sin mensajes y demo son estados distintos.
- Posiciones caducan a los 30 s; aviones a los 120 s. Traza acotada a 100 posiciones. Fuente SBS fija en configuración local del servidor.
- Unidades de aviación explícitas: ft, kt, grados y ft/min. Valores desconocidos se muestran como raya.
- Pestañas del panel: App; Aviones por defecto, no persistida, flechas para cambiar. Recepción muestra cadena (`server/chain.mjs`), ritmo y alcance (`server/stats.mjs`). En demo no muestra métricas; con el servidor caído, solo el error.
- Estados de la cadena: correcto, aviso, fallo y sin comprobar, siempre con icono y texto además del color (#0ca30c, #fab219, #d03b3b, #92a3b3). Estos colores no se usan en gráficos. El primer fallo se destaca con fondo rojo claro y su consejo.
- Gráficos SVG propios en `src/ReceptionCharts.jsx`: una serie, sin leyenda; línea de 2 px en el acento con relleno al 10 %; cuñas polares con hueco de 2 px en color de superficie; escala a 1, 2, 2,5 o 5 por potencia de diez; tooltip por puntero y teclado; tabla equivalente en un desplegable.

## Verificación

Pruebas de parser, caducidad, coordenadas y flujo SBS en `tests/`. Construcción con `npm run build`. La recepción RF exige el Pluto+ físico, una antena adecuada y el decodificador. Las teselas necesitan Internet; un error de teselas se informa y no impide consultar vuelos.
