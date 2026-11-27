# Gestor de citas · EntreCortes

Primera versión web para varias barberías: **React + Vite**, API **ASP.NET Core 8**, **MariaDB/MySQL** mediante EF Core y Pomelo. `master` es la rama principal; esta implementación se revisa en `codex/primera-version-web`.

## Simulador RA: 20 filtros y modo offline (27 de noviembre de 2026)

Primero se corrigió el contraste: títulos de las tarjetas en blanco y descripciones en crema claro, también en hover y selección. El simulador enlaza los veinte nombres del catálogo con hebras y texturas multicapa distintas, con cámara o foto local, detección facial, tono de cabello y ajuste fino de altura/escala.

El motor de hebras sustituye los cascos/bloques iniciales: rizos Bézier en capas, microvellos de densidad progresiva para fades y trazos peinados para los demás estilos. Incluye máscaras alfa, sombra de contacto y protección de cejas. OffscreenCanvas + Worker preparan las texturas al seleccionar; WebGL reutiliza las capas en cada frame. El objetivo de fluidez requiere medir FPS reales en los teléfonos del equipo; no se certifican 60 FPS universales.

El detector, su runtime y las fuentes son locales. `npm --prefix FrondEnd run build` prepara un paquete offline de aproximadamente 37.5 MiB. Abre la versión compilada con conexión y espera «Listo sin conexión» antes de usarla sin señal. Las vistas son ilustrativas; la coronilla se estima desde el rostro. Reservas y guardado de preferencias siguen requiriendo internet. No hay migraciones nuevas.

[Mapa de los 20 filtros, archivos modificados, preparación y pruebas](docs/filtros-ra.md).

La auditoría PWA del 26 de noviembre que aparece más abajo describe el estado anterior: esta actualización sí añade App Shell y recursos RA offline; continúa pendiente la persistencia/sincronización offline de los datos de negocio.

## Funciones incluidas

- Registro e inicio de sesión de clientes y propietarios de barbería; sesión en cookie HttpOnly y protección CSRF.
- Perfiles públicos con dirección, teléfono, mapa interactivo OpenStreetMap y fotografías opcionales del interior/exterior. La ubicación aparece aunque no haya fotos.
- Catálogo global inicial de 20 cortes reutilizables. Cada profesional selecciona sus cortes y define precio y duración. Una cuenta de administración mantiene el catálogo.
- Un propietario puede administrar varios establecimientos y varios profesionales por establecimiento. En esta versión los profesionales de su equipo se administran desde la cuenta del propietario.
- Horarios semanales, varios periodos por día, descansos y bloqueos por fechas.
- Productos propios, precios y existencias disponibles; encargos **junto con una cita**, con pago en el local.
- Consulta de horarios libres, reservas pendientes, confirmación/cancelación y citas completadas. Calendario mensual del propietario y lista de detalle con cliente, servicio, productos y total.
- Reservas y descuentos de stock en una sola transacción, sin empalmes por barbero ni sobreventa. Cancelar devuelve el stock una sola vez. Precios, nombres y duración se conservan en cada cita.
- Avisos de nueva cita y productos encargados al correo del propietario mediante cola persistente y SMTP configurable. Sin SMTP quedan pendientes; la reserva funciona igualmente.

## Multisucursal y reseñas (26 de noviembre de 2026)

### Inicio de sesión y sucursal activa

La causa del formulario de alta repetido era que `Manage` empezaba con `selected = ""`, aunque la cuenta ya tuviera barberías. Ahora `App.jsx` consulta el endpoint privado `GET /api/manage/shops` al iniciar sesión o recuperar la sesión. `GET /api/shops` sigue siendo el catálogo público y no se utiliza para decidir la propiedad de una sucursal.

| Barberías del usuario al iniciar sesión | Destino |
|---|---|
| 0 | Formulario existente de registro de barbería. |
| 1 | Gestión directa de la barbería existente. |
| 2 o más | Selector de Sucursales con nombre, dirección y acceso a gestión. |
| Error al consultar | Aviso y opción de reintentar; no se interpreta como cero barberías. |

El selector y el panel tienen un botón explícito **Agregar nueva sucursal**. La nueva sucursal queda vinculada al usuario autenticado por el backend. El modelo existente ya permite la relación `User 1:N Shop`: `OwnerId` no tiene índice único y no se modifica esa relación.

El estado compartido de `App.jsx` y `useBranches` guarda la sucursal activa. Solo su identificador se persiste en `localStorage`, bajo `barberst.activeShop.<userId>`. Al recargar se restaura únicamente si sigue perteneciendo a la lista privada del usuario; un nuevo inicio de sesión con varias sucursales vuelve a pedir elección. Cerrar sesión limpia la selección. Si el almacenamiento está deshabilitado, se mantiene la selección en memoria.

La barra de navegación permite cambiar de sucursal sin salir de la cuenta. El cambio vuelve a montar los formularios, fotografías, equipo, productos, agenda y reseñas de la sucursal correspondiente. La agenda del gestor utiliza `GET /api/bookings?shopId=<id>`, con validación de propiedad en el servidor. Sin ese parámetro, el endpoint conserva el comportamiento anterior.

### Reseñas bidireccionales y permisos

