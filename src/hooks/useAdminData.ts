import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { BootResponse } from '@/lib/supabase';

export interface AdminPorra {
  id: string;
  slug: string;
  name: string;
  tipo: string;
  exact_pts: number;
  sign_pts: number;
  miss_pts: number;
  torneo_id: string;
}

export interface AdminUser {
  id: string;
  name: string;
  alias: string | null;
  phone: string;
  email: string | null;
  paid: boolean;
  token: string;
  created_at: string;
}

export function useAdminData(activePorraId: string | null) {
  const [porras, setPorras]             = useState<AdminPorra[]>([]);
  const [activePorra, setActivePorra]   = useState<AdminPorra | null>(null);
  const [boot, setBoot]                 = useState<BootResponse | null>(null);
  const [users, setUsers]               = useState<AdminUser[]>([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);

    // 1. Cargar lista de porras
    const { data: porraList, error: pErr } = await supabase
      .from('porras')
      .select('id, slug, name, tipo, exact_pts, sign_pts, miss_pts, torneo_id')
      .order('created_at');

    if (pErr) { setError(pErr.message); setLoading(false); return; }
    const list = porraList ?? [];
    setPorras(list);
    if (list.length === 0) { setLoading(false); return; }

    // 2. Seleccionar porra activa
    const target = (activePorraId ? list.find(p => p.id === activePorraId) : null) ?? list[0];
    setActivePorra(target);

    // 3. Cargar boot + usuarios en paralelo
    const [bootRes, usersRes] = await Promise.all([
      supabase.rpc('boot', { p_slug: target.slug, p_token: null }),
      supabase.rpc('admin_boot', { p_porra_id: target.id }),
    ]);

    if (bootRes.error)  setError(bootRes.error.message);
    else if (bootRes.data?.ok)  setBoot(bootRes.data as BootResponse);

    if (usersRes.error) setError(usersRes.error.message);
    else if (usersRes.data?.ok) setUsers(usersRes.data.users ?? []);

    setLoading(false);
  }, [activePorraId]);

  useEffect(() => { refresh(); }, [refresh]);

  return { porras, activePorra, boot, users, loading, error, refresh };
}
