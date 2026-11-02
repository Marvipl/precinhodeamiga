// Contrato redacao/v1 (rotina pa-redacao: Redatora e Guardiã de texto; Anexo A.3).
// V1: "pedir outra versão" da frase de uma oferta (F-04). O P14 acrescenta novos tipos.
// Os pedidos de 5 minutos são juntados em um único job (core/ofertas/redacao.ts).
import { z } from 'zod';
import type { Contrato } from './index.ts';
import { alertaTexto } from './curadoria.ts';

const uuid = z.string().uuid();

export const TIPOS_REDACAO = ['outra_versao'] as const;

export const pedidoRedacao = z.object({
  oferta_id: uuid,
  tipo: z.enum(TIPOS_REDACAO),
  versao: z.number().int().min(2), // versão que a nova frase vai ter
  nome: z.string().min(1).max(300),
  nicho: z.string().nullable(),
  preco_atual: z.number().nonnegative(),
  frase_atual: z.string().nullable(),
  motivos: z.array(z.string()).max(5),
  frase_max: z.number().int().min(20).max(400),
});
export type PedidoRedacao = z.infer<typeof pedidoRedacao>;

export const entradaRedacao = z.object({ pedidos: z.array(pedidoRedacao).min(1).max(30) });
export type EntradaRedacao = z.infer<typeof entradaRedacao>;

export const saidaRedacao = z.object({
  textos: z
    .array(
      z.object({
        oferta_id: uuid,
        tipo: z.enum(TIPOS_REDACAO),
        frase: z.string().max(400).nullable(),
        alertas: z.array(alertaTexto).max(5).default([]),
      }),
    )
    .max(30),
});
export type SaidaRedacao = z.infer<typeof saidaRedacao>;

export function simularRedacao(e: EntradaRedacao): SaidaRedacao {
  return {
    textos: e.pedidos.map((p) => ({
      oferta_id: p.oferta_id,
      tipo: p.tipo,
      frase: `Frase de teste da Redatora, versão ${p.versao} (modo simulado).`,
      alertas: [],
    })),
  };
}

export const redacao: Contrato<EntradaRedacao, SaidaRedacao> = {
  id: 'redacao/v1',
  rotina: 'pa-redacao',
  descricao: 'Outra versão da frase de uma oferta',
  entrada: entradaRedacao,
  saida: saidaRedacao as unknown as z.ZodType<SaidaRedacao>,
  simular: simularRedacao,
};
