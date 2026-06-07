import { Routes, Route, Navigate } from 'react-router-dom';

// Rutas (pendientes de implementar — por ahora placeholders)
import PorraView from '@/routes/PorraView';
import Register from '@/routes/Register';
import AdminLogin from '@/routes/AdminLogin';
import Admin from '@/routes/Admin';
import Ayuda from '@/routes/Ayuda';

/**
 * Enrutado principal:
 *
 *   /p/:slug              → vista participante (Mi porra + Clasificación)
 *   /p/:slug/register     → alta de participante
 *   /admin                → panel admin (requiere sesión)
 *   /admin/login          → login de admin (magic-link)
 *   /                     → redirige; en producción habrá una landing
 */
export default function App() {
  return (
    <Routes>
      <Route path="/p/:slug" element={<PorraView />} />
      <Route path="/p/:slug/register" element={<Register />} />
      <Route path="/p/:slug/ayuda" element={<Ayuda />} />
      <Route path="/admin/login" element={<AdminLogin />} />
      <Route path="/admin" element={<Admin />} />
      {/* Raíz: en v1 redirige a /admin/login; con landing propia se cambia */}
      <Route path="/" element={<Navigate to="/admin/login" replace />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4">
      <span className="text-5xl">🔍</span>
      <h1 className="text-2xl font-bold">Página no encontrada</h1>
      <p className="text-muted">Comprueba el enlace de tu porra.</p>
    </div>
  );
}
