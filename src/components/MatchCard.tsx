import { useState, useEffect } from 'react';
import { flag } from '@/lib/fixture';
import { scoreMatchSafe } from '@/lib/scoring';
import type { Rules, Score } from '@/types';

interface Props {
  matchId: string;
  home: string;
  away: string;
  prediction: Score;
  result?: Score | null;
  rules: Rules;
  locked: boolean;
  onSave: (matchId: string, home: number | null, away: number | null) => void;
}

export default function MatchCard({ matchId, home, away, prediction, result, rules, locked, onSave }: Props) {
  const [h, setH] = useState(prediction.home?.toString() ?? '');
  const [a, setA] = useState(prediction.away?.toString() ?? '');

  // Sincronizar si llegan nuevas predicciones del servidor
  useEffect(() => {
    setH(prediction.home?.toString() ?? '');
    setA(prediction.away?.toString() ?? '');
  }, [prediction.home, prediction.away]);

  function handleBlur() {
    const hv = h === '' ? null : parseInt(h);
    const av = a === '' ? null : parseInt(a);
    onSave(matchId, hv, av);
  }

  // Puntuación si hay resultado real
  const score = result && scoreMatchSafe(
    { home: h === '' ? null : parseInt(h), away: a === '' ? null : parseInt(a) },
    result,
    rules
  );

  return (
    <div className={`card flex items-center gap-3 ${score ? 'border-line/80' : ''}`}>
      {/* Equipo local */}
      <div className="flex-1 flex items-center gap-1.5 justify-end min-w-0">
        <span className="text-sm font-medium truncate text-right">{home}</span>
        <span className="text-lg shrink-0">{flag(home)}</span>
      </div>

      {/* Inputs de marcador */}
      <div className="flex items-center gap-1 shrink-0">
        <input
          type="number" min={0} max={99}
          value={h}
          onChange={e => setH(e.target.value)}
          onBlur={handleBlur}
          disabled={locked}
          inputMode="numeric"
          className="score-input"
        />
        <span className="text-muted font-bold text-lg">–</span>
        <input
          type="number" min={0} max={99}
          value={a}
          onChange={e => setA(e.target.value)}
          onBlur={handleBlur}
          disabled={locked}
          inputMode="numeric"
          className="score-input"
        />
      </div>

      {/* Equipo visitante */}
      <div className="flex-1 flex items-center gap-1.5 min-w-0">
        <span className="text-lg shrink-0">{flag(away)}</span>
        <span className="text-sm font-medium truncate">{away}</span>
      </div>

      {/* Badge de puntuación (si hay resultado) */}
      {score && (
        <div className="shrink-0 text-right w-16">
          {score.kind === 'exact' && (
            <span className="badge-exact">+{score.points} ✓✓</span>
          )}
          {score.kind === 'sign' && (
            <span className="badge-sign">+{score.points} ✓</span>
          )}
          {score.kind === 'miss' && (
            <span className="badge-miss">0</span>
          )}
          {result && (
            <p className="text-xs text-faint mt-0.5">
              {result.home}–{result.away}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
