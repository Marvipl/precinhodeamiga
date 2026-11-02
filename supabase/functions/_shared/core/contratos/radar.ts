// Contrato radar/v1 (rotina pa-radar, segundas 07:07): lugares novos com regra observada, motivo,
// aviso e mensagens ajustadas a cada lugar (Anexo A.3; F-21; seção 5.11).
// A busca usa só páginas públicas. As mensagens não trazem link: o código põe o link de entrada no lugar de {link}.
import { z } from 'zod';
import type { Contrato } from './index.ts';
import { contemLink, MARCA_LINK } from '../radar/entrada.ts';
import { chaveLugar } from '../radar/lugares.ts';

const texto = (max: number, campo: string) =>
  z
    .string()
    .min(1)
    .max(max)
    .refine((t) => !contemLink(t), { message: `${campo}: mensagem do Radar não pode ter link (o código põe o link de entrada)` });

const entrada = z.object({
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  nichos: z.array(z.string().max(80)).max(20),
  regiao: z.string().max(120).nullable(),
  /** Chaves dos lugares já vistos, inclusive recusados e descartados, para não repetir. */
  ja_vistos: z.array(z.string().max(300)).max(2000),
});

const alerta = z.object({ trecho: z.string().max(200), texto: z.string().max(300) });

const lugar = z.object({
  nome: z.string().min(1).max(120),
  tipo: z.string().min(1).max(60), // ex.: "Grupo de Facebook", "Canal no Telegram"
  regiao: z.string().max(120).nullable(),
  url: z.string().url().max(500).nullable(), // página pública onde o lugar foi achado
  membros: z.number().int().min(0).nullable(),
  nota: z.number().int().min(0).max(100),
  regra: z.string().min(1).max(300), // regra observada na página pública
  proibe_links: z.boolean(),
  motivo: z.string().min(1).max(200),
  mensagens: z.object({
    pedido_admin: texto(800, 'pedido_admin'),
    troca: texto(800, 'troca').nullable(),
    convite: texto(800, 'convite').refine((t) => t.includes(MARCA_LINK), { message: `convite precisa da marca ${MARCA_LINK}` }),
  }),
  /** Promessas que o texto não sustenta, marcadas pela Guardiã (texto). */
  alertas: z.array(alerta).max(10),
});

const saida = z.object({ lugares: z.array(lugar).max(20) });

export type EntradaRadar = z.infer<typeof entrada>;
export type SaidaRadar = z.infer<typeof saida>;
export type LugarSugerido = z.infer<typeof lugar>;

/** Resposta gravada para o modo simulado: lugares claramente fictícios, sem link nenhum. */
function simular(e: EntradaRadar): SaidaRadar {
  const nicho = e.nichos[0] ?? 'nicho de teste';
  const regiao = e.regiao ?? null;
  const base: LugarSugerido[] = [
    {
      nome: 'Lugar de teste A',
      tipo: 'Grupo de teste',
      regiao,
      url: null,
      membros: null,
      nota: 70,
      regra: 'Regra de teste: convite permitido com autorização do administrador',
      proibe_links: false,
      motivo: `Resposta simulada: público do ${nicho}`,
      mensagens: {
        pedido_admin:
          'Oi! Sou a Lana e participo deste grupo. Criei o Precinho de Amiga, um canal com achados com desconto de verdade. Posso compartilhar o link uma vez aqui, no dia que você preferir? Se não puder, tudo bem. (mensagem simulada)',
        troca: null,
        convite: `Gente, criei o Precinho de Amiga: achados que eu mesma compraria, com desconto de verdade. Sem spam. Quem quiser, é só seguir: ${MARCA_LINK} (mensagem simulada)`,
      },
      alertas: [],
    },
    {
      nome: 'Canal de teste B',
      tipo: 'Canal de teste',
      regiao: null,
      url: null,
      membros: null,
      nota: 55,
      regra: 'Regra de teste: aceita troca de divulgação',
      proibe_links: false,
      motivo: 'Resposta simulada: nicho complementar',
      mensagens: {
        pedido_admin: 'Oi! Sou a Lana, do Precinho de Amiga. Posso divulgar o meu canal aqui uma vez? (mensagem simulada)',
        troca: 'Oi! Tenho o Precinho de Amiga, um canal de achados com {seguidores} seguidores. Topa uma troca? Eu indico o seu canal e você indica o meu, no mesmo dia. (mensagem simulada)',
        convite: `Achados com desconto de verdade, sem spam. Para seguir: ${MARCA_LINK} (mensagem simulada)`,
      },
      alertas: [],
    },
    {
      nome: 'Grupo de teste C',
      tipo: 'Grupo de teste',
      regiao,
      url: null,
      membros: null,
      nota: 20,
      regra: 'Regra de teste: proíbe links',
      proibe_links: true,
      motivo: 'Resposta simulada: mesmo nicho',
      mensagens: {
        pedido_admin: 'Mensagem simulada que não deve ser usada.',
        troca: null,
        convite: `Mensagem simulada: ${MARCA_LINK}`,
      },
      alertas: [],
    },
  ];
  // Não repete o que já foi visto.
  const vistos = new Set(e.ja_vistos);
  return { lugares: base.filter((l) => !vistos.has(chaveLugar(l))) };
}

export const radar: Contrato<EntradaRadar, SaidaRadar> = {
  id: 'radar/v1',
  rotina: 'pa-radar',
  descricao: 'Busca semanal de lugares para divulgar o link de entrada, com mensagens ajustadas a cada lugar',
  entrada,
  saida,
  simular,
};
