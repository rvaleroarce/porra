import { useState, useEffect } from 'react';

/**
 * Gestiona el token del participante para una porra concreta.
 * - Si viene en la URL (?u=TOKEN), lo guarda en localStorage y limpia la URL.
 * - Si ya está en localStorage, lo devuelve directamente (síncrono vía initializer).
 */
export function useToken(slug: string) {
  const LS_KEY = `porra_token_${slug}`;

  const [token, setTokenState] = useState<string | null>(() => {
    // Leer token de la URL o de localStorage al montar
    const params = new URLSearchParams(window.location.search);
    const urlTok = params.get('u');
    if (urlTok) {
      localStorage.setItem(LS_KEY, urlTok);
      return urlTok;
    }
    return localStorage.getItem(LS_KEY);
  });

  // Limpiar el parámetro ?u= de la URL (una sola vez al montar)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has('u')) {
      params.delete('u');
      const clean = params.size > 0
        ? `${window.location.pathname}?${params}`
        : window.location.pathname;
      window.history.replaceState({}, '', clean);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const saveToken = (t: string) => {
    localStorage.setItem(LS_KEY, t);
    setTokenState(t);
  };

  const clearToken = () => {
    localStorage.removeItem(LS_KEY);
    setTokenState(null);
  };

  return { token, saveToken, clearToken };
}
