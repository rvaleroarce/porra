import { useEffect } from 'react';

/**
 * Pone el título de la pestaña.
 *
 * El de `index.html` es solo el de reserva, el que se ve mientras carga:
 * como la app sirve para cualquier competición, ahí no puede haber nada
 * concreto. En cuanto se sabe qué porra es, se sustituye por su nombre —
 * que además es lo que distingue una pestaña de otra si tienes varias
 * porras abiertas.
 */
export function useDocumentTitle(partes: (string | null | undefined)[]) {
  const titulo = partes.filter(Boolean).join(' · ');
  useEffect(() => {
    if (!titulo) return;
    document.title = titulo;
    return () => { document.title = 'Porra'; };
  }, [titulo]);
}
