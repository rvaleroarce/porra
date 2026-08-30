-- =====================================================================
-- 005 — En las copas, las fases nuevas entran solas
-- =====================================================================
-- Ejecutar en: Supabase Dashboard → SQL Editor → New query → Run
-- Ojo: en el proyecto NUEVO (aqoirzqbvmfycvoxtfeq), no en el del Mundial.
--
-- Las fases de una porra se copiaban al crearla, y la sincronización solo
-- busca partidos dentro de ellas. En una liga da igual: las 38 jornadas se
-- publican de golpe. En una copa no: los playoffs y las eliminatorias
-- aparecen meses después, según avanza el torneo — y sin fase donde caer,
-- sus partidos no tenían por dónde entrar. Una porra de Champions se
-- quedaba con la liguilla para siempre.
--
-- Solo se hace en las copas, y esa distinción no es un apaño: en una liga,
-- si el alcance se recortó a propósito (media temporada, por ejemplo),
-- añadir fases nuevas sería justo lo contrario de lo que se pidió. En una
-- copa no cabe ese recorte, porque la pantalla de creación no ofrece elegir
-- fases: se incluye la competición entera.
--
-- Las fechas límite de las fases nuevas las pone `refresh_phase_deadlines`,
-- que la sincronización ejecuta justo después.
-- =====================================================================

create or replace function sync_porra_matches(p_porra_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_torneo_id uuid;
  v_kind      text;
  v_filtra    boolean;
  v_added     integer;
begin
  select p.torneo_id, t.kind into v_torneo_id, v_kind
  from porras p join torneos t on t.id = p.torneo_id
  where p.id = p_porra_id;
  if not found then
    return json_build_object('ok', false, 'error', 'Porra no encontrada');
  end if;

  -- En copa, la porra adopta las fases que el torneo haya ganado desde que
  -- se creó. Nacen abiertas, como el resto.
  if v_kind = 'cup' then
    insert into porra_phases (porra_id, phase_id, open, order_num)
    select p_porra_id, tp.phase_id, true, tp.order_num
    from tournament_phases tp
    where tp.torneo_id = v_torneo_id
    on conflict (porra_id, phase_id) do nothing;
  end if;

  v_filtra := exists(select 1 from porra_teams where porra_id = p_porra_id);

  insert into porra_matches (porra_id, match_id, phase_id)
  select p_porra_id, tm.match_id, tm.phase_id
  from tournament_matches tm
  join porra_phases pp
    on pp.porra_id = p_porra_id and pp.phase_id = tm.phase_id
  where tm.torneo_id = v_torneo_id
    and (
      not v_filtra
      or tm.home_team_id is null
      or tm.away_team_id is null
      or exists (
        select 1 from porra_teams pt
        where pt.porra_id = p_porra_id
          and pt.team_id in (tm.home_team_id, tm.away_team_id)
      )
    )
  on conflict (porra_id, match_id) do nothing;

  get diagnostics v_added = row_count;

  return json_build_object('ok', true, 'added', v_added);
end;
$$;
