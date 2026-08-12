/* =========================================================================
   Sincronización desde la terminal

   Envoltorio del mismo código que usa /api/sync, para poder ejecutarlo a
   mano sin pasar por el servidor:

     npm run sync                 todos los torneos con proveedor
     npm run sync laliga-2026-27  solo ese

   Necesita en .env.local:
     FOOTBALL_DATA_TOKEN        clave de football-data.org
     VITE_SUPABASE_URL          url del proyecto
     SUPABASE_SERVICE_ROLE_KEY  clave de servicio (Project Settings → API)

   La clave de servicio se salta las políticas RLS: es de servidor, nunca
   debe llevar el prefijo VITE_ ni acabar en el navegador.
   ========================================================================= */

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { syncTorneo, syncTodos } from '../api/_lib/sync.js';

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)));
const { createClient } = createRequire(join(RAIZ, 'package.json'))('@supabase/supabase-js');

const env = Object.fromEntries(
  readFileSync(join(RAIZ, '.env.local'), 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')];
    }),
);

function exigir(nombre, pista) {
  const v = process.env[nombre] || env[nombre];
  if (!v) throw new Error(`Falta ${nombre} en .env.local — ${pista}`);
  return v;
}

const main = async () => {
  const db = createClient(
    exigir('VITE_SUPABASE_URL', 'Project Settings → API'),
    exigir('SUPABASE_SERVICE_ROLE_KEY', 'Project Settings → API, la clave de servicio (secreta)'),
    { auth: { persistSession: false } },
  );
  const token = exigir('FOOTBALL_DATA_TOKEN', 'regístrate en football-data.org/client/register');
  const log = (m) => console.log(`  ${m}`);
  const slug = process.argv[2];

  let resultados;
  if (slug) {
    const { data: torneo, error } = await db
      .from('torneos').select('*').eq('slug', slug).single();
    if (error) throw new Error(`Consultando el torneo '${slug}': ${error.message}`);
    if (!torneo) throw new Error(`Torneo '${slug}' no encontrado`);
    console.log(`${torneo.name} (${torneo.kind}) — ${torneo.provider_code}\n`);
    resultados = [await syncTorneo(db, token, torneo, log)];
  } else {
    resultados = await syncTodos(db, token, log);
  }

  if (!resultados.length) {
    console.log('No hay ningún torneo con proveedor configurado.');
    return;
  }
  const porras = resultados.reduce((n, r) => n + r.porras, 0);
  console.log(`\nListo. ${porras} porra(s) recalculada(s).`);
};

main().catch((e) => {
  console.error(`\nError: ${e.message}`);
  process.exit(1);
});
