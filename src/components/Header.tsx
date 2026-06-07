import { FIXTURE } from '@/lib/fixture';

interface Props {
  /** Si se pasa, se muestra como título principal y el torneo queda como subtítulo. */
  porraName?: string;
}

/**
 * Header global de la app.
 * Gradiente naranja → amarillo (accent → accent2), Bricolage Grotesque 800.
 */
export default function Header({ porraName }: Props) {
  return (
    <header
      className="w-full py-5 px-4 text-center"
      style={{
        background: 'linear-gradient(135deg, var(--accent) 0%, var(--accent2) 100%)',
      }}
    >
      <p className="text-xs font-semibold uppercase tracking-widest text-white/70 mb-1">
        PORRA · {FIXTURE.venueLabel}
      </p>
      <h1
        className="text-2xl text-white leading-tight"
        style={{ fontFamily: '"Bricolage Grotesque", sans-serif', fontWeight: 800 }}
      >
        {porraName
          ? <>{porraName} <span className="text-white/60">· {FIXTURE.tournament}</span></>
          : FIXTURE.tournament
        }
      </h1>
    </header>
  );
}
