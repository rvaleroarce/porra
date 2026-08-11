import { useState } from 'react';
import { rpcSetPhaseState } from '@/lib/supabase';
import type { AdminPorra } from '@/hooks/useAdminData';
import Spinner from '@/components/Spinner';

interface Phase {
  phase_id:   string;
  name:       string;
  short_name: string;
  open:       boolean;
  deadline:   string | null;
  order_num:  number;
}

interface Props {
  porra: AdminPorra;
  phases: Phase[];
  onUpdated: () => void;
}

/** ISO → valor de un <input type="datetime-local"> en hora local. */
function aInputLocal(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default function AdminFases({ porra, phases, onUpdated }: Props) {
  const [busy, setBusy] = useState<string | null>(null);

  async function guardar(phase: Phase, cambios: { open?: boolean; deadline?: string | null }) {
    const clave = phase.phase_id + (cambios.deadline !== undefined ? '-dl' : '');
    setBusy(clave);
    await rpcSetPhaseState({
      porraId:  porra.id,
      phaseId:  phase.phase_id,
      open:     cambios.open ?? phase.open,
      deadline: cambios.deadline ?? null,
    });
    await onUpdated();
    setBusy(null);
  }

  if (!phases.length) {
    return (
      <div className="card text-center py-8 text-muted text-sm">
        Esta porra no tiene fases.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted">
        Abre o cierra cada fase. La fecha límite se calcula sola con el primer
        partido de la fase; si la fijas a mano, deja de actualizarse.
      </p>

      {phases.map(phase => {
        const { phase_id, name, open, deadline } = phase;
        const isBusy = busy === phase_id || busy === phase_id + '-dl';

        return (
          <div key={phase_id} className="card flex flex-col gap-2 py-3">
            <div className="flex items-center justify-between gap-2">
              <p className="font-medium text-sm">{name}</p>
              <button
                onClick={() => guardar(phase, { open: !open })}
                disabled={!!busy}
                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full
                  transition-colors disabled:opacity-50
                  ${open ? 'bg-success' : 'bg-line'}`}
              >
                {isBusy && busy === phase_id
                  ? <span className="absolute inset-0 flex items-center justify-center">
                      <Spinner size="sm" />
                    </span>
                  : <span className={`inline-block h-4 w-4 rounded-full bg-white shadow
                      transition-transform ${open ? 'translate-x-6' : 'translate-x-1'}`}
                    />
                }
              </button>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-xs text-muted whitespace-nowrap">Cierra</label>
              <input
                type="datetime-local"
                defaultValue={aInputLocal(deadline)}
                disabled={!!busy}
                onBlur={e => {
                  const nuevo = e.target.value;
                  if (nuevo === aInputLocal(deadline)) return;
                  guardar(phase, { deadline: nuevo ? new Date(nuevo).toISOString() : null });
                }}
                className="flex-1 px-3 py-1.5 rounded-lg bg-bg2 border border-line text-sm
                           text-ink focus:outline-none focus:border-accent
                           disabled:opacity-50"
              />
              {busy === phase_id + '-dl' && <Spinner size="sm" />}
            </div>
          </div>
        );
      })}
    </div>
  );
}
