# Verificación del workflow (27 de noviembre de 2026)

Ejecución remota revisada: https://github.com/Carlos-1803/Gestor-de-citas2/actions/runs/46007147171
Commit: 51b2941a7f4d630db751dcb731650ae1c1f5040d.

La API pública de GitHub confirma éxito en instalación npm, lint, pruebas frontend, build Vite, build .NET y migraciones. El fallo está en `Integration checks`, con código 1. La descarga del log exige autenticación (HTTP 403); las anotaciones públicas no contienen el traceback. El traceback aportado posteriormente confirma la causa: `ERROR 2026 (HY000): TLS/SSL error: SSL is required, but the server does not support it`. El cliente SQL del runner exigía TLS al conectarse al contenedor de pruebas sin TLS. No se ha ejecutado un nuevo check remoto.

Reproducción local correcta:

```bash
npm --prefix FrondEnd ci
npm --prefix FrondEnd run lint
npm --prefix FrondEnd test
npm --prefix FrondEnd run build
dotnet build BackEnd --configuration Release
dotnet run --project BackEnd --configuration Release --no-build -- --migrate
python tests/integration.py --url http://127.0.0.1:5191
python tests/integration_reviews.py --url http://127.0.0.1:5191 --db-config /tmp/kiin-ci.cnf --database gestor_test
```

Se usó una instancia MariaDB desechable en puerto 33346, base gestor_test y usuario gestor; se sustituyó solo la conexión del entorno de pruebas. No se modificó appsettings.json ni la base de trabajo. El equipo local tiene Node 26 y MariaDB 13; el workflow usa Node 24 y MariaDB 10.11. Por tanto, no se presenta como una réplica idéntica de Ubuntu/GitHub. El intento de usar Node 24 mediante npx siguió resolviendo Node 26; no certifica Node 24. No se ejecutó apt-get local: el cliente MariaDB ya estaba instalado.

Cambios en verify.yml:

- Instalación del cliente separada de las pruebas para identificar fallos de apt.
- Comprobación explícita de vida del proceso y salida con error si la API no está lista. Antes se ejecutaban los tests incluso si agotaba los 40 intentos de salud.
- Consulta previa de versión y migraciones mediante la misma conexión SQL de los tests.
- Python3 sin buffering, logs por suite y pipefail para conservar el código de error aunque se use tee.
- Artefacto de diagnóstico incluso al fallar. No incluye el archivo con credenciales SQL.
- Se mantienen todas las validaciones frontend/backend y las dos suites de integración.

El bloque de integración actualizado se ejecutó directamente desde el YAML, con la conexión temporal. La aprobación remota sigue pendiente de una nueva ejecución. No se eliminaron aserciones ni se atribuyó el fallo a código que pasó las pruebas.

## Corrección confirmada con el traceback

Se añadió `skip-ssl` a la sección `[client]` de `/tmp/reviews-db.cnf` generado por el workflow. Ese único archivo lo utilizan tanto el diagnóstico `mariadb` como `tests/integration_reviews.py` mediante `--defaults-extra-file`, por lo que todas las invocaciones SQL del workflow reciben la configuración. No es necesario duplicar opciones en Python ni pasar una bandera MariaDB incompatible a posibles clientes MySQL de otros entornos. Se mantiene el cliente `mariadb` instalado y seleccionado en CI.

La excepción solo afecta a la instancia desechable del pipeline; no modifica TLS en .NET, appsettings.json, cuentas reales ni conexiones de producción.

Comprobación de la corrección: se inició MariaDB temporal con `--skip-ssl`; exigir `--ssl` reprodujo exactamente ERROR 2026. Usar el archivo corregido devolvió código 0 en SELECT DATABASE(), diagnóstico de migraciones y ambas suites de integración.
