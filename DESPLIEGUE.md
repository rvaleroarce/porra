# Despliegue desde cero — Porra Mundial 2026

Guía para levantar la app completa en un entorno nuevo (Supabase + Vercel).

---

## 1. Supabase (base de datos + auth)

### 1.1 Crear el proyecto
1. [supabase.com](https://supabase.com) → **New project**
2. Región: **Europe West** (cercana a usuarios en España)
3. Guarda la contraseña de BD en sitio seguro (no se usa en el código)

### 1.2 Ejecutar los scripts SQL **en este orden**
En **SQL Editor → New query → Run**, uno por uno:

1. `supabase/schema.sql` — tablas, índices, RLS y funciones RPC base
2. `supabase/seed.sql` — inserta el torneo `mundial-2026`
3. `supabase/migrations/001_add_prize_info.sql` — campo de premio en porras
4. `supabase/migrations/002_get_submission_dates.sql` — función de fechas de envío (resguardo)

> Si añades más migraciones en el futuro, ejecútalas por orden numérico.

### 1.3 Configuración de Auth (dashboard, NO es código)
- **Authentication → Providers → Email**: activado
- **Authentication → User Signups → "Allow new users to sign up"**: **DESACTIVADO** ⚠️
  (crítico para seguridad: sin esto, cualquier email podría entrar como admin)
- **Authentication → URL Configuration**:
  - Site URL: `https://TU-DOMINIO.vercel.app`
  - Redirect URLs: `https://TU-DOMINIO.vercel.app/**` (y `http://localhost:3000/**` para desarrollo)

### 1.4 Crear la cuenta de admin
- **Authentication → Users → Add user → Create new user**
- Pon tu email (la contraseña da igual: el login real es por magic-link)

> ⚠️ **Rate limit de emails**: en el plan free, Supabase envía un máximo de **3 emails/hora**
> con su SMTP por defecto. Si haces varias pruebas de login seguidas verás
> *"email rate limit exceeded"*. Opciones:
> - Esperar ~1 hora, o
> - Configurar un SMTP propio (recomendado para producción): **Project Settings → Auth →
>   SMTP Settings**. P. ej. con [Resend](https://resend.com) (gratis, 100 emails/día):
>   host `smtp.resend.com`, puerto `465`, user `resend`, password = tu API key.

### 1.5 Copiar las claves
**Settings → API**:
- `Project URL`
- `anon public` key
- (NUNCA compartir la `service_role` key)

---

## 2. Variables de entorno

Crea `.env.local` (desarrollo) y configura las mismas en Vercel (producción):

```env
VITE_SUPABASE_URL=https://XXXX.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGci...
```

> No hay más secretos. El admin entra por Supabase Auth, no hay PIN ni service_role en el cliente.

---

## 3. Desarrollo local (opcional)

Requiere [Node.js](https://nodejs.org) 18+.

```bash
npm install          # instalar dependencias
npm run dev          # arranca en http://localhost:3000
```

> El puerto 3000 está fijado en `vite.config.ts` para que coincida con las Redirect URLs
> de Supabase. Necesitas el `.env.local` (paso 2) con las claves de tu proyecto.

Para comprobar que compila sin errores antes de subir:

```bash
npm run build
```

---

## 4. Vercel (hosting)

1. [vercel.com](https://vercel.com) → **Add New Project** → importa el repo de GitHub
2. Framework detectado: **Vite** (build `npm run build`, output `dist`)
3. **Environment Variables**: añade `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`
4. **Deploy**
5. Con la URL de producción, vuelve a **Supabase → Auth → URL Configuration** (paso 1.3) y actualízala

> `vercel.json` ya incluye el rewrite para que React Router funcione en todas las rutas.

Cada `git push` a `main` redespliega automáticamente.

---

## 5. Uso inicial

1. Entra a `https://TU-DOMINIO/admin/login` → magic-link a tu email → entras al panel
2. **Crea una porra** (nombre + tipo "Todos los partidos")
3. **Abre la fase de grupos** y fija fecha límite
4. Comparte el enlace `https://TU-DOMINIO/p/SLUG-PORRA` con los participantes

---

## Resumen de archivos SQL (fuente de verdad de la BD)

| Archivo | Contenido |
|---|---|
| `supabase/schema.sql` | Esquema completo: tablas, RLS, funciones RPC |
| `supabase/seed.sql` | Torneo Mundial 2026 |
| `supabase/migrations/001_add_prize_info.sql` | Campo `prize_info` |
| `supabase/migrations/002_get_submission_dates.sql` | Función fechas de envío |

> El **fixture** (equipos, grupos, 72 partidos, cruces) vive en código (`src/lib/fixture.ts`),
> no en la BD. Solo lo dinámico (porras, usuarios, pronósticos, resultados) está en Supabase.
