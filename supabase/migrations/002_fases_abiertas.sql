-- =====================================================================
-- 002 — Las fases nacen abiertas
-- =====================================================================
-- Ejecutar en: Supabase Dashboard → SQL Editor → New query → Run
--
-- Hasta ahora las fases se creaban cerradas y había que abrirlas a mano.
-- Con 38 jornadas eso son 38 gestos, y el cierre ya lo hace solo el
-- servidor cuando llega la fecha límite (`now() >= deadline`), que es el
-- kickoff del primer partido de la fase en esa porra.
--
-- El interruptor de AdminFases sigue existiendo, pero pasa a ser para
-- cerrar algo puntual, no para el uso diario.
--
-- Ojo con las fases SIN fecha: no se cierran solas. No depende de que sea
-- liga o copa, sino de que el proveedor haya publicado el horario. En la
-- liga todas las jornadas vienen con fecha; en una copa puede faltar la de
-- una eliminatoria aún sin sortear. AdminFases las marca en rojo.
-- =====================================================================


-- ── create_porra ─────────────────────────────────────────────────────────
create or replace function create_porra(
  p_torneo_id uuid,
  p_name      text,
  p_slug      text,
  p_cuota     numeric default 0,
  p_team_ids  uuid[] default null,
  p_phase_ids text[] default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_porra_id uuid;
begin
  if auth.uid() is null then
    return json_build_object('ok', false, 'error', 'No autorizado');
  end if;

  insert into porras (torneo_id, slug, name, cuota)
  values (p_torneo_id, p_slug, p_name, p_cuota)
  returning id into v_porra_id;

  -- Fases: las indicadas, o todas las del torneo. Abiertas de entrada; se
  -- cerrarán solas al llegar su fecha límite.
  insert into porra_phases (porra_id, phase_id, open, order_num)
  select v_porra_id, tp.phase_id, true, tp.order_num
  from tournament_phases tp
  where tp.torneo_id = p_torneo_id
    and (p_phase_ids is null or tp.phase_id = any(p_phase_ids));

  -- Equipos elegidos (si no se pasan, la porra abarca el torneo entero)
  if p_team_ids is not null and array_length(p_team_ids, 1) > 0 then
    insert into porra_teams (porra_id, team_id)
    select v_porra_id, t.id
    from teams t
    where t.torneo_id = p_torneo_id and t.id = any(p_team_ids);
  end if;

  perform sync_porra_matches(v_porra_id);
  perform refresh_phase_deadlines(v_porra_id);

  return json_build_object('ok', true, 'porra_id', v_porra_id);
end;
$$;


-- ── Porras que ya existían ───────────────────────────────────────────────
-- Se abren solo las fases que nadie ha tocado y que aún no han vencido: no
-- tiene sentido reabrir una jornada ya jugada o ya enviada por alguien.
update porra_phases pp
set open = true
where pp.open = false
  and (pp.deadline is null or pp.deadline > now())
  and not exists (
    select 1 from phase_submissions ps
    where ps.porra_id = pp.porra_id and ps.phase_id = pp.phase_id
  );
