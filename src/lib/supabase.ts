import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!url || !key) {
  throw new Error('Faltan VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY en .env.local');
}

export const supabase = createClient(url, key);

/* -----------------------------------------------------------------------
   Tipos de respuesta de las funciones RPC
   ----------------------------------------------------------------------- */

export interface RpcOk { ok: true }
export interface RpcError { ok: false; error: string; hint?: string }
export type RpcResult<T = RpcOk> = T | RpcError;

export function isRpcError(r: RpcResult<unknown>): r is RpcError {
  return !(r as RpcOk).ok;
}

/* Un partido tal y como lo devuelve boot(): con el equipo ya resuelto o con
   la etiqueta provisional del cruce, y con su resultado real si lo tiene. */
export interface BootMatch {
  match_id: string;
  phase_id: string;
  group_label: string | null;
  home: string | null;
  away: string | null;
  home_crest: string | null;
  away_crest: string | null;
  kickoff: string | null;
  venue: string | null;
  status: 'scheduled' | 'live' | 'finished' | 'postponed' | 'cancelled';
  home_score: number | null;
  away_score: number | null;
}

/* Filas del torneo que necesita el admin para montar una porra. */
export interface Torneo {
  id: string;
  slug: string;
  name: string;
  kind: 'cup' | 'league';
  emblem_url: string | null;
}

export interface Team {
  id: string;
  code: string;
  name: string;
  short_name: string | null;
  crest_url: string | null;
}

export interface TournamentPhase {
  phase_id: string;
  name: string;
  short_name: string;
  order_num: number;
}

/* Boot — respuesta de la función `boot(slug, token?)`

   En v1 esto se completaba en el cliente con fixture.ts. Ahora los partidos
   llegan ya renderizables: `home` trae el nombre del equipo si se conoce y,
   si no, la etiqueta del cruce ('1º A', 'Gan. Octavos 1'). */
export interface BootResponse {
  ok: true;
  porra: {
    id: string;
    name: string;
    exact_pts: number;
    sign_pts: number;
    miss_pts: number;
    cuota: number | null;
    prize_info: string | null;
  };
  torneo: {
    id: string;
    slug: string;
    name: string;
    kind: 'cup' | 'league';
    emblem_url: string | null;
  };
  /** Equipos elegidos al crear la porra. Vacío = abarca el torneo entero. */
  teams: Team[];
  phases: {
    phase_id: string;
    name: string;
    short_name: string;
    open: boolean;
    deadline: string | null;
    order_num: number;
  }[];
  matches: BootMatch[];
  standings: {
    id: string;
    name: string;
    pts: number;
    exact: number;
    sign: number;
  }[];
  me: {
    user: {
      id: string;
      name: string;
      alias: string | null;
      paid: boolean;
    };
    preds: {
      match_id: string;
      phase_id: string;
      home_score: number | null;
      away_score: number | null;
    }[];
    submitted: string[];
  } | null;
}

/* Admin boot — respuesta de `admin_boot(porra_id)` */
export interface AdminBootResponse {
  ok: true;
  users: {
    id: string;
    name: string;
    alias: string | null;
    phone: string;
    email: string | null;
    paid: boolean;
    token: string;
    created_at: string;
    submissions: { phase_id: string; submitted_at: string }[];
  }[];
}

/* -----------------------------------------------------------------------
   Helpers de llamada a RPC
   ----------------------------------------------------------------------- */

/** Carga inicial de la porra (participante). */
export async function rpcBoot(slug: string, token?: string | null) {
  const { data, error } = await supabase.rpc('boot', {
    p_slug: slug,
    p_token: token ?? null,
  });
  if (error) throw error;
  return data as RpcResult<BootResponse>;
}

/** Alta de participante. */
export async function rpcRegister(params: {
  porraSlug: string;
  name: string;
  phone: string;
  alias?: string;
  email?: string;
}) {
  const { data, error } = await supabase.rpc('register_participant', {
    p_porra_slug: params.porraSlug,
    p_name: params.name,
    p_phone: params.phone,
    p_alias: params.alias ?? null,
    p_email: params.email ?? null,
  });
  if (error) throw error;
  return data as RpcResult<{ token: string; user: { id: string; name: string; alias: string | null; paid: boolean } }>;
}

