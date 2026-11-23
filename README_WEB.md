# FACEGUARD UCT Web

App React + Vite + TypeScript + Tailwind CSS. La entrada Vite es la raíz (`index.html`).

## Estado comprobado

- Interfaz adaptable y controles principales; acceso docente mediante Supabase Auth.
- Modelos oficiales de face-api.js descargados en `public/models/` (tiny detector, landmarks y reconocimiento); captura frontal y extracción de descriptor 128D se ejecutan en el navegador.
- Llamada autenticada a Edge Function para identificación; la función intenta comparar plantillas cifradas y revisar permisos.
- La función falla cerrada: aun si encuentra identidad y permiso, responde `additional_check` porque no hay PAD validado. No abre hardware.
- Registro biométrico, dashboard de administración, inscripción/cifrado de plantillas y rate limit server-side están pendientes; no se deben considerar implementados.
- Los modelos descargados permiten probar la inferencia; revisa sus términos de uso. El descriptor facial de face-api.js tiene 128 dimensiones.

## Desarrollo local

Requiere Node.js 20 o posterior.

```sh
npm install
npm run dev
npm run build
npm run preview
```

Para cámara en dispositivo móvil utiliza HTTPS (Vercel Preview/Production) o `localhost` en el propio dispositivo. Copia `.env.example` a `.env.local` e introduce el URL y anon key públicos de Supabase. Nunca configures `service_role` en variables `VITE_*`.

## Supabase

1. Crea un proyecto Supabase y ejecuta `supabase/migrations/202611230001_faceguard_schema.sql` desde SQL Editor o Supabase CLI.
2. Habilita Email/Password Auth. Crea el profesor en Auth y agrega su fila `profiles` con el mismo UUID y rol `teacher`/`admin` desde SQL Editor seguro. No publiques credenciales iniciales.
3. Despliega `identify-access` con Supabase CLI. Configura secrets `BIOMETRIC_ENCRYPTION_KEY` (base64 de 32 bytes), `FACE_MATCH_THRESHOLD` y opcional `FACE_AMBIGUITY_MARGIN`. La comparación solo sirve para una calibración documentada; no se habilita autorización automática ni PAD por esta variable.
4. La función también requiere `SUPABASE_URL`, `SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` como secrets del entorno de Edge Functions, gestionados por Supabase; jamás los pongas en Vite/frontend.
5. Inserta laboratorios en `laboratories` desde el SQL Editor. La app no viene con cuentas, laboratorios ni plantillas demo.

El esquema bloquea acceso de cliente a `biometric_templates`; no hay aún flujo de inscripción que produzca ciphertext. La Edge Function es el único punto que usa service role. Revisa y prueba sus políticas antes de datos reales.

## Vercel

Importa el repositorio/carpeta en Vercel, utiliza preset Vite (build `npm run build`, output `dist`) y define `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`. `vercel.json` aporta fallback SPA. Añade el dominio en Supabase Auth URL Configuration y publica la Edge Function por separado. El HTTPS de Vercel permite solicitar cámara en Android.

## Verificación biométrica / limitaciones

Los modelos están en `public/models/`; confirma los términos aplicables antes de un uso real. La implementación no simula PAD: no analiza impresiones, pantallas o videos. Una foto no debe conceder acceso; reconocimiento y permisos por sí solos llevan a verificación adicional supervisada. No se reportan FAR/FRR/latencias de población: deben medirse con protocolo aprobado, conjuntos separados y participantes voluntarios. No conectes cerraduras reales.
