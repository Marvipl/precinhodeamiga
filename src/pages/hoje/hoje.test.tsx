// Tela Hoje no modo local (sem Supabase): estados vazios em palavras, sem dado inventado.
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it } from 'vitest';
import { AuthProvider } from '@/lib/auth';
import { ToastProvider } from '@/components/Toast';
import Pagina from './index';

function montar() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AuthProvider>
        <ToastProvider>
          <MemoryRouter>
            <Pagina />
          </MemoryRouter>
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

afterEach(cleanup);

describe('tela Hoje (modo local)', () => {
  it('mostra o dia do plano, os destaques vazios e os números aguardando dados', async () => {
    montar();
    expect(await screen.findByText(/Seu dia já está montado/)).toBeTruthy();
    expect(screen.getByText(/de 90|plano de 90 dias concluído|o plano começa/)).toBeTruthy();
    expect(screen.getByText('Seu roteiro de hoje')).toBeTruthy();
    expect(await screen.findByText('Nada pendente agora')).toBeTruthy();
    expect(screen.getAllByText(/aguardando dados/).length).toBe(3);
    expect(screen.getByText('a partir do 1º registro de tempo')).toBeTruthy();
    expect(screen.getByText('Os agentes ainda não rodaram hoje.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Começar sessão' })).toBeTruthy();
  });

  it('troca o tempo disponível e abre o lançamento manual', async () => {
    montar();
    const b40 = await screen.findByRole('button', { name: '40 min' });
    fireEvent.click(b40);
    expect(b40.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText(/0 min de 40 disponíveis/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Lançar tempo manualmente' }));
    expect(screen.getByRole('form', { name: 'Lançar sessão' })).toBeTruthy();
  });
});
