/* =========================================================================
   FIXTURE estático — Mundial 2026
   -------------------------------------------------------------------------
   Estructura inmutable del torneo: equipos, grupos, los 72 partidos de la
   fase de grupos, y la estructura de cruces de las eliminatorias.

   Extraído *verbatim* del prototipo (porra-app.html / Codigo.gs). NO es dato
   de BD: es un recurso estático del torneo. Solo lo dinámico (resultados,
   asignación de equipos a cruces, y todo lo de las porras) vive en Supabase.

   Sorteo real del Mundial 2026 (Canadá · México · EE. UU.).
   ========================================================================= */

import type { Fixture, GroupMatch, KnockoutPhase, PhaseInfo, Match } from '../types';

/** Los 12 grupos con sus 4 equipos. */
const groups: Record<string, string[]> = {
  A: ['México', 'Sudáfrica', 'Corea del Sur', 'Chequia'],
  B: ['Canadá', 'Suiza', 'Qatar', 'Bosnia y Herzegovina'],
  C: ['Brasil', 'Marruecos', 'Haití', 'Escocia'],
  D: ['Estados Unidos', 'Paraguay', 'Australia', 'Turquía'],
  E: ['Alemania', 'Curazao', 'Costa de Marfil', 'Ecuador'],
  F: ['Países Bajos', 'Japón', 'Túnez', 'Suecia'],
  G: ['Bélgica', 'Egipto', 'Irán', 'Nueva Zelanda'],
  H: ['España', 'Cabo Verde', 'Arabia Saudita', 'Uruguay'],
  I: ['Francia', 'Senegal', 'Noruega', 'Iraq'],
  J: ['Argentina', 'Argelia', 'Austria', 'Jordania'],
  K: ['Portugal', 'Colombia', 'Uzbekistán', 'DR Congo'],
  L: ['Inglaterra', 'Croacia', 'Ghana', 'Panamá'],
};

