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
- MariaDB o MySQL con tablas InnoDB. **Verificado contra MariaDB 10.11.14**; la versión de tu instalación sigue pendiente porque no se pudo abrir la imagen adjunta. El proveedor detecta la versión al conectar. El esquema evita tipos JSON y características exclusivas de MariaDB. MySQL todavía requiere ejecutar la misma prueba de integración antes de desplegar allí.

## 1. Obtener la rama

```bash
git clone --branch codex/primera-version-web https://github.com/Carlos-1803/Gestor-de-citas2.git
cd Gestor-de-citas2
```

Si ya tienes una copia, guarda tus cambios locales y ejecuta `git fetch origin` y `git switch --track origin/codex/primera-version-web` (o `git switch codex/primera-version-web` si ya existe localmente).

## 2. Preparar MariaDB en CachyOS

Con el servicio de MariaDB ya instalado y configurado, inícialo:

```bash
sudo systemctl enable --now mariadb
sudo mariadb
```

Ejecuta dentro del cliente SQL; sustituye la contraseña de ejemplo:

```sql
SELECT VERSION();
CREATE DATABASE gestor_citas CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'gestor'@'localhost' IDENTIFIED BY 'CAMBIA_ESTA_CONTRASENA';
GRANT ALL PRIVILEGES ON gestor_citas.* TO 'gestor'@'localhost';
EXIT;
```

Si el servicio aún no tiene un directorio de datos inicializado, sigue primero la configuración inicial de MariaDB de tu distribución. No inicialices de nuevo una instalación que ya contenga datos.

## 3. Configurar y migrar

En una terminal Bash, desde la raíz del repositorio:

```bash
export ConnectionStrings__Database='Server=localhost;Port=3306;Database=gestor_citas;User=gestor;Password=CAMBIA_ESTA_CONTRASENA'
export ASPNETCORE_ENVIRONMENT=Development

dotnet restore BackEnd
dotnet run --project BackEnd -- --migrate
```

`--migrate` aplica las migraciones versionadas, carga los cortes iniciales y termina. No se modifica el esquema durante el inicio normal. Repetirlo no duplica los cortes.

Para crear la cuenta inicial de administración, configura estas variables **antes** de ejecutar el comando de migración:

```bash
export Admin__Email='tu-correo@ejemplo.com'
read -r -s -p 'Contraseña inicial de administración (12 caracteres o más): ' Admin__Password
export Admin__Password
printf '\n'
dotnet run --project BackEnd -- --migrate
unset Admin__Password
```

No existe una contraseña predeterminada ni se permite registrar cuentas Admin desde la web. La migración no cambia contraseñas de cuentas existentes ni eleva sus permisos. El correo de administración debe ser una cuenta nueva.

## 4. Ejecutar la web

En la terminal del backend (con la variable de conexión):

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

## Publicación y mantenimiento

Para servir frontend y API desde el mismo origen:

```bash
npm --prefix FrondEnd run build
mkdir -p BackEnd/wwwroot
cp -r FrondEnd/dist/* BackEnd/wwwroot/
dotnet publish BackEnd -c Release -o publish
```

Configura la conexión y SMTP en el servidor; aplica migraciones antes de arrancar. Publica detrás de HTTPS. Conserva `wwwroot/uploads`, la base de datos y las claves de ASP.NET Data Protection entre despliegues; las fotos no se guardan en Git. Los recursos estáticos compilados tampoco se versionan. Usa un usuario de ejecución con permisos limitados y otro con permisos de migración si separas esas tareas.

## Estructura y alcance

- `BackEnd/Data`: entidades, contexto y catálogo inicial.
- `BackEnd/Migrations`: historial de esquema.
- `BackEnd/Services`: reglas de reserva y trabajador de correo.
- `BackEnd/Contracts`: contratos de entrada de la API.
- `FrondEnd/src/pages`: pantallas separadas por función.
- `docs/modelo-y-reglas.md`: relaciones y decisiones de negocio.
- `tests/integration.py`: comprobaciones de la API con base real.

Nombre visual provisional: **EntreCortes**. Quedan fuera de esta primera versión: app móvil, pagos en línea, encargos sin cita, recuperación/verificación de correo y accesos independientes para cada integrante del equipo. El mapa y las fuentes web necesitan conexión; hay tipografías alternativas locales. El envío real de correo requiere tus credenciales SMTP y no se ha probado con tu proveedor.
