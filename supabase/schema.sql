-- =====================================================================
-- Porra — Esquema completo v2 (multi-torneo)
-- =====================================================================
-- Ejecutar en: Supabase Dashboard → SQL Editor → New query → Run
-- Después, seed.sql.
--
-- Diferencia clave con v1: el fixture (equipos, partidos, fases) vivía en
-- código (src/lib/fixture.ts) y solo valía para el Mundial 2026. Ahora vive
-- aquí, así que la app sirve para cualquier competición —liga, copa— y los
-- resultados los puede rellenar un cron desde una API externa.
--
-- Dos niveles, igual que en v1:
--   · TORNEO — verdad objetiva: equipos, partidos, resultados reales.
--   · PORRA  — competición sobre un torneo: qué partidos, qué reglas, quién
--              juega, qué pronostican y cómo van. N porras por torneo.
-- =====================================================================


-- -----------------------------------------------------------------------
-- 1. TABLAS — TORNEO
-- -----------------------------------------------------------------------

create table torneos (
  id            uuid primary key default gen_random_uuid(),
  slug          text unique not null,   -- 'laliga-2026-27', 'mundial-2026'
  name          text not null,
  kind          text not null default 'cup' check (kind in ('cup', 'league')),
  provider      text,                   -- 'football-data'; null = fixture cargado a mano
  provider_code text,                   -- código de competición del proveedor: 'PD', 'CL'
  season        text,                   -- '2026-27'
  emblem_url    text,                   -- escudo de la competición (lo trae el proveedor)
  created_at    timestamptz default now()
);

-- `code` es el identificador estable del equipo dentro del torneo: el id del
-- proveedor ('86') o uno propio si se carga a mano ('ESP'). Es por donde el
-- cron reencuentra al equipo sin depender del nombre, que puede cambiar.
create table teams (
  id         uuid primary key default gen_random_uuid(),
  torneo_id  uuid not null references torneos(id) on delete cascade,
  code       text not null,
  name       text not null,
  short_name text,
  crest_url  text,                      -- escudo; en copas de selecciones, emoji de bandera
  unique (torneo_id, code)
);

-- Fases del torneo. `phase_id` es la clave de texto que referencian
-- porra_phases y predictions: 'GROUPS', 'R32'… en copa; 'J1'…'J38' en liga.
create table tournament_phases (
  torneo_id  uuid not null references torneos(id) on delete cascade,
  phase_id   text not null,
  name       text not null,             -- 'Fase de grupos', 'Jornada 1'
  short_name text not null,             -- 'Grupos', 'J1'  (selector del participante)
  order_num  integer not null default 0,
  primary key (torneo_id, phase_id)
);

-- Partidos del torneo, con su resultado real.
--
-- Equipos: `home_team_id` manda cuando se conoce. Mientras no se conoce
-- —cruce pendiente de sorteo o de clasificación— se enseña `home_label`
-- ('1º A', 'Gan. Octavos 1'). La FK es lo que permite filtrar por equipo;
-- la etiqueta es lo que permite pronosticar antes de saber quién juega.
create table tournament_matches (
  torneo_id    uuid not null references torneos(id) on delete cascade,
  match_id     text not null,           -- estable: id del proveedor o del fixture
  phase_id     text not null,
  group_label  text,                    -- 'A'..'L' en copas; null en liga
  home_team_id uuid references teams(id) on delete set null,
  away_team_id uuid references teams(id) on delete set null,
  home_label   text not null default '',
  away_label   text not null default '',
  kickoff      timestamptz,
  venue        text,
  status       text not null default 'scheduled'
               check (status in ('scheduled', 'live', 'finished', 'postponed', 'cancelled')),
  home_score   integer,
  away_score   integer,
  order_num    integer not null default 0,
  updated_at   timestamptz default now(),
  primary key (torneo_id, match_id)
);


-- -----------------------------------------------------------------------
-- 2. TABLAS — PORRA
-- -----------------------------------------------------------------------

create table porras (
  id          uuid primary key default gen_random_uuid(),
  torneo_id   uuid not null references torneos(id) on delete cascade,
  slug        text unique not null,     -- 'porra-del-bar' → /p/porra-del-bar
  name        text not null,
  exact_pts   integer not null default 3,
  sign_pts    integer not null default 1,
  miss_pts    integer not null default 0,
  cuota       numeric,                  -- null = de pago sin importe fijado; 0 = gratis; >0 = importe
  prize_info  text,
  created_at  timestamptz default now()
);

