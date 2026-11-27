# Simulador RA: 20 cortes y uso offline

Actualización: 27 de noviembre de 2026. Se hizo primero la corrección de contraste y después los filtros.

## Contraste

Los títulos `.corte-nombre` son blancos (`#FFFFFF`), las descripciones crema (`#F5EEDF`) y las tarjetas mantienen fondo verde oscuro tanto en estado normal como hover, selección y foco. Se verificó el color calculado de los 20 títulos y descripciones en el navegador.

## Mapeo exacto del catálogo y render multicapa

Los nombres se comparan normalizando espacios, mayúsculas y acentos. Cada nombre tiene una clave propia, independiente del ID de MySQL. El render inicial de primitivas se reemplazó primero para rizos y después para el resto del catálogo. No se resuelven los 20 nombres a dos modelos genéricos. Si no está disponible `/api/haircuts`, el catálogo local sigue ofreciendo los 20 filtros; no se inventan IDs de base de datos.

| Corte | Clave | Patrón de hebras |
|---|---|---|
| Buzz cut | buzz | Miles de vellos cortos con densidad y tono variables. |
| Corte clásico | classic | Hebras curvas con raya lateral y flujo hacia los lados. |
| Corte con tijera | scissor | Hebras de longitud media y variaciones naturales de dirección. |
| Corte de rizos | curls | Más de 3500 espirales Bézier irregulares, en capas de sombra y brillo. |
| Corte infantil | junior | Hebras hacia un flequillo corto, con raíz y puntas suaves. |
| Corte texturizado | texture | Ondas orgánicas con longitudes y curvaturas irregulares. |
| Crew cut | crew | Trazos cortos dirigidos y microvellos en los laterales. |
| Degradado a piel | skin | Miles de microvellos con densidad progresiva y superior peinado. |
| Degradado alto | high | Densidad lateral que empieza a crecer desde la zona alta. |
| Degradado bajo | low | Densidad lateral creciente desde una zona más baja. |
| Degradado medio | mid | Transición de densidad intermedia y hebras superiores. |
| Diseño con líneas | lines | Microvellos y trazos retirados con alfa, sin pintar líneas de piel opacas. |
| Flat top | flat | Hebras verticales con puntas niveladas y perímetro atenuado. |
| French crop | crop | Hebras hacia adelante y flequillo con raíz difuminada. |
| Mohicano | mohawk | Hebras centrales elevadas con puntas de longitudes variables. |
| Mullet | mullet | Hebras superiores cortas y una capa posterior larga, ocluida por el rostro. |
| Pompadour | pompadour | Hebras direccionales largas con arco elevado y brillos longitudinales. |
| Quiff | quiff | Hebras levantadas con puntas irregulares y reflejos. |
| Taper fade | taper | Microvellos bajos en patillas y hebras peinadas en el superior. |
| Undercut | undercut | Laterales de vello corto y hebras superiores largas desconectadas. |

El cabello visible se compone de **hebras, microvellos y gradientes**, sin casquetes rellenos, anillos, conos ni bloques sólidos. `hairStrands.js` utiliza trazos Bézier/cuadráticos con grosor, alfa, luces y sombras derivados del tono. Las únicas llamadas de relleno son rectángulos con gradientes para máscaras y sombra, no siluetas de cabello opacas.

Se preparan tres texturas RGBA de 640×640: fondo con sombras entre hebras, detalle frontal y sombra de contacto. Máscaras `destination-in` con degradados atenúan raíces, sienes, patillas y contorno superior. La oclusión ambiental aproximada sigue la línea del cabello mediante gradientes radiales suaves.

`strandWorker.js` genera las texturas en OffscreenCanvas fuera del hilo de interfaz. `strandTextures.js` deduplica peticiones y mantiene una caché LRU con la selección activa y hasta dos conjuntos sin uso. Al cambiar de tono se agrupan los eventos durante 80 ms. En navegadores sin Worker/OffscreenCanvas hay un fallback de preparación en canvas normal; ese fallback puede pausar la interfaz al seleccionar.

WebGL recibe tres superficies transparentes ligeramente curvadas para acompañar la rotación del rostro. La esfera invisible solo escribe profundidad para ocultar cabello posterior detrás de la cara: no tiene color visible ni forma parte de la textura capilar. Una textura pendiente permanece invisible; respuestas antiguas no pueden mostrar planos blancos ni reemplazar un tono nuevo.