- `Review` conserva puntuación, comentario, fecha UTC, cita, autor, cliente, sucursal y sentido. El servidor obtiene autor y destinatarios de la sesión y de la cita, no de identificadores enviados por el formulario.
- Una reseña requiere una cita **Completed**, cuya hora de fin ya pasó. No se admiten citas pendientes, confirmadas, canceladas ni pertenecientes a terceros.
- El cliente califica su barbería (`ClientToShop`); el propietario de esa barbería califica al cliente (`ShopToClient`). La puntuación es un entero de 1 a 5; el comentario es opcional y admite hasta 2000 caracteres.
- La base limita puntuación y sentido mediante restricciones CHECK. El índice único `(BookingId, Direction)` evita duplicados, incluso ante solicitudes simultáneas. Se permite una reseña por cada sentido y cita.
- Las reseñas del cliente a la barbería son públicas. Las del gestor al cliente son privadas: las ve el propio cliente y el gestor autorizado dentro de esa sucursal. No se publican correos ni identificadores de clientes en la lista pública.
- Las listas tienen promedio, contador y paginación de 20 reseñas, ordenadas por fecha e identificador. Un promedio sin reseñas se devuelve como `null`.
- El formulario está en **Mis citas**, para citas completadas. El perfil público muestra promedio, estrellas y comentarios. El panel del gestor añade **Reseñas y Calificaciones**, con reseñas recibidas y citas terminadas para calificar clientes. El cliente también puede consultar las calificaciones recibidas en su historial.
- Se conservan la autenticación con cookie y la validación CSRF de los nuevos POST. Los comentarios se muestran como texto, sin interpretar HTML. Esta versión no incluye edición, eliminación ni moderación de reseñas.

| Método y ruta | Acceso y resultado |
|---|---|
| `POST /api/reviews` | Cliente o gestor participante. Cuerpo: `{ "bookingId": 123, "rating": 5, "comment": "Excelente atención" }`. Devuelve 201; duplicado o cita no apta: 409; datos inválidos: 400; participante ajeno: 403. |
| `GET /api/shops/{id}/reviews?page=1` | Público: reseñas recibidas por la barbería. |
| `GET /api/manage/shops/{id}/reviews?page=1` | Propietario: reseñas recibidas por su sucursal. |
| `GET /api/manage/shops/{shopId}/customers/{customerId}/reviews?page=1` | Propietario: calificaciones del cliente en esa sucursal; requiere que exista una cita entre ambos. |
| `GET /api/me/reviews?page=1` | Cliente: calificaciones que ha recibido. |

### Aplicar la migración de EF Core

La migración **`20261126222100_AddReviews` ya está generada** e incluida junto con su archivo Designer y el snapshot. Crea únicamente la tabla `Reviews`, sus relaciones, índices y restricciones. No debes volver a generar `AddReviews` en cada equipo.

Desde la raíz del repositorio, con tu conexión configurada en `BackEnd/appsettings.json` y MariaDB/Laragon iniciado:

```bash
dotnet tool restore
dotnet restore BackEnd
dotnet ef database update 20261126222100_AddReviews --project BackEnd --startup-project BackEnd --context AppDb
```

El manifiesto `.config/dotnet-tools.json` fija `dotnet-ef` 8.0.13, compatible con EF Core 8 del backend. `DesignFactory` lee los JSON del proyecto para aplicar migraciones; usa una versión fija del proveedor para poder generar el esquema sin abrir una conexión. Antes usaba un usuario ficticio `unused`, por lo que `database update` sin una conexión explícita no utilizaba la configuración del proyecto.

El comando de actualización aplica también las migraciones anteriores que falten. Para una base completamente nueva, puedes ejecutar después `dotnet run --project BackEnd -- --migrate` para cargar el catálogo inicial. El arranque habitual de ASP.NET Core mantiene sus proveedores de configuración, incluidos los secretos de usuario en Development: una conexión configurada allí puede prevalecer sobre `appsettings.json`. En pruebas se utiliza siempre un destino explícito para impedir conexiones a la base de trabajo.

Comprueba desde el cliente SQL:

```sql
SELECT MigrationId FROM gestor_citas.__EFMigrationsHistory ORDER BY MigrationId;
SHOW CREATE TABLE gestor_citas.Reviews;
```

El comando empleado para generar los archivos fue el siguiente (solo como referencia, **ya fue ejecutado**):

```bash
dotnet ef migrations add AddReviews --project BackEnd --startup-project BackEnd --context AppDb --output-dir Migrations
```

### Archivos y verificación

- `FrondEnd/src/App.jsx`, `branches/branchSelection.js`, `branches/useBranches.js` y `pages/Branches.jsx`: recuperación de sesión, decisiones 0/1/N, persistencia por cuenta y selector rápido.
- `FrondEnd/src/pages/Manage.jsx`, `pages/Bookings.jsx` y `pages/ShopDetail.jsx`: formularios separados por sucursal, agenda filtrada y acceso a reseñas.
- `FrondEnd/src/components/ReviewForm.jsx`, `components/ReviewList.jsx` y `src/App.css`: estrellas interactivas, comentarios, promedios, paginación y estilos coherentes con los paneles existentes.
- `BackEnd/Data/Review.cs`, `Data/Models.cs`, `Contracts/Requests.cs`, `Services/ReviewEndpoints.cs` y `Program.cs`: entidad, validaciones, permisos, DTO y rutas Minimal API. Se mantiene la arquitectura sin carpeta Controllers.
- `BackEnd/Data/DesignFactory.cs`, `.config/dotnet-tools.json` y `BackEnd/Migrations/*AddReviews*`/`AppDbModelSnapshot.cs`: herramienta y migración reproducibles.
- `FrondEnd/tests/branches.test.mjs`, `FrondEnd/package.json`, `tests/integration_reviews.py` y `.github/workflows/verify.yml`: pruebas de selección y de API incorporadas a CI.

