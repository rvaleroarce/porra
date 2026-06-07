import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import Header from '@/components/Header';

export default function Ayuda() {
  const { slug }    = useParams<{ slug: string }>();
  const navigate    = useNavigate();
  const [prizeInfo, setPrizeInfo] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;
    supabase.from('porras').select('prize_info').eq('slug', slug).single()
      .then(({ data }) => setPrizeInfo(data?.prize_info ?? null));
  }, [slug]);

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <main className="flex-1 p-5 max-w-lg mx-auto w-full flex flex-col gap-6 pb-10">

        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1 text-sm text-muted hover:text-ink transition-colors self-start mt-1"
        >
          ← Volver
        </button>

        <div>
          <h2 className="text-2xl font-bold">¿Cómo funciona la porra?</h2>
          <p className="text-muted text-sm mt-1">
            Todo en menos de dos minutos.
          </p>
        </div>

        <Section icon="📝" title="Apúntate">
          La primera vez que entras te pedimos tu <strong>nombre</strong> y <strong>móvil</strong>
          (solo lo ve el organizador). También puedes poner un alias para la clasificación y un email
          por si pierdes tu enlace.
        </Section>

        <Section icon="🔗" title="Guarda tu enlace personal">
          Tras registrarte recibirás un enlace único. <strong>Guárdalo en favoritos</strong> —
          es tu acceso directo a la porra. Si lo pierdes, pide al organizador que te lo reenvíe
          por WhatsApp.
        </Section>

        <Section icon="⚽" title="Rellena tus pronósticos">
          <p>En la pestaña <strong>📝 Mi porra</strong> encontrarás los partidos organizados por fase y grupo.</p>
          <p className="mt-2">Para cada partido escribe el marcador que crees que será el resultado final
          (tiempo reglamentario, sin prórrogas ni penaltis).</p>
          <p className="mt-2">Pulsa <strong>"Completar a 0-0"</strong> para rellenar de golpe
          los partidos que aún no hayas tocado — sin sobreescribir lo que ya pusiste.</p>
        </Section>

        <Section icon="📤" title="Envía tu porra">
          Cuando estés listo pulsa <strong>"Enviar porra ➜"</strong>. Una vez enviada,
          esa fase queda <strong>bloqueada</strong> y no podrás cambiar nada.
          Hazlo antes de la fecha límite que marque el organizador.
        </Section>

        <Section icon="💰" title="El pago">
          Tu nombre no aparecerá en la clasificación hasta que el organizador confirme
          que has pagado la entrada. Si ya pagaste y no apareces, escríbele.
        </Section>

        <Section icon="🏆" title="Puntuación">
          <ul className="flex flex-col gap-1 mt-1">
            <li className="flex items-center gap-2">
              <span className="text-gold font-bold text-sm">✓✓ Exacto</span>
              <span className="text-muted text-sm">— aciertas el marcador exacto</span>
            </li>
            <li className="flex items-center gap-2">
              <span className="text-success font-bold text-sm">✓ Signo</span>
              <span className="text-muted text-sm">— aciertas quién gana (o que empata)</span>
            </li>
            <li className="flex items-center gap-2">
              <span className="text-faint text-sm">✗ Fallo</span>
              <span className="text-muted text-sm">— el resultado no coincide</span>
            </li>
          </ul>
          <p className="text-xs text-muted mt-3">
            El organizador puede ajustar los puntos exactos por cada categoría.
            Consulta la clasificación para ver cuántos puntos vale cada acierto.
          </p>
        </Section>

        <Section icon="🏆" title="Premio">
          {prizeInfo
            ? <p className="whitespace-pre-line">{prizeInfo}</p>
            : <p>El ganador (el que más puntos acumule al final del torneo) se lleva el bote. Pregunta al organizador el importe exacto.</p>
          }
        </Section>

        <Section icon="📊" title="Clasificación">
          En la pestaña <strong>🏆 Clasificación</strong> puedes ver la tabla en tiempo real
          conforme el organizador vaya metiendo los resultados. Tu fila aparece resaltada.
        </Section>

        {slug && (
          <div className="card text-center flex flex-col gap-3 mt-2">
            <p className="text-sm text-muted">¿Listo para jugar?</p>
            <button
              onClick={() => navigate(`/p/${slug}`)}
              className="btn-primary"
            >
              Ir a mi porra ➜
            </button>
          </div>
        )}

      </main>
    </div>
  );
}

function Section({ icon, title, children }: {
  icon: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-3">
      <span className="text-2xl mt-0.5 shrink-0">{icon}</span>
      <div>
        <h3 className="font-semibold text-base mb-1">{title}</h3>
        <div className="text-sm text-muted leading-relaxed">{children}</div>
      </div>
    </div>
  );
}