-- Equipos elegidos al crear la porra. Sin filas = la porra abarca el torneo
-- entero. Con filas, la regla de ámbito (ver create_porra) es: entra el
-- partido si juega alguno de los elegidos, o si aún no se sabe quién lo juega.
create table porra_teams (
  porra_id uuid not null references porras(id) on delete cascade,
  team_id  uuid not null references teams(id) on delete cascade,
  primary key (porra_id, team_id)
);

-- Ámbito materializado: qué partidos cuentan en esta porra. Se calcula al
-- crearla y se puede recalcular después (resync) si el fixture cambia.
create table porra_matches (
  porra_id uuid not null references porras(id) on delete cascade,
  match_id text not null,
  phase_id text not null,
  primary key (porra_id, match_id)
);

-- Estado de las fases por porra: cada porra lleva sus propios plazos.
--
-- `deadline` se calcula solo: el kickoff más temprano de los partidos que
-- esta porra tiene en esa fase. Si el admin la fija a mano, `deadline_manual`
-- se pone a true y el recálculo automático deja de tocarla.
create table porra_phases (
  porra_id        uuid not null references porras(id) on delete cascade,
  phase_id        text not null,
  open            boolean not null default false,
  deadline        timestamptz,
  deadline_manual boolean not null default false,
  order_num       integer not null default 0,
  primary key (porra_id, phase_id)
);


-- -----------------------------------------------------------------------
-- 3. TABLAS — PARTICIPANTES
-- -----------------------------------------------------------------------

-- No son auth.users: se identifican con un token no adivinable en la URL.
create table users (
  id         uuid primary key default gen_random_uuid(),
  porra_id   uuid not null references porras(id) on delete cascade,
  name       text not null,
  phone      text not null,
  email      text,                      -- opcional, para recuperar el enlace
  alias      text,                      -- nombre en la clasificación
  paid       boolean not null default false,
  token      text unique not null,
  created_at timestamptz default now()
);

create table predictions (
  id         uuid primary key default gen_random_uuid(),
  porra_id   uuid not null references porras(id) on delete cascade,
  user_id    uuid not null references users(id) on delete cascade,
  match_id   text not null,
  phase_id   text not null,
  home_score integer,
  away_score integer,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (porra_id, user_id, match_id)
);

-- Fases enviadas: una fila aquí congela esa fase para ese participante.
create table phase_submissions (
  porra_id     uuid not null references porras(id) on delete cascade,
  user_id      uuid not null references users(id) on delete cascade,
  phase_id     text not null,
  submitted_at timestamptz default now(),
  primary key (porra_id, user_id, phase_id)
);


-- -----------------------------------------------------------------------
-- 4. ÍNDICES
-- -----------------------------------------------------------------------

create index on teams              (torneo_id);
create index on tournament_phases  (torneo_id, order_num);
create index on tournament_matches (torneo_id, phase_id);
create index on tournament_matches (torneo_id, kickoff);
create index on tournament_matches (home_team_id);
create index on tournament_matches (away_team_id);
create index on porra_teams        (porra_id);
create index on porra_matches      (porra_id, phase_id);
create index on predictions        (user_id, porra_id);
create index on predictions        (porra_id, match_id);
create index on phase_submissions  (user_id, porra_id);
create index on users              (porra_id);
create index on users              (token);


-- -----------------------------------------------------------------------
-- 5. ROW LEVEL SECURITY
-- -----------------------------------------------------------------------
-- El fixture y el estado de las porras son públicos: los tiene que leer
-- cualquier participante sin sesión. Los datos personales (users) y los
-- pronósticos, no: se acceden solo por RPC security definer.
--
-- Admin = sesión de Supabase Auth. Los signups están DESACTIVADOS en el
-- dashboard; sin eso, cualquier email entraría como admin.