Comandos de verificación:

```bash
npm --prefix FrondEnd test
npm --prefix FrondEnd run lint
npm --prefix FrondEnd run build
dotnet build BackEnd -c Release
dotnet ef migrations has-pending-model-changes --project BackEnd --startup-project BackEnd --context AppDb
```

La nueva prueba de integración se ejecuta **solo contra una base desechable** llamada `gestor_test` o `barberst_test_*`, con una API configurada explícitamente hacia esa misma base:

```bash
python tests/integration_reviews.py --url http://127.0.0.1:5196 --db-config /ruta/al/client.cnf --database barberst_test_reviews
```

El archivo de cliente SQL contiene los datos de conexión de la instancia de pruebas; no se versiona. La prueba compara un establecimiento recién creado por la API con el mismo registro por SQL antes de modificar las fechas de sus propias citas. Usa ese ajuste de fechas para probar citas completadas sin alterar el reloj del sistema. Las pruebas anteriores siguen en `tests/integration.py` y ambas se ejecutan en CI.

Verificado localmente con MariaDB 13.0.2 en una instancia temporal del puerto 33346: actualización desde el esquema anterior conservando un registro testigo, restricciones y tres migraciones aplicadas; cinco pruebas de selección de sucursal; pruebas previas de API y nuevas pruebas de propiedad, reingreso, aislamiento por sucursal, reseñas en ambos sentidos, validaciones, promedios y duplicados concurrentes. En navegador se comprobaron altas y reingresos con 0/1/2 sucursales, cambio rápido y persistencia tras recarga, publicación de reseñas como gestor y cliente, y lectura de los comentarios recibidos. Se comprobó el selector a 390 px sin desbordamiento horizontal. No se aplicó la migración a la base de trabajo del usuario ni se modificó la PWA.

## Requisitos

- SDK de .NET 8.
- Node.js 24 y npm (versión usada para verificar el frontend).
- MariaDB o MySQL con tablas InnoDB. Verificación anterior con MariaDB 10.11.14. En la revisión del 24 de noviembre de 2026 se detectó MariaDB 13.0.2 local; su esquema sigue pendiente de migración y comprobación. Pomelo detecta la versión al conectar. Cada instalación de Laragon, especialmente si utiliza MySQL, debe verificar migraciones y reservas antes de desplegar.

## 1. Obtener la rama

```bash
git clone --branch codex/primera-version-web https://github.com/Carlos-1803/Gestor-de-citas2.git
cd Gestor-de-citas2
```

Si ya tienes una copia, guarda tus cambios locales y ejecuta `git fetch origin` y `git switch --track origin/codex/primera-version-web` (o `git switch codex/primera-version-web` si ya existe localmente).

## 2. Preparar la base local: MariaDB en Linux o Laragon en Windows

Cada integrante mantiene su propia base `gestor_citas` en `localhost`. La conexión se configura en `BackEnd/appsettings.json`; no hace falta definir variables de entorno para la base de datos. Las migraciones versionadas mantienen el mismo esquema en todos los equipos.

### Linux con MariaDB

Con MariaDB instalado e inicializado, inicia el servicio y abre una sesión administrativa:

```bash
sudo systemctl start mariadb
sudo mariadb
```

No vuelvas a inicializar el directorio de datos de una instalación existente. Ejecuta el siguiente SQL dentro de MariaDB, sustituyendo la contraseña de ejemplo:

```sql
SELECT VERSION();
CREATE DATABASE IF NOT EXISTS gestor_citas CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'gestor'@'localhost' IDENTIFIED BY 'CAMBIA_ESTA_CONTRASENA';
GRANT ALL PRIVILEGES ON gestor_citas.* TO 'gestor'@'localhost';
EXIT;
```

Si el usuario `gestor` ya existe, usa sus credenciales y comprueba sus permisos; no lo elimines ni cambies su contraseña sin revisar qué aplicaciones lo utilizan. El usuario solo recibe permisos sobre esta base. En Linux, `sudo mariadb` puede funcionar por autenticación de socket mientras `root` por TCP sigue rechazando conexiones: usa el usuario `gestor` en la aplicación.

### Windows con Laragon

1. Instala el SDK de .NET 8 y Node.js 24 con npm.
2. Abre Laragon e inicia MySQL o MariaDB; comprueba el puerto del servicio (los ejemplos usan `3306`).
3. Abre **Terminal** desde Laragon y ejecuta `mysql -h localhost -P 3306 -u root -p`. Introduce la contraseña de tu instalación; si está configurada sin contraseña, pulsa Enter.
4. Ejecuta `CREATE DATABASE IF NOT EXISTS gestor_citas CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;` en el cliente SQL. También puedes usar el cliente gráfico conectado a Laragon.
5. Si vas a usar la cuenta `gestor`, ejecuta también las instrucciones `CREATE USER` y `GRANT` del apartado Linux. Si tu instalación local utiliza `root` sin contraseña, puedes mantener el ejemplo inicial de conexión que se muestra abajo.

