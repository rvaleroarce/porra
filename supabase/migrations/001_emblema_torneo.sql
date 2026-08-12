-- =====================================================================
-- 001 — Escudo de la competición
-- =====================================================================
-- Ejecutar en: Supabase Dashboard → SQL Editor → New query → Run
--
-- El participante tiene que ver a qué está jugando. Con una sola
-- competición cargada se disimula, pero en cuanto conviven LaLiga y la
-- Champions, "Porra" a secas no dice nada.
--
-- La URL la trae el proveedor (`competition.emblem`); la rellena la
-- sincronización, así que después de aplicar esto hay que lanzar
-- `npm run sync` o el botón "Actualizar" del admin.
-- =====================================================================

alter table torneos
  add column if not exists emblem_url text;


-- boot() pasa a devolver el escudo junto al resto de datos del torneo.
create or replace function boot(p_slug text, p_token text default null)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_porra  porras%rowtype;
  v_torneo torneos%rowtype;
begin
  select * into v_porra from porras where slug = p_slug;
  if not found then
    return json_build_object('ok', false, 'error', 'Porra no encontrada');
  end if;

  select * into v_torneo from torneos where id = v_porra.torneo_id;

  return json_build_object(
    'ok', true,
    'porra', json_build_object(
      'id',         v_porra.id,
      'name',       v_porra.name,
      'exact_pts',  v_porra.exact_pts,
      'sign_pts',   v_porra.sign_pts,
      'miss_pts',   v_porra.miss_pts,
      'cuota',      v_porra.cuota,
      'prize_info', v_porra.prize_info
    ),
    'torneo', json_build_object(
      'id',         v_torneo.id,
      'slug',       v_torneo.slug,
      'name',       v_torneo.name,
      'kind',       v_torneo.kind,
      'emblem_url', v_torneo.emblem_url
    ),
    -- Equipos elegidos: vacío = la porra abarca el torneo entero
    'teams', (
      select coalesce(json_agg(
        json_build_object('id', t.id, 'name', t.name,
                          'short_name', t.short_name, 'crest_url', t.crest_url)
        order by coalesce(t.short_name, t.name)
      ), '[]'::json)
      from porra_teams pt
      join teams t on t.id = pt.team_id
      where pt.porra_id = v_porra.id
    ),
    'phases', (
      select coalesce(json_agg(
        json_build_object(
          'phase_id',   pp.phase_id,
          'name',       tp.name,
          'short_name', tp.short_name,
          'open',       pp.open,
          'deadline',   pp.deadline,
          'order_num',  pp.order_num
        ) order by pp.order_num
      ), '[]'::json)
      from porra_phases pp
      join tournament_phases tp
        on tp.torneo_id = v_porra.torneo_id and tp.phase_id = pp.phase_id
      where pp.porra_id = v_porra.id
    ),
    'matches', (
      select coalesce(json_agg(
        json_build_object(
          'match_id',    tm.match_id,
          'phase_id',    tm.phase_id,
          'group_label', tm.group_label,
          'home',        coalesce(homet.name, nullif(tm.home_label, '')),
          'away',        coalesce(awayt.name, nullif(tm.away_label, '')),
          'home_crest',  homet.crest_url,
          'away_crest',  awayt.crest_url,
          'kickoff',     tm.kickoff,
          'venue',       tm.venue,
          'status',      tm.status,
          'home_score',  tm.home_score,
          'away_score',  tm.away_score
        ) order by tm.order_num, tm.kickoff, tm.match_id
      ), '[]'::json)
      from porra_matches pm
      join tournament_matches tm
        on tm.torneo_id = v_porra.torneo_id and tm.match_id = pm.match_id
      left join teams homet  on homet.id  = tm.home_team_id
      left join teams awayt  on awayt.id  = tm.away_team_id
      where pm.porra_id = v_porra.id
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
              when m.home_score is null or m.away_score is null then 0
              when p.home_score = m.home_score
               and p.away_score = m.away_score
                then v_porra.exact_pts
              when sign(p.home_score::numeric - p.away_score::numeric)
                 = sign(m.home_score::numeric - m.away_score::numeric)
                then v_porra.sign_pts
              else v_porra.miss_pts
            end
          ), 0) as pts,
          count(*) filter (
            where p.home_score is not null and p.away_score is not null
              and m.home_score is not null and m.away_score is not null
              and p.home_score = m.home_score
              and p.away_score = m.away_score
          ) as exact_count,
          count(*) filter (
            where p.home_score is not null and p.away_score is not null
              and m.home_score is not null and m.away_score is not null
              and not (p.home_score = m.home_score and p.away_score = m.away_score)
              and sign(p.home_score::numeric - p.away_score::numeric)
                = sign(m.home_score::numeric - m.away_score::numeric)
          ) as sign_count
        from users u
        join predictions p
          on p.user_id = u.id and p.porra_id = v_porra.id
        join porra_phases pp
          on pp.porra_id = p.porra_id and pp.phase_id = p.phase_id
        left join tournament_matches m
          on m.torneo_id = v_porra.torneo_id
         and m.match_id  = p.match_id
         and m.home_score is not null
         and m.away_score is not null
        where u.porra_id = v_porra.id
          and (v_porra.cuota = 0 or u.paid = true)
          and (
            pp.open = false
            or (pp.deadline is not null and now() >= pp.deadline)
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
