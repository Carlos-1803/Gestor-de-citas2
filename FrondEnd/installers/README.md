# Instaladores de la prueba local

El menú ofrece el APK en Android y el MSI en Windows cuando el servidor dispone de los archivos de `public/descargas/`. En otros sistemas ofrece instalar la PWA desde el navegador. Los paquetes y las claves se conservan fuera de Git.

El APK requiere Android 8 o posterior, usa Android System WebView y guarda su propia sesión. Confía en la CA indicada únicamente para el servidor local configurado. El MSI instala para el usuario actual un acceso en Inicio y en el escritorio. Abre la PWA en una ventana de Edge o Chrome. Esta compilación de Windows se usa en la PC que hospeda EntreCortes.

## Generar los paquetes

En Windows usa Python 3.12 con Pillow y msilib, .NET Framework 4, Android SDK con Build Tools y JDK. Configura `JAVA_HOME`, `ANDROID_HOME` y `ENTRECORTES_KEYPASS` en la sesión. Usa un almacén PKCS12 de prueba con el alias `entrecortes` y la CA **pública** del HTTPS local. Desde la raíz del repositorio:

```powershell
python FrondEnd/installers/build.py --android-url https://192.168.1.234:8471/ --windows-url http://localhost:4190/ --ca C:\ruta\EntreCortes.crt --keystore C:\privado\prueba.p12
```

Los parámetros `--platform` y `--tools` eligen las versiones instaladas del SDK. Después, compila el frontend y sirve `dist` en el servidor de prueba. Sirve los archivos .apk con el tipo application/vnd.android.package-archive y los .msi con application/octet-stream. Los paquetes se descargan bajo demanda. El primer acceso de cada instalación requiere conexión al servidor para cargar la PWA e iniciar sesión. Si cambia la dirección privada, vuelve a generar los paquetes. Conserva la clave de prueba para actualizar el APK manteniendo sus datos.
