import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';

const Ctx = createContext<(msg: string) => void>(() => {});

/** Aviso curto no rodapé, como no mock ("Aprovada. O post já está montado e agendado."). */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState('');
  const [visivel, setVisivel] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const mostrar = useCallback((m: string) => {
    setMsg(m);
    setVisivel(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setVisivel(false), 2600);
  }, []);
  return (
    <Ctx.Provider value={mostrar}>
      {children}
      <div className={`toast${visivel ? ' show' : ''}`} role="status" aria-live="polite">
        {msg}
      </div>
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);
