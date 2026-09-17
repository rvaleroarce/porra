# Restauración ante desastre — Porra

Cómo reconstruir la app y sus datos si se pierde la base de datos (proyecto de
Supabase borrado, corrupción, migración fallida…).

> Para levantar la app **sin datos** (entorno nuevo limpio), usa `DESPLIEGUE.md`.
> Esta guía es para recuperar **con** los datos reales desde un backup.

---

## Qué tienes y qué NO cubre el backup

Los backups viven **fuera del repo**, en `../porra-backups/` (los genera `npm run backup`):
- `AAAA-MM-DD-datos.sql` — INSERTs en orden de dependencias, con `begin/commit`
- `AAAA-MM-DD-datos.json` — lo mismo en JSON, para inspección

El volcado cubre **solo el esquema `public`** (todas las tablas de la app). **NO incluye**:

| No respaldado | Cómo se recupera |
|---|---|
| **Cuenta(s) de admin** (viven en el esquema `auth`) | Recrear a mano en el dashboard (paso 4) |
| **Config del dashboard** (signups OFF, URLs, SMTP) | Reaplicar según `DESPLIEGUE.md` |
| **Secretos** (`.env.local`, vars de Vercel) | Los tienes aparte; reintroducir |
| **La estructura** (tablas, funciones, RLS) | Está en git: `supabase/schema.sql` |

---

## Procedimiento (base de datos desde cero)

Escenario habitual: proyecto de Supabase nuevo (o el mismo, ya vaciado).

### 1. Crear/preparar el proyecto
- Proyecto nuevo en Supabase, o el existente si solo se corrompieron datos.
- Ten a mano el backup más reciente de `../porra-backups/`.

### 2. Crear la estructura
En **SQL Editor**, ejecuta **`supabase/schema.sql`** entero. Crea las 11 tablas,
funciones RPC, RLS y grants. Es autocontenido: **no** hace falta aplicar las
migraciones de `supabase/migrations/` (ya están consolidadas en el schema).

> ⚠️ **NO ejecutes `seed.sql`**: inserta torneos de arranque que chocarían con los
> del backup. En una restauración los datos vienen del volcado, no del seed.

### 3. Cargar los datos
En el **SQL Editor**, pega y ejecuta el **`AAAA-MM-DD-datos.sql`** del backup más
reciente. Va en orden de dependencias y entra en una transacción; si algo falla,
no deja a medias. Los INSERT corren como servicio, así que RLS no los bloquea.

### 4. Recrear la cuenta de admin
El backup no trae las cuentas de Auth. En **Authentication → Users → Add user →
Create new user**, crea tu email de admin (la contraseña da igual: se entra por
magic-link).

### 5. Reconfigurar el dashboard (ver `DESPLIEGUE.md` §1.3)
- **User Signups → DESACTIVADO** (crítico: sin eso cualquier email sería admin)
- **URL Configuration**: Site URL + Redirect URLs (`/**`)
- SMTP propio si quieres evitar el rate limit de emails

### 6. Claves y despliegue
- Copia `Project URL` y `anon key` (Settings → API) a `.env.local` y a las
  variables de Vercel (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`).
- Repón los secretos de servidor en Vercel: `SUPABASE_SERVICE_ROLE_KEY`,
  `FOOTBALL_DATA_TOKEN` (sin prefijo `VITE_`).
- Si el proyecto es nuevo, Vercel ya sirve el frontend; solo cambian las claves.

### 7. Verificar
- Entra en `/admin/login` → magic-link → el panel carga tus porras.
- Abre una porra `/p/SLUG` → salen partidos y clasificación.
- Comprueba en el panel que el número de participantes y pronósticos cuadra con
  el backup (`AAAA-MM-DD-datos.json` lista los conteos por tabla).

---

## Restaurar en el MISMO proyecto (solo datos corruptos)

Si la estructura está bien pero los datos se estropearon, no recrees el proyecto:
1. Vacía las tablas respetando dependencias (o `truncate ... cascade` sobre las
   tablas de `public`; cuidado, es destructivo e irreversible).
2. Ejecuta el `AAAA-MM-DD-datos.sql`.
3. Salta los pasos 4-6 (Auth y claves siguen intactos).

> Antes de cualquier `truncate`, **haz un backup nuevo** por si el estado actual,
> aun corrupto, contiene algo recuperable.

---

## Mantener esto fiable (importante)

La restauración funciona **porque `schema.sql` está sincronizado con producción**.
Se comprobó el 2026-09-17: las columnas del backup coinciden con las del schema.

Para que siga siendo cierto: **cada vez que apliques una migración en el SQL Editor
de producción, refléjala también en `schema.sql`** (además de guardarla numerada en
`supabase/migrations/`). Si el schema se desincroniza, el `-datos.sql` fallaría al
restaurar por columnas que no existen.

Y lo esencial: **el backup solo vale si es reciente**. `npm run backup` es manual;
lánzalo con regularidad (sobre todo antes de tocar la BD).
