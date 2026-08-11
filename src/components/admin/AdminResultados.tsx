import { useState, useEffect, useMemo } from 'react';
import {
  rpcSetResult, rpcSetMatchTeams,
  fetchTournamentMatches, fetchPhases, fetchTeams,
  type TournamentMatch, type TournamentPhase, type Team,
} from '@/lib/supabase';
import Spinner from '@/components/Spinner';

interface Props {
  torneoId: string;
  onUpdated: () => void;
}

/**
 * Resultados del TORNEO, no de una porra: el marcador se mete una vez y
 * recalcula todas las porras que incluyan ese partido.
 */
export default function AdminResultados({ torneoId, onUpdated }: Props) {
  const [matches, setMatches] = useState<TournamentMatch[]>([]);
  const [phases, setPhases]   = useState<TournamentPhase[]>([]);
  const [teams, setTeams]     = useState<Team[]>([]);
  const [activePhase, setActivePhase] = useState('');
  const [activeGroup, setActiveGroup] = useState('');
  const [cargando, setCargando] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  async function recargar() {
    const [ms, ps, ts] = await Promise.all([
      fetchTournamentMatches(torneoId), fetchPhases(torneoId), fetchTeams(torneoId),
    ]);
    setMatches(ms);
    setPhases(ps);
    setTeams(ts);
    return ps;
  }

  useEffect(() => {
    setCargando(true);
    recargar()
      .then(ps => {
        // Arranca en la fase con partidos jugándose o la primera sin resultados
        setActivePhase(prev => prev || ps[0]?.phase_id || '');
      })
      .finally(() => setCargando(false));
  }, [torneoId]);

  const nombrePorId = useMemo(
    () => Object.fromEntries(teams.map(t => [t.id, t.short_name || t.name])),
    [teams],
  );

  const dePhase = matches.filter(m => m.phase_id === activePhase);

  const grupos = useMemo(() => {
    const s = new Set(dePhase.map(m => m.group_label).filter(Boolean));
    return [...s].sort() as string[];
  }, [dePhase]);

  useEffect(() => {
    if (grupos.length && !grupos.includes(activeGroup)) setActiveGroup(grupos[0]);
  }, [grupos, activeGroup]);

  const visibles = grupos.length
    ? dePhase.filter(m => m.group_label === activeGroup)
    : dePhase;

  async function guardarResultado(matchId: string, home: string, away: string) {
    const h = parseInt(home), a = parseInt(away);
    if (isNaN(h) || isNaN(a)) return;
    setBusy(matchId);
    await rpcSetResult({ torneoId, matchId, homeScore: h, awayScore: a });
    await recargar();
    await onUpdated();
    setBusy(null);
  }

  async function asignarEquipo(m: TournamentMatch, lado: 'home' | 'away', teamId: string) {
    setBusy(m.match_id + lado);
    await rpcSetMatchTeams({
      torneoId,
      matchId:    m.match_id,
      homeTeamId: lado === 'home' ? (teamId || null) : m.home_team_id,
      awayTeamId: lado === 'away' ? (teamId || null) : m.away_team_id,
    });
    await recargar();
    await onUpdated();
    setBusy(null);
  }

  if (cargando) return <div className="card flex justify-center py-10"><Spinner /></div>;

  if (!matches.length) {
    return (
      <div className="card text-center py-8 text-muted text-sm">
        Este torneo no tiene partidos cargados.<br />
        Ejecuta <code className="text-accent">npm run sync</code>.
      </div>
    );
  }

  const conResultado = dePhase.filter(m => m.home_score != null).length;

  return (
    <div className="flex flex-col gap-4">
      {/* Selector de fase */}
      <div className="flex gap-2 overflow-x-auto -mx-4 px-4 pb-1">
        {phases.map(p => {
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

      {grupos.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {grupos.map(g => (
            <button
              key={g}
              onClick={() => setActiveGroup(g)}
              className={`group-chip ${activeGroup === g ? 'active' : ''}`}
            >
              {g}
            </button>
          ))}
        </div>
      )}

      <p className="text-xs text-muted text-center">
        {conResultado} de {dePhase.length} partidos con resultado
      </p>

      <div className="flex flex-col gap-2">
        {visibles.map(m => {
          const sinResolver = !m.home_team_id || !m.away_team_id;
          return (
            <div key={m.match_id} className="card flex flex-col gap-2">
              {m.kickoff && (
                <p className="text-xs text-faint">
                  {new Date(m.kickoff).toLocaleString('es-ES', {
                    weekday: 'short', day: '2-digit', month: 'short',
                    hour: '2-digit', minute: '2-digit',
                  })}
                  {m.status === 'postponed' && <span className="text-accent2"> · aplazado</span>}
                </p>
              )}

              {/* Cruce sin resolver: hay que asignar los equipos primero */}
              {sinResolver && (
                <div className="flex gap-2">
                  <SelectorEquipo
                    teams={teams}
                    value={m.home_team_id}
                    etiqueta={m.home_label || 'Local'}
                    busy={busy === m.match_id + 'home'}
                    onChange={v => asignarEquipo(m, 'home', v)}
                  />
                  <SelectorEquipo
                    teams={teams}
                    value={m.away_team_id}
                    etiqueta={m.away_label || 'Visitante'}
                    busy={busy === m.match_id + 'away'}
                    onChange={v => asignarEquipo(m, 'away', v)}
                  />
                </div>
              )}

              {!sinResolver && (
                <FilaResultado
                  home={nombrePorId[m.home_team_id!] ?? m.home_label}
                  away={nombrePorId[m.away_team_id!] ?? m.away_label}
                  homeScore={m.home_score}
                  awayScore={m.away_score}
                  busy={busy === m.match_id}
                  onSave={(h, a) => guardarResultado(m.match_id, h, a)}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Fila de resultado ─────────────────────────────────────────────────── */
function FilaResultado({ home, away, homeScore, awayScore, busy, onSave }: {
  home: string; away: string;
  homeScore: number | null; awayScore: number | null;
  busy: boolean;
  onSave: (h: string, a: string) => void;
}) {
  const [h, setH] = useState(homeScore?.toString() ?? '');
  const [a, setA] = useState(awayScore?.toString() ?? '');

  useEffect(() => {
    setH(homeScore?.toString() ?? '');
    setA(awayScore?.toString() ?? '');
  }, [homeScore, awayScore]);

  return (
    <div className="flex items-center gap-3">
      <span className="flex-1 text-sm font-medium truncate text-right">{home}</span>
      <div className="flex items-center gap-1 shrink-0">
        <input
          type="number" min={0} max={99} inputMode="numeric"
          value={h}
          onChange={e => setH(e.target.value)}
          onBlur={() => { if (h !== '' && a !== '') onSave(h, a); }}
          disabled={busy}
          className="score-input"
        />
        <span className="text-muted font-bold">–</span>
        <input
          type="number" min={0} max={99} inputMode="numeric"
          value={a}
          onChange={e => setA(e.target.value)}
          onBlur={() => { if (h !== '' && a !== '') onSave(h, a); }}
          disabled={busy}
          className="score-input"
        />
        {busy && <Spinner size="sm" />}
      </div>
      <span className="flex-1 text-sm font-medium truncate">{away}</span>
    </div>
  );
}

/* ── Asignación de equipo a un cruce sin resolver ──────────────────────── */
function SelectorEquipo({ teams, value, etiqueta, busy, onChange }: {
  teams: Team[];
  value: string | null;
  etiqueta: string;
  busy: boolean;
  onChange: (teamId: string) => void;
}) {
  return (
    <div className="flex-1 flex items-center gap-1">
      <select
        value={value ?? ''}
        onChange={e => onChange(e.target.value)}
        disabled={busy}
        className="w-full px-2 py-1.5 rounded-lg bg-bg2 border border-line text-xs
                   text-ink focus:outline-none focus:border-accent disabled:opacity-50"
      >
        <option value="">{etiqueta}</option>
        {teams.map(t => (
          <option key={t.id} value={t.id}>{t.short_name || t.name}</option>
        ))}
      </select>
      {busy && <Spinner size="sm" />}
    </div>
  );
}
