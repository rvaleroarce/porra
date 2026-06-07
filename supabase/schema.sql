-- =====================================================================
-- Porra Mundial 2026 — Esquema completo
-- =====================================================================
-- Ejecutar en: Supabase Dashboard → SQL Editor → New query → Run
-- =====================================================================


-- -----------------------------------------------------------------------
-- 1. TABLAS
-- -----------------------------------------------------------------------

create table torneos (
  id          uuid primary key default gen_random_uuid(),
  slug        text unique not null,       -- 'mundial-2026' (enlaza con fixture.ts)
  name        text not null,              -- 'Mundial 2026'
  created_at  timestamptz default now()
);

create table porras (
  id          uuid primary key default gen_random_uuid(),
  torneo_id   uuid not null references torneos(id) on delete cascade,
  slug        text unique not null,       -- 'porra-del-bar', 'porra-del-trabajo'...
  name        text not null,
  tipo        text not null default 'TODOS',  -- clave del tipo de porra
  exact_pts   integer not null default 3,
  sign_pts    integer not null default 1,
  miss_pts    integer not null default 0,
  created_at  timestamptz default now()
);

-- Ámbito materializado: qué partidos cuenta esta porra
create table porra_matches (
  porra_id    uuid not null references porras(id) on delete cascade,
  match_id    text not null,
  phase_id    text not null,
  primary key (porra_id, match_id)
);

-- Estado de fases por porra (cada porra tiene sus propios plazos)
create table porra_phases (
  porra_id    uuid not null references porras(id) on delete cascade,
  phase_id    text not null,
  open        boolean not null default false,
  deadline    date,
  order_num   integer not null default 0,
  primary key (porra_id, phase_id)
);

-- Participantes (NO son auth.users; se identifican con token)
create table users (
  id          uuid primary key default gen_random_uuid(),
  porra_id    uuid not null references porras(id) on delete cascade,
  name        text not null,
  phone       text not null,
  email       text,                       -- opcional, para recuperación por magic-link
  alias       text,                       -- nombre en clasificación
  paid        boolean not null default false,
  token       text unique not null,       -- enlace personal (no-adivinable)
  created_at  timestamptz default now()
);

-- Pronósticos — por porra: UNIQUE(porra_id, user_id, match_id)
create table predictions (
  id          uuid primary key default gen_random_uuid(),
  porra_id    uuid not null references porras(id) on delete cascade,
  user_id     uuid not null references users(id) on delete cascade,
  match_id    text not null,
  phase_id    text not null,
  home_score  integer,
  away_score  integer,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now(),
  unique (porra_id, user_id, match_id)
);

-- Fases enviadas/bloqueadas
create table phase_submissions (
  porra_id     uuid not null references porras(id) on delete cascade,
  user_id      uuid not null references users(id) on delete cascade,
  phase_id     text not null,
  submitted_at timestamptz default now(),
  primary key (porra_id, user_id, phase_id)
);

-- Resultados reales — por torneo (una vez por partido, vale para todas las porras)
create table results (
  torneo_id   uuid not null references torneos(id) on delete cascade,
  match_id    text not null,
  home_score  integer,
  away_score  integer,
  updated_at  timestamptz default now(),
  primary key (torneo_id, match_id)
);

-- Equipos asignados a los cruces de eliminatoria — por torneo
create table bracket_teams (
  torneo_id   uuid not null references torneos(id) on delete cascade,
  phase_id    text not null,
  match_id    text not null,
  home        text not null default '',
  away        text not null default '',
  primary key (torneo_id, phase_id, match_id)
);


-- -----------------------------------------------------------------------
-- 2. ÍNDICES
-- -----------------------------------------------------------------------

create index on porra_matches (porra_id, phase_id);
create index on predictions (user_id, porra_id);
create index on predictions (porra_id, match_id);
create index on phase_submissions (user_id, porra_id);
create index on results (torneo_id);
create index on users (porra_id);
create index on users (token);


