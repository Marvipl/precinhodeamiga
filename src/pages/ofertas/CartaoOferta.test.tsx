import { describe, expect, it, vi, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { OfertaFila } from '@core/ofertas/fila.ts';
import { CartaoOferta } from './CartaoOferta';

afterEach(cleanup);

const oferta: OfertaFila = {
  id: '00000000-0000-4000-8000-000000000001',
  data: '2026-11-02',
  origem: 'rodada',
  pedido_id: null,
  nota: 82,
  motivos: ['Motivo de teste'],
  alertas: [{ tipo: 'historico_curto', texto: 'Histórico de preço curto: observado há 3 dias. Confira o preço antes de aprovar.' }],
  fora_nicho_principal: true,
  preco_atual: 50,
  preco_referencia: null,
  dias_historico: 3,
  comissao_taxa: 0.03,
  comissao_extra: false,
  cupom: null,
  prazo: null,
  frase: 'Frase de teste.',
  frase_versao: 1,
  frase_editada: false,
  estado: 'pendente',
  produto: { nome: 'Produto de teste A', imagem_url: null, url_produto: 'https://exemplo.invalid/produto-comum', nicho_id: null, nicho_nome: 'Nicho de teste' },
};

const base = { regras: { historicoCurtoDias: 7, descontoRealMinimo: 0.1 }, fraseMax: 140, ocupado: false, agora: new Date('2026-11-02T12:00:00Z') };

describe('CartaoOferta', () => {
  it('mostra prévia com "Link com comissão", estimativa e alertas; ver na Shopee usa o link comum', () => {
    render(<CartaoOferta {...base} oferta={oferta} podeDecidir agir={vi.fn()} />);
    expect(screen.getByText(/Link com comissão$/m, { selector: 'pre' })).toBeTruthy();
    expect(screen.getByText(/Cerca de/).textContent).toContain('R$ 1,50');
    expect(screen.getByText(/Histórico de preço curto/)).toBeTruthy();
    expect(screen.getByText(/Útil para testar Nicho de teste/)).toBeTruthy();
    expect(screen.getByRole('link', { name: /Ver na Shopee/ }).getAttribute('href')).toBe('https://exemplo.invalid/produto-comum');
  });

  it('aprovar manda os dois canais por padrão; desmarcar um manda só o outro', () => {
    const agir = vi.fn().mockResolvedValue(true);
    render(<CartaoOferta {...base} oferta={oferta} podeDecidir agir={agir} />);
    fireEvent.click(screen.getByRole('button', { name: 'Aprovar' }));
    expect(agir).toHaveBeenLastCalledWith({ acao: 'aprovar', oferta_id: oferta.id, canais: ['wa', 'tg'] });
    fireEvent.click(screen.getByLabelText('WhatsApp'));
    fireEvent.click(screen.getByRole('button', { name: 'Aprovar' }));
    expect(agir).toHaveBeenLastCalledWith({ acao: 'aprovar', oferta_id: oferta.id, canais: ['tg'] });
  });

  it('o dono não vê as ações de decisão (S2)', () => {
    render(<CartaoOferta {...base} oferta={oferta} podeDecidir={false} agir={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Aprovar' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Pular' })).toBeNull();
    expect(screen.getByRole('link', { name: /Ver na Shopee/ })).toBeTruthy();
  });

  it('oferta expirada não tem ações', () => {
    render(<CartaoOferta {...base} oferta={{ ...oferta, prazo: '2026-11-02T11:00:00Z' }} podeDecidir agir={vi.fn()} />);
    expect(screen.getByText('Expirada')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Aprovar' })).toBeNull();
  });
});