/** [id, grupo, local, visitante, fecha, sede] — se mapea a GroupMatch abajo. */
const GROUP_MATCH_ROWS: [string, string, string, string, string, string][] = [
  ['A1', 'A', 'México', 'Sudáfrica', '11 jun', 'Ciudad de México'],
  ['A2', 'A', 'Corea del Sur', 'Chequia', '11 jun', 'Guadalajara'],
  ['A3', 'A', 'Chequia', 'Sudáfrica', '18 jun', 'Atlanta'],
  ['A4', 'A', 'México', 'Corea del Sur', '18 jun', 'Guadalajara'],
  ['A5', 'A', 'Chequia', 'México', '24 jun', 'Ciudad de México'],
  ['A6', 'A', 'Sudáfrica', 'Corea del Sur', '24 jun', 'Monterrey'],
  ['B1', 'B', 'Canadá', 'Bosnia y Herzegovina', '12 jun', 'Toronto'],
  ['B2', 'B', 'Qatar', 'Suiza', '13 jun', 'Vancouver'],
  ['B3', 'B', 'Suiza', 'Bosnia y Herzegovina', '18 jun', 'Vancouver'],
  ['B4', 'B', 'Canadá', 'Qatar', '18 jun', 'Toronto'],
  ['B5', 'B', 'Suiza', 'Canadá', '24 jun', 'Vancouver'],
  ['B6', 'B', 'Bosnia y Herzegovina', 'Qatar', '24 jun', 'Toronto'],
  ['C1', 'C', 'Haití', 'Escocia', '13 jun', 'Houston'],
  ['C2', 'C', 'Brasil', 'Marruecos', '13 jun', 'Los Ángeles'],
  ['C3', 'C', 'Brasil', 'Haití', '19 jun', 'Los Ángeles'],
  ['C4', 'C', 'Escocia', 'Marruecos', '19 jun', 'Houston'],
  ['C5', 'C', 'Escocia', 'Brasil', '24 jun', 'Los Ángeles'],
  ['C6', 'C', 'Marruecos', 'Haití', '24 jun', 'Houston'],
  ['D1', 'D', 'Estados Unidos', 'Paraguay', '12 jun', 'Los Ángeles'],
  ['D2', 'D', 'Australia', 'Turquía', '13 jun', 'Seattle'],
  ['D3', 'D', 'Turquía', 'Paraguay', '19 jun', 'Seattle'],
  ['D4', 'D', 'Estados Unidos', 'Australia', '19 jun', 'Los Ángeles'],
  ['D5', 'D', 'Turquía', 'Estados Unidos', '25 jun', 'Seattle'],
  ['D6', 'D', 'Paraguay', 'Australia', '25 jun', 'San Francisco'],
  ['E1', 'E', 'Costa de Marfil', 'Ecuador', '14 jun', 'Filadelfia'],
  ['E2', 'E', 'Alemania', 'Curazao', '14 jun', 'Boston'],
  ['E3', 'E', 'Alemania', 'Costa de Marfil', '20 jun', 'Boston'],
  ['E4', 'E', 'Ecuador', 'Curazao', '20 jun', 'Filadelfia'],
  ['E5', 'E', 'Curazao', 'Costa de Marfil', '25 jun', 'Filadelfia'],
  ['E6', 'E', 'Ecuador', 'Alemania', '25 jun', 'Boston'],
  ['F1', 'F', 'Países Bajos', 'Japón', '14 jun', 'Nueva York'],
  ['F2', 'F', 'Suecia', 'Túnez', '14 jun', 'Kansas City'],
  ['F3', 'F', 'Países Bajos', 'Suecia', '20 jun', 'Nueva York'],
  ['F4', 'F', 'Túnez', 'Japón', '20 jun', 'Kansas City'],
  ['F5', 'F', 'Japón', 'Suecia', '25 jun', 'Nueva York'],
  ['F6', 'F', 'Túnez', 'Países Bajos', '25 jun', 'Kansas City'],
  ['G1', 'G', 'Irán', 'Nueva Zelanda', '15 jun', 'Dallas'],
  ['G2', 'G', 'Bélgica', 'Egipto', '15 jun', 'Atlanta'],
  ['G3', 'G', 'Bélgica', 'Irán', '21 jun', 'Atlanta'],
  ['G4', 'G', 'Nueva Zelanda', 'Egipto', '21 jun', 'Dallas'],
  ['G5', 'G', 'Egipto', 'Irán', '26 jun', 'Atlanta'],
  ['G6', 'G', 'Nueva Zelanda', 'Bélgica', '26 jun', 'Dallas'],
  ['H1', 'H', 'Arabia Saudita', 'Uruguay', '15 jun', 'Miami'],
  ['H2', 'H', 'España', 'Cabo Verde', '15 jun', 'Monterrey'],
  ['H3', 'H', 'Uruguay', 'Cabo Verde', '21 jun', 'Miami'],
  ['H4', 'H', 'España', 'Arabia Saudita', '21 jun', 'Monterrey'],
  ['H5', 'H', 'Cabo Verde', 'Arabia Saudita', '26 jun', 'Monterrey'],
  ['H6', 'H', 'Uruguay', 'España', '26 jun', 'Miami'],
  ['I1', 'I', 'Francia', 'Senegal', '16 jun', 'Nueva York'],
  ['I2', 'I', 'Iraq', 'Noruega', '16 jun', 'Filadelfia'],
  ['I3', 'I', 'Noruega', 'Senegal', '22 jun', 'Boston'],
  ['I4', 'I', 'Francia', 'Iraq', '22 jun', 'Nueva York'],
  ['I5', 'I', 'Noruega', 'Francia', '26 jun', 'Filadelfia'],
  ['I6', 'I', 'Senegal', 'Iraq', '26 jun', 'Boston'],
  ['J1', 'J', 'Argentina', 'Argelia', '16 jun', 'Dallas'],
  ['J2', 'J', 'Austria', 'Jordania', '17 jun', 'Kansas City'],
  ['J3', 'J', 'Argentina', 'Austria', '22 jun', 'Dallas'],
  ['J4', 'J', 'Jordania', 'Argelia', '22 jun', 'Houston'],
  ['J5', 'J', 'Argelia', 'Austria', '27 jun', 'Dallas'],
  ['J6', 'J', 'Jordania', 'Argentina', '27 jun', 'Kansas City'],
  ['K1', 'K', 'Portugal', 'DR Congo', '17 jun', 'San Francisco'],
  ['K2', 'K', 'Uzbekistán', 'Colombia', '17 jun', 'Seattle'],
  ['K3', 'K', 'Portugal', 'Uzbekistán', '23 jun', 'San Francisco'],
  ['K4', 'K', 'Colombia', 'DR Congo', '23 jun', 'Vancouver'],
  ['K5', 'K', 'Colombia', 'Portugal', '27 jun', 'San Francisco'],
  ['K6', 'K', 'DR Congo', 'Uzbekistán', '27 jun', 'Seattle'],
  ['L1', 'L', 'Ghana', 'Panamá', '17 jun', 'Toronto'],
  ['L2', 'L', 'Inglaterra', 'Croacia', '17 jun', 'Boston'],
  ['L3', 'L', 'Inglaterra', 'Ghana', '23 jun', 'Boston'],
  ['L4', 'L', 'Panamá', 'Croacia', '23 jun', 'Toronto'],
  ['L5', 'L', 'Panamá', 'Inglaterra', '27 jun', 'Atlanta'],
  ['L6', 'L', 'Croacia', 'Ghana', '27 jun', 'Toronto'],
];

