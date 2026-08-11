/* =========================================================================
   Sincronización de un torneo con football-data.org

   Trae equipos, fases y partidos —con sus horarios y resultados— y los
   vuelca en las tablas del torneo. Es idempotente: se puede ejecutar tantas
   veces como haga falta, y de hecho es lo que hará el cron a diario para ir
   recogiendo los marcadores.

   Al terminar recalcula, para cada porra de ese torneo, qué partidos entran
   en su ámbito y la fecha límite de cada fase.

   Uso:
     node scripts/sync-torneo.mjs laliga-2026-27

   Necesita en .env.local:
     FOOTBALL_DATA_TOKEN        clave de football-data.org
     VITE_SUPABASE_URL          url del proyecto
     SUPABASE_SERVICE_ROLE_KEY  clave de servicio (Project Settings → API)

   La clave de servicio se salta las políticas RLS: es de servidor, nunca
   debe llevar el prefijo VITE_ ni acabar en el navegador.
   ========================================================================= */

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)));
const { createClient } = createRequire(join(RAIZ, 'package.json'))('@supabase/supabase-js');

/* ── Entorno ──────────────────────────────────────────────────────────── */

const env = Object.fromEntries(
  readFileSync(join(RAIZ, '.env.local'), 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')];
    }),
);

function exigir(nombre, pista) {
  const v = process.env[nombre] || env[nombre];
  if (!v) throw new Error(`Falta ${nombre} en .env.local — ${pista}`);
  return v;
}

/* ── Traducción de la API a nuestro modelo ────────────────────────────── */

// football-data distingue más estados de los que nos importan.
const ESTADOS = {
  SCHEDULED: 'scheduled',  // sin hora confirmada
  TIMED:     'scheduled',  // con hora confirmada
  IN_PLAY:   'live',
  PAUSED:    'live',       // descanso
  FINISHED:  'finished',
  AWARDED:   'finished',   // resultado por resolución, no jugado
  POSTPONED: 'postponed',
  SUSPENDED: 'postponed',
  CANCELLED: 'cancelled',
};

/**
 * En una liga la fase es la jornada. En una copa, football-data usa `stage`
 * (GROUP_STAGE, LAST_16, FINAL…) y `group` para el grupo.
 */
function faseDe(partido, kind) {
  if (kind === 'league') {
    const j = partido.matchday;
    return { phase_id: `J${j}`, name: `Jornada ${j}`, short_name: `J${j}`, order_num: j };
  }
  const NOMBRES = {
    GROUP_STAGE:    ['Fase de grupos', 'Grupos', 0],
    LAST_32:        ['Dieciseisavos',  '1/16',   1],
    LAST_16:        ['Octavos',        '1/8',    2],
    QUARTER_FINALS: ['Cuartos',        '1/4',    3],
    SEMI_FINALS:    ['Semifinales',    'Semis',  4],
    THIRD_PLACE:    ['Tercer puesto',  '3º/4º',  5],
    FINAL:          ['Final',          'Final',  6],
  };
  const [name, short_name, order_num] = NOMBRES[partido.stage] ?? [partido.stage, partido.stage, 99];
  return { phase_id: partido.stage, name, short_name, order_num };
}

/* ── Programa ─────────────────────────────────────────────────────────── */

