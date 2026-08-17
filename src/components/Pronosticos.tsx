import { useState, useEffect, useMemo } from 'react';
import {
  fetchPhasePredictions, isRpcError,
  type BootResponse, type PhasePredictionMatch,
} from '@/lib/supabase';
import { estaCerrada } from '@/lib/fases';
import { scoreMatchSafe } from '@/lib/scoring';
import type { Rules } from '@/types';
import Spinner from '@/components/Spinner';

interface Props {
  slug: string;
  phases: BootResponse['phases'];
  rules: Rules;
  /** Para resaltar tu propia fila entre las de los demás. */
  currentUserId?: string;
}

/**
 * Lo que pronosticó cada uno, fase a fase.
 *
 * Solo se destapa cuando la fase está cerrada, es decir cuando ya nadie
 * puede cambiar nada. Quien lo impide es el servidor; aquí solo se evita
 * pedir lo que se sabe que no va a venir.
 *
 * Se agrupa por partido y no en parrilla —participantes en columnas— porque
 * con diez o más jugadores esa tabla no cabe en un móvil, y lo que la gente
 * quiere ver es quién clavó cada resultado.
 */
export default function Pronosticos({ slug, phases, rules, currentUserId }: Props) {
  const cerradas = useMemo(() => phases.filter(estaCerrada), [phases]);

  // Arranca en la última cerrada: es la recién jugada, la que interesa.
  const [activePhase, setActivePhase] = useState('');
  useEffect(() => {
    if (activePhase || !cerradas.length) return;
    setActivePhase(cerradas[cerradas.length - 1].phase_id);
  }, [cerradas, activePhase]);

  const [matches, setMatches] = useState<PhasePredictionMatch[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!activePhase) return;
    setCargando(true);
    setError('');
    fetchPhasePredictions(slug, activePhase)
      .then(r => {
        if (isRpcError(r)) { setError(r.error); return; }
        setMatches(r.matches);
      })
      .catch(e => setError(e instanceof Error ? e.message : 'No se pudo cargar'))
      .finally(() => setCargando(false));
  }, [slug, activePhase]);

  if (!cerradas.length) {
    return (
      <div className="card text-center py-8">
        <span className="text-3xl">🔒</span>
        <p className="text-sm text-muted mt-2">
          Todavía no se puede ver lo que ha puesto nadie.
        </p>
        <p className="text-xs text-faint mt-1">
          Los pronósticos se destapan cuando empieza cada jornada.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Solo las cerradas: ofrecer una abierta sería ofrecer una pantalla vacía */}
      <div className="flex gap-2 overflow-x-auto -mx-4 px-4 pb-1">
        {cerradas.map(p => {
          const activa = activePhase === p.phase_id;
          return (
            <button
              key={p.phase_id}
              ref={activa ? (el) => el?.scrollIntoView({ block: 'nearest', inline: 'center' }) : undefined}
              onClick={() => setActivePhase(p.phase_id)}
              className={`phase-pill shrink-0 ${activa ? 'active' : ''}`}
            >
              {p.short_name}
            </button>
          );
        })}
      </div>

      {cargando && <div className="flex justify-center py-8"><Spinner /></div>}
      {error && <p className="card text-sm text-accent">{error}</p>}

      {!cargando && !error && matches.map(m => (
        <Partido key={m.match_id} match={m} rules={rules} currentUserId={currentUserId} />
      ))}

      {!cargando && !error && matches.length === 0 && (
        <p className="card text-center py-6 text-muted text-sm">
          No hay pronósticos en esta jornada.
        </p>
      )}
    </div>
  );
}

function Partido({ match, rules, currentUserId }: {
  match: PhasePredictionMatch;
  rules: Rules;
  currentUserId?: string;
}) {
  const resultado = match.home_score != null && match.away_score != null
    ? { home: match.home_score, away: match.away_score }
    : null;

  // De más a menos acierto: lo primero que se busca es quién lo clavó.
  const filas = useMemo(() => {
    return match.preds
      .map(p => ({
        ...p,
        score: resultado ? scoreMatchSafe({ home: p.home, away: p.away }, resultado, rules) : null,
      }))
      .sort((a, b) => (b.score?.points ?? -1) - (a.score?.points ?? -1));
  }, [match.preds, resultado, rules]);

  return (
    <div className="card flex flex-col gap-2">
      {/* Partido y resultado real */}
      <div className="flex items-center gap-2 pb-2 border-b border-line">
        <div className="flex-1 flex items-center gap-1.5 justify-end min-w-0">
          <span className="text-sm font-semibold truncate text-right">{match.home ?? '—'}</span>
          {match.home_crest && <img src={match.home_crest} alt="" className="w-5 h-5 object-contain shrink-0" />}
        </div>
        <span className={`shrink-0 font-bold text-sm px-2 py-0.5 rounded-lg
          ${resultado ? 'bg-bg2 text-ink' : 'text-faint'}`}>
          {resultado ? `${resultado.home}–${resultado.away}` : 'sin jugar'}
        </span>
        <div className="flex-1 flex items-center gap-1.5 min-w-0">
          {match.away_crest && <img src={match.away_crest} alt="" className="w-5 h-5 object-contain shrink-0" />}
          <span className="text-sm font-semibold truncate">{match.away ?? '—'}</span>
        </div>
      </div>

      {/* Quién puso qué */}
      {filas.length === 0 ? (
        <p className="text-xs text-faint text-center py-1">Nadie pronosticó este partido.</p>
      ) : (
        <ul className="flex flex-col">
          {filas.map(f => (
            <li
              key={f.user_id}
              className={`flex items-center gap-2 py-1 px-1.5 rounded-lg text-sm
                ${f.user_id === currentUserId ? 'bg-accent/10 font-semibold' : ''}`}
            >
              <span className="flex-1 truncate">{f.name}</span>
              <span className="font-bold tabular-nums shrink-0">{f.home}–{f.away}</span>
              <span className="w-14 text-right shrink-0">
                {f.score?.kind === 'exact' && <span className="badge-exact">+{f.score.points} ✓✓</span>}
                {f.score?.kind === 'sign'  && <span className="badge-sign">+{f.score.points} ✓</span>}
                {f.score?.kind === 'miss'  && <span className="badge-miss">{f.score.points}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