El repositorio puede estar en cualquier carpeta; no necesita estar en `C:\laragon\www` ni usar Apache. Sal de la consola SQL con `exit;` antes de ejecutar los comandos de .NET.

## 3. Configurar la conexión en appsettings.json y migrar

Edita **solo la sección `ConnectionStrings`** de `BackEnd/appsettings.json`, conservando `Logging` y `AllowedHosts`.

Ejemplo para MariaDB con el usuario creado arriba:

```json
"ConnectionStrings": {
  "Database": "Server=localhost;Port=3306;Database=gestor_citas;User=gestor;Password=CAMBIA_ESTA_CONTRASENA"
}
```

El archivo del proyecto incluye inicialmente esta conexión para una instalación local de Laragon con `root` sin contraseña:

```json
"ConnectionStrings": {
  "Database": "Server=localhost;Port=3306;Database=gestor_citas;User=root;Password="
}
```

Cada integrante ajusta usuario, contraseña y puerto a su instalación local. No subas contraseñas personales al repositorio. No hace falta modificar `Program.cs`: `GetConnectionString("Database")` ya lee esta sección. Si anteriormente configuraste `ConnectionStrings__Database` en tu equipo, elimínala de esa terminal o de su configuración persistente, porque tiene prioridad sobre el JSON.

Desde la raíz del repositorio en Linux:

```bash
dotnet restore BackEnd
dotnet run --project BackEnd -- --migrate
```

Desde la raíz del repositorio en PowerShell o CMD de Windows:

```powershell
dotnet restore .\BackEnd
dotnet run --project .\BackEnd -- --migrate
```

`--migrate` aplica las migraciones pendientes y carga los veinte cortes iniciales. Incluye el esquema inicial y la tabla `Simulaciones` del simulador RA. No necesitas crear tablas manualmente ni importar un `.sql`. Repetirlo conserva los datos y no duplica los cortes iniciales; el arranque normal no ejecuta migraciones.

Comprueba el resultado desde el cliente SQL:

```sql
USE gestor_citas;
SHOW TABLES;
SELECT MigrationId FROM __EFMigrationsHistory ORDER BY MigrationId;
SELECT COUNT(*) AS cortes FROM Haircuts;
SHOW TABLES LIKE 'Simulaciones';
```

En una base nueva deben aparecer las migraciones `20261015011954_InitialSchema` y `20261101223639_AddSimulacionTable`, veinte cortes y la tabla `Simulaciones`.

Para crear una cuenta inicial de administración, añade temporalmente esta sección al objeto principal de `appsettings.json` (con la coma necesaria entre secciones), ejecuta `--migrate` y retira después `Admin:Password`:

```json
"Admin": {
  "Email": "tu-correo@ejemplo.com",
  "Password": "SUSTITUYE_POR_UNA_CONTRASENA_PROPIA"
}
```

La contraseña debe tener al menos doce caracteres. No existe una contraseña de administración predeterminada. Este proceso crea una cuenta nueva; no cambia contraseñas ni eleva permisos de cuentas existentes.

Si falla, revisa el servicio, puerto y credenciales. `Access denied` indica un problema de autenticación o permisos; `Unknown database`, que la base no existe en ese servidor. Tras arrancar el backend, `http://localhost:5191/api/haircuts` debe devolver el catálogo en JSON.

### Estado de la preparación local (24 de noviembre de 2026)

- Detectado MariaDB **13.0.2** y backend compilado sin errores ni advertencias.
- `gestor_citas` no existe en la instancia consultada.
- La cuenta disponible por socket es anónima y solo tiene `USAGE`; `root` por TCP rechaza el acceso y `sudo` solicita contraseña.
- **Pendiente:** ejecutar la preparación administrativa anterior, ajustar las credenciales del JSON y aplicar/verificar las dos migraciones. No se creó una base temporal como sustituto ni se modificaron bases existentes. La compatibilidad del esquema con esta instancia todavía no está verificada.

## 4. Ejecutar la web

Con MariaDB o el servicio de Laragon iniciado y la conexión configurada en `appsettings.json`, desde la raíz del repositorio:

```bash
dotnet run --project BackEnd
```

En otra terminal:

```bash
cd FrondEnd
npm ci
npm run dev
```

Abre la dirección indicada por Vite (normalmente `http://localhost:5173`). El proxy de Vite envía `/api` y `/uploads` a `http://localhost:5191`, así que no necesitas CORS ni claves de mapas. Swagger está disponible en `http://localhost:5191/swagger` en desarrollo. Los POST/PUT/DELETE necesitan el token obtenido en `GET /api/auth/token`, enviado como `X-CSRF-TOKEN` junto con la cookie.

## 5. Probar el flujo

1. Registra una cuenta de **barbero**. En «Mi barbería», publica los datos y coordenadas del establecimiento; añade fotos si quieres.
2. En «Barberos y horarios», añade un profesional, selecciona un corte del catálogo, define precio/duración y guarda sus periodos de trabajo.
3. Añade productos con sus existencias en «Productos» y revisa «Ver perfil público». Usa «Agregar nueva sucursal» para otro local y el selector de navegación para cambiar entre ellos.
4. Cierra sesión y registra una cuenta de **cliente**. Busca la barbería, elige servicio, fecha, horario y productos, y reserva.
5. Vuelve a la cuenta del barbero para consultar «Mis citas», filtrar en el calendario y confirmar la reserva. Solo una cita confirmada cuya hora de fin haya pasado puede marcarse completada.

