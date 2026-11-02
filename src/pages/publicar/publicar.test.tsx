import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { AuthProvider } from '@/lib/auth';
import { ToastProvider } from '@/components/Toast';
import Pagina from './index';

describe('tela Publicar em modo local', () => {
  it('mostra os estados vazios em palavras e o aviso fixo do WhatsApp', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <AuthProvider>
          <ToastProvider>
            <Pagina />
          </ToastProvider>
        </AuthProvider>
      </QueryClientProvider>,
    );
    expect(await screen.findByText('Sem posts hoje')).toBeTruthy();
    expect(screen.getByText('Bloco da noite, 20h')).toBeTruthy();
    expect(screen.getByText(/Nada é enviado automaticamente no WhatsApp/)).toBeTruthy();
    expect(await screen.findByText('Sem artes hoje')).toBeTruthy();
    expect(screen.getByText('Post manual')).toBeTruthy();
  });
});
