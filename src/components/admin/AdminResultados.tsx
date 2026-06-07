import { useState } from 'react';
import { rpcSetResult, rpcSetBracket } from '@/lib/supabase';
import { ALL_PHASES, matchesOfPhase, matchesOfGroup, GROUP_LETTERS, flag, ALL_TEAMS } from '@/lib/fixture';
import type { GroupMatch, BracketMatch } from '@/types';
import Spinner from '@/components/Spinner';

interface ResultRow { match_id: string; home_score: number | null; away_score: number | null; }
interface BracketRow { phase_id: string; match_id: string; home: string; away: string; }

interface Props {
  torneoId: string;
  bracket: BracketRow[];
  results: ResultRow[];
  onUpdated: () => void;
}

export default function AdminResultados({ torneoId, bracket, results, onUpdated }: Props) {
  const [activePhase, setActivePhase] = useState('GROUPS');
  const [activeGroup, setActiveGroup] = useState('A');
  const [busy, setBusy] = useState<string | null>(null);

  const resultMap  = Object.fromEntries(results.map(r => [r.match_id, r]));
  const bracketMap = Object.fromEntries(bracket.map(b => [`${b.phase_id}:${b.match_id}`, b]));

  async function saveResult(matchId: string, home: string, away: string) {
    const h = parseInt(home); const a = parseInt(away);
    if (isNaN(h) || isNaN(a)) return;
    setBusy(matchId);
    await rpcSetResult({ torneoId, matchId, homeScore: h, awayScore: a });
    await onUpdated();
    setBusy(null);
  }

  async function saveBracket(phaseId: string, matchId: string, side: 'home' | 'away', val: string) {
    const key = `${phaseId}:${matchId}`;
    const cur = bracketMap[key] ?? { home: '', away: '' };
    setBusy(key + side);
    await rpcSetBracket({
      torneoId,
      phaseId,
      matchId,
      home: side === 'home' ? val : cur.home,
      away: side === 'away' ? val : cur.away,
    });
    await onUpdated();
    setBusy(null);
  }

  const matches = activePhase === 'GROUPS'
    ? matchesOfGroup(activeGroup)
    : matchesOfPhase(activePhase) as BracketMatch[];

  return (
    <div className="flex flex-col gap-4">
      {/* Selector de fase */}
      <div className="flex gap-2 flex-wrap">
        {ALL_PHASES.map(p => (
          <button
            key={p.id}
            onClick={() => setActivePhase(p.id)}
            className={`phase-pill ${activePhase === p.id ? 'active' : ''}`}
          >
            {p.name}
          </button>
        ))}
      </div>

      {/* Selector de grupo (solo en GROUPS) */}
      {activePhase === 'GROUPS' && (
        <div className="flex gap-2 flex-wrap">
          {GROUP_LETTERS.map(g => (
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

      {/* Lista de partidos */}
      <div className="flex flex-col gap-2">
        {activePhase === 'GROUPS'
          ? (matches as GroupMatch[]).map(m => {
              const res = resultMap[m.id];
              return (
                <MatchResultRow
                  key={m.id}
                  matchId={m.id}
                  home={m.home}
                  away={m.away}
                  homeScore={res?.home_score ?? null}
                  awayScore={res?.away_score ?? null}
                  busy={busy === m.id}
                  onSave={(h, a) => saveResult(m.id, h, a)}
                />
              );
            })
          : (matches as BracketMatch[]).map(m => {
              const key = `${activePhase}:${m.id}`;
              const bkt = bracketMap[key];
              const res = resultMap[m.id];
              return (
                <div key={m.id} className="card flex flex-col gap-2">
                  {/* Asignación de equipos reales */}
                  <p className="text-xs text-muted font-medium">{m.id}</p>
                  <div className="flex items-center gap-2 text-xs text-faint">
                    <span className="flex-1">{m.home}</span>
                    <span>vs</span>
                    <span className="flex-1 text-right">{m.away}</span>
                  </div>
                  <div className="flex gap-2">
                    <TeamInput
                      value={bkt?.home ?? ''}
                      placeholder="Equipo local"
                      busy={busy === key + 'home'}
                      onSave={v => saveBracket(activePhase, m.id, 'home', v)}
                    />
                    <TeamInput
                      value={bkt?.away ?? ''}
                      placeholder="Equipo visitante"
                      busy={busy === key + 'away'}
                      onSave={v => saveBracket(activePhase, m.id, 'away', v)}
                    />
                  </div>
                  {/* Resultado si ya hay equipos */}
                  {bkt?.home && bkt?.away && (
                    <MatchResultRow
                      matchId={m.id}
                      home={bkt.home}
                      away={bkt.away}
                      homeScore={res?.home_score ?? null}
                      awayScore={res?.away_score ?? null}
                      busy={busy === m.id}
                      onSave={(h, a) => saveResult(m.id, h, a)}
                    />
                  )}
                </div>
              );
            })
        }
      </div>
    </div>
  );
}

/* ── Fila de resultado ─────────────────────────────────────────────────── */
function MatchResultRow({ home, away, homeScore, awayScore, busy, onSave }: {
  matchId?: string;
  home: string; away: string;
  homeScore: number | null; awayScore: number | null;
  busy: boolean;
  onSave: (h: string, a: string) => void;
}) {
  const [h, setH] = useState(homeScore?.toString() ?? '');
  const [a, setA] = useState(awayScore?.toString() ?? '');

  function handleBlur() {
    if (h !== '' && a !== '') onSave(h, a);
  }

  return (
    <div className="card flex items-center gap-3">
      <span className="flex-1 text-sm font-medium truncate text-right">
        {flag(home)} {home}
      </span>
      <div className="flex items-center gap-1">
        <input
          type="number" min={0} max={99}
          value={h}
          onChange={e => setH(e.target.value)}
          onBlur={handleBlur}
          disabled={busy}
          className="score-input"
        />
        <span className="text-muted font-bold">–</span>
        <input
          type="number" min={0} max={99}
          value={a}
          onChange={e => setA(e.target.value)}
          onBlur={handleBlur}
          disabled={busy}
          className="score-input"
        />
        {busy && <Spinner size="sm" />}
      </div>
      <span className="flex-1 text-sm font-medium truncate">
        {flag(away)} {away}
      </span>
    </div>
  );
}

/* ── Input de equipo con datalist ──────────────────────────────────────── */
function TeamInput({ value, placeholder, busy, onSave }: {
  value: string; placeholder: string; busy: boolean; onSave: (v: string) => void;
}) {
  const [val, setVal] = useState(value);
  return (
    <div className="flex-1 flex items-center gap-1">
      <input
        list="teams-list"
        value={val}
        placeholder={placeholder}
        onChange={e => setVal(e.target.value)}
        onBlur={() => { if (val !== value) onSave(val); }}
        disabled={busy}
        className="w-full px-2 py-1.5 rounded-lg bg-bg2 border border-line text-xs
                   text-ink focus:outline-none focus:border-accent disabled:opacity-50"
      />
      {busy && <Spinner size="sm" />}
      <datalist id="teams-list">
        {ALL_TEAMS.map(t => <option key={t} value={t} />)}
      </datalist>
    </div>
  );
}
