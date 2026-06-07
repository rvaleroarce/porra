import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useToken } from '@/hooks/useToken';
import { useBootData } from '@/hooks/useBootData';
import { supabase, rpcSavePredictions, rpcSubmitPhase } from '@/lib/supabase';
import { matchesOfPhase, matchesOfGroup, GROUP_LETTERS, ALL_PHASES } from '@/lib/fixture';
import type { GroupMatch, BracketMatch, Score } from '@/types';
import Header from '@/components/Header';
import Spinner from '@/components/Spinner';
import Standings from '@/components/Standings';
import MatchCard from '@/components/MatchCard';
import Toast, { type ToastState } from '@/components/Toast';

type Tab = 'porra' | 'clasificacion';

export default function PorraView() {
  const { slug }       = useParams<{ slug: string }>();
  const navigate       = useNavigate();
  const { token, clearToken } = useToken(slug!);

  const { data: boot, loading, error, refresh } = useBootData(slug!, token);
  const [prizeInfo, setPrizeInfo] = useState<string | null>(null);

  // prize_info no viene en boot (función SQL legada), lo pedimos por separado
  useEffect(() => {
    if (!slug) return;
    supabase.from('porras').select('prize_info').eq('slug', slug).single()
      .then(({ data }) => setPrizeInfo(data?.prize_info ?? null));
  }, [slug]);

  const [tab, setTab]           = useState<Tab>('porra');
  const [activePhase, setPhase] = useState('GROUPS');
  const [activeGroup, setGroup] = useState('A');
  const [preds, setPreds]       = useState<Record<string, Score>>({});
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast]       = useState<ToastState | null>(null);

  // Redirigir si no hay usuario tras cargar
  useEffect(() => {
    if (loading) return;
    if (!boot) return;
    if (boot.me === null) {
      clearToken();
      navigate(`/p/${slug}/register`, { replace: true });
    }
  }, [loading, boot]); // eslint-disable-line react-hooks/exhaustive-deps

  // Inicializar predicciones locales desde boot
  useEffect(() => {
    if (!boot?.me?.preds) return;
    const map: Record<string, Score> = {};
    for (const p of boot.me.preds) {
      map[p.match_id] = { home: p.home_score, away: p.away_score };
    }
    setPreds(map);
  }, [boot?.me?.preds]);

  // ── Helpers ──────────────────────────────────────────────────────────

  const phaseInfo    = Object.fromEntries(ALL_PHASES.map(p => [p.id, p]));
  const phaseState   = Object.fromEntries((boot?.phases ?? []).map(p => [p.phase_id, p]));
  const resultMap    = Object.fromEntries((boot?.results ?? []).map(r => [r.match_id, r]));
  const bracketMap   = Object.fromEntries((boot?.bracket ?? []).map(b => [b.match_id, b]));
  const submitted    = new Set(boot?.me?.submitted ?? []);
  const rules        = boot
    ? { exact: boot.porra.exact_pts, sign: boot.porra.sign_pts, miss: boot.porra.miss_pts }
    : { exact: 3, sign: 1, miss: 0 };

  function isLocked(phaseId: string): boolean {
    if (submitted.has(phaseId)) return true;
    const ph = phaseState[phaseId];
    if (!ph || !ph.open) return true;
    if (ph.deadline && new Date() > new Date(ph.deadline)) return true;
    return false;
  }

  const locked = isLocked(activePhase);

  /** Partidos visibles según fase/grupo activo */
  const visibleMatches = activePhase === 'GROUPS'
    ? matchesOfGroup(activeGroup)
    : matchesOfPhase(activePhase) as BracketMatch[];

  /** Todos los partidos de la fase activa (para calcular progreso y fill-zeros) */
  const allPhaseMatches = activePhase === 'GROUPS'
    ? matchesOfPhase('GROUPS') as GroupMatch[]
    : matchesOfPhase(activePhase) as BracketMatch[];

  /** Predicciones rellenas en la fase activa */
  const filled = allPhaseMatches.filter(m => {
    const p = preds[m.id];
    return p?.home != null && p?.away != null;
  }).length;

  // ── Acciones ─────────────────────────────────────────────────────────

  function updatePred(matchId: string, home: number | null, away: number | null) {
    setPreds(prev => ({ ...prev, [matchId]: { home, away } }));
  }

  const savePred = useCallback(async (matchId: string, home: number | null, away: number | null) => {
    if (!token || !boot || locked) return;
    updatePred(matchId, home, away);
    if (home == null || away == null) return; // no guardar si está a medias
    await rpcSavePredictions({
      token,
      porraId: boot.porra.id,
      phaseId: activePhase,
      preds: [{ match_id: matchId, home_score: home, away_score: away }],
    });
  }, [token, boot, locked, activePhase]);

  function fillRestZero() {
    const updates: Record<string, Score> = {};
    for (const m of allPhaseMatches) {
      const p = preds[m.id];
      if (p?.home == null || p?.away == null) {
        updates[m.id] = { home: 0, away: 0 };
      }
    }
    if (Object.keys(updates).length === 0) return;
    setPreds(prev => ({ ...prev, ...updates }));
    if (!token || !boot) return;
    // Guardar en el servidor
    rpcSavePredictions({
      token,
      porraId: boot.porra.id,
      phaseId: activePhase,
      preds: Object.entries(updates).map(([match_id, s]) => ({
        match_id, home_score: s.home!, away_score: s.away!,
      })),
    });
  }

  async function handleSubmit() {
    if (!token || !boot || locked) return;
    const empty = allPhaseMatches.length - filled;
    if (empty > 0) {
      if (!confirm(`Hay ${empty} partido${empty > 1 ? 's' : ''} sin rellenar. ¿Enviar la porra igualmente?`)) return;
    }
    setSubmitting(true);
    const allPreds = allPhaseMatches
      .filter(m => preds[m.id]?.home != null && preds[m.id]?.away != null)
      .map(m => ({ match_id: m.id, home_score: preds[m.id].home!, away_score: preds[m.id].away! }));

    const res = await rpcSubmitPhase({
      token,
      porraId: boot.porra.id,
      phaseId: activePhase,
      preds: allPreds,
    });
    setSubmitting(false);

    if (!res.ok) {
      setToast({ msg: (res as { error: string }).error, isError: true });
      return;
    }
    setToast({ msg: '✓ Porra enviada y bloqueada' });
    refresh();
  }

  // ── Render ────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error || !boot) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 p-6">
        <span className="text-4xl">😕</span>
        <p className="text-muted text-sm">{error ?? 'No se pudo cargar la porra'}</p>
        <button onClick={refresh} className="btn-secondary text-sm">Reintentar</button>
      </div>
    );
  }

  const user = boot.me?.user;

  return (
    <div className="min-h-screen flex flex-col pb-16">
      <Header porraName={boot?.porra.name} />
      <Toast toast={toast} onDone={() => setToast(null)} />

      {/* Info del usuario */}
      {user && (
        <div className="px-4 py-2 border-b border-line flex items-center justify-between gap-2">
          <p className="text-xs text-muted truncate">
            {user.alias || user.name}
            {!user.paid && (
              <span className="ml-2 text-accent2 font-medium">· Pago pendiente</span>
            )}
          </p>
          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={() => navigate(`/p/${slug}/ayuda`)}
              className="text-xs text-faint hover:text-muted transition-colors"
              title="Instrucciones"
            >
              ¿Cómo funciona?
            </button>
            <button
              onClick={() => { clearToken(); navigate(`/p/${slug}/register`); }}
              className="text-xs text-faint hover:text-muted transition-colors"
            >
              No soy yo
            </button>
          </div>
        </div>
      )}

      <main className="flex-1 p-4 max-w-2xl mx-auto w-full">

        {/* ── Clasificación ── */}
        {tab === 'clasificacion' && (
          <Standings
            standings={boot.standings}
            matchesPlayed={boot.results.filter(r => r.home_score != null).length}
            paidCount={boot.standings.length}
            rules={rules}
            currentUserId={user?.id}
            prizeInfo={prizeInfo}
          />
        )}

        {/* ── Mi porra ── */}
        {tab === 'porra' && (
          <div className="flex flex-col gap-4">

            {/* Selector de fases */}
            <div className="flex gap-2 flex-wrap">
              {ALL_PHASES.map(p => {
                const ph = phaseState[p.id];
                const lock = isLocked(p.id);
                const noPhase = !ph || !ph.open;
                return (
                  <button
                    key={p.id}
                    onClick={() => !noPhase && setPhase(p.id)}
                    disabled={noPhase}
                    className={`phase-pill shrink-0
                      ${activePhase === p.id ? 'active' : ''}
                      ${noPhase ? 'locked' : ''}`}
                  >
                    {lock && !noPhase ? '🔒 ' : ''}{p.name}
                  </button>
                );
              })}
            </div>

            {/* Estado de la fase */}
            {(() => {
              const ph = phaseState[activePhase];
              if (!ph || !ph.open) return (
                <div className="card text-center py-6 text-muted text-sm">
                  Esta fase aún no está abierta.
                </div>
              );
              const isSubmitted = submitted.has(activePhase);
              const isPast = ph.deadline && new Date() > new Date(ph.deadline);
              return (
                <div className="card flex flex-col gap-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{phaseInfo[activePhase]?.name}</span>
                    {isSubmitted
                      ? <span className="text-success font-semibold text-xs">✓ Enviada</span>
                      : isPast
                        ? <span className="text-accent text-xs">⏰ Cerrada</span>
                        : ph.deadline
                          ? <span className="text-muted text-xs">Límite: {ph.deadline}</span>
                          : null
                    }
                  </div>
                  {/* Barra de progreso */}
                  <div className="h-1.5 bg-bg2 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-accent rounded-full transition-all"
                      style={{ width: `${allPhaseMatches.length ? (filled / allPhaseMatches.length) * 100 : 0}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted text-right">
                    {filled} / {allPhaseMatches.length} partidos
                  </p>
                </div>
              );
            })()}

            {/* Selector de grupo (solo GROUPS) */}
            {activePhase === 'GROUPS' && (
              <div className="flex gap-2 flex-wrap">
                {GROUP_LETTERS.map(g => (
                  <button
                    key={g}
                    onClick={() => setGroup(g)}
                    className={`group-chip ${activeGroup === g ? 'active' : ''}`}
                  >
                    {g}
                  </button>
                ))}
              </div>
            )}

            {/* Lista de partidos */}
            <div className="flex flex-col gap-2 pb-20">
              {visibleMatches.map(m => {
                const home = 'group' in m ? m.home : (bracketMap[m.id]?.home ?? m.home);
                const away = 'group' in m ? m.away : (bracketMap[m.id]?.away ?? m.away);
                const result = resultMap[m.id] ?? null;
                return (
                  <MatchCard
                    key={m.id}
                    matchId={m.id}
                    home={home}
                    away={away}
                    prediction={preds[m.id] ?? { home: null, away: null }}
                    result={result ? { home: result.home_score, away: result.away_score } : null}
                    rules={rules}
                    locked={locked}
                    onSave={savePred}
                  />
                );
              })}
            </div>

          </div>
        )}
      </main>

      {/* Barra sticky inferior (solo en "Mi porra" y fase no bloqueada) */}
      {tab === 'porra' && !isLocked(activePhase) && phaseState[activePhase]?.open && (
        <div className="fixed bottom-14 left-0 right-0 bg-bg2/95 backdrop-blur border-t border-line px-4 py-3 flex gap-3 max-w-2xl mx-auto">
          <button
            onClick={fillRestZero}
            disabled={submitting}
            className="btn-secondary flex-1 text-sm"
          >
            Completar a 0-0
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="btn-primary flex-1 text-sm flex items-center justify-center gap-2"
          >
            {submitting ? <><Spinner size="sm" /> Enviando…</> : 'Enviar porra ➜'}
          </button>
        </div>
      )}

      {/* Tabs inferiores */}
      <nav className="fixed bottom-0 left-0 right-0 bg-bg2 border-t border-line flex">
        <button
          onClick={() => setTab('porra')}
          className={`tab-item ${tab === 'porra' ? 'active' : ''}`}
        >
          📝 Mi porra
        </button>
        <button
          onClick={() => setTab('clasificacion')}
          className={`tab-item ${tab === 'clasificacion' ? 'active' : ''}`}
        >
          🏆 Clasificación
        </button>
      </nav>
    </div>
  );
}
