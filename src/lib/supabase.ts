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

/* Boot — respuesta de la función `boot(slug, token?)` */
export interface BootResponse {
  ok: true;
  porra: {
    id: string;
    name: string;
    tipo: string;
    exact_pts: number;
    sign_pts: number;
    miss_pts: number;
  };
  phases: {
    phase_id: string;
    open: boolean;
    deadline: string | null;
    order_num: number;
  }[];
  bracket: {
    phase_id: string;
    match_id: string;
    home: string;
    away: string;
  }[];
  results: {
    match_id: string;
    home_score: number | null;
    away_score: number | null;
  }[];
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

export async function rpcSetBracket(params: {
  torneoId: string; phaseId: string; matchId: string; home: string; away: string;
}) {
  const { data, error } = await supabase.rpc('set_bracket', {
    p_torneo_id: params.torneoId,
    p_phase_id: params.phaseId,
    p_match_id: params.matchId,
    p_home: params.home,
    p_away: params.away,
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

export async function rpcCreatePorra(params: {
  torneoId: string;
  name: string;
  slug: string;
  tipo: string;
  matches: { match_id: string; phase_id: string }[];
  phases: { phase_id: string; order_num: number }[];
}) {
  const { data, error } = await supabase.rpc('create_porra', {
    p_torneo_id: params.torneoId,
    p_name: params.name,
    p_slug: params.slug,
    p_tipo: params.tipo,
    p_matches: params.matches,
    p_phases: params.phases,
  });
  if (error) throw error;
  return data as RpcResult<{ porra_id: string }>;
}
