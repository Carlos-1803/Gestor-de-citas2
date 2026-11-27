# Probar EntreCortes sin conexión

Usa el acceso y los formularios habituales de EntreCortes. Para una primera instalación, abre la aplicación con conexión desde HTTPS o localhost e inicia sesión. En Chrome o Edge elige **Instalar**. La PWA guarda en el dispositivo los datos consultados y prepara el catálogo de la cuenta. La autenticación de una cuenta nueva requiere conexión.

1. Abre una barbería con conexión. Activa el modo avión, solicita una cita y añade productos si los necesitas. Cierra y vuelve a abrir la aplicación. En **Mis citas** se muestra el envío pendiente.
2. Recupera la conexión y abre la PWA con la misma cuenta. Comprueba el número de cita. Si entretanto se ocupó el horario, elige otro desde el aviso. La selección de productos se conserva.
3. En **Catálogo**, una cuenta administradora puede añadir y modificar cortes. En **Mi barbería**, el propietario puede trabajar con establecimientos, fotos, productos, equipo, servicios, horarios y bloqueos. La agenda permite confirmar, cancelar y completar citas según su estado.
4. Cada envío se valida con la API original. Si se interrumpe la respuesta y falta información para saber si el servidor guardó el cambio, la aplicación lo señala para revisión y evita enviar a ciegas una segunda alta.

Para desarrollar, utiliza el backend y la configuración habitual del proyecto. La compilación del frontend genera el service worker junto a los archivos de la PWA. Desde `FrondEnd`, ejecuta `npm run build` y `npm run preview` para probar la compilación local. El servidor original y el simulador conservan su implementación.