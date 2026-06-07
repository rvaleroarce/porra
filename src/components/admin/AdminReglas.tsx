import { useState } from 'react';
import { rpcSetRules } from '@/lib/supabase';
import type { AdminPorra } from '@/hooks/useAdminData';
import Spinner from '@/components/Spinner';

export default function AdminReglas({ porra, onUpdated }: { porra: AdminPorra; onUpdated: () => void }) {
  const [exact, setExact] = useState(porra.exact_pts);
  const [sign,  setSign]  = useState(porra.sign_pts);
  const [miss,  setMiss]  = useState(porra.miss_pts);
  const [busy,  setBusy]  = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    setBusy(true);
    setSaved(false);
    await rpcSetRules({ porraId: porra.id, exact, sign, miss });
    await onUpdated();
    setBusy(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="card flex flex-col gap-5">
      <div>
        <h3 className="font-semibold">Puntos por resultado</h3>
        <p className="text-xs text-muted mt-0.5">
          Se aplican a todos los partidos de esta porra.
        </p>
      </div>

      {[
        { label: '✓✓ Marcador exacto', value: exact, set: setExact, color: 'text-gold' },
        { label: '✓ Signo correcto (1X2)', value: sign, set: setSign, color: 'text-success' },
        { label: '✗ Fallo', value: miss, set: setMiss, color: 'text-faint' },
      ].map(row => (
        <div key={row.label} className="flex items-center justify-between">
          <span className={`text-sm font-medium ${row.color}`}>{row.label}</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => row.set(Math.max(0, row.value - 1))}
              className="w-8 h-8 rounded-lg border border-line text-muted
                         hover:border-accent hover:text-ink transition-colors text-lg"
            >−</button>
            <span className="w-6 text-center font-bold">{row.value}</span>
            <button
              onClick={() => row.set(row.value + 1)}
              className="w-8 h-8 rounded-lg border border-line text-muted
                         hover:border-accent hover:text-ink transition-colors text-lg"
            >+</button>
          </div>
        </div>
      ))}

      <button
        onClick={handleSave}
        disabled={busy}
        className="btn-primary flex items-center justify-center gap-2"
      >
        {busy
          ? <><Spinner size="sm" /> Guardando…</>
          : saved ? '✓ Guardado' : 'Guardar reglas'}
      </button>
    </div>
  );
}
