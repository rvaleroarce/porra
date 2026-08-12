-- =====================================================================
-- Función: admin_boot (re-creación)
-- -----------------------------------------------------------------------
-- Añade a cada usuario su lista de fases enviadas (`submissions`), con el
-- phase_id y la fecha real de envío (submitted_at). El panel de admin la
-- usa para mostrar, por participante, si ha enviado la fase activa y cuándo.
-- Cambio seguro: create or replace de una función de solo lectura.
-- =====================================================================

create or replace function admin_boot(p_porra_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return json_build_object('ok', false, 'error', 'No autorizado');
  end if;

  return json_build_object(
    'ok',    true,
    'users', (
      select coalesce(json_agg(
        json_build_object(
          'id',          u.id,
          'name',        u.name,
          'alias',       u.alias,
          'phone',       u.phone,
          'email',       u.email,
          'paid',        u.paid,
          'token',       u.token,
          'created_at',  u.created_at,
          'submissions', (
            select coalesce(json_agg(json_build_object(
              'phase_id',     ps.phase_id,
              'submitted_at', ps.submitted_at
            )), '[]'::json)
            from phase_submissions ps
            where ps.user_id = u.id and ps.porra_id = p_porra_id
          )
        ) order by u.created_at
      ), '[]'::json)
      from users u
      where u.porra_id = p_porra_id
    )
  );
end;
$$;
