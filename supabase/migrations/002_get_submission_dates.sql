-- =====================================================================
-- Función: get_submission_dates
-- -----------------------------------------------------------------------
-- Devuelve las fechas de envío (submitted_at) de cada fase enviada por
-- un participante, identificado por su token. Usada por el resguardo PDF
-- para mostrar la fecha real de envío (fuente de verdad: el servidor).
-- =====================================================================

create or replace function get_submission_dates(p_token text, p_porra_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user users%rowtype;
begin
  select * into v_user from users
  where token = p_token and porra_id = p_porra_id;
  if not found then return '[]'::json; end if;

  return (
    select coalesce(json_agg(json_build_object(
      'phase_id',     ps.phase_id,
      'submitted_at', ps.submitted_at
    )), '[]'::json)
    from phase_submissions ps
    where ps.user_id = v_user.id and ps.porra_id = p_porra_id
  );
end;
$$;
