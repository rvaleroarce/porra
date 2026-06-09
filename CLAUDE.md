# CLAUDE.md — Porra Mundial 2026

Contexto esencial del proyecto para arrancar cualquier sesión. Para detalle profundo, ver
`PORRA_MUNDIAL_2026_migration.md` (diseño) y `DESPLIEGUE.md` (despliegue desde cero).

## Qué es

App web de porra deportiva para el Mundial 2026. Los participantes pronostican marcadores;
el admin mete resultados reales y se calcula la clasificación. **Está en producción con
usuarios reales** (Vercel + Supabase).

## Stack

- **Frontend**: Vite 5 + React 18 + TypeScript + Tailwind 3 + React Router 6
- **Backend/BD**: Supabase (PostgreSQL + Auth + RLS). No hay servidor propio.
- **Deploy**: Vercel (estático), redespliega solo con `git push` a `main`.

## Comandos

```bash
npm run dev      # local en http://localhost:3000 (puerto fijado, debe coincidir con Supabase)
npm run build    # tsc -b && vite build — úsalo SIEMPRE para verificar antes de subir
```

## Modelo de datos (dos niveles)

- **Torneo** = verdad objetiva: equipos, partidos, cruces, **resultados reales**. Una fila
  (`mundial-2026`). Su estructura (fixture) vive en CÓDIGO, no en BD.
- **Porra** = competición: subconjunto de partidos + usuarios + reglas + pronósticos +
  clasificación. N porras por torneo, cada una con su enlace `/p/SLUG`.
- **Pronósticos y reglas son por porra; resultados reales son por torneo** (se meten una vez,
  recalculan todas las porras).
- **Tipos de porra**: una porra materializa su ámbito al crearse (`porra_matches`). v1 solo
  implementa `TODOS`. La costura para añadir tipos está en `src/lib/porraTypes.ts`
  (una función `resolveMatches` por tipo).

### Tablas clave
`torneos`, `porras` (incl. reglas + `prize_info`), `porra_matches`, `porra_phases`,
`users` (participantes, con `token`), `predictions` (UNIQUE por `porra_id,user_id,match_id`),
`phase_submissions`, `results` (por torneo), `bracket_teams` (por torneo).

## Seguridad

- **Admin**: Supabase Auth (magic-link por email). NO hay PIN. Los signups están
  **DESACTIVADOS** en el dashboard (crítico: sin eso, cualquier email entra como admin).
  RLS actual: `auth.role() = 'authenticated'` = admin.
- **Participantes**: sin registro; token-capability en la URL (`?u=TOKEN`), guardado en
  localStorage. RLS + funciones RPC `security definer` impiden que toquen datos ajenos.
- Las escrituras críticas pasan por funciones RPC que validan en servidor (fase abierta, no
  enviada, no vencida). El cliente nunca escribe tablas críticas directamente.

## Reglas de negocio

- Bloqueo **por fase**: al "Enviar porra" se congela esa fase; también se bloquea al pasar la
  `deadline`. Validado en servidor. (Modelo "a ciegas": se rellena antes de empezar.)
- Solo **una fase activa** (abierta y no vencida) a la vez; las anteriores quedan abiertas
  pero bloqueadas por fecha.
- Clasificación: solo usuarios con `paid = true`. Orden por puntos, desempate por exactos.
- Puntuación: `scoreMatch` devuelve el TIPO (`exact`/`sign`/`miss`), no se deduce del valor
  de los puntos (evita bug si `exact == sign`).

## ⚠️ Avisos importantes

- **NO cambiar los `match_id` del fixture** (`H2`, `R32-1`, …): los pronósticos de usuarios
  reales los referencian. Cambiarlos huérfana datos en producción.
- **Cambios seguros** (sin tocar datos): apariencia/CSS, textos, layout, funciones RPC de solo
  lectura (`create or replace`). **Peligrosos**: ALTER/DROP de tablas, borrar filas, tocar ids.
- **El push lo hace el usuario** desde su terminal (el agente no tiene credenciales de GitHub).
- BD: `schema.sql` + `seed.sql` + migraciones numeradas en `supabase/`. Si añades cambios de
  BD, créalos como migración nueva y dáselos al usuario para ejecutar en el SQL Editor.

## Estructura

```
src/
  routes/      PorraView (participante), Register, AdminLogin, Admin, Ayuda
  components/  Header, MatchCard, Standings, Spinner, Toast + admin/*
  lib/         fixture.ts (datos torneo), scoring.ts (motor), porraTypes.ts, supabase.ts
  hooks/       useAdminAuth, useAdminData, useBootData, useToken
  types/
supabase/      schema.sql, seed.sql, migrations/
```

## Idioma

Todo de cara al usuario en **español**. Comunícate con el usuario en español.
