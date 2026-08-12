interface Props {
  /** Si se pasa, se muestra como título principal y el torneo queda como subtítulo. */
  porraName?: string;
  /** Nombre de la competición. Viene de la BD; en pantallas sueltas puede faltar. */
  tournamentName?: string | null;
  /** Escudo de la competición, si el proveedor lo da. */
  tournamentEmblem?: string | null;
}

/**
 * Header global de la app.
 *
 * Sin fondo de color: el bloque naranja pesaba mucho y ataba la app a un
 * torneo concreto. Ahora lo que identifica la pantalla es el escudo de la
 * competición, y el acento se reserva para lo que se puede pulsar.
 */
export default function Header({ porraName, tournamentName, tournamentEmblem }: Props) {
  return (
    <header className="w-full py-4 px-4 text-center bg-card border-b border-line">
      <div className="flex items-center justify-center gap-1.5 mb-0.5">
        {tournamentEmblem && (
          <img src={tournamentEmblem} alt="" className="w-4 h-4 object-contain" />
        )}
        <p className="text-[0.65rem] font-bold uppercase tracking-[0.14em] text-muted">
          {tournamentName ?? 'Porra'}
        </p>
      </div>

      <h1
        className="text-xl text-ink leading-tight"
        style={{ fontFamily: '"Bricolage Grotesque", sans-serif', fontWeight: 800 }}
      >
        {porraName ?? tournamentName ?? 'Porra'}
      </h1>
    </header>
  );
}