/** Guardar pronósticos (sin enviar). */
export async function rpcSavePredictions(params: {
  token: string;
  porraId: string;
  phaseId: string;
  preds: { match_id: string; home_score: number; away_score: number }[];
}) {
  const { data, error } = await supabase.rpc('upsert_predictions', {
    p_token: params.token,
    p_porra_id: params.porraId,
    p_phase_id: params.phaseId,
    p_preds: params.preds,
  });
  if (error) throw error;
  return data as RpcResult;
}

/** Enviar y bloquear una fase. */
export async function rpcSubmitPhase(params: {
  token: string;
  porraId: string;
  phaseId: string;
  preds?: { match_id: string; home_score: number; away_score: number }[];
}) {
  const { data, error } = await supabase.rpc('submit_phase', {
    p_token: params.token,
    p_porra_id: params.porraId,
    p_phase_id: params.phaseId,
    p_preds: params.preds ?? null,
  });
  if (error) throw error;
  return data as RpcResult;
}

/* -----------------------------------------------------------------------
   Admin RPCs (requieren sesión Supabase Auth)
   ----------------------------------------------------------------------- */

export async function rpcAdminBoot(porraId: string) {
  const { data, error } = await supabase.rpc('admin_boot', { p_porra_id: porraId });
  if (error) throw error;
  return data as RpcResult<AdminBootResponse>;
}

export async function rpcSetResult(params: {
  torneoId: string; matchId: string; homeScore: number; awayScore: number;
}) {
  const { data, error } = await supabase.rpc('set_result', {
    p_torneo_id: params.torneoId,
    p_match_id: params.matchId,
    p_home_score: params.homeScore,
    p_away_score: params.awayScore,
  });
  if (error) throw error;
  return data as RpcResult;
}

/** Resuelve un cruce de eliminatoria asignándole equipos reales. */
export async function rpcSetMatchTeams(params: {
  torneoId: string; matchId: string; homeTeamId: string | null; awayTeamId: string | null;
}) {
  const { data, error } = await supabase.rpc('set_match_teams', {
    p_torneo_id: params.torneoId,
    p_match_id: params.matchId,
    p_home_team: params.homeTeamId,
    p_away_team: params.awayTeamId,
  });
  if (error) throw error;
  return data as RpcResult;
}

export async function rpcSetPhaseState(params: {
  porraId: string; phaseId: string; open: boolean; deadline?: string | null;
}) {
  const { data, error } = await supabase.rpc('set_phase_state', {
    p_porra_id: params.porraId,
    p_phase_id: params.phaseId,
    p_open: params.open,
    p_deadline: params.deadline ?? null,
  });
  if (error) throw error;
  return data as RpcResult;
}

export async function rpcSetRules(params: {
  porraId: string; exact: number; sign: number; miss: number;
}) {
  const { data, error } = await supabase.rpc('set_rules', {
    p_porra_id: params.porraId,
    p_exact: params.exact,
    p_sign: params.sign,
    p_miss: params.miss,
  });
  if (error) throw error;
  return data as RpcResult;
}

export async function rpcSetPaid(userId: string, paid: boolean) {
  const { data, error } = await supabase.rpc('set_paid', {
    p_user_id: userId,
    p_paid: paid,
  });
  if (error) throw error;
  return data as RpcResult;
}

export async function rpcDeleteParticipant(userId: string) {
  const { data, error } = await supabase.rpc('delete_participant', { p_user_id: userId });
  if (error) throw error;
  return data as RpcResult;
}

/**
 * Crea la porra. El cliente ya no calcula qué partidos entran: manda las
 * fases y los equipos elegidos, y el servidor resuelve el ámbito contra el
 * fixture. `teamIds` vacío = la porra abarca el torneo entero.
 */
export async function rpcCreatePorra(params: {
  torneoId: string;
  name: string;
  slug: string;
  cuota: number;
  teamIds: string[];
  phaseIds: string[];
}) {
  const { data, error } = await supabase.rpc('create_porra', {
    p_torneo_id: params.torneoId,
    p_name: params.name,
    p_slug: params.slug,
    p_cuota: params.cuota,
    p_team_ids: params.teamIds.length ? params.teamIds : null,
    p_phase_ids: params.phaseIds.length ? params.phaseIds : null,
  });
  if (error) throw error;
  return data as RpcResult<{ porra_id: string }>;
}

