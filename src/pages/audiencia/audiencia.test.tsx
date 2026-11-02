import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { ToastProvider } from '@/components/Toast';
import Pagina from './index';
import { extensaoDoPrint } from './dados';

describe('tela Audiência', () => {
  it('sem dados mostra os estados vazios em palavras', async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <ToastProvider>
          <Pagina />
        </ToastProvider>
      </QueryClientProvider>,
    );
    expect(await screen.findByText('Audiência da comunidade')).toBeTruthy();
    expect(screen.getAllByText('aguardando dados').length).toBeGreaterThan(4);
    expect(screen.getByText('Nenhum registro ainda. O primeiro vira a linha de base.')).toBeTruthy();
    expect(screen.getByText('O gráfico aparece depois de duas semanas de registros.')).toBeTruthy();
    expect(screen.getByText('Linha de base em construção')).toBeTruthy();
    expect(screen.getByText(/Espaçar as divulgações em 48 horas/)).toBeTruthy();
  });
  it('aceita só imagens no print', () => {
    expect(extensaoDoPrint({ type: 'image/png', name: 'a' })).toBe('png');
    expect(extensaoDoPrint({ type: '', name: 'print.JPEG' })).toBe('jpg');
    expect(extensaoDoPrint({ type: 'application/pdf', name: 'a.pdf' })).toBeNull();
  });
});