alter table torneos            enable row level security;
alter table teams              enable row level security;
alter table tournament_phases  enable row level security;
alter table tournament_matches enable row level security;
alter table porras             enable row level security;
alter table porra_teams        enable row level security;
alter table porra_matches      enable row level security;
alter table porra_phases       enable row level security;
alter table users              enable row level security;
alter table predictions        enable row level security;
alter table phase_submissions  enable row level security;

create policy "public read" on torneos            for select using (true);
create policy "public read" on teams              for select using (true);
create policy "public read" on tournament_phases  for select using (true);
create policy "public read" on tournament_matches for select using (true);
create policy "public read" on porras             for select using (true);
create policy "public read" on porra_teams        for select using (true);
create policy "public read" on porra_matches      for select using (true);
create policy "public read" on porra_phases       for select using (true);

create policy "admin write" on torneos            for all using (auth.role() = 'authenticated');
create policy "admin write" on teams              for all using (auth.role() = 'authenticated');
create policy "admin write" on tournament_phases  for all using (auth.role() = 'authenticated');
create policy "admin write" on tournament_matches for all using (auth.role() = 'authenticated');
create policy "admin write" on porras             for all using (auth.role() = 'authenticated');
create policy "admin write" on porra_teams        for all using (auth.role() = 'authenticated');
create policy "admin write" on porra_matches      for all using (auth.role() = 'authenticated');
create policy "admin write" on porra_phases       for all using (auth.role() = 'authenticated');

create policy "admin only" on users             for all using (auth.role() = 'authenticated');
create policy "admin only" on predictions       for all using (auth.role() = 'authenticated');
create policy "admin only" on phase_submissions for all using (auth.role() = 'authenticated');


-- -----------------------------------------------------------------------
-- 5b. PRIVILEGIOS
-- -----------------------------------------------------------------------
-- RLS decide qué filas se ven, pero no da acceso a la tabla. Sin GRANT,
-- PostgREST responde "permission denied" sin llegar a mirar las políticas.
-- No basta con confiar en los privilegios por defecto de Supabase: en los
-- proyectos nuevos ya no alcanzan.

grant usage on schema public to anon, authenticated, service_role;

-- Lectura pública: el fixture y el estado de las porras. `users`,
-- `predictions` y `phase_submissions` quedan fuera a propósito — el
-- participante llega a lo suyo por RPC, nunca leyendo la tabla.
grant select on torneos, teams, tournament_phases, tournament_matches,
                porras, porra_teams, porra_matches, porra_phases
  to anon, authenticated;

-- El admin escribe todo; las políticas "admin write" son las que lo acotan.
grant select, insert, update, delete on all tables in schema public
  to authenticated;

-- El rol de servicio es el de los procesos de servidor (la sincronización
-- con la API, el cron de resultados). Se salta las políticas RLS por
-- diseño, pero los privilegios de tabla los necesita igual.
grant all on all tables in schema public to service_role;

-- Las RPC de participante son security definer: se ejecutan con permisos
-- del propietario, así que al anónimo solo le hace falta poder llamarlas.
grant execute on all functions in schema public
  to anon, authenticated, service_role;


-- -----------------------------------------------------------------------
-- 6. FUNCIONES RPC — PARTICIPANTES
-- (security definer: se ejecutan con permisos del propietario, bypass RLS)
-- -----------------------------------------------------------------------

-- ── boot ────────────────────────────────────────────────────────────────
-- Carga inicial en una sola llamada: torneo, fases, partidos con equipos y
-- resultados, clasificación y —si se pasa token— los datos del participante.
--
-- En v1 el cliente completaba esto con fixture.ts. Ahora viene todo de aquí:
-- los partidos ya llegan con el equipo resuelto o con su etiqueta provisional.
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
    -- Partidos del ámbito de la porra, ya renderizables: `home` es el nombre
    -- del equipo si se conoce, y si no la etiqueta del cruce.
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
          -- Pago: obligatorio salvo en porras gratis (cuota = 0)
          and (v_porra.cuota = 0 or u.paid = true)
          -- La fase debe contar: enviada, o ya bloqueada (cerrada / vencida)
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


