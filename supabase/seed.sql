-- =====================================================================
-- Seed — Mundial 2026
-- =====================================================================
-- Ejecutar DESPUÉS de schema.sql en: Supabase → SQL Editor → Run
-- =====================================================================

-- El torneo. El slug 'mundial-2026' enlaza con FIXTURE.tournament en fixture.ts.
insert into torneos (slug, name)
values ('mundial-2026', 'Mundial 2026');