El objetivo de dibujo es el ritmo de `requestAnimationFrame`, con seguimiento facial limitado a aproximadamente 15 muestras/s e interpolación de pose. No se pintan miles de hebras en cada frame; se reutilizan las texturas GPU. **Esto no certifica 60 FPS sostenidos en cualquier celular:** todavía hay que medir la canalización completa, incluidos MediaPipe, cámara y GPU, en los teléfonos objetivo. Las superposiciones siguen siendo una aproximación procedural, sin segmentación que elimine el cabello real ni garantía de equivalencia fotorrealista con una fotografía profesional.

## Seguimiento y controles

- Se conserva la cámara frontal y se añade carga local JPG/PNG/WebP de hasta 10 MB, normalizada a un máximo de 1200 píxeles de lado mayor. No se envía la foto al servidor.
- MediaPipe usa modo VIDEO para cámara y modo IMAGE para foto; se inicializa con los mismos recursos locales. Reintenta CPU si no puede usar GPU.
- El ajuste utiliza frente (10), barbilla (152), sienes (127/356) y la matriz de transformación facial. La coronilla se **estima** a partir de frente/barbilla: FaceLandmarker no proporciona un punto del cuero cabelludo.
- El motor usa también glabela (9) y puntos de cejas (70, 63, 105, 66, 107 y sus equivalentes derechos) para limitar la altura mínima y evitar taparlas. Aplica posición, escala, proporción del rostro y rotación; respeta la imagen completa con `object-fit: contain`, el espacio lateral y el espejo de la cámara. El modo foto no se refleja.
- Selector de tono, escala 70–140 %, desplazamiento vertical ±30 % del ancho facial y botón para restablecer el ajuste. Cambiar el filtro no vuelve a pedir permisos ni reinicia la cámara.
- Si se pierde el rostro, el filtro se oculta en lugar de quedar congelado en una posición equivocada. Detener la vista, cambiar de fuente o salir libera cámara, detector, geometría y contexto WebGL.
- El guardado de selección que ya existía solo se intenta en línea, para un cliente autenticado y un ID real obtenido del catálogo. Esta tarea no crea historial de preferencias ni modifica sus tablas.

## Recursos locales y preparación PWA

`npm run dev` y `npm run build` ejecutan `scripts/sync-ra-assets.mjs`: copia el runtime WASM de la versión instalada de `@mediapipe/tasks-vision` a `public/ra/vision`. Ese directorio generado no se versiona; se reconstruye con las dependencias. Se añadió `@napi-rs/canvas` únicamente como dependencia de desarrollo para pruebas de píxeles; no se incluye en el bundle del teléfono.

El modelo facial sí forma parte del proyecto:

- Archivo: `public/ra/face_landmarker.task`.
- Fuente oficial: <https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task>.
- SHA-256: `64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff`.
- Documentación del detector: [MediaPipe Face Landmarker Web](https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker?tab=Web).
- MediaPipe Tasks Vision declara licencia Apache-2.0. Se conservan los avisos de los archivos de distribución copiados.

