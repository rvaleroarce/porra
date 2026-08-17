interface StandingRow {
  id: string;
  name: string;
  pts: number;
  exact: number;
  sign: number;
}

interface Rules { exact: number; sign: number; miss: number; }

interface Props {
  standings: StandingRow[];
  matchesPlayed: number;
  paidCount: number;
  /** null = de pago sin importe fijado; 0 = gratis; >0 = importe por cabeza. */
  cuota?: number | null;
  rules: Rules;
  currentUserId?: string;
  prizeInfo?: string | null;
  isFree?: boolean;
}

const MEDALS = ['🥇', '🥈', '🥉'];

/** Importe sin decimales cuando son céntimos a cero, que es lo habitual. */
function euros(n: number): string {
  return n.toLocaleString('es-ES', {
    style: 'currency', currency: 'EUR',
    minimumFractionDigits: 0, maximumFractionDigits: 2,
  });
}

export default function Standings({
  standings, matchesPlayed, paidCount, cuota, rules, currentUserId, prizeInfo, isFree,
}: Props) {
  // Al participante "Pagados: 8" no le dice nada: es un dato de gestión. El
  // bote sí, y por eso ocupa su sitio. Solo se puede calcular si hay importe
  // por cabeza; si no lo hay, se cae a contar cuánta gente juega.
  const hayBote = typeof cuota === 'number' && cuota > 0;
  const central = hayBote
    ? { label: 'Bote', value: euros(paidCount * cuota) }
    : { label: isFree ? 'Jugando' : 'Pagados', value: paidCount };
  // Ranking "1-1-3-4-5-6": los empatados en pts comparten puesto (mismo número/medalla),
  // el siguiente distinto salta al índice real, no al consecutivo.
  // Ej: 5 empatados en 1º -> 1,1,1,1,1,6
  const ranks = standings.reduce<number[]>((acc, row, i) => {
    const rank = i === 0 || standings[i - 1].pts !== row.pts ? i + 1 : acc[i - 1];
    acc.push(rank);
    return acc;
  }, []);

  return (
    <div className="flex flex-col gap-4">
      {/* Premio */}
      {prizeInfo && (
        <div className="card border-gold/40 bg-gold/5 flex items-start gap-3">
          <span className="text-2xl shrink-0">🏆</span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gold mb-0.5">Premio</p>
            <p className="text-sm text-ink leading-relaxed whitespace-pre-line">{prizeInfo}</p>
          </div>
        </div>
      )}

      {/* Stats rápidos */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Partidos', value: matchesPlayed },
          central,
          { label: 'Puntos', value: `${rules.exact}/${rules.sign}/${rules.miss}` },
        ].map(s => (
          <div key={s.label} className="card text-center py-3">
            <p className="text-xl font-bold text-accent">{s.value}</p>
            <p className="text-xs text-muted mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Tabla */}
      <div className="card p-0 overflow-hidden">
        {standings.length === 0 ? (
          <p className="text-center text-muted text-sm py-8">
            {isFree ? 'Aún no hay participantes en juego.' : 'Aún no hay participantes pagados.'}
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-xs text-faint uppercase tracking-wide">
                <th className="py-3 px-4 text-left w-8">#</th>
                <th className="py-3 px-4 text-left">Nombre</th>
                <th className="py-3 px-3 text-right">✓✓</th>
                <th className="py-3 px-3 text-right">✓</th>
                <th className="py-3 px-4 text-right font-bold">Pts</th>
              </tr>
            </thead>
            <tbody>
              {standings.map((row, i) => {
                const isCurrent = row.id === currentUserId;
                const rank = ranks[i];
                return (
                  <tr
                    key={row.id}
                    className={`border-b border-line last:border-0 transition-colors
                      ${isCurrent ? 'bg-accent/10' : 'hover:bg-bg2'}`}
                  >
                    <td className="py-3 px-4 text-center">
                      {rank <= 3
                        ? MEDALS[rank - 1]
                        : <span className="text-faint">{rank}</span>
                      }
                    </td>
                    <td className={`py-3 px-4 font-medium ${isCurrent ? 'text-accent' : ''}`}>
                      {row.name}
                    </td>
                    <td className="py-3 px-3 text-right text-gold text-xs font-bold">
                      {row.exact}
                    </td>
                    <td className="py-3 px-3 text-right text-success text-xs font-bold">
                      {row.sign}
                    </td>
                    <td className="py-3 px-4 text-right font-bold text-ink">
                      {row.pts}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
