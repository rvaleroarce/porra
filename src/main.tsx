import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './index.css';
import App from './App';

// Tras un despliegue, los chunks diferidos (p.ej. el del resguardo PDF)
// cambian de nombre. Si una pestaña abierta de antes intenta cargar uno que
// ya no existe, Vite emite 'vite:preloadError': recargamos una vez para
// traer la versión nueva en lugar de fallar silenciosamente.
window.addEventListener('vite:preloadError', () => {
  if (!sessionStorage.getItem('preloadReloaded')) {
    sessionStorage.setItem('preloadReloaded', '1');
    window.location.reload();
  }
});

const root = document.getElementById('root');
if (!root) throw new Error('No se encontró el elemento #root');

createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
