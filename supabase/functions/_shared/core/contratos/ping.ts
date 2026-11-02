// Contrato de teste da orquestração: devolve a mensagem recebida.
// Serve para o Marcus conferir, no primeiro uso, que disparo e retorno funcionam (Fluxo G).
import { z } from 'zod';
import type { Contrato } from './index.ts';

const entrada = z.object({ mensagem: z.string().max(500) });
const saida = z.object({ eco: z.string().max(500) });

export const ping: Contrato<z.infer<typeof entrada>, z.infer<typeof saida>> = {
  id: 'ping/v1',
  rotina: 'pa-coach',
  descricao: 'Teste de ida e volta de uma rotina',
  entrada,
  saida,
  simular: (e) => ({ eco: e.mensagem }),
};
