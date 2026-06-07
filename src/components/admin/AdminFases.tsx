import { useState } from 'react';
import { rpcSetPhaseState } from '@/lib/supabase';
import { ALL_PHASES } from '@/lib/fixture';
import type { AdminPorra } from '@/hooks/useAdminData';
import Spinner from '@/components/Spinner';

interface Phase {
  phase_id: string;
  open: boolean;
  deadline: string | null;
  order_num: number;
}

interface Props {
  porra: AdminPorra;
  phases: Phase[];
  onUpdated: () => void;
}

export default function AdminFases({ porra, phases, onUpdated }: Props) {
  const [busy, setBusy] = useState<string | null>(null);

  const phaseMap = Object.fromEntries(phases.map(p => [p.phase_id, p]));
  const phaseInfo = Object.fromEntries(ALL_PHASES.map(p => [p.id, p]));

  async function toggleOpen(phaseId: string, currentOpen: boolean) {
    setBusy(phaseId);
    const current = phaseMap[phaseId];
    await rpcSetPhaseState({
      porraId:  porra.id,
      phaseId,
      open:     !currentOpen,
      deadline: current?.deadline ?? null,
    });
    await onUpdated();
    setBusy(null);
  }

  async function setDeadline(phaseId: string, deadline: string) {
    setBusy(phaseId + '-dl');
    const current = phaseMap[phaseId];
    await rpcSetPhaseState({
      porraId:  porra.id,
      phaseId,
      open:     current?.open ?? false,
      deadline: deadline || null,
    });
    await onUpdated();
    setBusy(null);
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted">
        Abre o cierra cada fase y fija su fecha límite de envío.
      </p>

      {ALL_PHASES.map(({ id }) => {
        const phase  = phaseMap[id];
        const info   = phaseInfo[id];
        const isOpen = phase?.open ?? false;
        const isBusy = busy === id || busy === id + '-dl';

        return (
          <div key={id} className="card flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-sm">{info?.name ?? id}</p>
                <p className="text-xs text-muted">{info?.dateLabel}</p>
              </div>
              <button
                onClick={() => toggleOpen(id, isOpen)}
                disabled={!!busy}
                className={`relative inline-flex h-6 w-11 items-center rounded-full
                  transition-colors disabled:opacity-50
                  ${isOpen ? 'bg-success' : 'bg-line'}`}
              >
                {isBusy && busy === id
                  ? <span className="absolute inset-0 flex items-center justify-center">
                      <Spinner size="sm" />
                    </span>
                  : <span className={`inline-block h-4 w-4 rounded-full bg-white shadow
                      transition-transform ${isOpen ? 'translate-x-6' : 'translate-x-1'}`}
                    />
                }
              </button>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-xs text-muted whitespace-nowrap">Fecha límite</label>
              <input
                type="date"
                defaultValue={phase?.deadline ?? ''}
                disabled={!!busy}
                onBlur={e => {
                  if (e.target.value !== (phase?.deadline ?? '')) {
                    setDeadline(id, e.target.value);
                  }
                }}
                className="flex-1 px-3 py-1.5 rounded-lg bg-bg2 border border-line text-sm
                           text-ink focus:outline-none focus:border-accent
                           disabled:opacity-50"
              />
              {busy === id + '-dl' && <Spinner size="sm" />}
            </div>
          </div>
        );
      })}
    </div>
  );
}
