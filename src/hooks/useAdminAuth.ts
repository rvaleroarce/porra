import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { Session } from '@supabase/supabase-js';

/**
 * Estado de sesión del admin (Supabase Auth).
 * - loading: true mientras se comprueba la sesión inicial.
 * - session: null = no autenticado; Session = autenticado.
 */
export function useAdminAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading]  = useState(true);

  useEffect(() => {
    // Sesión inicial (incluye el intercambio del ?code= del magic-link)
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    // Cambios posteriores (login, logout, refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = () => supabase.auth.signOut();

  return { session, loading, isAdmin: !!session, signOut };
}
