# Registro de Ventas – ropa de segunda

App para iPad, que se abre en Safari, para llevar el inventario, registrar ventas y exportar reportes a Excel.

## Qué hace

- **Inventario**: cada prenda recibe un número único según su categoría (`BLU-0001`, `PAN-0002`, …).
  El consecutivo es uno solo para toda la tienda.
- **Etiquetas con QR**: se imprimen en hoja carta (30 por hoja, tipo Avery 5160) o en una impresora de etiquetas (50×30, 40×30 o 58×40 mm).
- **Vender**: escaneas el QR con la cámara del iPad o buscas la prenda, y armas un carrito con varias prendas.
  También registra el precio final de cada prenda, el descuento general, la forma de pago, el canal y el cliente.
- **Devoluciones**: la prenda vuelve a estar disponible en el inventario.
- **Reportes**: ventas, ganancia, margen, ventas por categoría, por forma de pago, por canal y por día, y prendas con más tiempo sin venderse.
- **Exportar a Excel**: un solo archivo con estas hojas:
  - Resumen
  - Ventas detalle
  - Tickets
  - Por día
  - Por categoría
  - Por forma de pago
  - Por canal
  - Inventario
- **Usuarios**: cada quien entra con un nombre de usuario y contraseña, y queda registrado quién vendió.
  La primera vez, la app pide crear el usuario de la **dueña**. Desde **Ajustes › Usuarios** la dueña:
  - crea usuarios;
  - ve y cambia contraseñas;
  - desactiva cuentas.
- **Permisos**: la **dueña** ve todo. Un **ayudante** vende, registra prendas, imprime etiquetas y hace devoluciones,
  pero no ve costos, ganancias, reportes ni ajustes, y no puede borrar prendas.
- **Funciona sin internet**: las ventas se guardan y se sincronizan cuando vuelve la conexión.
  Lo único que necesita internet es **crear prendas nuevas**, porque así se garantiza que el número sea único.

Mientras Firebase no esté configurado, la app funciona en **modo demo**: los datos se guardan solo en ese dispositivo.

---

## Configurar Firebase (una sola vez)

1. Entra a <https://console.firebase.google.com> con tu cuenta de Google.
   Toca **Crear un proyecto**, ponle un nombre (ej. `mi-tienda-ventas`) y puedes desactivar Google Analytics.
2. **Usuarios**:
   - Ve a **Seguridad › Authentication › Comenzar**.
   - Elige **Correo electrónico/contraseña**, activa solo el primer interruptor y guarda.
   - **No agregues usuarios ahí**: se crean desde la app.
     Deja activado "Habilitar creación (registro)" en **Configuración › Acciones del usuario**.
     Una cuenta que no fue creada por la dueña desde la app no puede ver ni tocar nada (lo impiden las reglas).
3. **Base de datos**:
   - Ve a **Compilación › Firestore Database › Crear base de datos**.
   - Elige una ubicación (ej. `nam5 (United States)`) y **modo de producción**.
   - En la pestaña **Reglas**, borra lo que hay, pega el contenido del archivo [`firestore.rules`](firestore.rules) y toca **Publicar**.
4. **Conectar la app**:
   - Toca el engranaje ⚙️ › **Configuración del proyecto**.
   - En "Tus apps", toca el ícono **`</>`** (Web), ponle un nombre y registra la app. No hace falta Firebase Hosting.
   - Copia el bloque `firebaseConfig` que aparece y pégalo en [`js/config.js`](js/config.js), o mándaselo a Claude.
     Estos datos no son secretos: la seguridad viene de los usuarios y las reglas.

El plan gratuito (Spark) alcanza de sobra para este volumen.

## Publicar la app (GitHub Pages)

1. En GitHub, en este repositorio, entra a **Settings › Pages**.
2. En "Build and deployment", elige **Source: Deploy from a branch**.
   Selecciona la rama (`main` o la rama de trabajo) y la carpeta `/ (root)`, y guarda.
3. En un par de minutos la app queda en `https://<tu-usuario>.github.io/Cuellar/`.

## Instalar en el iPad

1. Abre el enlace en **Safari**.
2. Toca el botón **Compartir** › **Agregar a pantalla de inicio**.
3. La primera vez que escanees, Safari pedirá permiso para usar la cámara. Toca **Permitir**.

## Archivos

| Archivo | Para qué |
|---|---|
| `index.html`, `css/styles.css` | Interfaz |
| `js/app.js` | Pantallas: Vender, Inventario, Ventas, Reportes, Ajustes |
| `js/store.js` | Datos: Firebase o modo demo |
| `js/config.js` | **Aquí va la configuración de Firebase** |
| `js/defaults.js` | Categorías y listas iniciales (se editan desde Ajustes) |
| `js/reports.js`, `js/excel.js` | Cálculo de reportes y exportación a Excel |
| `js/labels.js`, `js/scanner.js` | Etiquetas QR y escáner con cámara |
| `vendor/` | Librerías (Firebase, QR, SheetJS) incluidas para que funcione sin internet |
| `sw.js`, `manifest.webmanifest` | Para instalarla como app y abrirla sin conexión |
| `firestore.rules` | Reglas de seguridad para pegar en Firebase |
