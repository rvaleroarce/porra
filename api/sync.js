/* =========================================================================
   POST /api/sync — dispara la sincronización con football-data.org

   Dos formas de llamarlo, y ambas ejecutan el mismo código:
     · el cron diario de Vercel, que se identifica con CRON_SECRET
     · el botón "Actualizar" del admin, que manda su sesión de Supabase

   Vive en el servidor porque necesita la clave de servicio, que nunca debe
   llegar al navegador.
   ========================================================================= */

import { createClient } from '@supabase/supabase-js';
import { syncTorneo, syncTodos } from './_lib/sync.js';

const falta = (v) => v === undefined || v === null || v === '';

export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Método no permitido' });
  }

  const url        = process.env.VITE_SUPABASE_URL;
  const anonKey    = process.env.VITE_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const fdToken    = process.env.FOOTBALL_DATA_TOKEN;
  const cronSecret = process.env.CRON_SECRET;

  if ([url, anonKey, serviceKey, fdToken].some(falta)) {
    return res.status(500).json({
      ok: false,
      error: 'Faltan variables de entorno en el servidor',
    });
  }

  /* ── Autorización ─────────────────────────────────────────────────────
     El endpoint escribe en la base de datos con permisos totales, así que
     no puede quedar abierto: o viene del cron, o de un admin con sesión. */
  const bearer = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
  if (!bearer) {
    return res.status(401).json({ ok: false, error: 'Falta autorización' });
  }

  let origen;
  if (cronSecret && bearer === cronSecret) {
    origen = 'cron';
  } else {
    // Sesión de Supabase: vale cualquier usuario autenticado, que en esta
    // app equivale a ser admin (los registros están desactivados).
    const publico = createClient(url, anonKey, { auth: { persistSession: false } });
    const { data, error } = await publico.auth.getUser(bearer);
    if (error || !data?.user) {
      return res.status(403).json({ ok: false, error: 'No autorizado' });
    }
    origen = data.user.email ?? 'admin';
  }

  /* ── Sincronizar ──────────────────────────────────────────────────── */
  const db = createClient(url, serviceKey, { auth: { persistSession: false } });
  const slug = req.query?.torneo;

  try {
    let resultado;
    if (slug) {
      const { data: torneo, error } = await db
        .from('torneos').select('*').eq('slug', slug).single();
      if (error || !torneo) {
        return res.status(404).json({ ok: false, error: `Torneo '${slug}' no encontrado` });
      }
      resultado = [await syncTorneo(db, fdToken, torneo)];
    } else {
      resultado = await syncTodos(db, fdToken);
    }

    return res.status(200).json({ ok: true, origen, torneos: resultado });
  } catch (e) {
    console.error('sync falló:', e);
    return res.status(502).json({ ok: false, error: e.message });
  }
}
