// Candidatas da curadoria: produto + histórico -> nota, alertas e o pacote enviado à rotina pa-curadoria.
// Código puro (navegador, Node e Deno).

import { z } from 'zod';
import { alertaHistoricoCurto, resumirHistorico, type PrecoObservado, type RegrasHistorico } from './historico.ts';
import { calcularNota, comissaoEstimada, eliminatorios, taxaComissao, type MotivoEliminacao, type ProdutoAvaliado, type RegrasNota } from './nota.ts';

const iso = z.string().min(10);

export const alertaCandidata = z.object({ tipo: z.string(), texto: z.string() });

export const candidata = z.object({
  produto_id: z.string().uuid(),
  nome: z.string(),
  nicho_id: z.string().uuid().nullable(),
  nicho_nome: z.string().nullable(),
  fora_nicho_principal: z.boolean(),
  imagem_url: z.string().nullable(),
  url_produto: z.string(), // link comum (botão "ver na Shopee"), nunca o de afiliado
  preco_atual: z.number().nonnegative(),
  preco_referencia: z.number().nonnegative().nullable(), // mediana; null = post sem de/por
  desconto_real: z.number().nullable(),
  dias_historico: z.number().int().nonnegative(),
  historico_curto: z.boolean(),
  comissao_taxa: z.number().nonnegative(),
  comissao_extra: z.boolean(),
  comissao_estimada: z.number().nonnegative(), // R$ por venda, estimativa ("cerca de")
  loja_nome: z.string().nullable(),
  loja_nota: z.number().nullable(),
  produto_nota: z.number().nullable(),
  vendas: z.number().int().nullable(),
  prazo: iso.nullable(),
  nota: z.number().int().min(0).max(100),
  nota_detalhe: z.object({ desconto: z.number(), comissao: z.number(), avaliacao: z.number(), aderencia: z.number(), prazo: z.number() }),
  alertas: z.array(alertaCandidata),
});
export type Candidata = z.infer<typeof candidata>;

// Entrada do contrato curadoria/v1: um só esquema, definido no contrato (pacote P2).
// `candidata` acima é a forma estrita que a coleta produz; ela cabe em `candidataCuradoria` do contrato.
export { entradaCuradoria, type EntradaCuradoria } from '../contratos/curadoria.ts';

/** Produto como está na tabela `produtos`, com o nicho resolvido. */
export interface ProdutoColetado extends ProdutoAvaliado {
  id: string;
  nome: string;
  imagem_url: string | null;
  url_produto: string;
  loja_nome: string | null;
  nicho: { id: string; nome: string; principal: boolean; bloqueado: boolean } | null;
}

export type RegrasCuradoria = RegrasHistorico & RegrasNota;

export type ResultadoCandidata = { ok: true; candidata: Candidata } | { ok: false; produto_id: string; motivos: MotivoEliminacao[] };

/** Monta uma candidata a partir de um produto e dos preços observados. Usada pela rodada diária e pelos pedidos. */
export function montarCandidata(p: ProdutoColetado, precos: readonly PrecoObservado[], hoje: string, regras: RegrasCuradoria, agora: Date): ResultadoCandidata {
  const resumo = resumirHistorico(precos, hoje, regras);
  const motivos = eliminatorios(p, resumo.precoAtual, regras, agora);
  if (motivos.length) return { ok: false, produto_id: p.id, motivos };
  const preco = resumo.precoAtual as number;
  const { taxa, extra } = taxaComissao(p);
  const { nota, detalhe } = calcularNota(p, resumo, regras);
  const alertas: Candidata['alertas'] = [];
  if (resumo.historicoCurto) alertas.push({ tipo: 'historico_curto', texto: alertaHistoricoCurto(resumo.diasHistorico) });
  const fora = !!p.nicho && !p.nicho.principal;
  if (fora) alertas.push({ tipo: 'fora_nicho_principal', texto: `Útil para testar ${p.nicho!.nome} na matriz de nicho.` });
  return {
    ok: true,
    candidata: {
      produto_id: p.id,
      nome: p.nome,
      nicho_id: p.nicho?.id ?? null,
      nicho_nome: p.nicho?.nome ?? null,
      fora_nicho_principal: fora,
      imagem_url: p.imagem_url,
      url_produto: p.url_produto,
      preco_atual: preco,
      preco_referencia: resumo.precoReferencia,
      desconto_real: resumo.descontoReal ? resumo.desconto : null,
      dias_historico: resumo.diasHistorico,
      historico_curto: resumo.historicoCurto,
      comissao_taxa: taxa,
      comissao_extra: extra,
      comissao_estimada: comissaoEstimada(preco, taxa),
      loja_nome: p.loja_nome,
      loja_nota: p.loja_nota,
      produto_nota: p.produto_nota,
      vendas: p.vendas,
      prazo: p.prazo,
      nota,
      nota_detalhe: detalhe,
      alertas,
    },
  };
}

/**
 * As `limite` melhores candidatas por nota (seção 5.2: a Caçadora escolhe entre as 30 de maior nota).
 * Desempate: comissão estimada, depois nome (determinístico).
 */
export function melhoresCandidatas(lista: readonly Candidata[], limite: number): Candidata[] {
  return [...lista]
    .sort((a, b) => b.nota - a.nota || b.comissao_estimada - a.comissao_estimada || a.nome.localeCompare(b.nome, 'pt-BR') || (a.produto_id < b.produto_id ? -1 : 1))
    .slice(0, Math.max(0, limite));
}
