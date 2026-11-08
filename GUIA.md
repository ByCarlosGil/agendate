# Agendate – Guía para compilar y publicar

## 1. Firebase (login con Google + base de datos) — gratis
1. Entra a https://console.firebase.google.com → **Crear proyecto** "agendate".
2. **Authentication → Comenzar → Google → Habilitar**.
3. **Firestore Database → Crear base de datos** (modo producción, región `us-east1` o la más cercana).
   Pestaña **Reglas** → pega el contenido de `firestore.rules` → Publicar.
4. **Configuración del proyecto → Agregar app → Android**:
   - Paquete: `com.carlosgil.agendate`
   - Huellas SHA-1 y SHA-256: las de `CLAVES-GUARDAR.txt`.
   - Descarga `google-services.json`.
5. En la misma pantalla agrega también una **app Web** y copia `apiKey`, `authDomain`, `projectId`, `appId`.
6. Después de subir la app a Play: **Play Console → Integridad de la app → Firma de apps** copia el SHA-1 y SHA-256 de *"clave de firma de apps"* y agrégalos también en Firebase (si no, el login falla en la versión descargada de Play).

## 2. AdMob (publicidad) — gratis
1. https://admob.google.com → registrarse con tu cuenta Google → datos de pago (Colombia, cobro mínimo USD 100).
2. **Apps → Agregar app → Android** (primero sin publicar; luego se vincula con Play).
3. Copia el **ID de app** (`ca-app-pub-…~…`) y crea un **bloque Banner** (`ca-app-pub-…/…`).
4. **Privacidad y mensajes → GDPR → Crear mensaje** (formulario de consentimiento; obligatorio para usuarios de Europa).
5. Mientras no pongas esos IDs, la app muestra **anuncios de prueba** (nunca hagas clic en tus propios anuncios reales: Google suspende la cuenta).

## 3. GitHub (compila el APK/AAB)
1. Crea un repositorio **privado** en https://github.com/new → nombre `agendate`.
2. Sube el contenido de este proyecto (o dime el nombre del repo y lo subo yo).
3. **Settings → Secrets and variables → Actions → New repository secret**:

| Secreto | Valor |
|---|---|
| `FIREBASE_API_KEY` / `FIREBASE_AUTH_DOMAIN` / `FIREBASE_PROJECT_ID` / `FIREBASE_APP_ID` | de la app Web de Firebase |
| `GOOGLE_SERVICES_JSON_B64` | el `google-services.json` en base64 (https://base64.guru/converter/encode/file) |
| `KEYSTORE_B64` | contenido de `upload.jks.b64` |
| `KEYSTORE_PASSWORD`, `KEY_PASSWORD`, `KEY_ALIAS` | de `CLAVES-GUARDAR.txt` |
| `ADMOB_APP_ID`, `ADMOB_BANNER_ID` | de AdMob (opcional al inicio) |

4. **Actions → Compilar Android → Run workflow**. Al terminar descarga el artefacto: `app-release.apk` (instalar en tu celular) y `app-release.aab` (subir a Play).

⚠️ Guarda `upload.jks` y `CLAVES-GUARDAR.txt` en un lugar seguro (Drive privado). Sin ellos no puedes actualizar la app.

## 4. Política de privacidad (obligatoria)
Activa **GitHub Pages**: Settings → Pages → Branch `main` / carpeta `/docs`. Las URLs quedan:
- `https://TU_USUARIO.github.io/agendate/privacidad.html`
- `https://TU_USUARIO.github.io/agendate/eliminar-cuenta.html`

Reemplaza `carlosgil960829` por tu usuario real de GitHub en `index.html` (2 enlaces).
(GitHub Pages en repo privado requiere plan de pago; si no, haz el repo público — no contiene claves.)

## 5. Google Play Console
1. https://play.google.com/console → cuenta **personal**, pago único **USD 25**, verificación de identidad (cédula) y de teléfono.
2. **Crear app** → nombre, idioma español, App, Gratis.
3. **Contenido de la app** (todo obligatorio):
   - Política de privacidad: URL de `privacidad.html`.
   - **Anuncios: Sí, contiene anuncios.**
   - Acceso a la app: indicar que requiere login con Google (dar una cuenta de prueba o instrucciones).
   - Clasificación de contenido: cuestionario → "Productividad", sin contenido sensible.
   - Público objetivo: 18+ (evita requisitos de familias).
   - **ID de publicidad: Sí** (lo usa AdMob).
   - **Seguridad de los datos** (ver tabla abajo).
   - Eliminación de cuenta: URL de `eliminar-cuenta.html`.
4. Ficha de Play: ícono 512×512, gráfico destacado 1024×500, mínimo 2 capturas de teléfono, descripción corta (80) y larga.
5. **Prueba cerrada obligatoria**: sube el `.aab` a *Pruebas cerradas*, invita **12 testers** (correos Gmail) que deben estar inscritos **14 días seguidos**. Luego: Panel → *Solicitar acceso a producción*.

### Formulario "Seguridad de los datos"
| Dato | Recopilado | Compartido | Propósito | Obligatorio |
|---|---|---|---|---|
| Correo electrónico, nombre | Sí | No | Gestión de cuenta | Sí |
| ID de usuario | Sí | No | Gestión de cuenta | Sí |
| Otro contenido del usuario (tareas) | Sí | No | Funcionalidad de la app | Sí |
| ID de dispositivo o publicidad | Sí | Sí (AdMob) | Publicidad | Sí |
| Interacciones con la app / diagnóstico | Sí | Sí (AdMob) | Publicidad, analítica | Sí |

- Datos cifrados en tránsito: **Sí**.
- El usuario puede pedir eliminar sus datos: **Sí**.

## Ingresos esperados (referencia)
Banner en LatAm suele pagar poco por usuario; los ingresos reales dependen de usuarios activos diarios. Un intersticial (pantalla completa) paga más, pero úsalo con moderación (Google penaliza anuncios intrusivos).