-- -----------------------------------------------------------------------
-- 3. ROW LEVEL SECURITY
-- -----------------------------------------------------------------------

alter table torneos           enable row level security;
alter table porras            enable row level security;
alter table porra_matches     enable row level security;
alter table porra_phases      enable row level security;
alter table users             enable row level security;
alter table predictions       enable row level security;
alter table phase_submissions enable row level security;
alter table results           enable row level security;
alter table bracket_teams     enable row level security;

-- Lectura pública de datos no sensibles
create policy "public read" on torneos         for select using (true);
create policy "public read" on porras          for select using (true);
create policy "public read" on porra_matches   for select using (true);
create policy "public read" on porra_phases    for select using (true);
create policy "public read" on results         for select using (true);
create policy "public read" on bracket_teams   for select using (true);

-- users, predictions, phase_submissions: solo admin (authenticated) puede leer/escribir
-- Los participantes acceden a sus propios datos solo a través de funciones RPC (security definer)
create policy "admin only" on users             for all using (auth.role() = 'authenticated');
create policy "admin only" on predictions       for all using (auth.role() = 'authenticated');
create policy "admin only" on phase_submissions for all using (auth.role() = 'authenticated');

-- Admin puede escribir también en las tablas de lectura pública
create policy "admin write" on torneos          for all using (auth.role() = 'authenticated');
create policy "admin write" on porras           for all using (auth.role() = 'authenticated');
create policy "admin write" on porra_matches    for all using (auth.role() = 'authenticated');
create policy "admin write" on porra_phases     for all using (auth.role() = 'authenticated');
create policy "admin write" on results          for all using (auth.role() = 'authenticated');
create policy "admin write" on bracket_teams    for all using (auth.role() = 'authenticated');


-- -----------------------------------------------------------------------
-- 4. FUNCIONES RPC — PARTICIPANTES
-- (security definer: se ejecutan con permisos del propietario, bypass RLS)
-- -----------------------------------------------------------------------

-- ── boot ────────────────────────────────────────────────────────────────
-- Carga inicial en una sola llamada: estado de la porra + datos del usuario.
-- p_token es opcional: si se pasa, devuelve los pronósticos y fases enviadas del usuario.
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
      'miss_pts',  v_porra.miss_pts
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
        left join predictions p
          on p.user_id = u.id and p.porra_id = v_porra.id
        left join results r
          on r.match_id = p.match_id
         and r.torneo_id = v_porra.torneo_id
         and r.home_score is not null
         and r.away_score is not null
        where u.porra_id = v_porra.id and u.paid = true
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
-- Alta de participante. Guard anti-duplicados: si el móvil ya existe en
-- la porra, devuelve error 'duplicate' con un hint para el cliente.
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
  v_porra  porras%rowtype;
  v_token  text;
  v_uid    uuid;
  v_phone  text;
  v_name   text;
  v_alias  text;
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

  -- Guard anti-duplicados
  if exists(select 1 from users where porra_id = v_porra.id and phone = v_phone) then
    return json_build_object(
      'ok',   false,
      'error','duplicate',
      'hint', '¿Ya estás apuntado? Puede que hayas perdido tu enlace personal. Pide al organizador que te lo reenvíe.'
    );
  end if;

  v_name  := trim(p_name);
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
    'user',  json_build_object(
      'id',    v_uid,
      'name',  v_name,
      'alias', v_alias,
      'paid',  false
    )
  );
end;
$$;