const groupMatches: GroupMatch[] = GROUP_MATCH_ROWS.map(
  ([id, group, home, away, date, venue]) => ({
    id,
    phaseId: 'GROUPS',
    group,
    home,
    away,
    date,
    venue,
  }),
);

/** Helper para construir una fase de eliminatoria a partir de filas [id, home, away]. */
function knockout(
  id: KnockoutPhase['id'],
  name: string,
  dateLabel: string,
  rows: [string, string, string][],
): KnockoutPhase {
  return {
    id,
    name,
    dateLabel,
    matches: rows.map(([mid, home, away]) => ({ id: mid, phaseId: id, home, away })),
  };
}

const knockoutPhases: KnockoutPhase[] = [
  knockout('R32', 'Dieciseisavos', '28 jun – 3 jul', [
    ['R32-1', '1º A', '3º C/E/F/H/I'],
    ['R32-2', '2º A', '2º B'],
    ['R32-3', '1º B', '3º E/F/G/I/J'],
    ['R32-4', '1º C', '2º F'],
    ['R32-5', '1º D', '3º B/E/F/I/J'],
    ['R32-6', '2º E', '2º I'],
    ['R32-7', '1º E', '3º A/B/C/D/F'],
    ['R32-8', '1º F', '2º C'],
    ['R32-9', '1º G', '3º A/E/H/I/J'],
    ['R32-10', '2º D', '2º G'],
    ['R32-11', '1º H', '2º J'],
    ['R32-12', '1º I', '3º C/D/F/G/H'],
    ['R32-13', '1º J', '2º H'],
    ['R32-14', '2º K', '2º L'],
    ['R32-15', '1º K', '3º D/E/I/J/L'],
    ['R32-16', '1º L', '3º E/H/I/J/K'],
  ]),
  knockout('R16', 'Octavos', '4 – 7 jul', [
    ['R16-1', 'Gan. 16avos 1', 'Gan. 16avos 2'],
    ['R16-2', 'Gan. 16avos 3', 'Gan. 16avos 4'],
    ['R16-3', 'Gan. 16avos 5', 'Gan. 16avos 6'],
    ['R16-4', 'Gan. 16avos 7', 'Gan. 16avos 8'],
    ['R16-5', 'Gan. 16avos 9', 'Gan. 16avos 10'],
    ['R16-6', 'Gan. 16avos 11', 'Gan. 16avos 12'],
    ['R16-7', 'Gan. 16avos 13', 'Gan. 16avos 14'],
    ['R16-8', 'Gan. 16avos 15', 'Gan. 16avos 16'],
  ]),
  knockout('QF', 'Cuartos', '9 – 11 jul', [
    ['QF-1', 'Gan. Octavos 1', 'Gan. Octavos 2'],
    ['QF-2', 'Gan. Octavos 3', 'Gan. Octavos 4'],
    ['QF-3', 'Gan. Octavos 5', 'Gan. Octavos 6'],
    ['QF-4', 'Gan. Octavos 7', 'Gan. Octavos 8'],
  ]),
  knockout('SF', 'Semifinales', '14 – 15 jul', [
    ['SF-1', 'Gan. Cuartos 1', 'Gan. Cuartos 2'],
    ['SF-2', 'Gan. Cuartos 3', 'Gan. Cuartos 4'],
  ]),
  knockout('TP', 'Tercer puesto', '18 jul', [['TP-1', 'Perd. Semi 1', 'Perd. Semi 2']]),
  knockout('FN', 'Final', '19 jul', [['FN-1', 'Gan. Semi 1', 'Gan. Semi 2']]),
];

