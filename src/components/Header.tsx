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
 * Gradiente naranja → amarillo (accent → accent2), Bricolage Grotesque 800.
 *
 * La competición se enseña siempre que se sepa: con varias cargadas —liga y
 * copa a la vez— el participante necesita saber a qué está jugando.
 */
export default function Header({ porraName, tournamentName, tournamentEmblem }: Props) {
  return (
    <header
      className="w-full py-5 px-4 text-center"
      style={{
        background: 'linear-gradient(135deg, var(--accent) 0%, var(--accent2) 100%)',
      }}
    >
      <div className="flex items-center justify-center gap-2 mb-1">
        {tournamentEmblem && (
          <img
            src={tournamentEmblem}
            alt=""
            className="w-6 h-6 object-contain drop-shadow"
            style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,.35))' }}
          />
        )}
        <p className="text-xs font-semibold uppercase tracking-widest text-white/80">
          {tournamentName ?? 'Porra'}
        </p>
      </div>

      <h1
        className="text-2xl text-white leading-tight"
        style={{ fontFamily: '"Bricolage Grotesque", sans-serif', fontWeight: 800 }}
      >
        {porraName ?? tournamentName ?? 'Porra'}
      </h1>
    </header>
  );
}
