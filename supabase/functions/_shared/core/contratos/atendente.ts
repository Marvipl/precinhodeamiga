// Contrato atendente/v1 (Anexo A.3, rotina pa-atendente): ciclo de 30 minutos da Atendente.
// Entrada: mensagens pendentes só com ID interno e texto (nunca nome, número ou ID do Telegram),
// dados do anúncio quando houver, respostas aprovadas antes e pedidos de "outra versão".
// Saída: nível de cada mensagem, resposta (nível 2 com trecho citado, rascunhos nos níveis 2 e 3), escalonamentos.
// Quem decide se algo sai sozinho é o código (core/atendente/regras.ts), nunca a IA.
import { z } from 'zod';
import type { Contrato } from './index.ts';
import { CATEGORIAS_FECHADAS } from '../atendente/niveis.ts';
import { chaveProduto } from '../atendente/regras.ts';

const categoria = z.enum(CATEGORIAS_FECHADAS);

const mensagemEntrada = z.object({
  id: z.string().uuid(),
  texto: z.string().max(4000),
  origem: z.enum(['telegram', 'formulario']),
  /** O formulário pode trazer faixa de preço. */
  preco_max: z.number().nonnegative().nullable().optional(),
  anuncio: z
    .object({ produto_id: z.string().uuid(), titulo: z.string().max(300), texto: z.string().max(8000) })
    .nullable()
    .optional(),
  outra_versao: z.object({ rascunho_anterior: z.string().max(2000) }).nullable().optional(),
});

const pedidoComOpcoes = z.object({
  pedido_id: z.string().uuid(),
  mensagem_id: z.string().uuid(),
  texto: z.string().max(1000),
  preco_max: z.number().nonnegative().nullable(),
  opcoes: z.array(z.object({ produto_id: z.string().uuid(), titulo: z.string().max(300), preco: z.number().nullable() })).max(5),
});

const entrada = z.object({
  ciclo: z.string().max(40),
  temas_ligados: z.array(categoria),
  mensagens: z.array(mensagemEntrada).max(200),
  pedidos_com_opcoes: z.array(pedidoComOpcoes).max(100).default([]),
  respostas_aprovadas: z.array(z.object({ categoria: z.string().nullable(), texto: z.string().max(2000) })).max(30).default([]),
});

const mensagemSaida = z.object({
  id: z.string().uuid(),
  nivel: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  categoria: categoria.nullable().optional(),
  /** Texto da resposta. Links só como {link:<produto_id>}. Ignorado no nível 1 (texto fixo do código). */
  resposta: z.string().max(1500).nullable().optional(),
  /** Nível 2: trecho do anúncio que sustenta a resposta, copiado literalmente. */
  trecho_citado: z.string().max(500).nullable().optional(),
  produto_id: z.string().uuid().nullable().optional(),
  /** Tema curto e estável da dúvida, para juntar dúvidas iguais na semana. */
  tema_duvida: z.string().max(80).nullable().optional(),
  /** Pedido de produto identificado na mensagem (nível 3). */
  pedido: z
    .object({ texto: z.string().min(2).max(300), preco_max: z.number().nonnegative().nullable().optional(), produto_canonico: z.string().max(120) })
    .nullable()
    .optional(),
  motivo: z.string().max(300).nullable().optional(),
  alertas: z.array(z.object({ tipo: z.string().max(40), trecho: z.string().max(300) })).max(10).default([]),
});

const saida = z.object({
  mensagens: z.array(mensagemSaida).max(200),
  /** Rascunhos para pedidos que já têm opções da Caçadora. */
  pedidos: z.array(z.object({ pedido_id: z.string().uuid(), resposta: z.string().max(1500) })).max(100).default([]),
});

export type EntradaAtendente = z.infer<typeof entrada>;
export type SaidaAtendente = z.infer<typeof saida>;

// Resposta simulada: determinística e claramente fictícia.
function simular(e: EntradaAtendente): SaidaAtendente {
  const mensagens = e.mensagens.map((m) => {
    const t = m.texto.toLowerCase();
    const pedePreco = m.preco_max != null || /\b(procuro|quero|queria|preciso|tem algum|tem alguma|indica)\b/.test(t);
    if (pedePreco) {
      return {
        id: m.id,
        nivel: 3 as const,
        pedido: { texto: m.texto.slice(0, 300), preco_max: m.preco_max ?? null, produto_canonico: chaveProduto(m.texto).slice(0, 120) || 'produto' },
        resposta: 'Rascunho simulado: recebi seu pedido e a Caçadora está procurando opções. Respondo assim que encontrar.',
        alertas: [],
      };
    }
    if (m.anuncio && /\b(medida|tamanho|altura|largura|cm)\b/.test(t)) {
      const frase = m.anuncio.texto.split(/[.\n]/).find((f) => /\d/.test(f))?.trim();
      if (frase) {
        return {
          id: m.id,
          nivel: 2 as const,
          categoria: 'medidas' as const,
          produto_id: m.anuncio.produto_id,
          trecho_citado: frase,
          resposta: `Resposta simulada: pelo anúncio, ${frase}.`,
          tema_duvida: 'medidas do produto',
          alertas: [],
        };
      }
    }
    return {
      id: m.id,
      nivel: 3 as const,
      resposta: m.outra_versao
        ? 'Rascunho simulado (outra versão): obrigada pela mensagem! Vou conferir e te respondo no próximo bloco.'
        : 'Rascunho simulado: obrigada pela mensagem! Vou conferir e te respondo no próximo bloco.',
      tema_duvida: null,
      alertas: [],
    };
  });
  const pedidos = e.pedidos_com_opcoes
    .filter((p) => p.opcoes.length > 0)
    .map((p) => ({
      pedido_id: p.pedido_id,
      resposta: `Rascunho simulado: achei ${p.opcoes.length} ${p.opcoes.length === 1 ? 'opção' : 'opções'} para o que você pediu: ${p.opcoes
        .map((o) => `{link:${o.produto_id}}`)
        .join(' e ')}. Os links geram comissão para a Precinho.`,
    }));
  return { mensagens, pedidos };
}

export const atendente: Contrato<EntradaAtendente, SaidaAtendente> = {
  id: 'atendente/v1',
  rotina: 'pa-atendente',
  descricao: 'Ciclo da Atendente: classifica mensagens pendentes e escreve rascunhos',
  entrada: entrada as unknown as z.ZodType<EntradaAtendente>,
  saida: saida as unknown as z.ZodType<SaidaAtendente>,
  simular,
};
