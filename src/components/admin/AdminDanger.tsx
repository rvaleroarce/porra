import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { AdminPorra } from '@/hooks/useAdminData';
import Spinner from '@/components/Spinner';

interface Props {
  porra: AdminPorra;
  onDeleted: () => void;
}

export default function AdminDanger({ porra, onDeleted }: Props) {
  const [confirming, setConfirming] = useState(false);
  const [input, setInput]           = useState('');
  const [busy, setBusy]             = useState(false);
  const [error, setError]           = useState('');

  async function handleDelete() {
    if (input.trim() !== porra.name) {
      setError('El nombre no coincide.');
      return;
    }
    setBusy(true);
    const { error: err } = await supabase
      .from('porras')
      .delete()
      .eq('id', porra.id);

    if (err) {
      setError(err.message);
      setBusy(false);
      return;
    }
    onDeleted();
  }

  if (!confirming) {
    return (
      <div className="card border-accent/30 flex flex-col gap-3">
        <div>
          <p className="text-sm font-semibold text-accent">Zona peligrosa</p>
          <p className="text-xs text-muted mt-0.5">
            Eliminar esta porra borrará también todos sus participantes,
            predicciones y envíos. Los resultados del torneo no se ven afectados.
          </p>
        </div>
        <button
          onClick={() => setConfirming(true)}
          className="self-start px-4 py-2 rounded-xl border border-accent text-accent
                     text-sm font-medium hover:bg-accent/10 transition-colors"
        >
          Eliminar porra…
        </button>
      </div>
    );
  }

  return (
    <div className="card border-accent/50 flex flex-col gap-4">
      <div>
        <p className="text-sm font-semibold text-accent">¿Seguro que quieres eliminar esta porra?</p>
        <p className="text-xs text-muted mt-1">
          Esta acción es <strong className="text-ink">irreversible</strong>. Se borrarán todos
          los participantes y predicciones de{' '}
          <span className="text-ink font-medium">"{porra.name}"</span>.
        </p>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted">
          Escribe <span className="text-ink font-medium">"{porra.name}"</span> para confirmar
        </label>
        <input
          type="text"
          value={input}
          onChange={e => { setInput(e.target.value); setError(''); }}
          placeholder={porra.name}
          disabled={busy}
          className="field-input text-sm"
        />
        {error && <p className="text-xs text-accent">{error}</p>}
      </div>

      <div className="flex gap-3">
        <button
          onClick={() => { setConfirming(false); setInput(''); setError(''); }}
          disabled={busy}
          className="btn-secondary flex-1 text-sm"
        >
          Cancelar
        </button>
        <button
          onClick={handleDelete}
          disabled={busy || input.trim() !== porra.name}
          className="flex-1 px-4 py-2.5 rounded-xl bg-accent text-white text-sm font-semibold
                     disabled:opacity-40 disabled:cursor-not-allowed
                     hover:bg-orange-500 transition-colors flex items-center justify-center gap-2"
        >
          {busy ? <><Spinner size="sm" /> Eliminando…</> : 'Eliminar definitivamente'}
        </button>
      </div>
    </div>
  );
}
