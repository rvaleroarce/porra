-- =====================================================================
-- Seed — datos mínimos para arrancar
-- =====================================================================
-- Ejecutar DESPUÉS de schema.sql en: Supabase → SQL Editor → Run
--
-- Solo crea el torneo. Equipos, fases y partidos los rellena la
-- sincronización con el proveedor; para un torneo manual (provider null)
-- se cargan a mano desde el admin.
-- =====================================================================

-- La Liga 2026-27 — el fixture lo trae football-data.org (competición 'PD').
insert into torneos (slug, name, kind, provider, provider_code, season)
values (
  'laliga-2026-27',
  'LaLiga 2026-27',
  'league',
  'football-data',
  'PD',
  '2026-27'
);

-- Ejemplo de torneo sin proveedor (fixture cargado a mano desde el admin):
--
-- insert into torneos (slug, name, kind, season)
-- values ('mundial-2030', 'Mundial 2030', 'cup', '2030');
