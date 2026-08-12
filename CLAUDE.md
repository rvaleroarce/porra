# CLAUDE.md — Porra

Contexto esencial del proyecto para arrancar cualquier sesión.
Para el despliegue desde cero, ver `DESPLIEGUE.md`.

## Qué es

App web de porras deportivas. Los participantes pronostican marcadores y se calcula la
clasificación. **Está en producción con usuarios reales**: https://porra-ochre.vercel.app

Nació como porra del Mundial 2026 y se generalizó en agosto de 2026 para servir a
cualquier competición. Aquella versión está en el tag `mundial-2026-final`, y su
clasificación final se conserva como página estática en `/mundial-2026.html`.

## Stack

- **Frontend**: Vite 5 + React 18 + TypeScript + Tailwind 3 + React Router 6
- **Backend/BD**: Supabase (PostgreSQL + Auth + RLS)
- **Servidor**: una función en `api/`, para lo que no puede vivir en el navegador
- **Datos deportivos**: football-data.org (plan gratuito, 10 peticiones/min)
- **Deploy**: Vercel, redespliega solo con `git push` a `main`

## Comandos

```bash
npm run dev      # local en http://localhost:3000 (puerto fijado, debe coincidir con Supabase)
npm run build    # tsc -b && vite build — úsalo SIEMPRE para verificar antes de subir
npm run sync     # trae equipos, fases y resultados del proveedor
npm run backup   # copia de seguridad de la BD (fuera del repo, en ../porra-backups)
```

En PowerShell `npm` está bloqueado por la política de ejecución: usar `npm.cmd run …`.

## Modelo de datos (dos niveles)

- **Torneo** = verdad objetiva: equipos, partidos, fases y **resultados reales**. Su
  estructura vive **en la base de datos**, no en código, y la rellena la sincronización
  con el proveedor.
- **Porra** = competición sobre un torneo: subconjunto de partidos + usuarios + reglas +
  pronósticos + clasificación. N porras por torneo, cada una con su enlace `/p/SLUG`.
- **Pronósticos y reglas son por porra; resultados reales son por torneo** (se meten una
  vez y recalculan todas las porras).

### Tablas
`torneos` (con `kind` liga/copa, proveedor y escudo), `teams`, `tournament_phases`,
`tournament_matches` (partidos **y** su resultado), `porras`, `porra_teams` (equipos
elegidos), `porra_matches` (ámbito materializado), `porra_phases` (plazos por porra),
`users` (participantes, con `token`), `predictions`, `phase_submissions`.

### Ámbito de una porra
Al crearla se elige competición, equipos y fases. La regla la aplica el servidor en
`sync_porra_matches`: **entra el partido si juega alguno de los equipos elegidos, o si
todavía no se sabe quién lo juega** (cruce sin sortear). Sin equipos elegidos, entra el
torneo entero. El ámbito **no se edita después**: quitar un equipo huerfanaría
pronósticos ya emitidos.

## Seguridad

- **Admin**: Supabase Auth (magic-link por email). Los signups están **DESACTIVADOS** en
  el dashboard (crítico: sin eso, cualquier email entra como admin). RLS: estar
  autenticado equivale a ser admin.
- **Participantes**: sin registro; token en la URL (`?u=TOKEN`), guardado en localStorage.
- Las escrituras críticas pasan por funciones RPC `security definer` que validan en
  servidor. El cliente nunca escribe tablas críticas directamente.
- **RLS no basta**: sin `grant` explícito, PostgREST responde "permission denied" antes de
  mirar las políticas. Los privilegios están declarados en `schema.sql`, sección 5b.
- `SUPABASE_SERVICE_ROLE_KEY` y `FOOTBALL_DATA_TOKEN` son de servidor: **nunca** con
  prefijo `VITE_`, o acabarían en el bundle del navegador.

## Reglas de negocio

- Las fases **nacen abiertas** y se cierran solas cuando llega su fecha límite, que es el
  kickoff del primer partido que esa porra tiene en esa fase. El admin puede cerrarlas a
  mano o fijar otra fecha. Una fase sin fecha no se cierra sola: AdminFases la marca.
- Al "Enviar porra" se congela esa fase para ese participante, aunque no haya vencido.
- Clasificación: solo usuarios con `paid = true`, salvo porras gratis (`cuota = 0`). Orden
  por puntos, desempate por exactos; los empatados comparten puesto.
- Puntuación: `scoreMatch` devuelve el TIPO (`exact`/`sign`/`miss`), no se deduce del valor
  de los puntos (evita un bug si `exact == sign`).
- La sincronización **solo copia el marcador de partidos acabados**: mientras se juega, el
  proveedor devuelve `fullTime` a null y machacaría lo ya guardado.

## ⚠️ Avisos importantes

- **NO cambiar los `match_id`**: los pronósticos de usuarios reales los referencian.
- **Cambios seguros**: apariencia/CSS, textos, layout, RPC de solo lectura
  (`create or replace`). **Peligrosos**: ALTER/DROP de tablas, borrar filas, tocar ids.
- **El push lo hace el usuario** desde su terminal (el agente no tiene credenciales de
  GitHub). Trabajamos directamente sobre `main`.
- BD: `schema.sql` es la receta desde cero; los cambios posteriores van como migraciones
  numeradas en `supabase/migrations/`, y **las ejecuta el usuario** en el SQL Editor.
  Las de la etapa Mundial están archivadas en `migrations/v1-mundial/`.
- Los volcados de la BD llevan teléfonos, emails y tokens: viven **fuera del repo**.

## Tema

Claro por defecto, oscuro si el móvil lo pide (`prefers-color-scheme`). Los colores son
variables CSS en tripletes RGB (`src/index.css`) y Tailwind los referencia: es lo único
que conserva los modificadores de opacidad (`bg-accent/10`).

## Estructura

```
src/
  routes/      PorraView (participante), Register, Ayuda, AdminLogin, Admin
  components/  Header, MatchCard, Standings, Spinner, Toast + admin/*
  lib/         supabase.ts (RPC y tipos), scoring.ts, generateReceipt.ts, slug.ts
  hooks/       useAdminAuth, useAdminData, useBootData, useToken
api/
  sync.js      endpoint que dispara la sincronización (cron y botón del admin)
  _lib/sync.js lógica compartida con `npm run sync`
scripts/       sync-torneo.mjs, backup-db.mjs
supabase/      schema.sql, seed.sql, migrations/
public/        mundial-2026.html (recuerdo estático)
```

## Idioma

Todo de cara al usuario en **español**. Comunícate con el usuario en español.
