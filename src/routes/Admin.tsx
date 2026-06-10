import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import { useAdminData } from '@/hooks/useAdminData';
import Header from '@/components/Header';
import Spinner from '@/components/Spinner';
import CreatePorra from '@/components/admin/CreatePorra';
import AdminFases from '@/components/admin/AdminFases';
import AdminResultados from '@/components/admin/AdminResultados';
import AdminReglas from '@/components/admin/AdminReglas';
import AdminUsuarios from '@/components/admin/AdminUsuarios';
import AdminDanger from '@/components/admin/AdminDanger';
import Standings from '@/components/Standings';

type AdminTab     = 'clasificacion' | 'admin';
type AdminSection = 'fases' | 'resultados' | 'reglas' | 'usuarios' | 'peligroso';

export default function Admin() {
  const { session, loading: authLoading, signOut } = useAdminAuth();
  const navigate = useNavigate();

  const [selectedPorraId, setSelectedPorraId] = useState<string | null>(null);
  const [creatingPorra, setCreatingPorra]     = useState(false);
  const [tab, setTab]                         = useState<AdminTab>('clasificacion');
  const [section, setSection]                 = useState<AdminSection>('fases');

  const { porras, activePorra, boot, users, loading, error, refresh } = useAdminData(selectedPorraId);

  // Auth guard
  useEffect(() => {
    if (!authLoading && !session) navigate('/admin/login', { replace: true });
  }, [authLoading, session, navigate]);

  // Cuando se crea una porra nueva: seleccionarla y volver al panel
  function handlePorraCreated(porraId: string) {
    setCreatingPorra(false);
    setSelectedPorraId(porraId);
    // refresh se disparará solo al cambiar selectedPorraId
  }

  // Cuando se elimina la porra activa: ir a la siguiente disponible
  function handlePorraDeleted() {
    const remaining = porras.filter(p => p.id !== activePorra?.id);
    setSelectedPorraId(remaining[0]?.id ?? null);
    refresh();
  }

  if (authLoading || (loading && porras.length === 0)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!session) return null;

  // ── Sin porras todavía ───────────────────────────────────────────────
  if (!creatingPorra && porras.length === 0) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <SessionBar email={session.user.email!} onSignOut={signOut} />
        <main className="flex-1 flex flex-col items-center justify-center p-6">
          <CreatePorra onCreated={handlePorraCreated} />
        </main>
      </div>
    );
  }

  // ── Formulario de nueva porra (inline) ───────────────────────────────
  if (creatingPorra) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <SessionBar email={session.user.email!} onSignOut={signOut} />
        <main className="flex-1 flex flex-col items-center justify-center p-6">
          <div className="w-full max-w-sm flex flex-col gap-4">
            <button
              onClick={() => setCreatingPorra(false)}
              className="flex items-center gap-1 text-sm text-muted hover:text-ink transition-colors self-start"
            >
              ← Volver al panel
            </button>
            <CreatePorra onCreated={handlePorraCreated} />
          </div>
        </main>
      </div>
    );
  }

  // ── Panel principal ──────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex flex-col pb-16">
      <Header />
      <SessionBar email={session.user.email!} onSignOut={signOut} />

      {/* Selector de porra */}
      <div className="border-b border-line px-4 py-2 flex items-center gap-2 overflow-x-auto">
        {porras.map(p => (
          <button
            key={p.id}
            onClick={() => setSelectedPorraId(p.id)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-sm font-medium border transition-colors
              ${activePorra?.id === p.id
                ? 'bg-info border-info text-white'
                : 'border-line text-muted hover:text-ink hover:border-muted'}`}
          >
            {p.name}
          </button>
        ))}
        <button
          onClick={() => setCreatingPorra(true)}
          className="shrink-0 px-3 py-1.5 rounded-full text-sm border border-dashed
                     border-line text-faint hover:border-accent hover:text-accent transition-colors"
        >
          + Nueva porra
        </button>
      </div>

      {/* Contenido */}
      <main className="flex-1 p-4 max-w-2xl mx-auto w-full">
        {error && (
          <div className="mb-4 p-3 rounded-xl bg-accent/10 border border-accent/30 text-sm text-accent">
            {error}
          </div>
        )}

        {loading && (
          <div className="flex justify-center py-12">
            <Spinner size="lg" />
          </div>
        )}

        {!loading && activePorra && (
          <>
            {tab === 'clasificacion' && boot && (
              <Standings
                standings={boot.standings}
                matchesPlayed={boot.results.filter(r => r.home_score != null).length}
                paidCount={activePorra.cuota === 0 ? boot.standings.length : users.filter(u => u.paid).length}
                rules={{ exact: boot.porra.exact_pts, sign: boot.porra.sign_pts, miss: boot.porra.miss_pts }}
                prizeInfo={activePorra.prize_info}
                isFree={activePorra.cuota === 0}
              />
            )}

            {tab === 'admin' && (
              <div className="flex flex-col gap-4">
                {/* Sub-navegación */}
                <div className="flex gap-2 flex-wrap">
                  {(['fases', 'resultados', 'reglas', 'usuarios', 'peligroso'] as AdminSection[]).map(s => (
                    <button
                      key={s}
                      onClick={() => setSection(s)}
                      className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap
                        border transition-colors
                        ${section === s
                          ? 'bg-info border-info text-white'
                          : 'border-line text-muted hover:text-ink'}`}
                    >
                      {{ fases: '📅 Fases', resultados: '📊 Resultados',
                         reglas: '⚖️ Reglas', usuarios: '👥 Usuarios',
                         peligroso: '⚠️' }[s]}
                    </button>
                  ))}
                </div>

                {section === 'fases' && (
                  <AdminFases
                    porra={activePorra}
                    phases={boot?.phases ?? []}
                    onUpdated={refresh}
                  />
                )}
                {section === 'resultados' && (
                  <AdminResultados
                    torneoId={activePorra.torneo_id}
                    bracket={boot?.bracket ?? []}
                    results={boot?.results ?? []}
                    onUpdated={refresh}
                  />
                )}
                {section === 'reglas' && (
                  <AdminReglas porra={activePorra} onUpdated={refresh} />
                )}
                {section === 'usuarios' && (
                  <AdminUsuarios
                    users={users}
                    phases={boot?.phases ?? []}
                    porraSlug={activePorra.slug}
                    isFree={activePorra.cuota === 0}
                    onUpdated={refresh}
                  />
                )}
                {section === 'peligroso' && (
                  <AdminDanger
                    porra={activePorra}
                    onDeleted={handlePorraDeleted}
                  />
                )}
              </div>
            )}
          </>
        )}
      </main>

      {/* Enlace de la porra activa */}
      {activePorra && (
        <div className="fixed bottom-14 left-0 right-0 border-t border-line/50 bg-bg">
          <div className="max-w-2xl mx-auto px-4 py-1.5 flex items-center justify-between gap-2">
            <p className="text-xs text-faint truncate">
              Enlace: <span className="text-muted">/p/{activePorra.slug}</span>
            </p>
            <button
              onClick={() => navigator.clipboard.writeText(
                `${window.location.origin}/p/${activePorra.slug}`
              )}
              className="text-xs text-faint hover:text-accent transition-colors shrink-0"
            >
              Copiar 🔗
            </button>
          </div>
        </div>
      )}

      {/* Tabs */}
      <nav className="fixed bottom-0 left-0 right-0 bg-bg2 border-t border-line flex">
        <button
          onClick={() => setTab('clasificacion')}
          className={`tab-item ${tab === 'clasificacion' ? 'active' : ''}`}
        >
          🏆 Clasificación
        </button>
        <button
          onClick={() => setTab('admin')}
          className={`tab-item ${tab === 'admin' ? 'active' : ''}`}
        >
          ⚙️ Admin
        </button>
      </nav>
    </div>
  );
}

// ── Barra de sesión ──────────────────────────────────────────────────────
function SessionBar({ email, onSignOut }: { email: string; onSignOut: () => void }) {
  return (
    <div className="flex items-center justify-between px-4 py-2 border-b border-line">
      <p className="text-xs text-muted truncate">{email}</p>
      <button
        onClick={onSignOut}
        className="text-xs text-faint hover:text-muted transition-colors shrink-0 ml-2"
      >
        Cerrar sesión
      </button>
    </div>
  );
}