const main = async () => {
  const slug = process.argv[2];
  if (!slug) throw new Error('Indica el slug del torneo: node scripts/sync-torneo.mjs laliga-2026-27');

  const db = createClient(
    exigir('VITE_SUPABASE_URL', 'Project Settings → API'),
    exigir('SUPABASE_SERVICE_ROLE_KEY', 'Project Settings → API, la clave de servicio (secreta)'),
    { auth: { persistSession: false } },
  );
  const token = exigir('FOOTBALL_DATA_TOKEN', 'regístrate en football-data.org/client/register');

  const { data: torneo, error: eT } = await db
    .from('torneos').select('*').eq('slug', slug).single();
  if (eT) throw new Error(`Consultando el torneo '${slug}': ${eT.message}${eT.hint ? ` (${eT.hint})` : ''}`);
  if (!torneo) throw new Error(`Torneo '${slug}' no encontrado en la base de datos`);
  if (!torneo.provider_code) throw new Error(`El torneo '${slug}' no tiene provider_code`);

  console.log(`Torneo   : ${torneo.name} (${torneo.kind})`);
  console.log(`Proveedor: ${torneo.provider} / ${torneo.provider_code}\n`);

  const api = async (ruta) => {
    const r = await fetch(`https://api.football-data.org/v4${ruta}`, {
      headers: { 'X-Auth-Token': token },
    });
    if (r.status === 429) throw new Error('Límite de peticiones de la API alcanzado (10/min). Espera un minuto.');
    if (!r.ok) throw new Error(`API ${r.status}: ${(await r.text()).slice(0, 200)}`);
    return r.json();
  };

  /* 1. Equipos ------------------------------------------------------------ */
  const { teams } = await api(`/competitions/${torneo.provider_code}/teams`);
  const { error: eEq } = await db.from('teams').upsert(
    teams.map((t) => ({
      torneo_id:  torneo.id,
      code:       String(t.id),
      name:       t.name,
      short_name: t.shortName || t.tla || t.name,
      crest_url:  t.crest,
    })),
    { onConflict: 'torneo_id,code' },
  );
  if (eEq) throw new Error(`Guardando equipos: ${eEq.message}`);
  console.log(`Equipos  : ${teams.length}`);

  // Índice code → id, para resolver las claves foráneas de los partidos
  const { data: guardados } = await db
    .from('teams').select('id, code').eq('torneo_id', torneo.id);
  const idPorCode = Object.fromEntries(guardados.map((t) => [t.code, t.id]));

  /* 2. Partidos y fases --------------------------------------------------- */
  const { matches } = await api(`/competitions/${torneo.provider_code}/matches`);

  const fases = new Map();
  const partidos = matches.map((m) => {
    const fase = faseDe(m, torneo.kind);
    if (!fases.has(fase.phase_id)) fases.set(fase.phase_id, { torneo_id: torneo.id, ...fase });

    // El marcador solo se toma de partidos acabados: mientras se juega,
    // fullTime viene a null y machacaría lo que ya hubiera.
    const acabado = ESTADOS[m.status] === 'finished';
    return {
      torneo_id:    torneo.id,
      match_id:     String(m.id),
      phase_id:     fase.phase_id,
      group_label:  m.group ?? null,
      home_team_id: idPorCode[String(m.homeTeam?.id)] ?? null,
      away_team_id: idPorCode[String(m.awayTeam?.id)] ?? null,
      home_label:   m.homeTeam?.name ?? '',
      away_label:   m.awayTeam?.name ?? '',
      kickoff:      m.utcDate,
      status:       ESTADOS[m.status] ?? 'scheduled',
      home_score:   acabado ? m.score?.fullTime?.home ?? null : null,
      away_score:   acabado ? m.score?.fullTime?.away ?? null : null,
      order_num:    fase.order_num,
      updated_at:   new Date().toISOString(),
    };
  });

  const { error: eF } = await db.from('tournament_phases')
    .upsert([...fases.values()], { onConflict: 'torneo_id,phase_id' });
  if (eF) throw new Error(`Guardando fases: ${eF.message}`);
  console.log(`Fases    : ${fases.size}`);

  // En lotes: 380 filas de golpe hacen una petición incómodamente grande
  for (let i = 0; i < partidos.length; i += 100) {
    const { error } = await db.from('tournament_matches')
      .upsert(partidos.slice(i, i + 100), { onConflict: 'torneo_id,match_id' });
    if (error) throw new Error(`Guardando partidos: ${error.message}`);
  }
  const jugados = partidos.filter((p) => p.home_score !== null).length;
  console.log(`Partidos : ${partidos.length} (${jugados} con resultado)`);

  /* 3. Repercutir en las porras ------------------------------------------- */
  const { data: porras } = await db
    .from('porras').select('id, name').eq('torneo_id', torneo.id);

  for (const porra of porras ?? []) {
    const { data: sync } = await db.rpc('sync_porra_matches', { p_porra_id: porra.id });
    await db.rpc('refresh_phase_deadlines', { p_porra_id: porra.id });
    console.log(`Porra    : ${porra.name} — ${sync?.added ?? 0} partidos nuevos en su ámbito`);
  }
  if (!porras?.length) console.log('Porras   : ninguna todavía');
};

main().catch((e) => {
  console.error(`\nError: ${e.message}`);
  process.exit(1);
});
