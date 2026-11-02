import { Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from '@/lib/auth';
import { Layout } from '@/components/Layout';
import { SpriteIcones } from '@/components/Icone';
import { ToastProvider } from '@/components/Toast';
import Entrar from '@/pages/entrar';
import { ABAS, PAGINA_CONFIGURACOES as Configuracoes } from './rotas';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: true } },
});

function Portao() {
  const { carregando, perfil } = useAuth();
  if (carregando) return <p className="carregando">Carregando...</p>;
  if (!perfil) return <Entrar />;
  return (
    <Routes>
      <Route element={<Layout />}>
        {ABAS.map(({ caminho, pagina: Pagina }) => (
          <Route key={caminho} path={caminho} element={<Pagina />} />
        ))}
        <Route path="/configuracoes" element={<Configuracoes />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ToastProvider>
          <SpriteIcones />
          <BrowserRouter>
            <Suspense fallback={<p className="carregando">Carregando...</p>}>
              <Portao />
            </Suspense>
          </BrowserRouter>
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
