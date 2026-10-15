# Verificación de la primera versión

Entorno de comprobación: .NET SDK 8.0.426, Node 24.19.0 y MariaDB 10.11.14 temporal. No se utilizó la base del usuario.

- `dotnet build BackEnd`: pasa sin errores ni advertencias.
- `npm --prefix FrondEnd run lint`: pasa.
- `npm --prefix FrondEnd run build`: pasa.
- Migración inicial aplicada a una base vacía y catálogo de veinte cortes cargado.
- Prueba en navegador Chromium: registro de barbero, alta de establecimiento/profesional/servicio/horario/producto y reserva de cliente con producto. Capturas revisadas en escritorio y móvil (390 px), sin desbordamiento horizontal.
- Prueba de integración con servidor real: autenticación, token CSRF, permisos por rol y propietario, consulta de horarios, concurrencia de citas y stock, conservación de precios, cancelación y devolución de stock, bloqueos y fotos.

La prueba de integración es repetible mediante `tests/integration.py` sobre una base dedicada. El flujo de GitHub Actions vuelve a ejecutar compilación, revisión estática, migración y prueba de API.

Pendiente de verificar en el entorno del usuario: su versión concreta de MariaDB, sus credenciales de conexión y el envío mediante su proveedor SMTP. La compatibilidad con MySQL debe comprobarse con la misma prueba antes de desplegar sobre ese motor.

El mapa se integra mediante iframe de OpenStreetMap y enlace directo; la descarga de mapas y fuentes externas depende de la conectividad. Los recursos externos del mapa no se pudieron verificar visualmente en el entorno restringido de pruebas.