-- ── register_participant ─────────────────────────────────────────────────
-- Alta de participante. Guard anti-duplicados: si el móvil ya existe en la
-- porra devuelve error 'duplicate' con un hint para el cliente.
create or replace function register_participant(
  p_porra_slug text,
  p_name       text,
  p_phone      text,
  p_alias      text default null,
  p_email      text default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_porra porras%rowtype;
  v_token text;
  v_uid   uuid;
  v_phone text;
  v_name  text;
  v_alias text;
begin
  select * into v_porra from porras where slug = p_porra_slug;
  if not found then
    return json_build_object('ok', false, 'error', 'Porra no encontrada');
  end if;

  -- Normalizar teléfono: solo dígitos
  v_phone := regexp_replace(p_phone, '\D', '', 'g');
  if length(v_phone) < 9 then
    return json_build_object('ok', false, 'error', 'Móvil no válido (mínimo 9 dígitos)');
  end if;

  if exists(select 1 from users where porra_id = v_porra.id and phone = v_phone) then
    return json_build_object(
      'ok',   false,
      'error','duplicate',
      'hint', '¿Ya estás apuntado? Puede que hayas perdido tu enlace personal. Pide al organizador que te lo reenvíe.'
    );
  end if;

  v_name := trim(p_name);
  if v_name = '' then
    return json_build_object('ok', false, 'error', 'Falta el nombre');
  end if;

  v_alias := nullif(trim(coalesce(p_alias, '')), '');
  -- Token: UUID sin guiones = 32 hex chars (no requiere pgcrypto)
  v_token := replace(gen_random_uuid()::text, '-', '');

  insert into users (porra_id, name, phone, email, alias, token)
  values (v_porra.id, v_name, v_phone, p_email, v_alias, v_token)
  returning id into v_uid;

  return json_build_object(
    'ok',    true,
    'token', v_token,
    'user',  json_build_object('id', v_uid, 'name', v_name, 'alias', v_alias, 'paid', false)
  );
end;
$$;


-- ── upsert_predictions ───────────────────────────────────────────────────
-- Guarda (sin enviar) los pronósticos de un participante.
-- Valida en servidor: fase abierta, no enviada, no vencida, partido en ámbito.
create or replace function upsert_predictions(
  p_token    text,
  p_porra_id uuid,
  p_phase_id text,
  p_preds    jsonb   -- [{ match_id, home_score, away_score }]
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user  users%rowtype;
  v_phase porra_phases%rowtype;
  v_pred  jsonb;
begin
  select * into v_user from users
  where token = p_token and porra_id = p_porra_id;
  if not found then
    return json_build_object('ok', false, 'error', 'Token no válido');
  end if;

  select * into v_phase from porra_phases
  where porra_id = p_porra_id and phase_id = p_phase_id;
  if not found or not v_phase.open then
    return json_build_object('ok', false, 'error', 'Fase no disponible');
  end if;

  if v_phase.deadline is not null and now() >= v_phase.deadline then
    return json_build_object('ok', false, 'error', 'Fecha límite superada');
  end if;

  if exists(
    select 1 from phase_submissions
    where user_id = v_user.id and porra_id = p_porra_id and phase_id = p_phase_id
  ) then
    return json_build_object('ok', false, 'error', 'Fase ya enviada y bloqueada');
  end if;

  for v_pred in select * from jsonb_array_elements(p_preds)
  loop
    -- Solo partidos dentro del ámbito de esta porra
    continue when not exists(
      select 1 from porra_matches
      where porra_id = p_porra_id and match_id = v_pred->>'match_id'
    );

    insert into predictions
      (porra_id, user_id, match_id, phase_id, home_score, away_score, updated_at)
    values (
      p_porra_id,
      v_user.id,
      v_pred->>'match_id',
      p_phase_id,
      (v_pred->>'home_score')::integer,
      (v_pred->>'away_score')::integer,
      now()
    )
    on conflict (porra_id, user_id, match_id) do update
      set home_score = excluded.home_score,
          away_score = excluded.away_score,
          updated_at = now();
  end loop;

  return json_build_object('ok', true);
end;
$$;


-- ── submit_phase ─────────────────────────────────────────────────────────
-- Envía y bloquea una fase. Opcionalmente guarda pronósticos antes.
-- Idempotente: si ya está enviada, devuelve ok sin error.
create or replace function submit_phase(
  p_token    text,
  p_porra_id uuid,
  p_phase_id text,
  p_preds    jsonb default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user  users%rowtype;
  v_phase porra_phases%rowtype;
  v_save  json;
begin
  select * into v_user from users
  where token = p_token and porra_id = p_porra_id;
  if not found then
    return json_build_object('ok', false, 'error', 'Token no válido');
  end if;

  select * into v_phase from porra_phases
  where porra_id = p_porra_id and phase_id = p_phase_id;
  if not found or not v_phase.open then
    return json_build_object('ok', false, 'error', 'Fase no disponible');
  end if;

  if v_phase.deadline is not null and now() >= v_phase.deadline then
    return json_build_object('ok', false, 'error', 'Fecha límite superada');
  end if;

  if exists(
    select 1 from phase_submissions
    where user_id = v_user.id and porra_id = p_porra_id and phase_id = p_phase_id
  ) then
    return json_build_object('ok', true);
  end if;

  if p_preds is not null then
    v_save := upsert_predictions(p_token, p_porra_id, p_phase_id, p_preds);
    if not (v_save->>'ok')::boolean then
      return v_save;
    end if;
  end if;

  insert into phase_submissions (porra_id, user_id, phase_id)
  values (p_porra_id, v_user.id, p_phase_id);

  return json_build_object('ok', true);
end;
$$;


-- ── get_submission_dates ─────────────────────────────────────────────────
-- Fechas de envío reales (fuente de verdad: el servidor) para el resguardo PDF.
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


-- -----------------------------------------------------------------------
-- 7. FUNCIONES RPC — ADMIN
-- (requieren sesión Supabase Auth: auth.uid() not null)
-- -----------------------------------------------------------------------

-- ── admin_boot ───────────────────────────────────────────────────────────
-- Estado de la porra incluyendo datos sensibles (teléfonos, tokens).
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
    'ok', true,
    'users', (
      select coalesce(json_agg(
        json_build_object(
          'id',         u.id,
          'name',       u.name,
          'alias',      u.alias,
          'phone',      u.phone,
          'email',      u.email,
          'paid',       u.paid,
          'token',      u.token,
          'created_at', u.created_at,
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


-- ── set_result ───────────────────────────────────────────────────────────
-- El marcador real vive en el propio partido del torneo, así que vale para
-- todas las porras de ese torneo a la vez.
create or replace function set_result(
  p_torneo_id  uuid,
  p_match_id   text,
  p_home_score integer,
  p_away_score integer
)
returns json
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return json_build_object('ok', false, 'error', 'No autorizado');
  end if;

  update tournament_matches
  set home_score = p_home_score,
      away_score = p_away_score,
      status     = case
                     when p_home_score is null or p_away_score is null then status
                     else 'finished'
                   end,
      updated_at = now()
  where torneo_id = p_torneo_id and match_id = p_match_id;

  if not found then
    return json_build_object('ok', false, 'error', 'Partido no encontrado');
  end if;

  return json_build_object('ok', true);
end;
$$;


-- ── set_match_teams ──────────────────────────────────────────────────────
-- Resuelve un cruce de eliminatoria: asigna equipos reales al partido.
-- Sustituye a set_bracket de v1; ahora son FK, no texto.
create or replace function set_match_teams(
  p_torneo_id uuid,
  p_match_id  text,
  p_home_team uuid,
  p_away_team uuid
)
returns json
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return json_build_object('ok', false, 'error', 'No autorizado');
  end if;

  update tournament_matches
  set home_team_id = p_home_team,
      away_team_id = p_away_team,
      updated_at   = now()
  where torneo_id = p_torneo_id and match_id = p_match_id;

  if not found then
    return json_build_object('ok', false, 'error', 'Partido no encontrado');
  end if;

  return json_build_object('ok', true);
end;
$$;


-- ── set_phase_state ──────────────────────────────────────────────────────
-- Abrir/cerrar una fase. Si se pasa fecha límite se marca como manual, para
-- que el recálculo automático no la pise después.
create or replace function set_phase_state(
  p_porra_id uuid,
  p_phase_id text,
  p_open     boolean,
  p_deadline timestamptz default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return json_build_object('ok', false, 'error', 'No autorizado');
  end if;

  update porra_phases
  set open            = p_open,
      deadline        = coalesce(p_deadline, deadline),
      deadline_manual = deadline_manual or (p_deadline is not null)
  where porra_id = p_porra_id and phase_id = p_phase_id;

  if not found then
    return json_build_object('ok', false, 'error', 'Fase no encontrada');
  end if;

  return json_build_object('ok', true);
end;
$$;


-- ── set_rules ────────────────────────────────────────────────────────────
create or replace function set_rules(
  p_porra_id uuid,
  p_exact    integer,
  p_sign     integer,
  p_miss     integer
)
returns json
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return json_build_object('ok', false, 'error', 'No autorizado');
  end if;

  update porras
  set exact_pts = p_exact, sign_pts = p_sign, miss_pts = p_miss
  where id = p_porra_id;

  return json_build_object('ok', true);
end;
$$;


-- ── set_paid ─────────────────────────────────────────────────────────────
create or replace function set_paid(p_user_id uuid, p_paid boolean)
returns json
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return json_build_object('ok', false, 'error', 'No autorizado');
  end if;

  update users set paid = p_paid where id = p_user_id;
  if not found then
    return json_build_object('ok', false, 'error', 'Usuario no encontrado');
  end if;

  return json_build_object('ok', true);
end;
$$;


-- ── delete_participant ───────────────────────────────────────────────────
create or replace function delete_participant(p_user_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return json_build_object('ok', false, 'error', 'No autorizado');
  end if;

  delete from users where id = p_user_id;
  if not found then
    return json_build_object('ok', false, 'error', 'Usuario no encontrado');
  end if;

  return json_build_object('ok', true);
end;
$$;


-- ── sync_porra_matches ───────────────────────────────────────────────────
-- Calcula (o recalcula) el ámbito de la porra aplicando la regla:
--
--   entra el partido si juega alguno de los equipos elegidos,
--   o si todavía no se sabe quién lo juega (cruce sin resolver).
--
-- Sin equipos en porra_teams, entran todos los partidos de las fases de la
-- porra. Es idempotente, así que sirve tanto al crear como para resincronizar
-- cuando el fixture cambia (partidos aplazados, cruces que se resuelven).
--
-- No borra partidos que ya salieron del ámbito si alguien los pronosticó:
-- quitarlos huerfanaría pronósticos ya emitidos.
create or replace function sync_porra_matches(p_porra_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_torneo_id uuid;
  v_filtra    boolean;
  v_added     integer;
begin
  select torneo_id into v_torneo_id from porras where id = p_porra_id;
  if not found then
    return json_build_object('ok', false, 'error', 'Porra no encontrada');
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


-- ── refresh_phase_deadlines ──────────────────────────────────────────────
-- Recalcula la fecha límite de cada fase: el kickoff más temprano de los
-- partidos que ESA porra tiene en la fase (no los del torneo entero — si tus
-- equipos juegan el domingo, no tienes por qué cerrar el viernes).
-- Respeta las fases con fecha puesta a mano.
create or replace function refresh_phase_deadlines(p_porra_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_torneo_id uuid;
begin
  select torneo_id into v_torneo_id from porras where id = p_porra_id;
  if not found then
    return json_build_object('ok', false, 'error', 'Porra no encontrada');
  end if;

  update porra_phases pp
  set deadline = sub.first_kickoff
  from (
    select pm.phase_id, min(tm.kickoff) as first_kickoff
    from porra_matches pm
    join tournament_matches tm
      on tm.torneo_id = v_torneo_id and tm.match_id = pm.match_id
    where pm.porra_id = p_porra_id
      and tm.status <> 'postponed'
    group by pm.phase_id
  ) sub
  where pp.porra_id = p_porra_id
    and pp.phase_id = sub.phase_id
    and pp.deadline_manual = false;

  return json_build_object('ok', true);
end;
$$;


-- ── create_porra ─────────────────────────────────────────────────────────
-- Crea la porra y materializa su ámbito en una transacción.
--
-- A diferencia de v1, el cliente ya no envía la lista de partidos: manda qué
-- fases y qué equipos, y el servidor resuelve el resto contra el fixture.
--   p_team_ids  — equipos elegidos; array vacío o null = todos
--   p_phase_ids — fases que abarca; null = todas las del torneo
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
  -- cierran solas al llegar su fecha límite, así que con 38 jornadas no hay
  -- que ir abriéndolas una a una.
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