Los horarios públicos usan la zona de la barbería (`America/Merida` por defecto). La entrada de bloqueos usa la zona del navegador, indicada en la pantalla. Las horas se guardan en UTC. Las citas existentes se conservan aunque se cambie el horario semanal o se desactive un servicio.

## Correo SMTP

Configura en el entorno del backend y reinícialo:

```bash
export Smtp__Host='smtp.tu-proveedor.com'
export Smtp__Port='587'
export Smtp__EnableSsl='true'
export Smtp__User='tu-usuario'
export Smtp__Password='tu-secreto'
export Smtp__From='citas@tu-dominio.com'
```

El proveedor debe permitir SMTP con STARTTLS en ese puerto. El trabajador consulta cada 30 segundos y reintenta hasta diez veces con espera creciente. La cola se confirma dentro de la transacción de la cita. Ejecuta **una sola instancia del trabajador** en esta versión. El envío es al menos una vez: un fallo después del envío y antes de guardar puede duplicar un aviso. Para reintentar trabajos agotados tras corregir SMTP, revisa los registros y restablece `Attempts`/`NextAttemptUtc` de los trabajos afectados en `MailJobs`.

## Verificación

```bash
dotnet build BackEnd
npm --prefix FrondEnd ci
npm --prefix FrondEnd run lint
npm --prefix FrondEnd run build
```

Con una API levantada contra una **base desechable**, ejecuta:

```bash
python tests/integration.py --url http://localhost:5191
```

La prueba usa solo la biblioteca estándar de Python, crea sus propias cuentas y barberías y comprueba autenticación, CSRF, permisos, catálogo compartido, horarios, reservas simultáneas, sobreventa, cancelación, precios históricos, bloqueos y fotos. No ejecutarla sobre una base de producción. El flujo de CI repite estas pruebas con MariaDB.

### Corrección de la comprobación de GitHub (24 de noviembre de 2026)

