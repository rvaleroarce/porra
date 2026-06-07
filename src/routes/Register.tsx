import { useState, type FormEvent } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { rpcRegister, isRpcError } from '@/lib/supabase';
import { useToken } from '@/hooks/useToken';
import Header from '@/components/Header';
import Spinner from '@/components/Spinner';

export default function Register() {
  const { slug }   = useParams<{ slug: string }>();
  const navigate   = useNavigate();
  const { saveToken } = useToken(slug!);

  const [name,  setName]  = useState('');
  const [phone, setPhone] = useState('');
  const [alias, setAlias] = useState('');
  const [email, setEmail] = useState('');
  const [busy,  setBusy]  = useState(false);
  const [error, setError] = useState('');
  const [isDuplicate, setIsDuplicate] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setIsDuplicate(false);

    try {
      const res = await rpcRegister({
        porraSlug: slug!,
        name: name.trim(),
        phone: phone.trim(),
        alias: alias.trim() || undefined,
        email: email.trim() || undefined,
      });

      if (isRpcError(res)) {
        if (res.error === 'duplicate') {
          setIsDuplicate(true);
          setError(res.hint ?? '¿Ya estás apuntado? Pide al organizador que te reenvíe tu enlace.');
        } else {
          setError(res.error);
        }
        return;
      }

      // Éxito: guardar token y entrar a la porra
      saveToken(res.token);
      navigate(`/p/${slug}`, { replace: true });

    } catch (err) {
      console.error('register error:', err);
      const msg = (err as { message?: string })?.message
        ?? (typeof err === 'string' ? err : JSON.stringify(err));
      setError(msg || 'Error desconocido');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <main className="flex-1 flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-sm card flex flex-col gap-6">

          <div className="text-center">
            <span className="text-4xl">📝</span>
            <h2 className="mt-3 text-xl font-bold">Apúntate a la porra</h2>
            <p className="mt-1 text-sm text-muted">
              Sin contraseña. Solo te pedimos un nombre y tu móvil.
            </p>
          </div>

          {isDuplicate ? (
            /* Estado: móvil duplicado */
            <div className="flex flex-col gap-4 text-center">
              <p className="text-sm text-muted">{error}</p>
              <button
                onClick={() => { setIsDuplicate(false); setError(''); }}
                className="btn-secondary text-sm"
              >
                Usar otro número
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">

              <Field label="Nombre *">
                <input
                  type="text" required autoFocus
                  placeholder="Tu nombre"
                  value={name} onChange={e => setName(e.target.value)}
                  disabled={busy}
                  className="field-input"
                />
              </Field>

              <Field label="Móvil *" hint="Solo lo ve el organizador">
                <input
                  type="tel" required
                  placeholder="612 345 678"
                  value={phone} onChange={e => setPhone(e.target.value)}
                  disabled={busy}
                  className="field-input"
                />
              </Field>

              <Field label="Alias" hint="Nombre que aparece en la clasificación">
                <input
                  type="text"
                  placeholder="LeoMessi10 (opcional)"
                  value={alias} onChange={e => setAlias(e.target.value)}
                  disabled={busy}
                  className="field-input"
                />
              </Field>

              <Field label="Email" hint="Opcional. Solo para recuperar tu enlace si lo pierdes.">
                <input
                  type="email"
                  placeholder="tu@email.com (opcional)"
                  value={email} onChange={e => setEmail(e.target.value)}
                  disabled={busy}
                  className="field-input"
                />
              </Field>

              {error && !isDuplicate && (
                <p className="text-sm text-accent">{error}</p>
              )}

              <button
                type="submit"
                disabled={busy || !name.trim() || !phone.trim()}
                className="btn-primary flex items-center justify-center gap-2"
              >
                {busy ? <><Spinner size="sm" /> Un momento…</> : '¡Apuntarme! ➜'}
              </button>

              <p className="text-xs text-faint text-center">
                Al apuntarte recibirás un enlace personal. Guárdalo en favoritos — es tu acceso a la porra.
              </p>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}

function Field({ label, hint, children }: {
  label: string; hint?: string; children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between">
        <label className="text-xs text-muted font-medium uppercase tracking-wide">{label}</label>
        {hint && <span className="text-xs text-faint">{hint}</span>}
      </div>
      {children}
    </div>
  );
}
