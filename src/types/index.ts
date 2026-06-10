/* =========================================================================
   Tipos del dominio — Porra Mundial 2026
   -------------------------------------------------------------------------
   Tipos compartidos por el fixture estático, el motor de puntos y la UI.
   ========================================================================= */

/** Identificadores de fase del torneo. */
export type PhaseId = 'GROUPS' | 'R32' | 'R16' | 'QF' | 'SF' | 'TP' | 'FN';

/** Un marcador (predicho o real). `null` = sin rellenar. */
export interface Score {
  home: number | null;
  away: number | null;
}

/** Marcador con ambos valores presentes (tras validar). */
export interface FilledScore {
  home: number;
  away: number;
}

/** Partido de la fase de grupos (equipos reales conocidos de antemano). */
export interface GroupMatch {
  id: string; // 'A1'
  phaseId: 'GROUPS';
  group: string; // 'A'
  home: string; // nombre de equipo
  away: string;
  date: string; // '11 jun'
  venue: string; // 'Ciudad de México'
}

/**
 * Partido de eliminatoria. `home`/`away` son *etiquetas de slot* del fixture
 * (ej. '1º A', '3º C/E/F/H', 'Gan. Octavos 1'). Los equipos reales los asigna
 * el admin en `bracket_teams` cuando termina la fase anterior.
 */
export interface BracketMatch {
  id: string; // 'R32-1'
  phaseId: Exclude<PhaseId, 'GROUPS'>;
  home: string; // etiqueta de slot
  away: string;
}

/** Cualquier partido del torneo. */
export type Match = GroupMatch | BracketMatch;

/** Una fase de eliminatoria con sus cruces. */
export interface KnockoutPhase {
  id: Exclude<PhaseId, 'GROUPS'>;
  name: string; // 'Dieciseisavos'
  dateLabel: string; // '28 jun – 3 jul'
  matches: BracketMatch[];
}

/** Metadatos de una fase (para selectores de UI). */
export interface PhaseInfo {
  id: PhaseId;
  name: string;
  shortName: string;
  dateLabel: string;
}

/** El fixture estático completo de un torneo. */
export interface Fixture {
  tournament: string; // 'Mundial 2026'
  venueLabel: string; // 'Canadá · México · EE. UU.'
  /** Grupo -> equipos (4). */
  groups: Record<string, string[]>;
  groupMatches: GroupMatch[];
  knockoutPhases: KnockoutPhase[];
}

/* ----------------------- Puntuación ----------------------- */

/** Tipo de acierto de un partido puntuado. */
export type ScoreKind = 'exact' | 'sign' | 'miss';

/** Reglas de puntos (por porra). */
export interface Rules {
  exact: number; // marcador exacto
  sign: number; // acierto de signo (1X2)
  miss: number; // fallo
}

/** Resultado de puntuar un partido. */
export interface MatchScore {
  kind: ScoreKind;
  points: number;
}

/* ----------------------- Clasificación ----------------------- */

/** Usuario mínimo necesario para calcular la clasificación. */
export interface StandingsUser {
  id: string;
  name: string;
  alias?: string | null;
  paid: boolean;
}

/** Una fila de la clasificación. */
export interface StandingRow {
  id: string;
  name: string; // alias si existe, si no el nombre
  points: number;
  exact: number; // nº de aciertos exactos
  sign: number; // nº de aciertos de signo
}

/** Pronósticos: userId -> matchId -> marcador. */
export type PredictionsByUser = Record<string, Record<string, Score>>;

/** Resultados reales: matchId -> marcador. */
export type ResultsByMatch = Record<string, Score>;
