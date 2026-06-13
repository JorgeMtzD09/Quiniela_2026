# Quiniela Mundial 2026 — Página Web

Sitio web móvil gratuito para la quiniela del Mundial 2026. Los participantes consultan el podio y pronósticos en **tiempo real** vía Firebase. Cada quien puede **capturar sus pronósticos una sola vez** con un login sencillo (usuario + clave).

## Funciones

- **Login obligatorio**: sin iniciar sesión no se ve nada (ni podio ni resultados). Usuario en minúsculas + clave; el navegador recuerda la sesión
- **Podio**: ranking en vivo con medallas y manejo de empates
- **Quiniela**: pronósticos de cada participante vs. resultados reales. En tu propia pestaña capturas tus pronósticos **uno por uno**; al guardar cada uno (con confirmación) queda bloqueado
- **Tiempo real**: cambios en Firebase se ven al instante (sin refrescar manualmente)

## Reglas de puntuación

| Concepto | Puntos |
|----------|--------|
| Acierto de ganador (local, visitante o empate) | 3 |
| Bono marcador exacto | +1 |
| Máximo por partido | 4 |

---

## Paso 1: Crear proyecto Firebase (gratis)

1. Ve a [console.firebase.google.com](https://console.firebase.google.com) → **Crear proyecto**.
2. Nombre sugerido: `quiniela-mundial-2026`.
3. Desactiva Google Analytics (opcional, no lo necesitas).
4. En el proyecto → **Build** → **Firestore Database** → **Crear base de datos** → modo **Producción** → ubicación cercana (ej. `us-central`).
5. **Authentication** → **Comenzar** → **Anonymous** → **Activar** (un solo toggle).

### Obtener la config web

1. **Project settings** (engranaje) → **Your apps** → **</> Web**.
2. Nombre: `quiniela-web` → **Register app**.
3. Copia el objeto `firebaseConfig`.

### Pegar config en la app

Abre [app.js](app.js) y reemplaza `CONFIG.firebase`:

```js
firebase: {
  apiKey: 'AIza...',
  authDomain: 'tu-proyecto.firebaseapp.com',
  projectId: 'tu-proyecto',
  storageBucket: 'tu-proyecto.appspot.com',
  messagingSenderId: '123456789',
  appId: '1:123456789:web:abc123',
},
USE_LOCAL_FALLBACK: false,
```

---

## Paso 2: Reglas de seguridad

En Firebase Console → **Firestore** → **Reglas**, pega el contenido de [firestore.rules](firestore.rules) y publica.

Resumen:
- `partidos`, `participantes`: solo lectura (tú editas marcadores en la consola)
- `usuarios`: lectura individual para login (no se listan todos)
- `pronosticos`: lectura pública; se pueden **agregar** pronósticos nuevos (uno por uno), pero los ya guardados **no se pueden modificar ni borrar** desde el cliente (solo el admin)

---

## Paso 3: Importar partidos y participantes (seed)

1. Sube todos los archivos a GitHub Pages (o abre localmente con `python3 -m http.server 8080`).
2. **Temporalmente** en Reglas de Firestore, cambia `partidos` y `participantes` a:
   ```
   allow write: if request.auth != null;
   ```
3. Abre `https://tu-sitio/seed.html` (o `http://localhost:8080/seed.html`).
4. Clic en **Importar partidos y participantes**.
5. **Restaura** las reglas originales de `firestore.rules`.

Opcional: **Importar pronósticos existentes** si ya tienes datos del Excel (quedan bloqueados). Para esto, agrega temporalmente `allow write: if request.auth != null;` también en `pronosticos`.

---

## Paso 4: Crear usuarios (claves de login)

En Firebase Console → **Firestore** → crea la colección `usuarios` con un documento por persona.

**ID del documento** = usuario en minúsculas (lo que escriben para entrar).

| ID documento | password | clave |
|--------------|----------|-------|
| `coque` | `clave123` | `Coque` |
| `abi` | `clave456` | `Abi` |
| `angel` | `clave789` | `Angel` |
| `jefon` | `clave000` | `Jefon` |
| `tety` | `clave111` | `Tety` |

- `password`: la clave que les das (pueden ser distintas por persona).
- `clave`: debe coincidir con el ID en la colección `participantes` (Coque, Abi, Angel, Jefon, Tety).

Ejemplo de documento `usuarios/abi`:
```
password: "mipassword"
clave: "Abi"
```

---

## Paso 5: Publicar en GitHub Pages

1. Sube el proyecto a un repo de GitHub.
2. **Settings** → **Pages** → branch `main`, carpeta `/ (root)`.
3. Tu sitio quedará en: `https://TU_USUARIO.github.io/NOMBRE_REPO/`

**Importante:** editar archivos en tu Mac **no** actualiza el sitio. Debes subir los cambios a GitHub (commit/push o editar en la web de GitHub).

---

## Día a día

### Participantes
1. Abren el link → aparece la pantalla de **Iniciar sesión** (sin login no se ve nada).
2. Escriben usuario + clave (solo la primera vez; después el navegador recuerda).
3. Van a la pestaña **Quiniela** → su propia pestaña (marcada con "(tú)").
4. Tocan el marcador de un partido para capturarlo. Aparecen los botones **Guardar** y **Cancelar** para ese partido (solo se puede editar uno a la vez).
5. Al **Guardar** sale un modal de confirmación. Si confirman, ese pronóstico se guarda y queda bloqueado. Si cancelan, se borra lo escrito.
6. Repiten partido por partido. Los ya jugados no se pueden pronosticar.

### Tú (admin) — desde la consola de Firebase

**Capturar marcador de un partido:**
1. Firestore → `partidos` → abre el documento (ej. `1` para México vs Sudáfrica).
2. Edita `golesLocal` y `golesVisitante` (números).
3. Guarda. El podio se actualiza al instante para todos.

**Liberar un pronóstico de alguien** (caso extraordinario):
1. Firestore → `pronosticos` → abre el documento (ej. `Coque`).
2. En el campo `items`, borra la entrada del partido que quieras liberar (ej. la clave `"5"`).
3. Esa persona podrá volver a capturar y guardar ese partido. Para liberar todos, borra el documento completo.

**Cambiar clave de un usuario:**
1. Firestore → `usuarios` → documento del usuario → edita `password`.

---

## Estructura del proyecto

```
Quiniela/
├── index.html          # Página principal
├── styles.css          # Estilos
├── app.js              # Lógica + config Firebase
├── seed.html           # Importación inicial a Firestore
├── firestore.rules     # Reglas de seguridad (copiar a Firebase)
├── data/
│   └── quiniela.json   # Datos para seed / demo local
└── README.md
```

## Modelo de datos (Firestore)

```
partidos/{id}        → { id, local, visitante, golesLocal, golesVisitante }
participantes/{clave} → { nombreVisible, orden }
usuarios/{usuario}   → { password, clave }
pronosticos/{clave}  → { items: { "1": {l,v}, ... }, actualizado }
                       (cada partido presente en items = pronóstico bloqueado)
```

---

## Solución de problemas

**"Firebase no configurado" al entrar**
- Verifica que pegaste la config en `app.js` y `USE_LOCAL_FALLBACK: false`.

**Error al guardar pronósticos**
- Verifica que **Anonymous Auth** esté activado.
- Verifica las reglas de `firestore.rules` publicadas.

**No aparecen partidos**
- Ejecuta `seed.html` una vez (con reglas temporales de escritura).

**Login dice "Usuario no encontrado"**
- Crea el documento en `usuarios/{usuario}` con el ID exacto en minúsculas.

**Los cambios de código no se ven en el sitio**
- Debes subir los archivos a GitHub. Editar localmente no actualiza GitHub Pages.

**Modo demo local**
- Con `USE_LOCAL_FALLBACK: true` y sin Firebase configurado, la app usa `data/quiniela.json`. El login no funciona en modo demo.

---

## Participantes

| Usuario (login) | Nombre visible | Clave interna |
|-----------------|----------------|---------------|
| coque | Coque | Coque |
| abi | Abi | Abi |
| angel | Ángel | Angel |
| jefon | Abuelo | Jefon |
| tety | Tety | Tety |
