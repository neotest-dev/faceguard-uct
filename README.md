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

Copia `.env.example` como base de configuración. En Vercel configura la URL y clave pública del frontend; añade las claves privadas solo como variables server-side. Ejecuta las migraciones SQL de `supabase/migrations/` y sigue [`README_WEB.md`](README_WEB.md).

Nunca publiques claves `service_role` o de cifrado en el navegador. Los modelos de face-api.js deben colocarse en `public/models/` tras revisar su procedencia y licencia.

## Alcance actual

La UI, inicio de sesión Supabase, captura facial y Vercel Functions para inscripción cifrada, administración e identificación están implementados. Sin detección de vida validada no se concede acceso automático ni se controla hardware.

El detalle de instalación de Supabase, despliegue en Vercel, limitaciones y pruebas está en [`README_WEB.md`](README_WEB.md).
