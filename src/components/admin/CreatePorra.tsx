import { useState, type FormEvent } from 'react';
import { supabase } from '@/lib/supabase';
import { PORRA_TIPOS, slugify } from '@/lib/porraTypes';
import Spinner from '@/components/Spinner';

export default function CreatePorra({ onCreated }: { onCreated: (porraId: string) => void }) {
  const [name, setName]   = useState('');
  const [tipo, setTipo]   = useState(PORRA_TIPOS[0].key);
  const [busy, setBusy]   = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError('');

    // Obtener el torneo mundial-2026
    const { data: torneos } = await supabase
      .from('torneos')
      .select('id')
      .eq('slug', 'mundial-2026')
      .single();

    if (!torneos) {
      setError('No se encontró el torneo. ¿Ejecutaste el seed.sql?');
      setBusy(false);
      return;
    }

    const tipoDef = PORRA_TIPOS.find(t => t.key === tipo)!;
    const { data, error: rpcError } = await supabase.rpc('create_porra', {
      p_torneo_id: torneos.id,
      p_name:      name.trim(),
      p_slug:      slugify(name.trim()),
      p_tipo:      tipo,
      p_matches:   tipoDef.resolveMatches(),
      p_phases:    tipoDef.resolvePhases(),
    });

    if (rpcError || !data?.ok) {
      setError(rpcError?.message ?? data?.error ?? 'Error desconocido');
      setBusy(false);
      return;
    }

    onCreated(data.porra_id as string);
  }

  return (
    <div className="w-full max-w-sm card flex flex-col gap-6">
      <div className="text-center">
        <span className="text-4xl">🏆</span>
        <h2 className="mt-3 text-xl font-bold">Crear tu porra</h2>
        <p className="mt-1 text-sm text-muted">
          Dale un nombre y elige qué partidos incluye.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted font-medium uppercase tracking-wide">
            Nombre de la porra
          </label>
          <input
            type="text"
            required
            autoFocus
            placeholder="Porra del bar"
            value={name}
            onChange={e => setName(e.target.value)}
            disabled={busy}
            className="w-full px-4 py-3 rounded-xl bg-bg2 border border-line
                       text-ink placeholder:text-faint
                       focus:outline-none focus:border-accent
                       disabled:opacity-50"
          />
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-xs text-muted font-medium uppercase tracking-wide">
            Tipo de porra
          </label>
          {PORRA_TIPOS.map(t => (
            <label
              key={t.key}
              className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors
                ${tipo === t.key ? 'border-accent bg-accent/10' : 'border-line hover:border-muted'}`}
            >
              <input
                type="radio"
                name="tipo"
                value={t.key}
                checked={tipo === t.key}
                onChange={() => setTipo(t.key)}
                className="mt-0.5 accent-accent"
              />
              <div>
                <p className="text-sm font-medium">{t.label}</p>
                <p className="text-xs text-muted">{t.description}</p>
              </div>
            </label>
          ))}
        </div>

        {error && (
          <p className="text-sm text-accent">{error}</p>
        )}

        <button
          type="submit"
          disabled={busy || !name.trim()}
          className="btn-primary flex items-center justify-center gap-2"
        >
          {busy ? <><Spinner size="sm" /> Creando…</> : 'Crear porra'}
        </button>
      </form>
    </div>
  );
}
