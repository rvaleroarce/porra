import type { BootResponse } from './supabase';

type Fase = BootResponse['phases'][number];

/**
 * La fecha límite es un instante, así que basta comparar marcas de tiempo:
 * el cliente y el servidor (`now() >= deadline`) llegan a lo mismo.
 */
export function isDeadlinePast(deadline: string | null): boolean {
  if (!deadline) return false;
  return Date.now() >= new Date(deadline).getTime();
}

/**
 * Cerrada para todos: ya nadie puede cambiar su pronóstico.
 *
 * Es la condición que decide si se pueden destapar los pronósticos de los
 * demás, y la misma que aplica `phase_predictions` en el servidor. Vive
 * aquí para que no acaben divergiendo: aquí solo sirve para no enseñar una
 * pestaña vacía, porque quien decide de verdad es el servidor.
 */
export function estaCerrada(fase: Fase): boolean {
  return !fase.open || isDeadlinePast(fase.deadline);
}
