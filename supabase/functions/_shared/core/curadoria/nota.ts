// Eliminatórios, comissão estimada, nota de 0 a 100 e tamanho da fila (seção 5.2).
// Código puro (navegador, Node e Deno). As escalas de cada componente são [SUPOSIÇÃO] (docs/decisions.md, S-P1-1).

import type { ResumoHistorico } from './historico.ts';

export interface PesosNota {
  desconto: number;
  comissao: number;
  avaliacao: number;
  aderencia: number;
  prazo: number;
}

export interface RegrasNota {
  pesosNota: PesosNota;
  lojaNotaMinima: number | null;
  lojaAvaliacoesMinimas: number | null;
}

/** Escalas que levam cada componente a 1 (nota máxima do componente). [SUPOSIÇÃO] S-P1-1. */
export const ESCALAS = {
  /** Desconto real de 40% ou mais vale o componente inteiro. */
  descontoCheio: 0.4,
  /** Comissão estimada de R$ 20 por venda ou mais vale o componente inteiro. */
  comissaoCheiaReais: 20,
  /** Nota do produto: 3,0 vale 0 e 5,0 vale 1. */
  notaProdutoMin: 3,
  notaProdutoMax: 5,
  /** Vendas: escala logarítmica, 10.000 vendas valem 1. */
  vendasCheias: 10_000,
  /** Aderência: nicho principal ou pedido = 1; outro nicho ativo = 0,5; sem nicho = 0. */
  aderenciaOutroNicho: 0.5,
} as const;

export interface ProdutoAvaliado {
  em_estoque: boolean;
  loja_nota: number | null;
  loja_avaliacoes: number | null;
  produto_nota: number | null;
  vendas: number | null;
  comissao_taxa: number | null;
  comissao_extra_taxa: number | null;
  prazo: string | null; // ISO; oferta com prazo claro
  nicho: { id: string; principal: boolean; bloqueado: boolean } | null;
  /** O produto atende a um pedido aberto (F-05). */
  atendePedido?: boolean;
}

export type MotivoEliminacao = 'sem_estoque' | 'nicho_bloqueado' | 'loja_nota_baixa' | 'loja_poucas_avaliacoes' | 'sem_preco' | 'prazo_vencido';

export function eliminatorios(p: ProdutoAvaliado, precoAtual: number | null, regras: RegrasNota, agora: Date): MotivoEliminacao[] {
  const out: MotivoEliminacao[] = [];
  if (precoAtual === null || precoAtual <= 0) out.push('sem_preco');
  if (!p.em_estoque) out.push('sem_estoque');
  if (p.nicho?.bloqueado) out.push('nicho_bloqueado');
  // Sem dado da loja não elimina: a API pode não trazer o campo. O limite só vale quando o dono define.
  if (regras.lojaNotaMinima !== null && p.loja_nota !== null && p.loja_nota < regras.lojaNotaMinima) out.push('loja_nota_baixa');
  if (regras.lojaAvaliacoesMinimas !== null && p.loja_avaliacoes !== null && p.loja_avaliacoes < regras.lojaAvaliacoesMinimas) {
    out.push('loja_poucas_avaliacoes');
  }
  if (p.prazo && new Date(p.prazo).getTime() <= agora.getTime()) out.push('prazo_vencido');
  return out;
}

/** Taxa usada na estimativa: a Comissão Extra, quando houver, senão a padrão. */
export function taxaComissao(p: Pick<ProdutoAvaliado, 'comissao_taxa' | 'comissao_extra_taxa'>): { taxa: number; extra: boolean } {
  const extra = p.comissao_extra_taxa ?? 0;
  const padrao = p.comissao_taxa ?? 0;
  return extra > 0 && extra >= padrao ? { taxa: extra, extra: true } : { taxa: padrao, extra: false };
}

/**
 * Comissão por venda exibida (seção 5.2): preço atual × taxa, sempre rotulada como estimativa ("cerca de"),
 * porque a Shopee calcula sobre o valor líquido, sem impostos, cupons e frete.
 */
export function comissaoEstimada(precoAtual: number, taxa: number): number {
  return Math.round(precoAtual * taxa * 100) / 100;
}

export interface DetalheNota {
  desconto: number;
  comissao: number;
  avaliacao: number;
  aderencia: number;
  prazo: number;
}

const lim = (x: number) => Math.max(0, Math.min(1, x));

/** Cada componente em pontos já ponderados (a soma é a nota). */
export function calcularNota(p: ProdutoAvaliado, resumo: ResumoHistorico, regras: RegrasNota): { nota: number; detalhe: DetalheNota } {
  const w = regras.pesosNota;
  const preco = resumo.precoAtual ?? 0;
  const fDesconto = resumo.descontoReal && resumo.desconto !== null ? lim(resumo.desconto / ESCALAS.descontoCheio) : 0;
  const fComissao = lim(comissaoEstimada(preco, taxaComissao(p).taxa) / ESCALAS.comissaoCheiaReais);
  const fNotaProd = p.produto_nota === null ? 0 : lim((p.produto_nota - ESCALAS.notaProdutoMin) / (ESCALAS.notaProdutoMax - ESCALAS.notaProdutoMin));
  const fVendas = p.vendas === null || p.vendas <= 0 ? 0 : lim(Math.log10(p.vendas + 1) / Math.log10(ESCALAS.vendasCheias + 1));
  const fAvaliacao = (fNotaProd + fVendas) / 2;
  const fAderencia = p.atendePedido || p.nicho?.principal ? 1 : p.nicho ? ESCALAS.aderenciaOutroNicho : 0;
  const fPrazo = p.prazo ? 1 : 0;
  const detalhe: DetalheNota = {
    desconto: r1(fDesconto * w.desconto),
    comissao: r1(fComissao * w.comissao),
    avaliacao: r1(fAvaliacao * w.avaliacao),
    aderencia: r1(fAderencia * w.aderencia),
    prazo: r1(fPrazo * w.prazo),
  };
  const soma = detalhe.desconto + detalhe.comissao + detalhe.avaliacao + detalhe.aderencia + detalhe.prazo;
  const total = w.desconto + w.comissao + w.avaliacao + w.aderencia + w.prazo;
  const nota = total > 0 ? Math.round((soma / total) * 100) : 0;
  return { nota: Math.max(0, Math.min(100, nota)), detalhe };
}

function r1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Tamanho da fila do dia: maior cadência vigente entre os dois canais + folga (seção 5.2). */
export function tamanhoFila(cadencias: { wa: number; tg: number }, folga: number): number {
  return Math.max(cadencias.wa, cadencias.tg) + folga;
}
