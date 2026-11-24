# Gestor de citas · EntreCortes

Primera versión web para varias barberías: **React + Vite**, API **ASP.NET Core 8**, **MariaDB/MySQL** mediante EF Core y Pomelo. `master` es la rama principal; esta implementación se revisa en `codex/primera-version-web`.

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
3. Añade productos con sus existencias en «Productos» y revisa «Ver perfil público».
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

## Plan de implementación de la PWA

**Estado: planificación; todavía no implementada.** La revisión del código encontró React 19, Vite 8, API ASP.NET Core, sesión con cookie HttpOnly y protección CSRF. No hay manifiesto PWA ni service worker registrado. El backend ya sirve archivos estáticos y tiene fallback a `index.html`.

### Etapa 1. Preparar la base técnica

- Resolver el aviso de ESLint por `setCuts` sin usar en `FrondEnd/src/pages/Catalog.jsx` y volver a ejecutar lint y build.
- Cargar `SimulacionView` bajo demanda con React para que Three.js y el detector facial no formen parte de la descarga inicial de las reservas. La compilación revisada generó un JavaScript principal de aproximadamente 967 KB sin gzip.
- Comprobar la compatibilidad de `vite-plugin-pwa` con Vite 8 antes de elegir e instalar su versión. Registrar las versiones efectivamente usadas.
- Confirmar publicación de frontend y API bajo el mismo origen, con HTTPS en el servidor. `localhost` permite pruebas locales; abrir una IP de la red por HTTP en un celular no equivale a `localhost` seguro.

**Criterio de salida:** lint y build correctos, carga separada del simulador y URL de prueba definida.

### Etapa 2. Instalación y actualización

- Configurar el manifiesto en `FrondEnd/vite.config.js`: nombre EntreCortes, identificador estable, `start_url`, `scope`, idioma español, colores y `display: standalone`.
- Preparar iconos PNG de 192 y 512 px, una variante maskable y un icono para Apple en `FrondEnd/public`.
- Registrar el service worker desde el frontend e incorporar un aviso de actualización con opción de posponer. No recargar automáticamente mientras se completa una reserva o se usa la cámara.
- Añadir instalación guiada según soporte del navegador, sin mostrar un botón que no pueda funcionar. En dispositivos que lo requieran, explicar la instalación desde el menú del navegador.

**Criterio de salida:** instalación real y apertura independiente verificadas en Chrome/Edge de escritorio y Android; comprobar también el flujo disponible en Safari/iPhone.

### Etapa 3. Funcionamiento sin conexión y caché

| Recurso o función | Política inicial |
|---|---|
| HTML, CSS, JavaScript e iconos propios | Precaché versionada de la interfaz y limpieza de versiones antiguas. |
| Navegación de la interfaz | Fallback al shell de React cuando no haya red, excluyendo `/api`, `/uploads` y recursos ajenos a la interfaz. |
| Todas las rutas `/api`, incluidas sesión, CSRF, citas y simulaciones | Solo red; excluir de precaché y de cualquier caché dinámica, conservando `Cache-Control: no-store`. |
| Crear/cancelar citas, actualizar stock y guardar elecciones RA | Requieren respuesta del servidor. Sin cola ni reenvío automático al recuperar conexión. |
| Fotografías de `/uploads` | Solo red inicialmente; no necesarias para abrir la interfaz sin conexión. |
| Modelos/WASM externos del simulador, mapas y fuentes web | Sin garantía de funcionamiento sin conexión. Mantener fuentes alternativas locales. |

- Añadir aviso de conexión y mensajes de error que distingan falta de red de una lista vacía. Actualmente `Explore` puede mostrar una lista vacía tras fallar la consulta.
- Confirmar la disponibilidad real mediante respuesta de la API; `navigator.onLine` por sí solo no demuestra que el servidor funcione.
- Desactivar las acciones que requieren conexión cuando corresponda. Tras una respuesta perdida al reservar, consultar las citas antes de invitar a repetir la operación.
- No guardar respuestas privadas en Cache Storage ni en almacenamiento local. Al cerrar sesión, retirar los datos privados que la interfaz mantenga en memoria.

**Criterio de salida:** tras una primera visita en línea, la interfaz abre sin red, explica sus límites y no presenta citas, stock o reservas como confirmados sin respuesta de la API.

### Etapa 4. Publicar, probar y documentar

- Compilar y copiar la salida completa de `FrondEnd/dist` al backend, incluidos manifiesto, iconos y service worker, conservando `wwwroot/uploads`.
- Verificar que manifiesto y service worker devuelven su contenido y tipo correctos, sin recibir el HTML del fallback; evitar una caché HTTP prolongada para el service worker.
- Probar el build publicado: instalación, reinicio, modo avión, reconexión, sesión, CSRF, cierre de sesión y reservas. `npm run dev` por sí solo no valida el comportamiento de producción de la PWA.
- Publicar una segunda versión y comprobar el aviso de actualización, su aplazamiento y la actualización posterior sin perder formularios.
- Probar permisos y liberación de cámara al salir del simulador, tanto instalada como en navegador.
- Registrar navegadores, dispositivos, versiones y resultados en este README. Ejecutar las pruebas de integración sobre una base desechable separada de las bases de trabajo del equipo.

**Criterio de salida:** lista de comprobaciones aprobada en dispositivos reales y procedimiento de actualización documentado.

No se necesitan tablas nuevas para la primera PWA. Las notificaciones push, recordatorios y una posible descarga de modelos RA para uso sin conexión quedan fuera de esta etapa; requieren diseño y pruebas propios.

Referencias del plan: [guía oficial de Vite PWA](https://vite-pwa-org.netlify.app/guide/), [actualizaciones con aviso](https://vite-pwa-org.netlify.app/guide/prompt-for-update.html), [instalación y contexto seguro en MDN](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable).

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
