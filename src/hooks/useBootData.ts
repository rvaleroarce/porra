import { useEffect, useState, useCallback } from 'react';
import { rpcBoot, isRpcError, type BootResponse } from '@/lib/supabase';

/**
 * Carga el estado inicial de la porra en una sola llamada.
 * Devuelve boot.me=null si el token no existe o es inválido.
 */
export function useBootData(slug: string, token: string | null) {
  const [data, setData]       = useState<BootResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await rpcBoot(slug, token);
      if (isRpcError(res)) {
        setError(res.error);
      } else {
        setData(res);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [slug, token]);

  useEffect(() => { fetch(); }, [fetch]);

  return { data, loading, error, refresh: fetch };
}