/** El fixture completo del Mundial 2026. */
export const FIXTURE: Fixture = {
  tournament: 'Mundial 2026',
  venueLabel: 'Canadá · México · EE. UU.',
  groups,
  groupMatches,
  knockoutPhases,
};

/** Todas las fases en orden, con metadatos (para selectores de UI). */
const SHORT_PHASE_NAMES: Record<string, string> = {
  R32: '1/16',
  R16: '1/8',
  QF:  '1/4',
  SF:  'Semis',
  TP:  '3º/4º',
  FN:  'Final',
};

export const ALL_PHASES: PhaseInfo[] = [
  { id: 'GROUPS', name: 'Fase de grupos', shortName: 'Grupos', dateLabel: '11 – 27 jun' },
  ...knockoutPhases.map((f) => ({
    id: f.id,
    name: f.name,
    shortName: SHORT_PHASE_NAMES[f.id] ?? f.name,
    dateLabel: f.dateLabel,
  })),
];

/** Letras de grupo en orden ('A'..'L'). */
export const GROUP_LETTERS: string[] = Object.keys(groups);

/** Banderas (emoji) por país. */
export const FLAGS: Record<string, string> = {
  México: '🇲🇽',
  Sudáfrica: '🇿🇦',
  'Corea del Sur': '🇰🇷',
  Chequia: '🇨🇿',
  Canadá: '🇨🇦',
  Suiza: '🇨🇭',
  Qatar: '🇶🇦',
  'Bosnia y Herzegovina': '🇧🇦',
  Brasil: '🇧🇷',
  Marruecos: '🇲🇦',
  Haití: '🇭🇹',
  Escocia: '🏴󠁧󠁢󠁳󠁣󠁴󠁿',
  'Estados Unidos': '🇺🇸',
  Paraguay: '🇵🇾',
  Australia: '🇦🇺',
  Turquía: '🇹🇷',
  Alemania: '🇩🇪',
  Curazao: '🇨🇼',
  'Costa de Marfil': '🇨🇮',
  Ecuador: '🇪🇨',
  'Países Bajos': '🇳🇱',
  Japón: '🇯🇵',
  Túnez: '🇹🇳',
  Suecia: '🇸🇪',
  Bélgica: '🇧🇪',
  Egipto: '🇪🇬',
  Irán: '🇮🇷',
  'Nueva Zelanda': '🇳🇿',
  España: '🇪🇸',
  'Cabo Verde': '🇨🇻',
  'Arabia Saudita': '🇸🇦',
  Uruguay: '🇺🇾',
  Francia: '🇫🇷',
  Senegal: '🇸🇳',
  Noruega: '🇳🇴',
  Iraq: '🇮🇶',
  Argentina: '🇦🇷',
  Argelia: '🇩🇿',
  Austria: '🇦🇹',
  Jordania: '🇯🇴',
  Portugal: '🇵🇹',
  Colombia: '🇨🇴',
  Uzbekistán: '🇺🇿',
  'DR Congo': '🇨🇩',
  Inglaterra: '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
  Croacia: '🇭🇷',
  Ghana: '🇬🇭',
  Panamá: '🇵🇦',
};

/** Bandera de un equipo (o bandera neutra si no se conoce). */
export const flag = (team: string): string => FLAGS[team] || '🏳️';

/** Lista de los 48 países (útil para datalists del admin). */
export const ALL_TEAMS: string[] = Object.values(groups).flat();

/**
 * Partidos de una fase concreta.
 * Para GROUPS devuelve los 72 partidos de grupos (puedes filtrar por grupo
 * después); para una eliminatoria devuelve sus cruces.
 */
export function matchesOfPhase(phaseId: string): Match[] {
  if (phaseId === 'GROUPS') return groupMatches;
  const phase = knockoutPhases.find((p) => p.id === phaseId);
  return phase ? phase.matches : [];
}

/** Partidos de un grupo concreto ('A'..'L'). */
export function matchesOfGroup(group: string): GroupMatch[] {
  return groupMatches.filter((m) => m.group === group);
}

/** Todos los partidos del torneo (grupos + eliminatorias), en orden de fase. */
export function allMatches(): Match[] {
  return [...groupMatches, ...knockoutPhases.flatMap((p) => p.matches)];
}