La [ejecución del commit `9f9012a`](https://github.com/Carlos-1803/Gestor-de-citas2/actions/runs/45423322603) falló en `npm --prefix FrondEnd run lint`: `Catalog.jsx` declaraba `setCuts` sin utilizarlo. El catálogo de administración tenía tres cortes de ejemplo y una función de carga vacía.

Se sustituyeron los ejemplos por la consulta a `GET /api/haircuts` y se utiliza esa misma ruta para refrescar la lista después de crear o editar un corte. Los errores de carga se muestran mediante el aviso de la aplicación.

Verificación de la corrección: ESLint y compilación del frontend correctos; compilación Release del backend sin errores ni advertencias. Las dos migraciones y las pruebas de integración se verificaron en una base desechable `gestor_ci` sobre MariaDB 13.0.2. El flujo remoto utiliza MariaDB 10.11 y debe volver a ejecutarse al subir el nuevo commit. El aviso de Vite sobre el tamaño del JavaScript es una advertencia y no fue la causa del fallo de GitHub. Esta corrección no incorpora cambios PWA.

Incidencia durante la validación: la primera ejecución alcanzó la instancia local del puerto 3306 y generó datos de ejemplo del script de integración (cuentas `@example.test`, una barbería `Integration …` y sus reservas/productos de prueba). Se detuvo ese proceso y se repitió la comprobación con el destino temporal fijado explícitamente por argumento. No se eliminaron registros de la instancia local para evitar borrar datos ajenos a la prueba.

## Auditoría Offline-First de la PWA (26 de noviembre de 2026)

**Diagnóstico de la copia revisada: PWA básica con aviso offline; no hay arquitectura Offline-First ni doble persistencia de datos de negocio.** Esta auditoría es informativa. No se implementaron App Shell, base local de citas ni Outbox; requieren aprobación separada. La implementación de mapas descrita más abajo crea una base IndexedDB exclusiva de teselas, no de citas, servicios o reseñas.

| Capa | Evidencia actual | Resultado |
|---|---|---|
| Manifiesto | `FrondEnd/public/manifest.json`: nombre, iconos 192/512, `start_url`, `scope` y `display: standalone`; enlazado desde `index.html`. | Metadatos de instalación; no descarga la interfaz. |
| Registro SW | `src/main.jsx` registra `/sw.js` en producción, con contexto seguro y soporte del navegador. | No hay `vite-plugin-pwa` ni Workbox instalados. |
| App Shell | `public/sw.js` solo guarda `/pwa/sin-conexion.html` y usa red con fallback a ese documento para `/` e `/index.html`. | No guarda React, sus bundles JS/CSS, imágenes, fuentes ni modelos RA. Una reapertura sin red muestra el aviso estático, no la interfaz completa. |
| Datos locales | Las pantallas usan `useState` y `src/api.js` llama directamente a `fetch`. | Antes del módulo de mapas no existía IndexedDB/Dexie/LocalForage. Ahora solo hay IndexedDB de mapas; los datos de negocio siguen en el servidor. |
| localStorage | `src/branches/useBranches.js` guarda el ID de sucursal activa por usuario. | No contiene citas, formularios pendientes ni una réplica de la base remota. |
| Sincronización | No hay `sync`/Background Sync, Outbox, mapeo de IDs temporales ni estados pendientes. | Crear una cita, sucursal o reseña sin conexión falla y no queda en una cola persistente. |
| Conectividad | `ConnectionNotice` escucha `navigator.onLine`. | Tener red no prueba que .NET/MySQL estén disponibles. |
| CSRF y reintentos | `api.js` renueva CSRF y repite ante cualquier HTTP 400. | No es sincronización. Debe distinguirse el rechazo específico de CSRF de la validación de negocio; no se modificó en esta tarea informativa. |

El backend ya protege la disponibilidad de horarios y stock mediante transacciones. Eso no equivale a resolver operaciones creadas offline: falta un contrato que evite duplicados cuando se pierde una respuesta y que devuelva conflictos explícitos. La autenticación offline tampoco está implementada; la cookie HttpOnly y el token CSRF deben renovarse con el servidor antes de reproducir operaciones.

### Plan pendiente de aprobación: datos de negocio y sincronización

| Capa | Librerías/archivos propuestos (todavía no creados) |
|---|---|
| App Shell | `vite-plugin-pwa` y Workbox; configurar `vite.config.js` y crear `src/pwa/register.js`, `UpdateNotice.jsx`. Sustituir el worker manual, sin mantener dos registros. |
| Base local | `dexie` y `dexie-react-hooks`; crear `src/offline/db.js`, `repositories/shops.js`, `bookings.js`, `services.js`, `reviews.js`, con partición por cuenta y sucursal. |
| Cola y transporte | `src/offline/outbox.js`, `syncEngine.js`, `idMapping.js`, `SyncStatus.jsx`. UUID por operación, IDs locales, dependencias entre entidades, intentos y errores persistentes. |
| Ejecución | Sincronizar al abrir/reanudar la app, recuperar conexión y mediante acción manual. Background Sync como mejora cuando exista soporte, nunca como único mecanismo. |
| API .NET | Crear `BackEnd/Contracts/SyncRequests.cs`, `BackEnd/Services/SyncService.cs`, `BackEnd/Services/SyncEndpoints.cs` y `BackEnd/Data/ProcessedOperation.cs`; actualizar `Data/Models.cs`. Incluir identificadores de operación/idempotencia, registro persistente de operaciones procesadas y versión de registros. Generar `AddOfflineSync` solo al aprobar esta capa. |
| Conflictos | Citas offline como solicitudes pendientes de confirmación, no reservas garantizadas; el servidor decide horarios y stock. Mapear sucursales locales antes de sus operaciones dependientes. Conservar reseñas duplicadas/rechazadas con un error visible, sin repetirlas ni descartarlas silenciosamente. Fechas en UTC y presentación en `America/Merida`, válida para Campeche. |
| Seguridad y pruebas | Crear `FrondEnd/tests/offline-db.test.mjs`, `outbox.test.mjs`, `syncEngine.test.mjs` y `tests/integration_sync.py`. No almacenar contraseñas ni reproducir operaciones bajo otra cuenta. Probar expiración de sesión/CSRF, pérdida de respuesta, duplicados, falta de cuota, cambio de cuenta y conflictos simultáneos. |

## Mapas móviles y caché de Campeche

### Funcionalidad implementada

Se reemplazó el iframe de OpenStreetMap por Leaflet/React-Leaflet en el perfil público y el formulario de barbería. Se mantiene el estilo existente y se incorporó **Mapa offline** a la navegación, sin modificar el Service Worker ni agregar sincronización de negocio.

- Las nuevas barberías comienzan sin ubicación seleccionada. Candelaria es únicamente la vista de referencia del mapa; hay que fijar el pin o aceptar una lectura precisa antes de guardar.
- En edición se conserva la ubicación guardada: el botón **Usar mi ubicación GPS actual** permite sustituirla de forma explícita. Hay un solo marcador de ubicación seleccionada, compartido por toque, arrastre y GPS; no se dibuja un segundo pin del dispositivo. Una respuesta GPS tardía no sobrescribe una selección manual.
- El botón GPS usa `getCurrentPosition` con `{ enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }`. Ante `TIMEOUT (3)` reintenta una sola vez con `enableHighAccuracy: false`, admitiendo ubicación aproximada por red/Wi-Fi. Se muestra la precisión reportada para confirmar el pin; ya no se descartan lecturas por superar 50 metros. Mientras espera muestra «Obteniendo GPS...» y deshabilita el botón. Los errores de permiso (1), ubicación no disponible (2), timeout (3) y contexto inseguro se indican bajo el mapa. Cancelar o seleccionar manualmente impide aplicar respuestas tardías.
- Al tocar el mapa o arrastrar el marcador se actualiza la selección sin cambiar la cámara ni el zoom. El marcador muestra la etiqueta «Ubicación de la barbería». Cada búsqueda GPS exige una lectura sin caché (`maximumAge: 0`), también en el fallback.
- Al aceptar la ubicación con el botón, se actualizan `shop.latitude` y `shop.longitude` (los mismos valores que recibe el marcador y se envían al guardar). Un subcomponente con `useMap()` ejecuta `flyTo([lat, lng], 16)`, incluso al solicitar nuevamente la misma posición. Se conserva la validación de cobertura de Campeche; fuera de ella se informa el motivo sin cambiar el local.
- Pin arrastrable y selección tocando el mapa, sin campos numéricos de latitud/longitud visibles. Las coordenadas se conservan internamente para guardar y mostrar el local. El navegador necesita HTTPS o localhost para geolocalización.
- No se consulta ningún servicio de ubicación por IP. La API del navegador no informa si usa GPS, Wi-Fi o red, ni permite obligar el uso del GPS físico: alta precisión es una petición al dispositivo, no una garantía. En el teléfono hay que habilitar ubicación precisa y conceder permiso al sitio; siempre se debe confirmar el pin antes de guardar.
- Dos dedos para mover el mapa, un dedo para desplazar la página; controles de zoom y GPS de al menos 44 px, altura adaptable y atribución visible.
- Cobertura: `minLat=17.80`, `maxLat=20.85`, `minLon=-92.47`, `maxLon=-89.12`. Las ubicaciones antiguas fuera de esa región se conservan y se informa que no están cubiertas por los paquetes offline.
- Almacenamiento separado **IndexedDB `barberst-maps`**, con almacenes de teselas y metadatos mediante LocalForage. Se guardan únicamente imágenes de mapas, su fuente/versionado y metadatos de descarga.
- Las teselas consultadas se reutilizan desde IndexedDB. Para la fuente OSM estándar se respetan los encabezados de frescura y se conservan las imágenes para reutilización offline; cuando no hay información de frescura se utilizan siete días. Una imagen caducada se revalida al disponer de red; las respuestas que prohíben almacenamiento no se descargan como paquete. No se precargan regiones del servidor público.
- El visor usa niveles nativos **8–15** y permite ampliar la vista hasta 18. Cuando falta una tesela, recorta y escala el ancestro más cercano guardado; `maxNativeZoom=15` evita solicitar detalle superior. Sin un ancestro disponible no se pueden inventar calles: se indica que la zona todavía no está guardada.
- El descargador permite **Todo Campeche** o **Área visible + base estatal en zoom 8**, detalle máximo, presupuesto de 32 MiB a 4 GiB, confirmación para paquetes grandes, barra de progreso, cancelación y reanudación reutilizando lo completado. Solo hace dos peticiones simultáneas; comprueba cuota y tamaño real, y solicita almacenamiento persistente. Cuando Web Locks está disponible, evita descargas simultáneas entre ventanas.
- La descarga requiere mantener la pantalla abierta. Cambiar de pantalla cancela y conserva lo completado. El navegador/sistema aún puede desalojar datos; el usuario puede borrar únicamente los mapas locales desde la utilidad.

**Los mapas descargados funcionan con la interfaz ya cargada; no convierten la reapertura de React en Offline-First.** Al cerrar y reabrir sin red sigue aplicando el aviso estático del worker actual. Resolverlo pertenece al App Shell de la auditoría y queda pendiente de aprobación.

### Fuente de teselas: condición para activar la descarga estatal

El equipo confirmó que **todavía no dispone de una fuente autorizada para descargas**. Por ello, la configuración entregada usa OSM para consulta normal y mantiene `offline: null`: el botón de descarga regional está visible pero deshabilitado, con explicación. La infraestructura está implementada y probada con teselas sintéticas propias; no se descargó una región real completa de OSM.

El servidor público `tile.openstreetmap.org` prohíbe ofrecer precarga de ciudades/regiones. El código bloquea su uso para descarga masiva incluso si alguien cambia `offlineAllowed` a `true`. Datos OSM abiertos no implican permiso para descargar masivamente de cualquier servicio de teselas. Referencia: [política oficial de teselas OSM](https://operations.osmfoundation.org/policies/tiles/).

Para activar las descargas, sustituye `FrondEnd/public/maps/config.json` por una configuración con un servidor propio o un proveedor cuyo contrato permita paquetes offline. Ejemplo de estructura (requiere que las imágenes existan en esa ruta):

```json
{
  "online": {
    "id": "osm-standard-v1",
    "name": "OpenStreetMap",
    "urlTemplate": "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    "attribution": "© OpenStreetMap contributors",
    "attributionUrl": "https://www.openstreetmap.org/copyright"
  },
  "offline": {
    "id": "campeche-propio-v1",
    "name": "Mapa propio de Campeche",
    "urlTemplate": "/map-tiles/{z}/{x}/{y}.png",
    "offlineAllowed": true,
    "attribution": "© OpenStreetMap contributors · Servicio propio",
    "attributionUrl": "https://www.openstreetmap.org/copyright"
  }
}
```

La fuente debe proporcionar teselas XYZ PNG/JPEG/WebP entre zoom 8 y 15, permitir CORS si es externa y usar HTTPS en producción. Una ruta propia puede servirse desde `BackEnd/wwwroot/map-tiles/{z}/{x}/{y}.png`, mediante los archivos estáticos ya configurados; esa ruta **no contiene datos de mapas incluidos en este repositorio**. Hay que preparar y alojar las teselas con una herramienta de generación compatible con datos OSM, o contratar una fuente permitida. No introduzcas contraseñas/credenciales privadas en el JSON público; una clave secreta necesita un servicio propio que la proteja. Cambia el ID de versión cuando renueves el juego de teselas. Reconstruye el frontend y recarga para recoger cambios de configuración.

La plantilla relativa se resuelve sobre el origen de la aplicación; para desarrollo con Vite, usa la URL HTTPS del proveedor o configura explícitamente el proxy de la fuente propia. El proxy de API existente no genera ni sirve mapas por sí mismo.

### Tamaño orientativo y operación en celulares

| Zoom incluido | Teselas de ese nivel en todo el rectángulo |
|---|---:|
| 8 | 12 |
| 9 | 36 |
| 10 | 110 |
| 11 | 420 |
| 12 | 1520 |
| 13 | 5850 |
| 14 | 22792 |
| 15 | 90576 |

Todos los niveles 8–15 suman **121316 teselas**: aproximadamente **2.9 GiB a 25 KiB por tesela**, sin contar sobrecarga. La base estatal 8–11 suma 578 teselas, aproximadamente 14.1 MiB bajo esa misma hipótesis. El tamaño real depende del estilo y del contenido. Para celulares conviene una base estatal y zonas urbanas detalladas, no iniciar automáticamente varios GiB. Las estimaciones no sustituyen la comprobación de cuota y el límite de bytes reales durante la descarga.

### Backend, archivos y comprobación

`Shop.Latitude` y `Shop.Longitude` ya existen como `double`, están en `ShopRequest`, en POST/PUT y GET de barberías y en `20261015011954_InitialSchema`. El backend valida valores finitos y rangos geográficos. **Esta tarea de mapas no crea una migración y no requiere ejecutar `dotnet ef database update`.** La migración de reseñas de la tarea anterior es independiente y conserva sus instrucciones en este README.

Paquetes nuevos de mapas: `leaflet` 1.9.4, `react-leaflet` 5.0.0, `localforage` 1.10.0 y `leaflet-gesture-handling` 1.2.2. Para pruebas se agregó `fake-indexeddb` (solo desarrollo). No se instalaron Dexie ni Workbox ni se creó una Outbox.

Archivos nuevos: `FrondEnd/src/maps/LocationMap.jsx`, `OfflineMaps.jsx`, `PersistentTileLayer.js`, `mapConfig.js`, `mapRegion.js`, `mapStorage.js`, `maps.css`; `FrondEnd/public/maps/config.json`; pruebas `FrondEnd/tests/maps.test.mjs` y `map-storage.test.mjs`.

Integración en `FrondEnd/src/App.jsx`, `pages/Manage.jsx`, `pages/ShopDetail.jsx`; dependencias en `package.json`/`package-lock.json` y documentación en este README. Se conservaron los cambios previos de sucursales y reseñas.

```bash
npm --prefix FrondEnd ci
npm --prefix FrondEnd test
npm --prefix FrondEnd run lint
npm --prefix FrondEnd run build
```

Verificación: geometría y conteo de teselas, recorte del ancestro, límites de Campeche, bloqueo de precarga OSM, persistencia IDB de blobs, reanudación sin repetir peticiones, cancelación, cuota y respuestas `no-store`. En navegador se comprobó la carga normal de teselas OSM de Candelaria, selección por toque y arrastre del pin, recuperación tras fallo de GPS y envío de coordenadas en un servidor de formulario ficticio. El visor se revisó a 390 px sin desbordamiento horizontal; el GPS de un teléfono físico y sus gestos multitáctiles requieren comprobación en ese dispositivo. La descarga y la ampliación con servidor detenido se probaron contra una fuente local de teselas sintéticas propias; esta prueba no equivale a haber descargado un mapa estatal real. No se usó ni modificó la base de trabajo del usuario para las pruebas de mapas.

Referencias técnicas: [React-Leaflet](https://react-leaflet.js.org/), [Leaflet 1.9.4](https://leafletjs.com/reference-1.9.4.html), [LocalForage](https://localforage.github.io/localForage/), [gestos móviles](https://elmarquis.github.io/Leaflet.GestureHandling/).

## Publicación y mantenimiento

Para servir frontend y API desde el mismo origen:

```bash
npm --prefix FrondEnd run build
mkdir -p BackEnd/wwwroot
cp -r FrondEnd/dist/* BackEnd/wwwroot/
dotnet publish BackEnd -c Release -o publish
```

Configura la conexión en `BackEnd/appsettings.json` y SMTP en el servidor; aplica migraciones antes de arrancar. Publica detrás de HTTPS. Conserva `wwwroot/uploads`, la base de datos y las claves de ASP.NET Data Protection entre despliegues; las fotos no se guardan en Git. Los recursos estáticos compilados tampoco se versionan. Usa un usuario de ejecución con permisos limitados y otro con permisos de migración si separas esas tareas.

## Estructura y alcance

- `BackEnd/Data`: entidades, contexto y catálogo inicial.
- `BackEnd/Migrations`: historial de esquema.
- `BackEnd/Services`: reglas de reserva y trabajador de correo.
- `BackEnd/Contracts`: contratos de entrada de la API.
- `FrondEnd/src/pages`: pantallas separadas por función.
- `docs/modelo-y-reglas.md`: relaciones y decisiones de negocio.
- `tests/integration.py`: comprobaciones de la API con base real.

Nombre visual provisional: **EntreCortes**. Quedan fuera de esta primera versión: app móvil, pagos en línea, encargos sin cita, recuperación/verificación de correo y accesos independientes para cada integrante del equipo. El mapa y las fuentes web necesitan conexión; hay tipografías alternativas locales. El envío real de correo requiere tus credenciales SMTP y no se ha probado con tu proveedor.
