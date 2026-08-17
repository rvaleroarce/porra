import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useToken } from '@/hooks/useToken';
import { useBootData } from '@/hooks/useBootData';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { supabase, rpcSavePredictions, rpcSubmitPhase, type BootMatch } from '@/lib/supabase';
import type { Score } from '@/types';
import Header from '@/components/Header';
import Spinner from '@/components/Spinner';
import Standings from '@/components/Standings';
import MatchCard from '@/components/MatchCard';
import Toast, { type ToastState } from '@/components/Toast';

type Tab = 'porra' | 'clasificacion';

// La fecha límite es el instante del primer partido de la fase, así que basta
// comparar marcas de tiempo: cliente y servidor (`now() >= deadline`) coinciden.
function isDeadlinePast(deadline: string | null): boolean {
  if (!deadline) return false;
  return Date.now() >= new Date(deadline).getTime();
}

function formatoFecha(iso: string): string {
  return new Date(iso).toLocaleString('es-ES', {
    weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

export default function PorraView() {
  const { slug }       = useParams<{ slug: string }>();
  const navigate       = useNavigate();
  const { token, clearToken } = useToken(slug!);

  const { data: boot, loading, error, refresh } = useBootData(slug!, token);

  useDocumentTitle([boot?.porra.name, boot?.torneo.name]);

  const [tab, setTab]           = useState<Tab>('porra');
  const [activePhase, setPhase] = useState('');
  const [activeGroup, setGroup] = useState('');
  const [preds, setPreds]       = useState<Record<string, Score>>({});
  const [submitting, setSubmitting] = useState(false);
  const [receiptBusy, setReceiptBusy] = useState(false);
  const [toast, setToast]           = useState<ToastState | null>(null);

  // Fechas de envío por fase — guardadas en localStorage para persistir
  const LS_SUBMIT_KEY = `porra_submits_${slug}`;
  const [submitDates, setSubmitDates] = useState<Record<string, string>>(() => {
    try { return JSON.parse(localStorage.getItem(LS_SUBMIT_KEY) ?? '{}'); }
    catch { return {}; }
  });

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

  // Recuperar fechas de envío del servidor (para envíos anteriores al feature)
  useEffect(() => {
    if (!boot || !token) return;
    supabase.rpc('get_submission_dates', {
      p_token:    token,
      p_porra_id: boot.porra.id,
    }).then(({ data }) => {
      if (!data) return;
      const serverDates: Record<string, string> = {};
      for (const s of (data as { phase_id: string; submitted_at: string }[])) {
        serverDates[s.phase_id] = s.submitted_at;
      }
      // Servidor es la fuente de verdad; localStorage prevalece si es más reciente
      setSubmitDates(prev => {
        const merged = { ...serverDates, ...prev };
        localStorage.setItem(LS_SUBMIT_KEY, JSON.stringify(merged));
        return merged;
      });
    });
  }, [boot?.porra.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Datos derivados de boot ──────────────────────────────────────────

  const phases     = boot?.phases ?? [];
  const phaseInfo  = Object.fromEntries(phases.map(p => [p.phase_id, p]));
  const phaseState = phaseInfo;
  const submitted  = new Set(boot?.me?.submitted ?? []);
  const rules      = boot
    ? { exact: boot.porra.exact_pts, sign: boot.porra.sign_pts, miss: boot.porra.miss_pts }
    : { exact: 3, sign: 1, miss: 0 };
  const isFree     = boot?.porra.cuota === 0;
  const prizeInfo  = boot?.porra.prize_info ?? null;

  /** Los partidos de la porra, agrupados por fase y en orden. */
  const matchesByPhase = useMemo(() => {
    const mapa: Record<string, BootMatch[]> = {};
    for (const m of boot?.matches ?? []) (mapa[m.phase_id] ??= []).push(m);
    return mapa;
  }, [boot?.matches]);

  /** Arranca en la primera fase jugable; si no hay ninguna, en la primera. */
  useEffect(() => {
    if (activePhase || !phases.length) return;
    const jugable = phases.find(p => p.open && !isDeadlinePast(p.deadline));
    setPhase((jugable ?? phases[0]).phase_id);
  }, [phases, activePhase]);

  function isLocked(phaseId: string): boolean {
    if (submitted.has(phaseId)) return true;
    const ph = phaseState[phaseId];
    if (!ph || !ph.open) return true;
    if (isDeadlinePast(ph.deadline)) return true;
    return false;
  }

  const locked = isLocked(activePhase);

  /** Todos los partidos de la fase activa (progreso y "completar a 0-0"). */
  const allPhaseMatches = matchesByPhase[activePhase] ?? [];

  /** Grupos de la fase activa. En liga no hay ninguno y el selector no sale. */
  const grupos = useMemo(() => {
    const s = new Set(allPhaseMatches.map(m => m.group_label).filter(Boolean));
    return [...s].sort() as string[];
  }, [allPhaseMatches]);

  useEffect(() => {
    if (grupos.length && !grupos.includes(activeGroup)) setGroup(grupos[0]);
  }, [grupos, activeGroup]);

  /** Partidos visibles: los del grupo activo si la fase tiene grupos. */
  const visibleMatches = grupos.length
    ? allPhaseMatches.filter(m => m.group_label === activeGroup)
    : allPhaseMatches;

  /** Predicciones rellenas en la fase activa */
  const filled = allPhaseMatches.filter(m => {
    const p = preds[m.match_id];
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
      const p = preds[m.match_id];
      if (p?.home == null || p?.away == null) {
        updates[m.match_id] = { home: 0, away: 0 };
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
    const phaseName = phaseInfo[activePhase]?.name ?? 'esta fase';
    const emptyMsg = empty > 0
      ? `\n\nHay ${empty} partido${empty > 1 ? 's' : ''} sin rellenar.`
      : '';
    if (!confirm(`¿Enviar la porra de ${phaseName}? Se bloqueará y no podrás cambiar tus pronósticos.${emptyMsg}`)) return;
    setSubmitting(true);
    const allPreds = allPhaseMatches
      .filter(m => preds[m.match_id]?.home != null && preds[m.match_id]?.away != null)
      .map(m => ({
        match_id:   m.match_id,
        home_score: preds[m.match_id].home!,
        away_score: preds[m.match_id].away!,
      }));

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
    // Guardar fecha de envío en localStorage
    const now = new Date().toISOString();
    const updated = { ...submitDates, [activePhase]: now };
    setSubmitDates(updated);
    localStorage.setItem(LS_SUBMIT_KEY, JSON.stringify(updated));

    setToast({ msg: '✓ Porra enviada y bloqueada' });
    refresh();
  }

  async function handleDownloadReceipt() {
    if (!boot || !user || receiptBusy) return;
    setReceiptBusy(true);
    try {
      // Carga diferida de jsPDF para no penalizar la carga inicial
      const { generateReceipt } = await import('@/lib/generateReceipt');
      generateReceipt({
        porraName:       boot.porra.name,
        tournament:      boot.torneo.name,
        participantName: user.alias || user.name,
        phaseName:       phaseInfo[activePhase]?.name ?? activePhase,
        submittedAt:     submitDates[activePhase] ? new Date(submitDates[activePhase]) : new Date(),
        matches:         allPhaseMatches,
        preds,
      });
      setToast({ msg: '✓ Resguardo descargado' });
    } catch (e) {
      console.error('Error al generar el resguardo:', e);
      setToast({ msg: 'No se pudo generar el resguardo. Recarga la página e inténtalo de nuevo.', isError: true });
    } finally {
      setReceiptBusy(false);
    }
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
      <Header
        porraName={boot?.porra.name}
        tournamentName={boot?.torneo.name}
        tournamentEmblem={boot?.torneo.emblem_url}
      />
      <Toast toast={toast} onDone={() => setToast(null)} />

      {/* Info del usuario */}
      {user && (
        <div className="px-4 py-2 border-b border-line flex items-center justify-between gap-2">
          <p className="text-xs text-muted truncate">
            {user.alias || user.name}
            {!isFree && !user.paid && (
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
            matchesPlayed={boot.matches.filter(m => m.home_score != null).length}
            paidCount={boot.paid_count}
            cuota={boot.porra.cuota}
            rules={rules}
            currentUserId={user?.id}
            prizeInfo={prizeInfo}
            isFree={isFree}
          />
        )}

        {/* ── Mi porra ── */}
        {tab === 'porra' && (
          <div className="flex flex-col gap-4">

            {/* Selector de fases — con 38 jornadas no cabe en pantalla, así que
                se desliza en horizontal y la activa se centra sola. */}
            <div className="flex gap-2 overflow-x-auto -mx-4 px-4 pb-1 scrollbar-none">
              {phases.map(p => {
                const lock = isLocked(p.phase_id);
                const noPhase = !p.open;
                const activa = activePhase === p.phase_id;
                return (
                  <button
                    key={p.phase_id}
                    ref={activa ? (el) => el?.scrollIntoView({ block: 'nearest', inline: 'center' }) : undefined}
                    onClick={() => !noPhase && setPhase(p.phase_id)}
                    disabled={noPhase}
                    className={`phase-pill shrink-0
                      ${activa ? 'active' : ''}
                      ${noPhase ? 'locked' : ''}`}
                  >
                    {lock && !noPhase ? '🔒 ' : ''}{p.short_name}
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
              const isPast = isDeadlinePast(ph.deadline);
              const submitDate = submitDates[activePhase]
                ? new Date(submitDates[activePhase]).toLocaleString('es-ES', {
                    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
                  })
                : null;
              return (
                <div className="card flex flex-col gap-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{phaseInfo[activePhase]?.name}</span>
                    {isSubmitted
                      ? <span className="text-success font-semibold text-xs">
                          ✓ Enviada{submitDate ? ` · ${submitDate}` : ''}
                        </span>
                      : isPast
                        ? <span className="text-accent text-xs">⏰ Cerrada</span>
                        : ph.deadline
                          ? <span className="text-muted text-xs">Cierra: {formatoFecha(ph.deadline)}</span>
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
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted">
                      {filled} / {allPhaseMatches.length} partidos
                    </p>
                    {isSubmitted && (
                      <button
                        onClick={handleDownloadReceipt}
                        disabled={receiptBusy}
                        className="text-xs text-info hover:text-ink transition-colors flex items-center gap-1 disabled:opacity-50"
                      >
                        {receiptBusy
                          ? <><Spinner size="sm" /> Generando…</>
                          : '📄 Descargar resguardo'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* Selector de grupo — solo en fases que tienen grupos */}
            {grupos.length > 0 && (
              <div className="flex gap-2 flex-wrap">
                {grupos.map(g => (
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
            <div className="flex flex-col gap-2 pb-28">
              {visibleMatches.map(m => (
                <MatchCard
                  key={m.match_id}
                  matchId={m.match_id}
                  home={m.home ?? '—'}
                  away={m.away ?? '—'}
                  homeCrest={m.home_crest}
                  awayCrest={m.away_crest}
                  prediction={preds[m.match_id] ?? { home: null, away: null }}
                  result={m.home_score != null && m.away_score != null
                    ? { home: m.home_score, away: m.away_score }
                    : null}
                  rules={rules}
                  locked={locked}
                  onSave={savePred}
                />
              ))}
              {visibleMatches.length === 0 && (
                <p className="card text-center py-6 text-muted text-sm">
                  No hay partidos en esta fase.
                </p>
              )}
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
