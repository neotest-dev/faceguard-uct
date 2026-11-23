# FACEGUARD UCT

Aplicación web para el control de acceso supervisado a laboratorios universitarios, desarrollada con React, Vite, TypeScript, Tailwind CSS y Supabase.

## Inicio rápido

```sh
npm install
npm run dev
```

Usa Node.js 20+. Para construir y probar:

```sh
npm run build
npm run test
npm run preview
```

## Configuración

Copia `.env.example` como `.env.local` e indica `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`. Configura el proyecto, ejecuta la migración `supabase/migrations/202611230001_faceguard_schema.sql` y despliega la Edge Function `identify-access` según [`README_WEB.md`](README_WEB.md).

Nunca publiques claves `service_role` o de cifrado en el navegador. Los modelos de face-api.js deben colocarse en `public/models/` tras revisar su procedencia y licencia.

## Alcance actual

La UI, inicio de sesión Supabase, captura de cámara, extracción de descriptor y comprobaciones de la Edge Function están implementados. Registro biométrico completo, dashboard, modelos faciales incluidos y detección de vida validada siguen pendientes. Hasta completar revisión y pruebas reales, no se concede acceso automático ni se controla hardware.

El detalle de instalación de Supabase, despliegue en Vercel, limitaciones y pruebas está en [`README_WEB.md`](README_WEB.md).
