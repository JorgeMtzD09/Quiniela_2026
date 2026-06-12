# Quiniela Mundial 2026 — Página Web

Sitio web móvil gratuito para consultar la quiniela del Mundial 2026. Los participantes ven el podio, sus pronósticos y los resultados reales. Tú editas los marcadores en un Google Sheet y la página se actualiza sola.

## Cómo funciona

```
Tú editas marcadores → Google Sheet → Página web (auto-refresco cada 60s) → 5 personas consultan desde el teléfono
```

- **Sin login** — solo consulta pública
- **Gratis** — GitHub Pages o Netlify, sin anuncios
- **Puntos automáticos** — 3 pts por acertar ganador/empate + 1 bono por marcador exacto
- **5 participantes fijos** — Coque, Abi, Ángel, Abuelo, Tety

---

## Paso 1: Crear el Google Sheet

1. Ve a [sheets.google.com](https://sheets.google.com) y crea una hoja nueva.
2. Renómbrala **"Quiniela Mundial 2026"**.
3. Crea **3 pestañas** con estos nombres exactos:
   - `Partidos`
   - `Pronosticos`
   - `Participantes`

### Importar los datos prellenados

En la carpeta `data/` de este proyecto hay 3 archivos CSV listos:

| Archivo | Pestaña |
|---------|---------|
| `data/Partidos.csv` | Partidos |
| `data/Pronosticos.csv` | Pronosticos |
| `data/Participantes.csv` | Participantes |

Para cada uno:
1. Abre el CSV con un editor de texto o Excel.
2. Selecciona todo (Cmd+A) y copia.
3. En la pestaña correspondiente del Google Sheet, haz clic en la celda A1 y pega.

### Estructura de las pestañas

**Partidos** (lo que editas seguido):

| id | grupo | local | visitante | golesLocal | golesVisitante |
|----|-------|-------|-----------|------------|----------------|
| 1 | | 🇲🇽México | 🇿🇦Sudáfrica | 2 | 0 |
| 2 | | 🇰🇷Corea del Sur | 🇨🇿República Checa | 2 | 1 |
| 3 | | 🇨🇦Canadá | 🇧🇦Bosnia y Herzegovina | 1 | 1 |
| 4 | | 🇺🇸Estados Unidos | 🇵🇾Paraguay | | |

> Deja `golesLocal` y `golesVisitante` vacíos para partidos que aún no se juegan. Cuando termine un partido, escribe los goles ahí.

**Pronosticos** (se llenan una vez, no se tocan después):

| id | Coque_L | Coque_V | Abi_L | Abi_V | Angel_L | Angel_V | Jefon_L | Jefon_V | Tety_L | Tety_V |
|----|---------|---------|-------|-------|---------|---------|---------|---------|--------|--------|

**Participantes**:

| clave | nombreVisible |
|-------|---------------|
| Coque | Coque |
| Abi | Abi |
| Angel | Ángel |
| Jefon | Abuelo |
| Tety | Tety |

### Publicar el Sheet

1. Clic en **Compartir** (arriba a la derecha).
2. Cambia a **"Cualquiera con el enlace"** → rol **"Lector"**.
3. Copia el enlace. El ID del Sheet es la parte larga de la URL:
   ```
   https://docs.google.com/spreadsheets/d/ESTE_ES_EL_ID/edit
   ```

---

## Paso 2: Configurar la página web

1. Abre `app.js`.
2. Busca la línea:
   ```js
   SHEET_ID: '',
   ```
3. Pega tu ID entre las comillas:
   ```js
   SHEET_ID: '1aBcDeFgHiJkLmNoPqRsTuVwXyZ',
   ```
4. (Opcional) Cambia `USE_LOCAL_DATA` a `false` cuando ya tengas el Sheet configurado:
   ```js
   USE_LOCAL_DATA: false,
   ```

---

## Paso 3: Probar en local

Abre una terminal en la carpeta del proyecto y ejecuta:

```bash
# Opción A: Python (ya viene en Mac)
python3 -m http.server 8080

# Opción B: Node.js
npx serve .
```

Luego abre en el navegador: **http://localhost:8080**

Prueba desde el teléfono usando la IP de tu Mac (ej. `http://192.168.1.10:8080`).

---

## Paso 4: Publicar gratis (GitHub Pages)

### 4a. Crear repositorio en GitHub

1. Ve a [github.com/new](https://github.com/new).
2. Nombre: `quiniela-mundial-2026` (o el que quieras).
3. Público, sin README (ya lo tenemos).
4. Clic en **Create repository**.

### 4b. Subir los archivos

En la terminal, desde la carpeta del proyecto:

```bash
git init
git add index.html styles.css app.js data/ README.md
git commit -m "Quiniela Mundial 2026 - página web"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/quiniela-mundial-2026.git
git push -u origin main
```

### 4c. Activar GitHub Pages

1. En tu repo de GitHub → **Settings** → **Pages**.
2. Source: **Deploy from a branch**.
3. Branch: **main** → carpeta **/ (root)**.
4. Guarda. En 1-2 minutos tu sitio estará en:
   ```
   https://TU_USUARIO.github.io/quiniela-mundial-2026/
   ```

Comparte ese link con los 5 participantes.

---

## Alternativa: Netlify (aún más fácil)

1. Ve a [app.netlify.com/drop](https://app.netlify.com/drop).
2. Arrastra la carpeta del proyecto (con `index.html`, `styles.css`, `app.js`, `data/`).
3. Netlify te da un link tipo `https://random-name.netlify.app`.
4. (Opcional) En Site settings → Change site name → ponle algo como `quiniela-mundial-2026`.

---

## Día a día: actualizar resultados

1. Se juega un partido.
2. Abres el Google Sheet (desde el teléfono o computadora).
3. En la pestaña **Partidos**, buscas el partido y escribes `golesLocal` y `golesVisitante`.
4. Guardas (Google Sheets guarda automáticamente).
5. Los participantes refrescan la página (o esperan 60 segundos al auto-refresco) y ven el podio actualizado.

**No necesitas tocar la página web ni volver a desplegar.** Solo editas el Sheet.

---

## Reglas de puntuación

| Concepto | Puntos |
|----------|--------|
| Acierto de ganador (local, visitante o empate) | 3 |
| Bono marcador exacto | +1 |
| Máximo por partido | 4 |

---

## Estructura del proyecto

```
Quiniela/
├── index.html          # Página principal
├── styles.css          # Estilos mobile-first
├── app.js              # Lógica (config, fetch, scoring, render)
├── data/
│   ├── Partidos.csv    # Plantilla para Google Sheet
│   ├── Pronosticos.csv # Plantilla para Google Sheet
│   ├── Participantes.csv
│   └── quiniela.json   # Datos locales (demo/fallback)
└── README.md           # Este archivo
```

---

## Solución de problemas

**La página dice "Error al cargar"**
- Verifica que el Sheet esté compartido como "Cualquiera con el enlace → Lector".
- Verifica que el `SHEET_ID` en `app.js` sea correcto.
- Verifica que las pestañas se llamen exactamente `Partidos`, `Pronosticos`, `Participantes`.

**Los puntos no coinciden con el Excel**
- La página calcula automáticamente. Si cambias un marcador en el Sheet, los puntos se recalculan.
- Los pronósticos deben estar en la pestaña `Pronosticos` alineados por `id` de partido.

**Quiero cambiar un pronóstico**
- Edita la pestaña `Pronosticos` en el Google Sheet. La página lo reflejará al refrescar.

**Quiero agregar más participantes**
- Agrega filas en `Participantes`, columnas en `Pronosticos`, y actualiza `app.js` si es necesario (la lógica es dinámica, debería funcionar automáticamente).
