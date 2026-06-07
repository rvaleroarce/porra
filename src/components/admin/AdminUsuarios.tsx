import { useState } from 'react';
import { rpcSetPaid, rpcDeleteParticipant } from '@/lib/supabase';
import type { AdminUser } from '@/hooks/useAdminData';
import Spinner from '@/components/Spinner';

interface Props {
  users: AdminUser[];
  porraSlug: string;
  onUpdated: () => void;
}

export default function AdminUsuarios({ users, porraSlug, onUpdated }: Props) {
  const [busy, setBusy] = useState<string | null>(null);

  const paid    = users.filter(u => u.paid).length;
  const pending = users.length - paid;

  async function togglePaid(user: AdminUser) {
    setBusy(user.id + '-paid');
    await rpcSetPaid(user.id, !user.paid);
    await onUpdated();
    setBusy(null);
  }

  async function deleteUser(user: AdminUser) {
    if (!confirm(`¿Eliminar a ${user.alias || user.name}?`)) return;
    setBusy(user.id + '-del');
    await rpcDeleteParticipant(user.id);
    await onUpdated();
    setBusy(null);
  }

  function personalLink(token: string) {
    return `${window.location.origin}/p/${porraSlug}?u=${token}`;
  }

  function openWhatsApp(user: AdminUser) {
    // Normaliza teléfono: si tiene 9 dígitos asume España (+34)
    let phone = user.phone.replace(/\D/g, '');
    if (phone.length === 9) phone = '34' + phone;
    const link = personalLink(user.token);
    const text  = encodeURIComponent(
      `¡Hola ${user.alias || user.name}! 🏆 Te mando tu enlace personal para la porra del Mundial:\n\n${link}\n\nGuárdalo en favoritos para volver cuando quieras.`
    );
    window.open(`https://wa.me/${phone}?text=${text}`, '_blank');
  }

  function copyLink(token: string) {
    navigator.clipboard.writeText(personalLink(token));
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Resumen */}
      <div className="grid grid-cols-3 gap-3 text-center">
        {[
          { label: 'Total', value: users.length },
          { label: 'Pagados', value: paid, color: 'text-success' },
          { label: 'Pendientes', value: pending, color: pending > 0 ? 'text-accent2' : '' },
        ].map(s => (
          <div key={s.label} className="card py-3">
            <p className={`text-xl font-bold ${s.color ?? 'text-ink'}`}>{s.value}</p>
            <p className="text-xs text-muted">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Lista */}
      {users.length === 0 ? (
        <div className="card text-center py-8 text-muted text-sm">
          Aún no hay participantes. Comparte el enlace de la porra:<br />
          <span className="text-accent font-mono text-xs">
            {window.location.origin}/p/{porraSlug}
          </span>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {users.map(u => (
            <div key={u.id} className="card flex flex-col gap-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate">
                    {u.alias || u.name}
                    {u.alias && <span className="text-xs text-muted ml-1">({u.name})</span>}
                  </p>
                  <p className="text-xs text-muted">{formatPhone(u.phone)}</p>
                </div>
                <span className={`shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full
                  ${u.paid ? 'bg-success/20 text-success' : 'bg-accent2/20 text-accent2'}`}>
                  {u.paid ? 'Pagado' : 'Pendiente'}
                </span>
              </div>

              {/* Acciones */}
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={() => togglePaid(u)}
                  disabled={busy === u.id + '-paid'}
                  className="btn-secondary text-xs px-3 py-1 flex items-center gap-1"
                >
                  {busy === u.id + '-paid'
                    ? <Spinner size="sm" />
                    : u.paid ? '↩ Pendiente' : '✓ Marcar pagado'}
                </button>

                <button
                  onClick={() => openWhatsApp(u)}
                  className="btn-secondary text-xs px-3 py-1"
                >
                  💬 WhatsApp
                </button>

                <button
                  onClick={() => copyLink(u.token)}
                  className="btn-secondary text-xs px-3 py-1"
                >
                  🔗 Enlace
                </button>

                <button
                  onClick={() => deleteUser(u)}
                  disabled={busy === u.id + '-del'}
                  className="ml-auto btn-secondary text-xs px-3 py-1 text-accent
                             hover:border-accent"
                >
                  {busy === u.id + '-del' ? <Spinner size="sm" /> : '✕'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function formatPhone(phone: string): string {
  const d = phone.replace(/\D/g, '');
  if (d.length === 9) return d.replace(/(\d{3})(\d{3})(\d{3})/, '$1 $2 $3');
  return phone;
}
