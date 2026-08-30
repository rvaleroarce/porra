/* =========================================================================
   Sincronización de torneos con football-data.org

   Lógica compartida por las dos formas de dispararla: el cron diario y el
   botón del admin (ambos vía /api/sync), y el script de terminal
   `npm run sync`. Un solo sitio donde vive la verdad.
   ========================================================================= */

/** football-data distingue más estados de los que nos importan. */
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

/** Las fases de copa del proveedor, en el orden en que se juegan. */
const FASES_COPA = {
  // `liguilla` = varios partidos por equipo, no una eliminatoria. Se numeran
  // como jornadas; el resto, como ida y vuelta.
  LEAGUE_STAGE:   { name: 'Liguilla',       short: 'J',      orden: 0, liguilla: true },
  GROUP_STAGE:    { name: 'Fase de grupos', short: 'Grupos', orden: 0, liguilla: true },
  PLAYOFFS:       { name: 'Playoffs',       short: 'PO',     orden: 1 },
  LAST_32:        { name: 'Dieciseisavos',  short: '1/16',   orden: 2 },
  LAST_16:        { name: 'Octavos',        short: '1/8',    orden: 3 },
  QUARTER_FINALS: { name: 'Cuartos',        short: '1/4',    orden: 4 },
  SEMI_FINALS:    { name: 'Semifinales',    short: 'SF',     orden: 5 },
  THIRD_PLACE:    { name: 'Tercer puesto',  short: '3º/4º',  orden: 6 },
  FINAL:          { name: 'Final',          short: 'Final',  orden: 7 },
};

/**
 * A qué fase de la porra pertenece un partido.
 *
 * En una liga es su jornada, sin más. En una copa manda el `stage` del
 * proveedor, pero **se parte por jornada cuando esa fase tiene más de una**:
 * la liguilla de la Champions son 144 partidos en 8 jornadas, y meterlos en
 * una sola fase significaría una única fecha límite en septiembre para todo
 * el torneo. Lo mismo con las eliminatorias a doble partido: si ida y vuelta
 * comparten fase, cerrar la ida congela la vuelta una semana antes de jugarse.
 *
 * `variasJornadas` se calcula mirando todos los partidos de esa fase, no este
 * partido suelto: una eliminatoria a partido único no debe acabar etiquetada
 * como "ida".
 */
function faseDe(partido, kind, variasJornadas = false) {
  if (kind === 'league') {
    const j = partido.matchday;
    return { phase_id: `J${j}`, name: `Jornada ${j}`, short_name: `J${j}`, order_num: j };
  }

  const f = FASES_COPA[partido.stage]
    ?? { name: partido.stage, short: partido.stage, orden: 90 };
  const j = partido.matchday;

  if (!variasJornadas || !j) {
    return {
      phase_id: partido.stage,
      name: f.name,
      short_name: f.short,
      order_num: f.orden * 100,
    };
  }

  const esIda = j === 1;
  return {
    phase_id:   `${partido.stage}-${j}`,
    name:       f.liguilla ? `Jornada ${j}` : `${f.name} (${esIda ? 'ida' : 'vuelta'})`,
    short_name: f.liguilla ? `J${j}`        : `${f.short} ${esIda ? 'ida' : 'vta'}`,
    order_num:  f.orden * 100 + j,
  };
}

/**
 * Sincroniza un torneo: equipos, fases y partidos con horarios y resultados.
 * Idempotente — todo son upserts.
 *
 * @param db      cliente de Supabase con clave de servicio
 * @param token   clave de football-data.org
 * @param torneo  fila de la tabla `torneos`
 * @param log     función opcional para ir informando del progreso
 */
export async function syncTorneo(db, token, torneo, log = () => {}) {
  if (!torneo.provider_code) {
    throw new Error(`El torneo '${torneo.slug}' no tiene provider_code`);
  }

  const api = async (ruta) => {
    const r = await fetch(`https://api.football-data.org/v4${ruta}`, {
      headers: { 'X-Auth-Token': token },
    });
    if (r.status === 429) {
      throw new Error('Límite de peticiones de football-data alcanzado (10/min).');
    }
    if (!r.ok) throw new Error(`API ${r.status}: ${(await r.text()).slice(0, 200)}`);
    return r.json();
  };

  /* 1. La competición: escudo y temporada -------------------------------- */
  const comp = await api(`/competitions/${torneo.provider_code}`);
  if (comp.emblem && comp.emblem !== torneo.emblem_url) {
    await db.from('torneos').update({ emblem_url: comp.emblem }).eq('id', torneo.id);
  }

  /* 2. Equipos ----------------------------------------------------------- */
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
  log(`Equipos: ${teams.length}`);

  // Índice code → id, para resolver las claves foráneas de los partidos
  const { data: guardados } = await db
    .from('teams').select('id, code').eq('torneo_id', torneo.id);
  const idPorCode = Object.fromEntries(guardados.map((t) => [t.code, t.id]));

  /* 3. Partidos y fases -------------------------------------------------- */
  const { matches } = await api(`/competitions/${torneo.provider_code}/matches`);

  // Cuántas jornadas tiene cada fase: es lo que decide si se parte o no, y
  // solo se sabe mirando todos los partidos, no uno suelto.
  const jornadasPorFase = {};
  for (const m of matches) (jornadasPorFase[m.stage] ??= new Set()).add(m.matchday ?? 0);

  const fases = new Map();
  const partidos = matches.map((m) => {
    const fase = faseDe(m, torneo.kind, (jornadasPorFase[m.stage]?.size ?? 1) > 1);
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
  log(`Fases: ${fases.size}`);

  // En lotes: 380 filas de golpe hacen una petición incómodamente grande
  for (let i = 0; i < partidos.length; i += 100) {
    const { error } = await db.from('tournament_matches')
      .upsert(partidos.slice(i, i + 100), { onConflict: 'torneo_id,match_id' });
    if (error) throw new Error(`Guardando partidos: ${error.message}`);
  }
  const conResultado = partidos.filter((p) => p.home_score !== null).length;
  log(`Partidos: ${partidos.length} (${conResultado} con resultado)`);

  /* 4. Repercutir en las porras ------------------------------------------ */
  const { data: porras } = await db
    .from('porras').select('id, name').eq('torneo_id', torneo.id);

  for (const porra of porras ?? []) {
    await db.rpc('sync_porra_matches', { p_porra_id: porra.id });
    await db.rpc('refresh_phase_deadlines', { p_porra_id: porra.id });
  }

  return {
    torneo:    torneo.slug,
    equipos:   teams.length,
    fases:     fases.size,
    partidos:  partidos.length,
    resultados: conResultado,
    porras:    porras?.length ?? 0,
  };
}

/** Sincroniza todos los torneos que tengan proveedor configurado. */
export async function syncTodos(db, token, log = () => {}) {
  const { data: torneos, error } = await db
    .from('torneos').select('*').not('provider_code', 'is', null);
  if (error) throw new Error(`Leyendo torneos: ${error.message}`);

  const resultados = [];
  for (const t of torneos ?? []) {
    log(`— ${t.name}`);
    resultados.push(await syncTorneo(db, token, t, log));
  }
  return resultados;
}
