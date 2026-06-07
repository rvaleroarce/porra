/* =========================================================================
   Motor de puntos — Porra Mundial 2026
   -------------------------------------------------------------------------
   Portado de Codigo.gs (scoreOne_ / computeStandings_), con una mejora:
   scoreMatch devuelve el TIPO de acierto ('exact' | 'sign' | 'miss') además
   de los puntos. El prototipo deducía el tipo comparando el valor de los
   puntos (`s === rules.exact && rules.exact >= rules.sign`), lo que se
   descuadra si el admin configura `exact == sign`. Aquí el desglose
   exactos/signos es siempre correcto sea cual sea la configuración.
   ========================================================================= */

import type {
  FilledScore,
  MatchScore,
  PredictionsByUser,
  ResultsByMatch,
  Rules,
  Score,
  StandingRow,
  StandingsUser,
} from '../types';

/** Signo de un marcador: 1 (gana local), -1 (gana visitante), 0 (empate). */
function sign(home: number, away: number): -1 | 0 | 1 {
  return home > away ? 1 : home < away ? -1 : 0;
}

/** ¿Tiene el marcador ambos valores numéricos? */
function isFilled(s: Score | null | undefined): s is FilledScore {
  return !!s && s.home != null && s.away != null;
}

/**
 * Puntúa un partido comparando pronóstico y resultado real.
 * Devuelve el tipo de acierto y los puntos según las reglas.
 */
export function scoreMatch(
  prediction: FilledScore,
  result: FilledScore,
  rules: Rules,
): MatchScore {
  if (prediction.home === result.home && prediction.away === result.away) {
    return { kind: 'exact', points: rules.exact };
  }
  if (sign(prediction.home, prediction.away) === sign(result.home, result.away)) {
    return { kind: 'sign', points: rules.sign };
  }
  return { kind: 'miss', points: rules.miss };
}

/**
 * Puntúa un partido de forma tolerante: si falta el pronóstico o el resultado
 * (o están a medias), devuelve `null` (el partido no cuenta todavía).
 */
export function scoreMatchSafe(
  prediction: Score | null | undefined,
  result: Score | null | undefined,
  rules: Rules,
): MatchScore | null {
  if (!isFilled(prediction) || !isFilled(result)) return null;
  return scoreMatch(prediction, result, rules);
}

/** Opciones de cálculo de la clasificación. */
export interface ComputeStandingsOptions {
  /**
   * Ámbito de la porra: si se pasa, solo cuentan estos `matchId`
   * (la lista materializada de `porra_matches`). Si se omite, cuentan todos
   * los partidos que tengan resultado y pronóstico.
   */
  matchIds?: Iterable<string>;
}

/**
 * Calcula la clasificación de una porra.
 *
 * - Solo entran usuarios con `paid = true`.
 * - El nombre mostrado es el alias si existe, si no el nombre.
 * - Solo se puntúan partidos dentro del ámbito (si se indica) que tengan a la
 *   vez pronóstico y resultado real.
 * - Orden: puntos desc, y a igualdad, nº de aciertos exactos desc.
 */
export function computeStandings(
  users: StandingsUser[],
  predictions: PredictionsByUser,
  results: ResultsByMatch,
  rules: Rules,
  options: ComputeStandingsOptions = {},
): StandingRow[] {
  const scopeSet = options.matchIds ? new Set(options.matchIds) : null;

  const rows: StandingRow[] = [];

  for (const user of users) {
    if (!user.paid) continue; // solo pagados en la clasificación

    const display = (user.alias && user.alias.trim()) || user.name;
    const userPreds = predictions[user.id] || {};

    let points = 0;
    let exact = 0;
    let signCount = 0;

    for (const matchId of Object.keys(userPreds)) {
      if (scopeSet && !scopeSet.has(matchId)) continue; // fuera del ámbito de la porra

      const s = scoreMatchSafe(userPreds[matchId], results[matchId], rules);
      if (!s) continue;

      points += s.points;
      if (s.kind === 'exact') exact += 1;
      else if (s.kind === 'sign') signCount += 1;
    }

    rows.push({ id: user.id, name: display, points, exact, sign: signCount });
  }

  rows.sort((a, b) => b.points - a.points || b.exact - a.exact);
  return rows;
}
