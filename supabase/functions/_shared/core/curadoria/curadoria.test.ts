import { describe, expect, it } from 'vitest';
import { alertaHistoricoCurto, mediana, resumirHistorico, validarDeManual, type PrecoObservado } from './historico.ts';
import { calcularNota, comissaoEstimada, eliminatorios, tamanhoFila, taxaComissao, type ProdutoAvaliado } from './nota.ts';
import { entradaCuradoria, melhoresCandidatas, montarCandidata, type ProdutoColetado } from './candidata.ts';
import { CONFIG } from '../config.ts';
import { somarDias } from '../formato.ts';

const REGRAS = {
  janelaHistoricoDias: 30,
  descontoRealMinimo: 0.1,
  historicoCurtoDias: 7,
  pesosNota: CONFIG.pesosNota.padrao,
  lojaNotaMinima: null,
  lojaAvaliacoesMinimas: null,
};
const HOJE = '2026-11-20';
const AGORA = new Date('2026-11-20T09:00:00Z');

function serie(dias: number, preco: number, hoje = HOJE): PrecoObservado[] {
  return Array.from({ length: dias }, (_, i) => ({ data: somarDias(hoje, -dias + i), preco }));
}

const PRODUTO: ProdutoColetado = {
  id: '00000000-0000-4000-9000-000000000001',
  nome: 'Produto de teste A',
  imagem_url: null,
  url_produto: 'https://exemplo.invalid/shopee/produto/1/1',
  loja_nome: 'Loja de teste 1',
  em_estoque: true,
  loja_nota: null,
  loja_avaliacoes: null,
  produto_nota: 4.8,
  vendas: 1200,
  comissao_taxa: 0.05,
  comissao_extra_taxa: null,
  prazo: null,
  nicho: { id: '00000000-0000-4000-9100-000000000001', nome: 'Nicho de teste', principal: true, bloqueado: false },
};

describe('histórico de preço (seção 5.2)', () => {
  it('mediana', () => {
    expect(mediana([])).toBeNull();
    expect(mediana([3, 1, 2])).toBe(2);
    expect(mediana([4, 1, 2, 3])).toBe(2.5);
  });

  it('preço de referência é a mediana da janela, sem o dia de hoje', () => {
    const r = resumirHistorico([...serie(20, 100), { data: HOJE, preco: 80 }], HOJE, REGRAS);
    expect(r.precoAtual).toBe(80);
    expect(r.mediana).toBe(100);
    expect(r.desconto).toBe(0.2);
    expect(r.descontoReal).toBe(true);
    expect(r.precoReferencia).toBe(100);
    expect(r.historicoCurto).toBe(false);
    expect(r.maiorNaJanela).toBe(100);
  });

  it('desconto abaixo de 10% não é desconto real: post sem de/por', () => {
    const r = resumirHistorico([...serie(20, 100), { data: HOJE, preco: 91 }], HOJE, REGRAS);
    expect(r.descontoReal).toBe(false);
    expect(r.precoReferencia).toBeNull();
    const exato = resumirHistorico([...serie(20, 100), { data: HOJE, preco: 90 }], HOJE, REGRAS);
    expect(exato.descontoReal).toBe(true);
  });

  it('ignora preços fora da janela de 30 dias', () => {
    const antigos = Array.from({ length: 10 }, (_, i) => ({ data: somarDias(HOJE, -60 + i), preco: 500 }));
    const r = resumirHistorico([...antigos, ...serie(10, 100), { data: HOJE, preco: 85 }], HOJE, REGRAS);
    expect(r.mediana).toBe(100);
    expect(r.maiorNaJanela).toBe(100);
    expect(r.diasHistorico).toBe(60); // histórico conta desde a primeira vez, mesmo fora da janela
  });

  it('histórico curto (menos de 7 dias): alerta e sem de/por, mesmo com desconto', () => {
    const r = resumirHistorico([...serie(6, 100), { data: HOJE, preco: 50 }], HOJE, REGRAS);
    expect(r.diasHistorico).toBe(6);
    expect(r.historicoCurto).toBe(true);
    expect(r.descontoReal).toBe(false);
    expect(r.precoReferencia).toBeNull();
    const sete = resumirHistorico([...serie(7, 100), { data: HOJE, preco: 50 }], HOJE, REGRAS);
    expect(sete.historicoCurto).toBe(false);
  });

  it('produto visto pela primeira vez hoje', () => {
    const r = resumirHistorico([{ data: HOJE, preco: 50 }], HOJE, REGRAS);
    expect(r).toMatchObject({ precoAtual: 50, mediana: null, diasHistorico: 0, historicoCurto: true, precoReferencia: null });
    expect(alertaHistoricoCurto(0)).toBe('Histórico de preço curto: observado só hoje. Confira o preço antes de aprovar.');
    expect(alertaHistoricoCurto(3)).toBe('Histórico de preço curto: observado há 3 dias. Confira o preço antes de aprovar.');
  });

  it('"de" manual (F-16) só com histórico e até o maior preço da janela', () => {
    const r = resumirHistorico([...serie(20, 100), { data: HOJE, preco: 80 }], HOJE, REGRAS);
    expect(validarDeManual(100, r, 80)).toBe(100);
    expect(validarDeManual(120, r, 80)).toBeNull();
    expect(validarDeManual(null, r, 80)).toBeNull();
    const curto = resumirHistorico([{ data: HOJE, preco: 80 }], HOJE, REGRAS);
    expect(validarDeManual(90, curto, 80)).toBeNull();
  });
});

