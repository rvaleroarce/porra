import { useState } from 'react';
import type { BootResponse } from '@/lib/supabase';

/**
 * Qué abarca esta porra: competición, equipos y fases.
 *
 * Se fija al crearla y no se puede cambiar después: quitar un equipo
 * dejaría huérfanos los pronósticos ya emitidos de sus partidos. Aquí solo
 * se enseña, que es lo que faltaba — hasta ahora había que mirar la base de
 * datos para saber de qué iba una porra.
 */
export default function AdminAmbito({ boot }: { boot: BootResponse }) {
  const [abierto, setAbierto] = useState(false);

  const { torneo, teams, phases, matches } = boot;
  const todos = teams.length === 0;
  const unidad = torneo.kind === 'league' ? 'jornadas' : 'fases';

  return (
    <div className="card flex flex-col gap-2 py-3">
      <div className="flex items-center gap-2">
        {torneo.emblem_url && (
          <img src={torneo.emblem_url} alt="" className="w-6 h-6 object-contain shrink-0" />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium truncate">{torneo.name}</p>
          <p className="text-xs text-muted">
            {matches.length} partidos · {phases.length} {unidad} ·{' '}
            {todos ? 'todos los equipos' : `${teams.length} equipos`}
          </p>
        </div>
        {!todos && (
          <button
            onClick={() => setAbierto(v => !v)}
            className="text-xs text-info hover:text-ink transition-colors shrink-0"
          >
            {abierto ? 'Ocultar' : 'Ver equipos'}
          </button>
        )}
      </div>

      {abierto && !todos && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {teams.map(t => (
            <span
              key={t.id}
              className="flex items-center gap-1.5 pl-1.5 pr-2.5 py-1 rounded-full
                         border border-line text-xs text-muted"
            >
              {t.crest_url
                ? <img src={t.crest_url} alt="" className="w-4 h-4 object-contain" />
                : <span className="w-4 text-center">⚽</span>}
              {t.short_name || t.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
