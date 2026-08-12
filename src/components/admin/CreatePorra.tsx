import { useState, useEffect, useMemo, type FormEvent } from 'react';
import {
  fetchTorneos, fetchTeams, fetchPhases, rpcCreatePorra, isRpcError, supabase,
  type Torneo, type Team, type TournamentPhase,
} from '@/lib/supabase';
import { slugify } from '@/lib/slug';
import Spinner from '@/components/Spinner';

/** Lo mínimo de cada partido para poder contar el ámbito sin ir al servidor. */
interface MatchLite {
  phase_id: string;
  home_team_id: string | null;
  away_team_id: string | null;
}

export default function CreatePorra({ onCreated }: { onCreated: (porraId: string) => void }) {
  const [torneos, setTorneos]   = useState<Torneo[]>([]);
  const [torneoId, setTorneoId] = useState('');
  const [teams, setTeams]       = useState<Team[]>([]);
  const [phases, setPhases]     = useState<TournamentPhase[]>([]);
  const [matches, setMatches]   = useState<MatchLite[]>([]);

  const [name, setName]         = useState('');
  const [cuota, setCuota]       = useState('');
  const [elegidos, setElegidos] = useState<Set<string>>(new Set());
  const [desde, setDesde]       = useState('');
  const [hasta, setHasta]       = useState('');

  const [cargando, setCargando] = useState(true);
  const [busy, setBusy]         = useState(false);
  const [error, setError]       = useState('');

  const torneo   = torneos.find(t => t.id === torneoId);
  const esLiga   = torneo?.kind === 'league';

  useEffect(() => {
    fetchTorneos()
      .then(ts => {
        setTorneos(ts);
        if (ts.length === 1) setTorneoId(ts[0].id);
      })
      .catch(e => setError(e.message))
      .finally(() => setCargando(false));
  }, []);

  useEffect(() => {
    if (!torneoId) return;
    setCargando(true);
    Promise.all([
      fetchTeams(torneoId),
      fetchPhases(torneoId),
      supabase.from('tournament_matches')
        .select('phase_id, home_team_id, away_team_id')
        .eq('torneo_id', torneoId),
    ])
      .then(([tm, ph, { data: ms }]) => {
        setTeams(tm);
        setPhases(ph);
        setMatches((ms ?? []) as MatchLite[]);
        setElegidos(new Set());
        setDesde(ph[0]?.phase_id ?? '');
        setHasta(ph[ph.length - 1]?.phase_id ?? '');
      })
      .catch(e => setError(e.message))
      .finally(() => setCargando(false));
  }, [torneoId]);

  /** Fases dentro del rango elegido (en liga) o todas (en copa). */
  const fasesElegidas = useMemo(() => {
    if (!esLiga) return phases.map(p => p.phase_id);
    const i = phases.findIndex(p => p.phase_id === desde);
    const j = phases.findIndex(p => p.phase_id === hasta);
    if (i < 0 || j < 0 || j < i) return phases.map(p => p.phase_id);
    return phases.slice(i, j + 1).map(p => p.phase_id);
  }, [esLiga, phases, desde, hasta]);

  /* Cuenta de partidos aplicando la MISMA regla que sync_porra_matches en
     el servidor: entra si juega alguno de los elegidos, o si todavía no se
     sabe quién lo juega. Si cambia allí, hay que cambiarla aquí. */
  const totalPartidos = useMemo(() => {
    const dentro = new Set(fasesElegidas);
    return matches.filter(m =>
      dentro.has(m.phase_id) && (
        elegidos.size === 0
        || m.home_team_id === null
        || m.away_team_id === null
        || elegidos.has(m.home_team_id)
        || elegidos.has(m.away_team_id)
      ),
    ).length;
  }, [matches, fasesElegidas, elegidos]);

  function alternarEquipo(id: string) {
    setElegidos(prev => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id); else s.add(id);
      return s;
    });
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || !torneoId) return;
    setBusy(true);
    setError('');

    try {
      const r = await rpcCreatePorra({
        torneoId,
        name:     name.trim(),
        slug:     slugify(name.trim()),
        cuota:    cuota.trim() === '' ? 0 : Number(cuota),
        teamIds:  [...elegidos],
        phaseIds: fasesElegidas,
      });
      if (isRpcError(r)) {
        setError(r.error);
        setBusy(false);
        return;
      }
      onCreated(r.porra_id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error desconocido');
      setBusy(false);
    }
  }

  if (cargando && !torneos.length) {
    return <div className="card flex justify-center py-10"><Spinner /></div>;
  }

  if (!torneos.length) {
    return (
      <div className="w-full max-w-sm card text-center">
        <p className="text-sm text-muted">
          No hay ningún torneo cargado. Ejecuta <code className="text-accent">seed.sql</code> y
          después <code className="text-accent">npm run sync</code>.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md card flex flex-col gap-6">
      {/* La competición preside la pantalla: cuando solo hay una cargada el
          desplegable no aparece, y sin esto no se ve a qué se está creando
          la porra aunque debajo salgan sus equipos. */}
      <div className="text-center">
        {torneo?.emblem_url
          ? <img src={torneo.emblem_url} alt=""
                 className="w-14 h-14 mx-auto object-contain" />
          : <span className="text-4xl">🏆</span>}
        <h2 className="mt-3 text-xl font-bold">Crear tu porra</h2>
        <p className="mt-1 text-sm text-muted">
          {torneo
            ? <>Sobre <strong className="text-ink">{torneo.name}</strong>. Elige los equipos y hasta dónde llega.</>
            : 'Elige la competición, los equipos y hasta dónde llega.'}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-5">

        {torneos.length > 1 && (
          <Campo etiqueta="Competición">
            <select
              value={torneoId}
              onChange={e => setTorneoId(e.target.value)}
              disabled={busy}
              className={ESTILO_CAMPO}
            >
              <option value="">Elige una…</option>
              {torneos.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </Campo>
        )}

        <Campo etiqueta="Nombre de la porra">
          <input
            type="text" required autoFocus placeholder="Porra del bar"
            value={name} onChange={e => setName(e.target.value)} disabled={busy}
            className={ESTILO_CAMPO}
          />
        </Campo>

        {/* Equipos */}
        {teams.length > 0 && (
          <div className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between">
              <label className="text-xs text-muted font-medium uppercase tracking-wide">
                Equipos
              </label>
              {elegidos.size > 0 && (
                <button
                  type="button"
                  onClick={() => setElegidos(new Set())}
                  className="text-xs text-accent hover:underline"
                >
                  Quitar filtro
                </button>
              )}
            </div>
            <p className="text-xs text-faint -mt-1">
              {elegidos.size === 0
                ? 'Sin elegir ninguno entran todos los partidos.'
                : `${elegidos.size} elegidos: solo entran sus partidos.`}
            </p>
            <div className="flex flex-wrap gap-1.5 max-h-52 overflow-y-auto p-1">
              {teams.map(t => {
                const on = elegidos.has(t.id);
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => alternarEquipo(t.id)}
                    disabled={busy}
                    className={`flex items-center gap-1.5 pl-1.5 pr-2.5 py-1 rounded-full border text-xs
                      transition-colors disabled:opacity-50
                      ${on ? 'border-accent bg-accent/15 text-ink' : 'border-line text-muted hover:border-muted'}`}
                  >
                    {t.crest_url
                      ? <img src={t.crest_url} alt="" className="w-4 h-4 object-contain" />
                      : <span className="w-4 text-center">⚽</span>}
                    {t.short_name || t.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Alcance: rango de jornadas en liga, fases sueltas en copa */}
        {esLiga && phases.length > 0 && (
          <div className="flex flex-col gap-2">
            <label className="text-xs text-muted font-medium uppercase tracking-wide">
              Jornadas
            </label>
            <div className="flex items-center gap-2">
              <select value={desde} onChange={e => setDesde(e.target.value)}
                      disabled={busy} className={ESTILO_CAMPO}>
                {phases.map(p => <option key={p.phase_id} value={p.phase_id}>{p.name}</option>)}
              </select>
              <span className="text-muted text-sm shrink-0">a</span>
              <select value={hasta} onChange={e => setHasta(e.target.value)}
                      disabled={busy} className={ESTILO_CAMPO}>
                {phases.map(p => <option key={p.phase_id} value={p.phase_id}>{p.name}</option>)}
              </select>
            </div>
          </div>
        )}

        <Campo etiqueta="Cuota por participante (€)">
          <input
            type="number" min="0" step="any" inputMode="decimal"
            placeholder="0 = porra gratis"
            value={cuota} onChange={e => setCuota(e.target.value)} disabled={busy}
            className={ESTILO_CAMPO}
          />
          <p className="text-xs text-faint mt-1">
            Déjalo en 0 para una porra sin dinero (se ocultan los pagos).
          </p>
        </Campo>

        {/* Resumen de lo que va a salir */}
        <div className="card bg-bg2 py-2.5 px-3 text-center">
          <p className="text-sm">
            <strong className="text-accent">{totalPartidos}</strong>
            <span className="text-muted"> partidos en </span>
            <strong>{fasesElegidas.length}</strong>
            <span className="text-muted"> {esLiga ? 'jornadas' : 'fases'}</span>
          </p>
          {totalPartidos === 0 && (
            <p className="text-xs text-accent2 mt-1">
              Así la porra se quedaría vacía. Revisa equipos y jornadas.
            </p>
          )}
        </div>

        {error && <p className="text-sm text-accent">{error}</p>}

        <button
          type="submit"
          disabled={busy || !name.trim() || !torneoId || totalPartidos === 0}
          className="btn-primary flex items-center justify-center gap-2"
        >
          {busy ? <><Spinner size="sm" /> Creando…</> : 'Crear porra'}
        </button>
      </form>
    </div>
  );
}

const ESTILO_CAMPO =
  'w-full px-4 py-3 rounded-xl bg-bg2 border border-line text-ink ' +
  'placeholder:text-faint focus:outline-none focus:border-accent disabled:opacity-50';

function Campo({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-muted font-medium uppercase tracking-wide">{etiqueta}</label>
      {children}
    </div>
  );
}
