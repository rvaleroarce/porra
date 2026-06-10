import { useState } from 'react';
import { rpcSetRules } from '@/lib/supabase';
import { supabase } from '@/lib/supabase';
import type { AdminPorra } from '@/hooks/useAdminData';
import Spinner from '@/components/Spinner';

export default function AdminReglas({ porra, onUpdated }: { porra: AdminPorra; onUpdated: () => void }) {
  const [exact,     setExact]     = useState(porra.exact_pts);
  const [sign,      setSign]      = useState(porra.sign_pts);
  const [miss,      setMiss]      = useState(porra.miss_pts);
  const [cuota,     setCuota]     = useState(porra.cuota?.toString() ?? '');
  const [prizeInfo, setPrizeInfo] = useState(porra.prize_info ?? '');
  const [busy,      setBusy]      = useState(false);
  const [saved,     setSaved]     = useState(false);

  async function handleSave() {
    setBusy(true);
    setSaved(false);

    await Promise.all([
      rpcSetRules({ porraId: porra.id, exact, sign, miss }),
      supabase.from('porras').update({
        cuota: cuota.trim() === '' ? null : Number(cuota),
        prize_info: prizeInfo || null,
      }).eq('id', porra.id),
    ]);

    await onUpdated();
    setBusy(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="flex flex-col gap-5">

      {/* Puntos */}
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
      </div>

      {/* Cuota */}
      <div className="card flex flex-col gap-3">
        <div>
          <h3 className="font-semibold">💶 Cuota por participante</h3>
          <p className="text-xs text-muted mt-0.5">
            Pon <span className="font-medium">0</span> para una porra gratis (se ocultan los pagos).
            Déjalo vacío para mantener el modo de pago sin importe fijo.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min="0"
            step="any"
            inputMode="decimal"
            placeholder="0 = gratis"
            value={cuota}
            onChange={e => setCuota(e.target.value)}
            className="w-32 px-4 py-3 rounded-xl bg-bg2 border border-line text-sm
                       text-ink placeholder:text-faint
                       focus:outline-none focus:border-accent"
          />
          <span className="text-sm text-muted">€</span>
        </div>
      </div>

      {/* Premio */}
      <div className="card flex flex-col gap-3">
        <div>
          <h3 className="font-semibold">🏆 Premio</h3>
          <p className="text-xs text-muted mt-0.5">
            Se muestra en la clasificación y en las instrucciones.
          </p>
        </div>
        <textarea
          rows={3}
          value={prizeInfo}
          onChange={e => setPrizeInfo(e.target.value)}
          placeholder="Ej: El ganador se lleva el bote completo (10 € × participante). En caso de empate se reparte a partes iguales."
          className="w-full px-4 py-3 rounded-xl bg-bg2 border border-line text-sm
                     text-ink placeholder:text-faint resize-none
                     focus:outline-none focus:border-accent"
        />
      </div>

      <button
        onClick={handleSave}
        disabled={busy}
        className="btn-primary flex items-center justify-center gap-2"
      >
        {busy
          ? <><Spinner size="sm" /> Guardando…</>
          : saved ? '✓ Guardado' : 'Guardar'}
      </button>
    </div>
  );
}
