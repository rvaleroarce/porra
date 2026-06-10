-- =====================================================================
-- 004 — Cuota configurable + puntuación por fase enviada/bloqueada
-- ---------------------------------------------------------------------
-- Bloque 1: nueva columna porras.cuota
--   null = de pago como hasta ahora (las porras existentes no cambian)
--   0    = gratis (la app oculta todo lo de pagos)
--   >0   = de pago, con importe mostrable
-- Bloque 2: boot recalcula la clasificación:
--   - una predicción solo cuenta si su fase cuenta para el usuario
--     (la envió, o la fase está bloqueada: apagada o con fecha vencida)
--   - el pago solo se exige si la porra no es gratis
-- Cambios seguros: columna aditiva + funciones de solo lectura. No toca
-- match_id ni borra filas. (El drop es de una FUNCIÓN, no de una tabla.)
-- Ejecutar en: Supabase Dashboard -> SQL Editor -> New query -> Run
-- =====================================================================

-- ── 1. Columna cuota ───────────────────────────────────────────────────
alter table porras add column if not exists cuota numeric;

-- ── 2. boot (re-creación con cuota + nueva clasificación) ───────────────
create or replace function boot(p_slug text, p_token text default null)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_porra porras%rowtype;
begin
  select * into v_porra from porras where slug = p_slug;
  if not found then
    return json_build_object('ok', false, 'error', 'Porra no encontrada');
  end if;

  return json_build_object(
    'ok', true,
    'porra', json_build_object(
      'id',        v_porra.id,
      'name',      v_porra.name,
      'tipo',      v_porra.tipo,
      'exact_pts', v_porra.exact_pts,
      'sign_pts',  v_porra.sign_pts,
      'miss_pts',  v_porra.miss_pts,
      'cuota',     v_porra.cuota
    ),
    'phases', (
      select coalesce(json_agg(
        json_build_object(
          'phase_id',  pp.phase_id,
          'open',      pp.open,
          'deadline',  pp.deadline,
          'order_num', pp.order_num
        ) order by pp.order_num
      ), '[]'::json)
      from porra_phases pp
      where pp.porra_id = v_porra.id
    ),
    'bracket', (
      select coalesce(json_agg(
        json_build_object(
          'phase_id', bt.phase_id,
          'match_id', bt.match_id,
          'home',     bt.home,
          'away',     bt.away
        )
      ), '[]'::json)
      from bracket_teams bt
      where bt.torneo_id = v_porra.torneo_id
    ),
    'results', (
      select coalesce(json_agg(
        json_build_object(
          'match_id',   r.match_id,
          'home_score', r.home_score,
          'away_score', r.away_score
        )
      ), '[]'::json)
      from results r
      join porra_matches pm on pm.match_id = r.match_id and pm.porra_id = v_porra.id
      where r.torneo_id = v_porra.torneo_id
    ),
    'standings', (
      select coalesce(json_agg(
        json_build_object(
          'id',    s.id,
          'name',  s.display_name,
          'pts',   s.pts,
          'exact', s.exact_count,
          'sign',  s.sign_count
        ) order by s.pts desc, s.exact_count desc
      ), '[]'::json)
      from (
        select
          u.id,
          coalesce(nullif(trim(coalesce(u.alias, '')), ''), u.name) as display_name,
          coalesce(sum(
            case
              when p.home_score is null or p.away_score is null then 0
              when r.home_score is null or r.away_score is null then 0
              when p.home_score = r.home_score
               and p.away_score = r.away_score
                then v_porra.exact_pts
              when sign(p.home_score::numeric - p.away_score::numeric)
                 = sign(r.home_score::numeric - r.away_score::numeric)
                then v_porra.sign_pts
              else v_porra.miss_pts
            end
          ), 0) as pts,
          count(*) filter (
            where p.home_score is not null and p.away_score is not null
              and r.home_score is not null and r.away_score is not null
              and p.home_score = r.home_score
              and p.away_score = r.away_score
          ) as exact_count,
          count(*) filter (
            where p.home_score is not null and p.away_score is not null
              and r.home_score is not null and r.away_score is not null
              and not (p.home_score = r.home_score and p.away_score = r.away_score)
              and sign(p.home_score::numeric - p.away_score::numeric)
                = sign(r.home_score::numeric - r.away_score::numeric)
          ) as sign_count
        from users u
        join predictions p
          on p.user_id = u.id and p.porra_id = v_porra.id
        join porra_phases pp
          on pp.porra_id = p.porra_id and pp.phase_id = p.phase_id
        left join results r
          on r.match_id = p.match_id
         and r.torneo_id = v_porra.torneo_id
         and r.home_score is not null
         and r.away_score is not null
        where u.porra_id = v_porra.id
          -- Pago: obligatorio salvo en porras gratis (cuota = 0)
          and (v_porra.cuota = 0 or u.paid = true)
          -- La fase debe contar para el usuario: enviada, o bloqueada (apagada / fecha vencida)
          and (
            pp.open = false
            or (pp.deadline is not null and current_date > pp.deadline)
            or exists (
              select 1 from phase_submissions ps
              where ps.user_id = u.id and ps.porra_id = p.porra_id
                and ps.phase_id = p.phase_id
            )
          )
        group by u.id, u.alias, u.name
      ) s
    ),
    'me', (
      case when p_token is null then null::json
      else (
        select json_build_object(
          'user', json_build_object(
            'id',    u.id,
            'name',  u.name,
            'alias', u.alias,
            'paid',  u.paid
          ),
          'preds', (
            select coalesce(json_agg(
              json_build_object(
                'match_id',   p.match_id,
                'phase_id',   p.phase_id,
                'home_score', p.home_score,
                'away_score', p.away_score
              )
            ), '[]'::json)
            from predictions p
            where p.user_id = u.id and p.porra_id = v_porra.id
          ),
          'submitted', (
            select coalesce(json_agg(ps.phase_id), '[]'::json)
            from phase_submissions ps
            where ps.user_id = u.id and ps.porra_id = v_porra.id
          )
        )
        from users u
        where u.token = p_token and u.porra_id = v_porra.id
      )
      end
    )
  );
end;
$$;

-- ── 3. create_porra (drop + recreate con p_cuota) ──────────────────────
-- Drop necesario: añadir un parámetro cambia la firma y, sin el drop,
-- quedarían dos versiones y la llamada con argumentos nombrados sería ambigua.
drop function if exists create_porra(uuid, text, text, text, jsonb, jsonb);

create or replace function create_porra(
  p_torneo_id uuid,
  p_name      text,
  p_slug      text,
  p_tipo      text,
  p_matches   jsonb,
  p_phases    jsonb,
  p_cuota     numeric default 0
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_porra_id uuid;
  v_item     jsonb;
begin
  if auth.uid() is null then
    return json_build_object('ok', false, 'error', 'No autorizado');
  end if;

  insert into porras (torneo_id, slug, name, tipo, cuota)
  values (p_torneo_id, p_slug, p_name, p_tipo, p_cuota)
  returning id into v_porra_id;

  -- Materializar partidos del ámbito
  for v_item in select * from jsonb_array_elements(p_matches)
  loop
    insert into porra_matches (porra_id, match_id, phase_id)
    values (v_porra_id, v_item->>'match_id', v_item->>'phase_id');
  end loop;

  -- Crear fases de la porra
  for v_item in select * from jsonb_array_elements(p_phases)
  loop
    insert into porra_phases (porra_id, phase_id, order_num)
    values (v_porra_id, v_item->>'phase_id', (v_item->>'order_num')::integer);
  end loop;

  return json_build_object('ok', true, 'porra_id', v_porra_id);
end;
$$;
