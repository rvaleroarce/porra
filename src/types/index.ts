/* =========================================================================
   Tipos del dominio
   -------------------------------------------------------------------------
   Tipos compartidos por el motor de puntos y la UI.

   Los tipos del fixture (partidos, fases, equipos) ya no viven aquí: el
   fixture está en la base de datos y llega tipado desde `lib/supabase.ts`
   (BootMatch, Team, TournamentPhase, TournamentMatch).
   ========================================================================= */

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

/* ----------------------- Puntuación ----------------------- */

/** Tipo de acierto de un partido puntuado. */
export type ScoreKind = 'exact' | 'sign' | 'miss';

/** Reglas de puntos (por porra). */
export interface Rules {
  exact: number; // marcador exacto
  sign: number;  // acierto de signo (1X2)
  miss: number;  // fallo
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
  name: string;  // alias si existe, si no el nombre
  points: number;
  exact: number; // nº de aciertos exactos
  sign: number;  // nº de aciertos de signo
}

/** Pronósticos: userId -> matchId -> marcador. */
export type PredictionsByUser = Record<string, Record<string, Score>>;

/** Resultados reales: matchId -> marcador. */
export type ResultsByMatch = Record<string, Score>;
