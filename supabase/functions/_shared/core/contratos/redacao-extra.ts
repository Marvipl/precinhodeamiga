// Contrato `redacao-extra/v1` (F-28): conteúdo extra da Redatora, na rotina pa-redacao.
// Três tipos: roteiro de vídeo curto, lista de achados para data de pico e post de respostas da semana.
//
// Divisão de papéis (seção 5): a IA só escreve frases. Preços, nomes de produto e a lista de itens
// vêm da entrada (do banco) e são montados por código em `core/crescimento/extra.ts`.
// A saída nunca traz número de preço: o código põe o preço que veio do banco.
import { z } from 'zod';
import type { Contrato } from './index.ts';
import { DURACAO_MAX_VIDEO_S } from '../crescimento/regras.ts';

const produto = z.object({
  ref: z.string().min(1).max(64), // id interno da oferta
  nome: z.string().min(1).max(200),
  preco: z.number().nonnegative(),
  motivos: z.array(z.string().max(200)).max(5).default([]),
});

const entradaRoteiro = z.object({
  tipo: z.literal('roteiro_video'),
  conteudo_id: z.string().uuid(),
  versao: z.number().int().positive(),
  produto,
});

const entradaLista = z.object({
  tipo: z.literal('lista_data'),
  conteudo_id: z.string().uuid(),
  versao: z.number().int().positive(),
  data_pico: z.object({ nome: z.string().min(1).max(80), data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }),
  achados: z.array(produto).min(1).max(12),
});

const entradaRespostas = z.object({
  tipo: z.literal('respostas_semana'),
  conteudo_id: z.string().uuid(),
  versao: z.number().int().positive(),
  // Só o tema e o texto das perguntas, sem nome nem contato (a IA nunca recebe dado pessoal).
  temas: z
    .array(z.object({ tema: z.string().min(1).max(120), perguntas: z.array(z.string().max(500)).min(1).max(10) }))
    .min(1)
    .max(5),
});

export const entradaRedacaoExtra = z.discriminatedUnion('tipo', [entradaRoteiro, entradaLista, entradaRespostas]);

/** Trecho com promessa que o anúncio não sustenta (seção 5.3), marcado pela IA da própria rotina. */
const alerta = z.object({ trecho: z.string().max(200), motivo: z.string().max(200) });

const cena = z.object({
  segundos: z.number().int().min(1).max(DURACAO_MAX_VIDEO_S),
  mostra: z.string().min(1).max(200), // o que aparece (pode ser só mãos e produto)
  fala: z.string().max(200), // texto falado ou escrito na tela; pode ser vazio
});

const saidaRoteiro = z.object({
  tipo: z.literal('roteiro_video'),
  titulo: z.string().min(1).max(100),
  cenas: z
    .array(cena)
    .min(2)
    .max(8)
    .refine((c) => c.reduce((s, x) => s + x.segundos, 0) <= DURACAO_MAX_VIDEO_S, {
      message: `o roteiro passa de ${DURACAO_MAX_VIDEO_S} segundos`,
    }),
  legenda: z.string().max(300),
  alertas: z.array(alerta).max(10).default([]),
});

const saidaLista = z.object({
  tipo: z.literal('lista_data'),
  titulo: z.string().min(1).max(100),
  abertura: z.string().max(300),
  itens: z.array(z.object({ ref: z.string().min(1).max(64), frase: z.string().max(140) })).min(1).max(12),
  alertas: z.array(alerta).max(10).default([]),
});

const saidaRespostas = z.object({
  tipo: z.literal('respostas_semana'),
  titulo: z.string().min(1).max(100),
  itens: z.array(z.object({ tema: z.string().min(1).max(120), resposta: z.string().min(1).max(400) })).min(1).max(5),
  alertas: z.array(alerta).max(10).default([]),
});

export const saidaRedacaoExtra = z.discriminatedUnion('tipo', [saidaRoteiro, saidaLista, saidaRespostas]);

export type EntradaRedacaoExtra = z.infer<typeof entradaRedacaoExtra>;
export type SaidaRedacaoExtra = z.infer<typeof saidaRedacaoExtra>;

const AVISO_SIMULADO = '[Texto simulado: a Redatora ainda não está ligada]';

/** Resposta simulada: fictícia, determinística e avisando que é simulação. */
function simular(e: EntradaRedacaoExtra): SaidaRedacaoExtra {
  switch (e.tipo) {
    case 'roteiro_video':
      return {
        tipo: 'roteiro_video',
        titulo: `Roteiro simulado: ${e.produto.nome}`,
        cenas: [
          { segundos: 5, mostra: 'Mãos tirando o produto da embalagem', fala: AVISO_SIMULADO },
          { segundos: 10, mostra: 'Produto em uso, de perto', fala: '[Fala simulada sobre o uso do produto]' },
          { segundos: 10, mostra: 'Detalhe que faz diferença', fala: '[Fala simulada sobre o detalhe]' },
          { segundos: 5, mostra: 'Produto parado, bem enquadrado', fala: 'O link está no canal.' },
        ],
        legenda: AVISO_SIMULADO,
        alertas: [],
      };
    case 'lista_data':
      return {
        tipo: 'lista_data',
        titulo: `Achados para ${e.data_pico.nome} (simulado)`,
        abertura: AVISO_SIMULADO,
        itens: e.achados.map((a) => ({ ref: a.ref, frase: '[Frase simulada]' })),
        alertas: [],
      };
    case 'respostas_semana':
      return {
        tipo: 'respostas_semana',
        titulo: 'Respostas da semana (simulado)',
        itens: e.temas.map((t) => ({ tema: t.tema, resposta: `${AVISO_SIMULADO} Resposta para "${t.tema}".` })),
        alertas: [],
      };
  }
}

export const redacaoExtra: Contrato<EntradaRedacaoExtra, SaidaRedacaoExtra> = {
  id: 'redacao-extra/v1',
  rotina: 'pa-redacao',
  descricao: 'Conteúdo extra da Redatora: roteiro de vídeo, lista de achados de data e respostas da semana',
  entrada: entradaRedacaoExtra as unknown as z.ZodType<EntradaRedacaoExtra>,
  saida: saidaRedacaoExtra as unknown as z.ZodType<SaidaRedacaoExtra>,
  simular,
};
