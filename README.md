# Vida de Yoguis — Instrucciones de despliegue

## Requisitos previos

- Cuenta de Google (para Google Sheets + Apps Script)
- Cuenta en [Vercel](https://vercel.com) (gratis) para publicar el frontend
- Repositorio en GitHub (gratis) para conectar con Vercel

---

## PASO 1 — Crear el Google Sheet

1. Ve a [sheets.google.com](https://sheets.google.com) y crea una hoja nueva.
2. Nómbrala exactamente: **Vida de Yoguis**
3. Crea **4 pestañas** con estos nombres exactos (clic derecho en la pestaña → Cambiar nombre):

### Pestaña `Clientes`
Escribe estos encabezados en la fila 1, una por columna (A → K):

| A | B | C | D | E | F | G | H | I | J | K |
|---|---|---|---|---|---|---|---|---|---|---|
| id | nombre | telefono | pack | clases_restantes | tiene_recuperacion | fecha_inicio | fecha_fin | activo | observaciones | fecha_alta |

### Pestaña `Asistencias`
Encabezados en fila 1 (A → D):

| A | B | C | D |
|---|---|---|---|
| timestamp | alumno_id | nombre | estado |

### Pestaña `Config`
Escribe estos datos exactamente (sin encabezado, desde la fila 1):

| A | B |
|---|---|
| pack_esencial_clases | 4 |
| pack_habito_clases | 8 |
| pack_estilo_clases | 12 |
| precio_suelta | 10 |
| precio_esencial | 30 |
| precio_habito | 60 |
| precio_estilo | 80 |

### Pestaña `Dashboard`
Déjala vacía por ahora (la usa el backend internamente con fórmulas opcionales).

---

## PASO 2 — Crear y desplegar el Apps Script

1. Con el Sheet abierto, ve al menú **Extensiones → Apps Script**.
2. Se abre el editor de Apps Script. Borra todo el código que hay por defecto.
3. Copia y pega el contenido completo del archivo **`apps-script/Code.gs`** de este proyecto.
4. Nómbralo como quieras (p.ej. `Vida de Yoguis Backend`).
5. Guarda con **Ctrl+S**.

### Desplegar como Web App

1. Haz clic en **Desplegar → Nueva implementación**.
2. En "Tipo", elige **Aplicación web**.
3. Configura:
   - **Descripción**: `v1`
   - **Ejecutar como**: `Yo (tu cuenta de Google)`
   - **Quién tiene acceso**: **Cualquier usuario** ← importante
4. Haz clic en **Desplegar**.
5. Google pedirá que autorices la app. Acepta todos los permisos.
6. Copia la **URL de la aplicación web** (termina en `/exec`). La necesitas en el Paso 3.

> **Nota**: cada vez que modifiques el código `.gs` debes hacer una **nueva implementación** (no "Gestionar implementaciones" → editar, sino "Nueva implementación") para que los cambios surtan efecto. La URL no cambia.

---

## PASO 3 — Conectar el frontend con el backend

1. Abre el archivo **`app.js`** en cualquier editor de texto.
2. Busca la línea al principio que dice:
   ```js
   const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/...';
   ```
3. Reemplaza la URL completa por la que copiaste en el Paso 2.
4. Guarda el archivo.

---

## PASO 4 — Subir el frontend a GitHub

Si todavía no tienes repositorio:

1. Ve a [github.com](https://github.com) → **New repository**.
2. Nómbralo `vida-de-yoguis` (o como quieras), hazlo **público** o privado.
3. Sube todos los archivos del proyecto a ese repositorio:
   - `index.html`
   - `app.js`
   - `styles.css`
   - `manifest.json`
   - `service-worker.js`
   - Carpeta `icons/` con `icon-192.png` e `icon-512.png` (ver sección "Iconos PWA" al final)

---

## PASO 5 — Desplegar en Vercel

1. Ve a [vercel.com](https://vercel.com) e inicia sesión con tu cuenta de GitHub.
2. Haz clic en **Add New → Project**.
3. Selecciona tu repositorio `vida-de-yoguis`.
4. Vercel detecta que es un proyecto estático. Deja toda la configuración por defecto.
5. Haz clic en **Deploy**.
6. En 1-2 minutos tu app estará en una URL tipo `https://vida-de-yoguis.vercel.app`.

### Actualizar la app en el futuro

Cada vez que edites y subas cambios a GitHub (push a `main`), Vercel redespliega automáticamente en menos de 1 minuto.

---

## PASO 6 — Instalar la app en el móvil (PWA)

### En iPhone (Safari)
1. Abre la URL de Vercel en Safari.
2. Toca el botón compartir (cuadrado con flecha ↑).
3. Desplázate y toca **"Añadir a pantalla de inicio"**.
4. Dale el nombre que quieras → Añadir.

### En Android (Chrome)
1. Abre la URL en Chrome.
2. Toca los tres puntos (⋮) → **"Añadir a pantalla de inicio"**.
3. O bien Chrome mostrará un banner automático de instalación.

---

## PASO 7 — Probar que todo funciona

1. Abre la app y ve a **Nueva alumna**.
2. Rellena el formulario y guarda. Verifica que aparece la fila en el Sheet (pestaña `Clientes`).
3. El QR generado contiene el ID de la alumna (p.ej. `A001`).
4. Ve a **Escanear QR**, apunta la cámara al QR. Verifica que aparece la confirmación de asistencia y que se escribe una fila en la pestaña `Asistencias`.
5. Si no tienes el QR impreso, usa el buscador por teléfono en la misma pantalla.

---

## Iconos PWA (opcional)

Los iconos solo son necesarios si quieres que la app tenga un ícono personalizado cuando se instale en el móvil. Sin ellos la app funciona igual.

Para generarlos:
1. Abre el archivo `generar-iconos.html` en el navegador (doble clic).
2. Descarga `icon-192.png` e `icon-512.png`.
3. Crea la carpeta `icons/` en el proyecto y coloca los dos archivos ahí.
4. Sube los cambios a GitHub → Vercel se actualiza automáticamente.

---

## Referencia rápida de acciones

| Acción | Dónde |
|--------|-------|
| Registrar asistencia | Escanear QR → cámara o búsqueda por teléfono |
| Añadir alumna nueva | Nueva alumna |
| Ver estadísticas del mes | Dashboard |
| Renovar packs al inicio de mes | Renovar mes |
| Ver / editar ficha de alumna | Ver alumnas → toca cualquier alumna |
| Ajustar clases manualmente | Ficha alumna → "Ajustar clases" |
| Dar de baja / reactivar | Ficha alumna → botón inferior |

---

## Estructura de archivos

```
/
├── index.html          — Toda la interfaz (SPA con secciones)
├── app.js              — Toda la lógica JavaScript
├── styles.css          — Estilos (paleta Vida de Yoguis)
├── manifest.json       — Configuración PWA
├── service-worker.js   — Caché offline
├── generar-iconos.html — Generador de iconos (solo se usa una vez)
├── icons/
│   ├── icon-192.png    — Icono app móvil (192×192)
│   └── icon-512.png    — Icono app móvil (512×512)
└── apps-script/
    └── Code.gs         — Backend Google Apps Script (13 endpoints)
```