/** Recalcula el ámbito de una porra tras cambiar el fixture. */
export async function rpcSyncPorraMatches(porraId: string) {
  const { data, error } = await supabase.rpc('sync_porra_matches', { p_porra_id: porraId });
  if (error) throw error;
  return data as RpcResult<{ added: number }>;
}

/**
 * Dispara la sincronización con el proveedor.
 *
 * Va por /api/sync y no directamente contra la API porque hace falta la
 * clave de servicio, que no puede salir del servidor. Manda la sesión del
 * admin para que el endpoint sepa que la petición es legítima.
 */
export async function triggerSync(): Promise<{ torneos: { torneo: string; partidos: number; resultados: number }[] }> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('No hay sesión de admin');

  const r = await fetch('/api/sync', {
    method: 'POST',
    headers: { Authorization: `Bearer ${session.access_token}` },
  });

  // En `npm run dev` no hay funciones de servidor: Vite sirve el index.html
  // y la respuesta no es JSON. Merece un mensaje claro en vez de un error raro.
  const texto = await r.text();
  let cuerpo: { ok?: boolean; error?: string; torneos?: [] };
  try {
    cuerpo = JSON.parse(texto);
  } catch {
    throw new Error(
      r.status === 404 || texto.startsWith('<')
        ? 'La sincronización solo funciona en el sitio desplegado; en local usa `npm run sync`.'
        : `Respuesta inesperada del servidor (${r.status})`,
    );
  }

  if (!r.ok || !cuerpo.ok) throw new Error(cuerpo.error ?? `Error ${r.status}`);
  return cuerpo as { torneos: { torneo: string; partidos: number; resultados: number }[] };
}

/* -----------------------------------------------------------------------
   Lecturas directas del fixture (tablas de lectura pública)
   ----------------------------------------------------------------------- */

/**
 * Datos mínimos para la cabecera de una porra: su nombre y el de la
 * competición. Lo usan Registro y Ayuda, que necesitan el rótulo pero no
 * los cientos de partidos que devuelve boot().
 */
export interface PorraHeader {
  name: string;
  torneo: { name: string; emblem_url: string | null } | null;
}

export async function fetchPorraHeader(slug: string): Promise<PorraHeader | null> {
  const { data, error } = await supabase
    .from('porras')
    .select('name, prize_info, torneos(name, emblem_url)')
    .eq('slug', slug)
    .single();
  if (error || !data) return null;
  const t = data.torneos as unknown as { name: string; emblem_url: string | null } | null;
  return { name: data.name, torneo: t };
}

export async function fetchTorneos(): Promise<Torneo[]> {
  const { data, error } = await supabase
    .from('torneos').select('id, slug, name, kind, emblem_url').order('created_at');
  if (error) throw error;
  return data ?? [];
}

export async function fetchTeams(torneoId: string): Promise<Team[]> {
  const { data, error } = await supabase
    .from('teams').select('id, code, name, short_name, crest_url')
    .eq('torneo_id', torneoId).order('short_name').order('name');
  if (error) throw error;
  return data ?? [];
}

/** Partido del torneo con sus claves foráneas, para la gestión del admin. */
export interface TournamentMatch {
  match_id:     string;
  phase_id:     string;
  group_label:  string | null;
  home_team_id: string | null;
  away_team_id: string | null;
  home_label:   string;
  away_label:   string;
  kickoff:      string | null;
  status:       string;
  home_score:   number | null;
  away_score:   number | null;
}

export async function fetchTournamentMatches(torneoId: string): Promise<TournamentMatch[]> {
  const { data, error } = await supabase
    .from('tournament_matches')
    .select('match_id, phase_id, group_label, home_team_id, away_team_id, home_label, away_label, kickoff, status, home_score, away_score')
    .eq('torneo_id', torneoId)
    .order('order_num').order('kickoff');
  if (error) throw error;
  return data ?? [];
}

export async function fetchPhases(torneoId: string): Promise<TournamentPhase[]> {
  const { data, error } = await supabase
    .from('tournament_phases').select('phase_id, name, short_name, order_num')
    .eq('torneo_id', torneoId).order('order_num');
  if (error) throw error;
  return data ?? [];
}