describe('eliminatórios, comissão e nota (seção 5.2)', () => {
  const base: ProdutoAvaliado = PRODUTO;

  it('eliminatórios: sem estoque, nicho bloqueado, loja abaixo do mínimo, prazo vencido', () => {
    expect(eliminatorios(base, 10, REGRAS, AGORA)).toEqual([]);
    expect(eliminatorios({ ...base, em_estoque: false }, 10, REGRAS, AGORA)).toContain('sem_estoque');
    expect(eliminatorios({ ...base, nicho: { ...base.nicho!, bloqueado: true } }, 10, REGRAS, AGORA)).toContain('nicho_bloqueado');
    expect(eliminatorios(base, null, REGRAS, AGORA)).toContain('sem_preco');
    expect(eliminatorios({ ...base, prazo: '2026-11-20T08:00:00Z' }, 10, REGRAS, AGORA)).toContain('prazo_vencido');
    const comLimite = { ...REGRAS, lojaNotaMinima: 4.5, lojaAvaliacoesMinimas: 100 };
    expect(eliminatorios({ ...base, loja_nota: 4.4, loja_avaliacoes: 50 }, 10, comLimite, AGORA)).toEqual(['loja_nota_baixa', 'loja_poucas_avaliacoes']);
    // Sem limite definido pelo dono (null), não filtra.
    expect(eliminatorios({ ...base, loja_nota: 1, loja_avaliacoes: 0 }, 10, REGRAS, AGORA)).toEqual([]);
  });

  it('comissão estimada: preço atual × taxa (Extra quando houver)', () => {
    expect(comissaoEstimada(80, 0.05)).toBe(4);
    expect(comissaoEstimada(33.33, 0.07)).toBe(2.33);
    expect(taxaComissao({ comissao_taxa: 0.05, comissao_extra_taxa: 0.12 })).toEqual({ taxa: 0.12, extra: true });
    expect(taxaComissao({ comissao_taxa: 0.05, comissao_extra_taxa: null })).toEqual({ taxa: 0.05, extra: false });
    expect(taxaComissao({ comissao_taxa: null, comissao_extra_taxa: null })).toEqual({ taxa: 0, extra: false });
  });

  it('nota de 0 a 100 com os pesos 35/25/20/10/10', () => {
    const resumo = resumirHistorico([...serie(20, 100), { data: HOJE, preco: 60 }], HOJE, REGRAS); // 40% de desconto
    const cheio: ProdutoAvaliado = { ...base, produto_nota: 5, vendas: 10_000, comissao_taxa: 0.5, prazo: '2026-11-21T00:00:00Z' };
    expect(calcularNota(cheio, resumo, REGRAS).nota).toBe(100);
    const vazio: ProdutoAvaliado = { ...base, produto_nota: null, vendas: null, comissao_taxa: 0, nicho: null };
    const semDesconto = resumirHistorico([{ data: HOJE, preco: 60 }], HOJE, REGRAS);
    expect(calcularNota(vazio, semDesconto, REGRAS)).toEqual({ nota: 0, detalhe: { desconto: 0, comissao: 0, avaliacao: 0, aderencia: 0, prazo: 0 } });
  });

  it('nota pondera cada componente', () => {
    const resumo = resumirHistorico([...serie(20, 100), { data: HOJE, preco: 80 }], HOJE, REGRAS); // 20%
    const { detalhe } = calcularNota({ ...base, produto_nota: 4, vendas: 0, comissao_taxa: 0.05, prazo: null }, resumo, REGRAS);
    expect(detalhe.desconto).toBe(17.5); // 20/40 × 35
    expect(detalhe.comissao).toBe(5); // R$ 4 / R$ 20 × 25
    expect(detalhe.avaliacao).toBe(5); // (0,5 + 0) / 2 × 20
    expect(detalhe.aderencia).toBe(10); // nicho principal
    expect(detalhe.prazo).toBe(0);
    const outro = calcularNota({ ...base, nicho: { ...base.nicho!, principal: false } }, resumo, REGRAS);
    expect(outro.detalhe.aderencia).toBe(5);
    const pedido = calcularNota({ ...base, nicho: null, atendePedido: true }, resumo, REGRAS);
    expect(pedido.detalhe.aderencia).toBe(10);
  });

  it('tamanho da fila: maior cadência + 2', () => {
    expect(tamanhoFila({ wa: 6, tg: 6 }, 2)).toBe(8);
    expect(tamanhoFila({ wa: 4, tg: 8 }, 2)).toBe(10);
  });
});

