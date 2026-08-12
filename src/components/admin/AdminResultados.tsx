import { useState, useEffect, useMemo } from 'react';
import {
  rpcSetResult, rpcSetMatchTeams, triggerSync,
  fetchTournamentMatches, fetchPhases, fetchTeams,
  type TournamentMatch, type TournamentPhase, type Team,
} from '@/lib/supabase';
import Spinner from '@/components/Spinner';

interface Props {
  torneoId: string;
  /** Partidos que entran en la porra activa, para no enseñar el torneo entero. */
  porraMatchIds: string[];
  onUpdated: () => void;
}

/**
 * Resultados del TORNEO, no de una porra: el marcador se mete una vez y
 * recalcula todas las porras que incluyan ese partido.
 *
 * Aun así se enseñan por defecto solo los partidos de la porra activa. Con
 * el cron trayendo los marcadores, aquí se viene a corregir algo puntual, y
 * ver los 380 del torneo es ruido. El enlace "ver todos" queda para el caso
 * de varias porras con equipos distintos.
 */
export default function AdminResultados({ torneoId, porraMatchIds, onUpdated }: Props) {
  const [matches, setMatches] = useState<TournamentMatch[]>([]);
  const [phases, setPhases]   = useState<TournamentPhase[]>([]);
  const [teams, setTeams]     = useState<Team[]>([]);
  const [activePhase, setActivePhase] = useState('');
  const [activeGroup, setActiveGroup] = useState('');
  const [cargando, setCargando] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [sync, setSync] = useState<{ estado: 'ok' | 'error'; msg: string } | null>(null);
  const [verTodos, setVerTodos] = useState(false);

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
    recargar().finally(() => setCargando(false));
  }, [torneoId]);

  const nombrePorId = useMemo(
    () => Object.fromEntries(teams.map(t => [t.id, t.short_name || t.name])),
    [teams],
  );

  /** Partidos del ámbito: los de la porra, o el torneo entero si se pide. */
  const delAmbito = useMemo(() => {
    if (verTodos) return matches;
    const enPorra = new Set(porraMatchIds);
    return matches.filter(m => enPorra.has(m.match_id));
  }, [matches, porraMatchIds, verTodos]);

  /** Solo las fases que tienen algún partido visible. */
  const fasesVisibles = useMemo(() => {
    const conPartidos = new Set(delAmbito.map(m => m.phase_id));
    return phases.filter(p => conPartidos.has(p.phase_id));
  }, [phases, delAmbito]);

  // Al cambiar el ámbito, la fase activa puede quedarse fuera
  useEffect(() => {
    if (!fasesVisibles.length) return;
    if (!fasesVisibles.some(p => p.phase_id === activePhase)) {
      setActivePhase(fasesVisibles[0].phase_id);
    }
  }, [fasesVisibles, activePhase]);

  const dePhase = delAmbito.filter(m => m.phase_id === activePhase);

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

  /** Trae del proveedor los resultados y cualquier cambio de horario. */
  async function actualizar() {
    setBusy('sync');
    setSync(null);
    try {
      const r = await triggerSync();
      const total = r.torneos.reduce((n, t) => n + t.resultados, 0);
      await recargar();
      await onUpdated();
      setSync({ estado: 'ok', msg: `Actualizado · ${total} partidos con resultado` });
    } catch (e) {
      setSync({ estado: 'error', msg: e instanceof Error ? e.message : 'Error desconocido' });
    } finally {
      setBusy(null);
    }
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
      {/* Actualizar desde el proveedor. El cron lo hace solo una vez al día;
          esto sirve para no esperar, p. ej. al acabar una jornada. */}
      <div className="card py-2.5 px-3 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs text-muted">Resultados y horarios</p>
          {sync && (
            <p className={`text-xs truncate ${sync.estado === 'ok' ? 'text-success' : 'text-accent'}`}>
              {sync.msg}
            </p>
          )}
        </div>
        <button
          onClick={actualizar}
          disabled={!!busy}
          className="btn-secondary text-xs px-3 py-1.5 flex items-center gap-1.5 shrink-0"
        >
          {busy === 'sync' ? <><Spinner size="sm" /> Actualizando…</> : '↻ Actualizar'}
        </button>
      </div>

      {/* Selector de fase */}
      <div className="flex gap-2 overflow-x-auto -mx-4 px-4 pb-1">
        {fasesVisibles.map(p => {
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
        {porraMatchIds.length > 0 && matches.length > porraMatchIds.length && (
          <>
            {' · '}
            <button
              onClick={() => setVerTodos(v => !v)}
              className="text-info hover:text-ink transition-colors underline"
            >
              {verTodos ? 'solo los de la porra' : 'ver todos los del torneo'}
            </button>
          </>
        )}
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
