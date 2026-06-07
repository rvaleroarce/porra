import { useEffect, useState } from 'react';

export interface ToastState {
  msg: string;
  isError?: boolean;
}

/** Toast de notificación, desaparece solo tras 2.5 s. */
export default function Toast({ toast, onDone }: {
  toast: ToastState | null;
  onDone: () => void;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!toast) return;
    setVisible(true);
    const t = setTimeout(() => { setVisible(false); onDone(); }, 2500);
    return () => clearTimeout(t);
  }, [toast]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!toast || !visible) return null;

  return (
    <div
      className={`fixed top-4 left-1/2 -translate-x-1/2 z-50
        px-5 py-3 rounded-xl text-sm font-medium shadow-xl
        transition-all duration-300
        ${toast.isError
          ? 'bg-accent text-white'
          : 'bg-success text-bg font-semibold'}`}
    >
      {toast.msg}
    </div>
  );
}