describe('candidatas', () => {
  it('monta a candidata com alertas e valida no esquema do contrato', () => {
    const r = montarCandidata({ ...PRODUTO, nicho: { ...PRODUTO.nicho!, principal: false } }, [{ data: HOJE, preco: 50 }], HOJE, REGRAS, AGORA);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.candidata).toMatchObject({ preco_atual: 50, preco_referencia: null, historico_curto: true, comissao_estimada: 2.5, fora_nicho_principal: true });
    expect(r.candidata.alertas.map((a) => a.tipo)).toEqual(['historico_curto', 'fora_nicho_principal']);
    expect(r.candidata.alertas[1].texto).toBe('Útil para testar Nicho de teste na matriz de nicho.');
    expect(r.candidata.url_produto).toBe(PRODUTO.url_produto);
    const e = entradaCuradoria.safeParse({ data: HOJE, tamanho_fila: 8, candidatas: [r.candidata], pedidos: [], nichos: [] });
    expect(e.success).toBe(true);
  });

  it('elimina e informa o motivo', () => {
    const r = montarCandidata({ ...PRODUTO, em_estoque: false }, [{ data: HOJE, preco: 50 }], HOJE, REGRAS, AGORA);
    expect(r).toEqual({ ok: false, produto_id: PRODUTO.id, motivos: ['sem_estoque'] });
  });

  it('as melhores por nota, com desempate determinístico', () => {
    const c = (id: number, nota: number, com = 1) => {
      const r = montarCandidata({ ...PRODUTO, id: `00000000-0000-4000-9000-${String(id).padStart(12, '0')}`, nome: `Produto de teste ${id}` }, [{ data: HOJE, preco: 50 }], HOJE, REGRAS, AGORA);
      if (!r.ok) throw new Error('eliminado');
      return { ...r.candidata, nota, comissao_estimada: com };
    };
    const lista = [c(1, 50), c(2, 90), c(3, 70, 1), c(4, 70, 3)];
    expect(melhoresCandidatas(lista, 3).map((x) => x.nome)).toEqual(['Produto de teste 2', 'Produto de teste 4', 'Produto de teste 3']);
  });
});
