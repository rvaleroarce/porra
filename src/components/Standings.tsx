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
  rules: Rules;
  currentUserId?: string;
}

const MEDALS = ['🥇', '🥈', '🥉'];

export default function Standings({ standings, matchesPlayed, paidCount, rules, currentUserId }: Props) {
  return (
    <div className="flex flex-col gap-4">
      {/* Stats rápidos */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Partidos', value: matchesPlayed },
          { label: 'Pagados', value: paidCount },
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
            Aún no hay participantes pagados.
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
                return (
                  <tr
                    key={row.id}
                    className={`border-b border-line last:border-0 transition-colors
                      ${isCurrent ? 'bg-accent/10' : 'hover:bg-bg2'}`}
                  >
                    <td className="py-3 px-4 text-center">
                      {i < 3 ? MEDALS[i] : <span className="text-faint">{i + 1}</span>}
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