-- ── upsert_predictions ───────────────────────────────────────────────────
-- Guarda (sin enviar) los pronósticos de un participante.
-- Valida: fase abierta, no enviada, no pasada la fecha límite, match en el ámbito.
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
  select * into v_user
  from users where token = p_token and porra_id = p_porra_id;
  if not found then
    return json_build_object('ok', false, 'error', 'Token no válido');
  end if;

  select * into v_phase
  from porra_phases where porra_id = p_porra_id and phase_id = p_phase_id;
  if not found or not v_phase.open then
    return json_build_object('ok', false, 'error', 'Fase no disponible');
  end if;

  if v_phase.deadline is not null and current_date > v_phase.deadline then
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
-- Envía y bloquea una fase. Opcionalmente guarda pronósticos antes de bloquear.
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
  v_user   users%rowtype;
  v_phase  porra_phases%rowtype;
  v_save   json;
begin
  select * into v_user
  from users where token = p_token and porra_id = p_porra_id;
  if not found then
    return json_build_object('ok', false, 'error', 'Token no válido');
  end if;

  select * into v_phase
  from porra_phases where porra_id = p_porra_id and phase_id = p_phase_id;
  if not found or not v_phase.open then
    return json_build_object('ok', false, 'error', 'Fase no disponible');
  end if;

  if v_phase.deadline is not null and current_date > v_phase.deadline then
    return json_build_object('ok', false, 'error', 'Fecha límite superada');
  end if;

  -- Idempotente
  if exists(
    select 1 from phase_submissions
    where user_id = v_user.id and porra_id = p_porra_id and phase_id = p_phase_id
  ) then
    return json_build_object('ok', true);
  end if;

  -- Guardar pronósticos si se pasan
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


-- -----------------------------------------------------------------------
-- 5. FUNCIONES RPC — ADMIN
-- (requieren sesión Supabase Auth: auth.uid() not null)
-- -----------------------------------------------------------------------

-- ── admin_boot ───────────────────────────────────────────────────────────
-- Estado completo de la porra incluyendo datos sensibles (teléfonos, tokens).
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
          'id',         u.id,
          'name',       u.name,
          'alias',      u.alias,
          'phone',      u.phone,
          'email',      u.email,
          'paid',       u.paid,
          'token',      u.token,
          'created_at', u.created_at
        ) order by u.created_at
      ), '[]'::json)
      from users u
      where u.porra_id = p_porra_id
    )
  );
end;
$$;

-- ── set_result ───────────────────────────────────────────────────────────
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

  insert into results (torneo_id, match_id, home_score, away_score, updated_at)
  values (p_torneo_id, p_match_id, p_home_score, p_away_score, now())
  on conflict (torneo_id, match_id) do update
    set home_score = excluded.home_score,
        away_score = excluded.away_score,
        updated_at = now();

  return json_build_object('ok', true);
end;
$$;

-- ── set_bracket ──────────────────────────────────────────────────────────
create or replace function set_bracket(
  p_torneo_id uuid,
  p_phase_id  text,
  p_match_id  text,
  p_home      text,
  p_away      text
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

  insert into bracket_teams (torneo_id, phase_id, match_id, home, away)
  values (p_torneo_id, p_phase_id, p_match_id, p_home, p_away)
  on conflict (torneo_id, phase_id, match_id) do update
    set home = excluded.home,
        away = excluded.away;

  return json_build_object('ok', true);
end;
$$;

-- ── set_phase_state ──────────────────────────────────────────────────────
create or replace function set_phase_state(
  p_porra_id  uuid,
  p_phase_id  text,
  p_open      boolean,
  p_deadline  date default null
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
  set open = p_open, deadline = p_deadline
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

-- ── create_porra ─────────────────────────────────────────────────────────
-- Crea la porra y materializa su ámbito en una transacción.
-- p_matches: [{ match_id, phase_id }]
-- p_phases:  [{ phase_id, order_num }]
create or replace function create_porra(
  p_torneo_id uuid,
  p_name      text,
  p_slug      text,
  p_tipo      text,
  p_matches   jsonb,
  p_phases    jsonb
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

  insert into porras (torneo_id, slug, name, tipo)
  values (p_torneo_id, p_slug, p_name, p_tipo)
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
