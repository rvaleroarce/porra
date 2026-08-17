-- =====================================================================
-- 004 — Ver los pronósticos de todos
-- =====================================================================
-- Ejecutar en: Supabase Dashboard → SQL Editor → New query → Run
-- Ojo: en el proyecto NUEVO (aqoirzqbvmfycvoxtfeq), no en el del Mundial.
--
-- Devuelve lo que pronosticó cada participante en una fase, pero solo
-- cuando esa fase ya está cerrada — es decir, cuando nadie puede cambiar
-- nada. Antes de eso responde `revealed: false` y ni un solo marcador.
--
-- La comprobación vive aquí y no en la pantalla porque la clave pública
-- de la app permite llamar a esta función desde la consola del navegador:
-- si la regla estuviera en el cliente, sería decorativa.
--
-- Aparecen los mismos que en la clasificación (los que han pagado, o
-- todos si la porra es gratis), para no tener dos criterios distintos.
-- =====================================================================

create or replace function phase_predictions(p_slug text, p_phase_id text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_porra porras%rowtype;
  v_phase porra_phases%rowtype;
begin
  select * into v_porra from porras where slug = p_slug;
  if not found then
    return json_build_object('ok', false, 'error', 'Porra no encontrada');
  end if;

  select * into v_phase from porra_phases
  where porra_id = v_porra.id and phase_id = p_phase_id;
  if not found then
    return json_build_object('ok', false, 'error', 'Fase no encontrada');
  end if;

  -- Sigue viva: abierta y sin vencer. No se enseña nada.
  if v_phase.open and (v_phase.deadline is null or now() < v_phase.deadline) then
    return json_build_object('ok', true, 'revealed', false, 'matches', '[]'::json);
  end if;

  return json_build_object(
    'ok', true,
    'revealed', true,
    'matches', (
      select coalesce(json_agg(
        json_build_object(
          'match_id',   tm.match_id,
          'home',       coalesce(homet.name, nullif(tm.home_label, '')),
          'away',       coalesce(awayt.name, nullif(tm.away_label, '')),
          'home_crest', homet.crest_url,
          'away_crest', awayt.crest_url,
          'kickoff',    tm.kickoff,
          'home_score', tm.home_score,
          'away_score', tm.away_score,
          'preds', (
            select coalesce(json_agg(
              json_build_object(
                'user_id', u.id,
                'name',    coalesce(nullif(trim(coalesce(u.alias, '')), ''), u.name),
                'home',    p.home_score,
                'away',    p.away_score
              ) order by coalesce(nullif(trim(coalesce(u.alias, '')), ''), u.name)
            ), '[]'::json)
            from predictions p
            join users u on u.id = p.user_id
            where p.porra_id   = v_porra.id
              and p.match_id   = tm.match_id
              and p.home_score is not null
              and p.away_score is not null
              -- Mismo criterio que la clasificación
              and (v_porra.cuota = 0 or u.paid = true)
          )
        ) order by tm.order_num, tm.kickoff, tm.match_id
      ), '[]'::json)
      from porra_matches pm
      join tournament_matches tm
        on tm.torneo_id = v_porra.torneo_id and tm.match_id = pm.match_id
      left join teams homet on homet.id = tm.home_team_id
      left join teams awayt on awayt.id = tm.away_team_id
      where pm.porra_id = v_porra.id
        and pm.phase_id = p_phase_id
    )
  );
end;
$$;

-- Los privilegios del esquema se concedieron sobre las funciones que
-- existían entonces: una función nueva necesita el suyo.
grant execute on function phase_predictions(text, text) to anon, authenticated, service_role;
