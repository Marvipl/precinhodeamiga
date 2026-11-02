// Contrato curadoria/v1 (rotina pa-curadoria: Caçadora, Redatora e Guardiã de texto; Anexo A.3).
// Entrada: candidatas já com nota (calculada em código pela coleta, seção 5.2), pedidos abertos e nichos.
// Saída: ofertas escolhidas com motivos, frase e alertas de promessa; opções para os pedidos.
// A IA escolhe e escreve. Quem decide tamanho da fila, preço "de", limite da frase e o que vira oferta
// é o código (core/ofertas/curadoria.ts).
import { z } from 'zod';
import type { Contrato } from './index.ts';

const uuid = z.string().uuid();

export const candidataCuradoria = z.object({
  produto_id: uuid,
  nome: z.string().min(1).max(300),
  nicho_id: uuid.nullable(),
  nicho_nome: z.string().nullable(),
  fora_nicho_principal: z.boolean(),
  imagem_url: z.string().nullable(),
  url_produto: z.string(), // link comum (botão "ver na Shopee"), nunca o de afiliado
  preco_atual: z.number().nonnegative(),
  preco_referencia: z.number().nonnegative().nullable(), // mediana; null = sem de/por
  desconto_real: z.number().nullable(),
  dias_historico: z.number().int().nonnegative(),
  historico_curto: z.boolean(),
  comissao_taxa: z.number().nonnegative().nullable(),
  comissao_extra: z.boolean(),
  comissao_estimada: z.number().nonnegative().nullable(),
  loja_nome: z.string().nullable(),
  loja_nota: z.number().nullable(),
  produto_nota: z.number().nullable(),
  vendas: z.number().int().nullable(),
  prazo: z.string().nullable(),
  nota: z.number().int().min(0).max(100).nullable(),
  nota_detalhe: z.record(z.number()).nullable(),
  alertas: z.array(z.object({ tipo: z.string(), texto: z.string() })),
});
export type CandidataCuradoria = z.infer<typeof candidataCuradoria>;

export const entradaCuradoria = z.object({
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  tamanho_fila: z.number().int().min(0).max(50),
  candidatas: z.array(candidataCuradoria).max(60),
  pedidos: z.array(z.object({ id: uuid, texto: z.string().max(300), preco_max: z.number().nonnegative().nullable() })).max(20),
  nichos: z.array(z.object({ id: uuid, nome: z.string(), principal: z.boolean() })),
  /** Pulos recentes com motivo: ensinam a Caçadora (F-04). */
  pulos_recentes: z.array(z.object({ produto_id: uuid.nullable(), nome: z.string(), motivo: z.string().nullable() })).max(50).optional(),
});
export type EntradaCuradoria = z.infer<typeof entradaCuradoria>;

export const alertaTexto = z.object({
  tipo: z.literal('promessa'),
  texto: z.string().min(1).max(300),
  trecho: z.string().max(300).optional(),
});

const ofertaEscolhida = z.object({
  produto_id: uuid,
  motivos: z.array(z.string().min(1).max(160)).min(1).max(5),
  frase: z.string().max(400).nullable(), // limite real (padrão 140) é aplicado pelo código
  alertas: z.array(alertaTexto).max(5).default([]),
});

export const saidaCuradoria = z.object({
  ofertas: z.array(ofertaEscolhida).max(50),
  pedidos: z
    .array(
      z.object({
        pedido_id: uuid,
        opcoes: z.array(ofertaEscolhida).max(5), // o código aceita até 2 (Fluxo B)
        observacao: z.string().max(300).optional(),
      }),
    )
    .max(20)
    .default([]),
});
export type SaidaCuradoria = z.infer<typeof saidaCuradoria>;

/**
 * Resposta simulada (AGENTES_MODO=simulado): escolhe as maiores notas e usa frases que dizem
 * claramente que são de teste. Determinística.
 */
export function simularCuradoria(e: EntradaCuradoria): SaidaCuradoria {
  const ordenadas = [...e.candidatas].sort((a, b) => (b.nota ?? -1) - (a.nota ?? -1) || a.produto_id.localeCompare(b.produto_id));
  const escolher = (c: CandidataCuradoria) => ({
    produto_id: c.produto_id,
    motivos: motivosSimulados(c),
    frase: 'Frase de teste da Redatora (modo simulado).',
    alertas: [],
  });
  return {
    ofertas: ordenadas.slice(0, e.tamanho_fila).map(escolher),
    pedidos: e.pedidos.map((p) => ({
      pedido_id: p.id,
      opcoes: ordenadas
        .filter((c) => p.preco_max === null || c.preco_atual <= p.preco_max)
        .slice(0, 2)
        .map(escolher),
    })),
  };
}

function motivosSimulados(c: CandidataCuradoria): string[] {
  const m: string[] = [];
  if (c.preco_referencia !== null && !c.historico_curto) m.push('Preço abaixo da mediana observada (simulado)');
  if (c.comissao_extra) m.push('Comissão Extra ativa (simulado)');
  if (m.length === 0) m.push('Escolhida pela nota (simulado)');
  return m;
}

export const curadoria: Contrato<EntradaCuradoria, SaidaCuradoria> = {
  id: 'curadoria/v1',
  rotina: 'pa-curadoria',
  descricao: 'Escolha das ofertas do dia, motivos, frases e opções para pedidos',
  entrada: entradaCuradoria as unknown as z.ZodType<EntradaCuradoria>,
  saida: saidaCuradoria as unknown as z.ZodType<SaidaCuradoria>,
  simular: simularCuradoria,
};
