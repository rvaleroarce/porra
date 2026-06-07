import { useState, useEffect, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import Header from '@/components/Header';
import Spinner from '@/components/Spinner';

type Status = 'idle' | 'sending' | 'sent' | 'error';

export default function AdminLogin() {
  const { isAdmin, loading } = useAdminAuth();
  const navigate = useNavigate();
  const [email, setEmail]   = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [errMsg, setErrMsg] = useState('');

  // Si ya hay sesión activa, ir directo al panel
  useEffect(() => {
    if (!loading && isAdmin) navigate('/admin', { replace: true });
  }, [loading, isAdmin, navigate]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setStatus('sending');
    setErrMsg('');

    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        // Redirige al panel admin tras el clic en el email
        emailRedirectTo: `${window.location.origin}/admin`,
      },
    });

    if (error) {
      setStatus('error');
      setErrMsg(error.message);
    } else {
      setStatus('sent');
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <main className="flex-1 flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-sm card flex flex-col gap-6">

          {status !== 'sent' ? (
            <>
              <div className="text-center">
                <span className="text-4xl">🔑</span>
                <h2 className="mt-3 text-xl font-bold">Acceso de organizador</h2>
                <p className="mt-1 text-sm text-muted">
                  Te enviamos un enlace mágico a tu email. Sin contraseña.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="flex flex-col gap-3">
                <input
                  type="email"
                  required
                  autoFocus
                  placeholder="tu@email.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  disabled={status === 'sending'}
                  className="w-full px-4 py-3 rounded-xl bg-bg2 border border-line
                             text-ink placeholder:text-faint
                             focus:outline-none focus:border-accent
                             disabled:opacity-50"
                />

                {status === 'error' && (
                  <p className="text-sm text-accent">{errMsg}</p>
                )}

                <button
                  type="submit"
                  disabled={status === 'sending' || !email.trim()}
                  className="btn-primary flex items-center justify-center gap-2"
                >
                  {status === 'sending'
                    ? <><Spinner size="sm" /> Enviando…</>
                    : 'Enviar enlace mágico'}
                </button>
              </form>
            </>
          ) : (
            /* Estado: enlace enviado */
            <div className="text-center flex flex-col gap-4">
              <span className="text-5xl">📬</span>
              <h2 className="text-xl font-bold">¡Revisa tu email!</h2>
              <p className="text-sm text-muted">
                Te hemos enviado un enlace a{' '}
                <span className="text-ink font-medium">{email}</span>.
                Haz clic en él para entrar al panel.
              </p>
              <p className="text-xs text-faint">
                Si no aparece en unos segundos, mira la carpeta de spam.
              </p>
              <button
                onClick={() => { setStatus('idle'); setEmail(''); }}
                className="btn-secondary text-sm"
              >
                Usar otro email
              </button>
            </div>
          )}

        </div>
      </main>
    </div>
  );
}
