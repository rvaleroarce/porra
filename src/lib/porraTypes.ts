/* =========================================================================
   Tipos de porra — funciones resolveMatches
   -------------------------------------------------------------------------
   Un "tipo de porra" es una función que, dado el fixture, devuelve qué
   partidos entran en la porra y qué fases tiene.
   Al crear la porra se ejecuta una vez y se materializa en porra_matches
   y porra_phases. A partir de ahí, todo el resto (UI, puntuación) solo
   lee esas tablas.

   Añadir un tipo nuevo = añadir una entrada a PORRA_TIPOS. Sin tocar BD.
   ========================================================================= */

import { FIXTURE, ALL_PHASES, allMatches } from './fixture';

export interface PorraTypeMatch {
  match_id: string;
  phase_id: string;
}

export interface PorraTypePhase {
  phase_id: string;
  order_num: number;
}

export interface PorraTypeDefinition {
  key: string;
  label: string;
  description: string;
  resolveMatches(): PorraTypeMatch[];
  resolvePhases(): PorraTypePhase[];
}

/* -----------------------------------------------------------------------
   Tipo TODOS — todos los partidos del torneo (v1)
   ----------------------------------------------------------------------- */
const TODOS: PorraTypeDefinition = {
  key: 'TODOS',
  label: 'Todos los partidos',
  description: 'Fase de grupos completa + todas las eliminatorias (104 partidos)',
  resolveMatches() {
    return allMatches().map(m => ({ match_id: m.id, phase_id: m.phaseId }));
  },
  resolvePhases() {
    return ALL_PHASES.map((p, i) => ({ phase_id: p.id, order_num: i }));
  },
};

/* -----------------------------------------------------------------------
   Catálogo de tipos disponibles
   (añadir aquí nuevos tipos en el futuro sin tocar nada más)
   ----------------------------------------------------------------------- */
export const PORRA_TIPOS: PorraTypeDefinition[] = [TODOS];

export function getPorraTipo(key: string): PorraTypeDefinition | undefined {
  return PORRA_TIPOS.find(t => t.key === key);
}

/** Genera un slug URL-safe a partir del nombre de la porra. */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')  // quitar acentos
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

// Exportar FIXTURE para acceso externo si hace falta
export { FIXTURE };