Las fuentes DM Sans y Playfair Display también se sirven localmente desde `public/fonts`; los archivos OFL adyacentes contienen sus licencias. Proceden del repositorio oficial [google/fonts](https://github.com/google/fonts). Se conserva la tipografía sin llamadas a Google Fonts durante el uso.

Después de Vite, `scripts/build-offline.mjs` genera `dist/sw.js` con la lista exacta de bundles, interfaz, iconos, fuentes, detector y WASM, con versión derivada de su contenido. El Service Worker instala el paquete completo, con dos descargas concurrentes, antes de indicar que está listo. La UI muestra progreso y fallos de red/almacenamiento. Un archivo inexistente o una página HTML servida por error como WASM impide marcarlo listo. Una actualización espera a instalar y activar la nueva versión antes de comprobarla.

El tamaño es aproximadamente **37.5 MiB**; la cifra exacta se imprime al compilar y aparece en el indicador. Para comprobar:

```bash
npm --prefix FrondEnd ci
npm --prefix FrondEnd run build
npm --prefix FrondEnd run preview -- --host 127.0.0.1
```

1. Abrir el simulador conectado, mediante HTTPS o localhost.
2. Pulsar «Preparar / comprobar uso sin conexión» y esperar **Listo sin conexión**.
3. Cerrar y volver a abrir la app tras una actualización del paquete.
4. Desconectar y abrir otra vez el simulador; elegir cámara o una foto del dispositivo.

Se puede pedir permiso de cámara estando offline; el navegador y el dispositivo deben permitirlo. La primera visita sin preparación no puede funcionar offline. Si el navegador borra cachés o se retiran permisos, hay que preparar o autorizar de nuevo. Esto añade el App Shell y recursos de RA; **no añade sincronización ni caché de datos privados de negocio**. Las reservas y el guardado en MySQL siguen requiriendo red. La caché de teselas de mapas mantiene su mecanismo separado.

En ASP.NET se registraron MIME `.task` y `.wasm` para que el despliegue del frontend compilado entregue el detector correctamente. No hay cambios de modelos de negocio ni migraciones.

## Archivos de esta tarea

- `FrondEnd/src/components/Simulacion/simulacion.css`: contraste, controles y adaptación visual.
- `FrondEnd/src/components/Simulacion/hairCatalog.js`: los 20 nombres y su enlace con el catálogo de API.
- `FrondEnd/src/components/Simulacion/hairStrands.js`: patrones, paleta, máscaras alfa y sombras para los 20 cortes.
- `FrondEnd/src/components/Simulacion/strandWorker.js`, `strandTextures.js`: precálculo offscreen y caché limitada.
- `FrondEnd/src/components/Simulacion/modelosCabello.js`: capas de textura, tono y liberación de recursos.
- `FrondEnd/src/components/Simulacion/facePose.js`: anclaje y ajuste de coordenadas.
- `FrondEnd/src/components/Simulacion/hairRenderer.js`: escena, seguimiento, rotación y cambio de filtros.
- `FrondEnd/src/components/Simulacion/servicioSimulacion.js`: detector local y cámara.
- `FrondEnd/src/components/Simulacion/SimulacionView.jsx`: cámara/foto, selección y ajustes.
- `FrondEnd/src/components/Simulacion/OfflineRaStatus.jsx`: progreso y comprobación de preparación offline.
- `FrondEnd/src/App.jsx`: entrega el usuario actual al simulador para conservar el guardado autorizado.
- `FrondEnd/public/sw.js`: plantilla de caché estática versionada.
- `FrondEnd/public/ra/face_landmarker.task`: modelo facial local.
- `FrondEnd/public/fonts/*` y `FrondEnd/src/index.css`: fuentes locales y licencias.
- `FrondEnd/scripts/sync-ra-assets.mjs`, `FrondEnd/scripts/build-offline.mjs`: preparación reproducible y manifiesto de caché.
- `FrondEnd/package.json`, `FrondEnd/eslint.config.js`, `.gitignore`: ejecución de scripts y exclusión de archivos generados.
- `FrondEnd/tests/hair-filters.test.mjs`, `FrondEnd/tests/hair-strands.test.mjs`, `FrondEnd/tests/ra-offline.test.mjs`: pruebas.
- `BackEnd/Program.cs`: MIME de recursos de RA.
- `README.md` y este documento.

## Verificación

- Lint, pruebas frontend y compilación Vite; compilación .NET.
- Catálogo: los 20 nombres coinciden con los de `BackEnd/Data/Seed.cs`, con IDs reordenados y catálogo de API ausente.
- Texturas: 20 firmas de píxeles diferentes, alfa continuo, variación cromática, más de 3500 rizos sin base opaca y más de 2000 microvellos en cada degradado. Cambio de tono sin mover las hebras, protección de cejas y liberación de texturas/geometría. Se prueban las respuestas asíncronas antiguas para impedir que reaparezcan tonos o planos vacíos.
- Ajuste: imagen con espacio lateral, espejo de cámara, escala, altura y ausencia de rostro. En navegador se comprobó el límite protector con escala 140 % y altura solicitada −30 %.
- Service Worker: instalación completa, lectura de recursos desde caché, exclusión de API, preservación de caché ajena y fallo explícito ante recursos inexistentes o HTML incorrecto.
- Navegador: render multicapa y worker con servidor detenido, selección de los 20 patrones, y contraste de los 20 títulos/descripciones; detección sobre una foto pública de prueba de MediaPipe; selección de los 20 filtros con servidor detenido; reapertura del App Shell desde caché y detector cargado sin servidor. Prueba realizada contra frontend compilado y un catálogo temporal, sin modificar la base del usuario.
- El seguimiento de una cámara física, el rendimiento en cada teléfono y la apreciación estética de cada filtro requieren comprobación en esos dispositivos; no se presentan como certificados por la prueba sobre foto.
