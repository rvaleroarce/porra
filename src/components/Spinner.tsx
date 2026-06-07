/** Spinner de carga genérico. */
export default function Spinner({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const s = { sm: 'w-4 h-4', md: 'w-8 h-8', lg: 'w-12 h-12' }[size];
  return (
    <div
      className={`${s} rounded-full border-2 border-line border-t-accent animate-spin`}
      role="status"
      aria-label="Cargando"
    />
  );
}
