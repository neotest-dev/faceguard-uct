# FACEGUARD UCT Web

Aplicación React + Vite + TypeScript + Tailwind. Supabase se utiliza únicamente para Auth y PostgreSQL; el procesamiento privado se ejecuta en Vercel Functions (`api/*.ts`).

## Funcionalidades

- Login Supabase Auth, panel docente, gestión de laboratorios/estudiantes/permisos, historial y CSV.
- Cámara frontal y extracción local de descriptor 128D con face-api.js; modelos en `public/models/`.
- Inscripción de tres muestras con consentimiento y cifrado AES-256-GCM realizado en Vercel.
- Endpoints autenticados: `/api/enroll-template`, `/api/manage-templates` y `/api/identify-access`.
- No se conservan fotos. Sin PAD validado, una coincidencia requiere verificación presencial y no autoriza automáticamente.

## Desarrollo local

Requiere Node.js 20 o posterior.

```sh
npm install
npm run dev
npm run build
npm run test
npm run preview
```

Para probar endpoints locales con runtime de Vercel instala/usa Vercel CLI y ejecuta `vercel dev` tras configurar las variables. `npm run dev` inicia Vite para la interfaz; las rutas `/api` funcionan al desplegar en Vercel o con `vercel dev`.

## Supabase: Auth y PostgreSQL

1. Ejecuta en SQL Editor, en orden, las migraciones `202611230001_faceguard_schema.sql`, `202611230002_teacher_panel_security.sql` y `202611230003_auth_only_access.sql`. Si ya ejecutaste las primeras, ejecuta las que te falten; no repitas ninguna migración que haya fallado parcialmente sin revisar primero.
2. Activa Email/Password Auth y **desactiva el registro público de usuarios**. Crea las cuentas docentes desde Authentication → Users. La app no consulta `profiles`; cualquier cuenta autenticada es docente.
3. Copia el URL de proyecto y la clave pública/publishable. Las migraciones crean tablas y políticas RLS; las plantillas son inaccesibles directamente desde navegador.

## Variables de Vercel

Configura para Production/Preview (y Development si usarás `vercel dev`):

- `VITE_SUPABASE_URL`: URL del proyecto.
- `VITE_SUPABASE_ANON_KEY`: clave pública/anon.
- `SUPABASE_URL`: URL del proyecto (server-side).
- `SUPABASE_ANON_KEY`: clave pública para validar sesiones en Node.
- `SUPABASE_SERVICE_ROLE_KEY`: clave secreta de servidor; **nunca** usar prefijo `VITE_`.
- `BIOMETRIC_ENCRYPTION_KEY`: clave única base64 de 32 bytes, solo server-side.
- `FACE_MATCH_THRESHOLD`: dejar vacío hasta calibración documentada.
- `FACE_AMBIGUITY_MARGIN`: opcional; por defecto `0.05`.

Genera una clave en tu terminal con:

```sh
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Copia el valor directamente al entorno privado de Vercel. No la pongas en el código, en una variable `VITE_*` ni la compartas. No configures `SUPABASE_SERVICE_ROLE_KEY` en el navegador.

## Despliegue

Vercel compila `npm run build`, sirve `dist/` y despliega automáticamente las rutas de `api/` como Functions Node.js. Define las variables anteriores y despliega. Agrega el dominio Vercel en Supabase Auth → URL Configuration. No se despliega ninguna Edge Function ni se requiere Supabase CLI para las funciones.

## Alcance/limitaciones

El enrolamiento cifra y almacena descriptores, y la API comprueba sesión, permisos y horarios. Si no hay umbral configurado/calibrado, identificación devuelve verificación adicional. Incluso con umbral, no hay PAD que distinga fotos/pantallas; acceso automático permanece bloqueado. No se reportan métricas FAR/FRR ni se controla hardware.
