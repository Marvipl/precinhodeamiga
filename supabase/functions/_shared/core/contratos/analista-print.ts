// Leitura do print do canal do WhatsApp (Fluxo E, F-22). A IA só lê o número; a Lana confirma antes de salvar.
// O processador grava a leitura em `leituras_print` e nunca em `seguidores_registros`.
import { z } from 'zod';
import type { Contrato } from './index.ts';
import { TOTAL_MAXIMO } from '../audiencia/index.ts';

const entrada = z.object({
  leitura_id: z.string().uuid(),
  canal: z.literal('wa'),
  /** URL assinada e temporária da imagem no Storage (bucket `prints`). */
  imagem_url: z.string().url().max(2000),
});

const saida = z.object({
  /** Total de seguidores lido no print, ou null quando não dá para ler com segurança. */
  numero: z.number().int().min(0).max(TOTAL_MAXIMO).nullable(),
  /** Trecho do print onde o número aparece (ex.: "[número] seguidores"), para a Lana conferir. */
  trecho: z.string().max(200),
  confianca: z.enum(['alta', 'media', 'baixa']),
});

export const analistaPrint: Contrato<z.infer<typeof entrada>, z.infer<typeof saida>> = {
  id: 'analista-print/v1',
  rotina: 'pa-analista',
  descricao: 'Lê o total de seguidores no print do canal do WhatsApp',
  entrada,
  saida,
  // Modo simulado: não inventa número. A Lana digita o total e confirma.
  simular: () => ({ numero: null, trecho: 'Leitura simulada: nenhum número foi lido do print.', confianca: 'baixa' }),
};
