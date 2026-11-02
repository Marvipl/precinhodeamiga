// Contrato coach/v1: revisão semanal do plano de 90 dias (F-24; Anexo A.3, pa-coach).
// Entrada: plano, tarefas pendentes (atrasadas marcadas) e resultados da semana.
// Saída: até três prioridades (ids de tarefas da entrada) e a nota da semana.
import { z } from 'zod';
import type { Contrato } from './index.ts';
import { MAX_MOTIVO, MAX_NOTA, MAX_PRIORIDADES, simularCoach, type EntradaCoach, type SaidaCoach } from '../coach/revisao.ts';

const data = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const entrada = z.object({
  semana: data,
  dia_plano: z.number().int().min(1).max(91),
  periodos_atuais: z.array(z.string().max(80)).max(4),
  tarefas_pendentes: z
    .array(
      z.object({
        id: z.string().max(10),
        texto: z.string().max(200),
        responsavel: z.string().max(120),
        periodo: z.string().max(80),
        atrasada: z.boolean(),
      }),
    )
    .max(40),
  resultados: z.object({
    horas_registradas: z.number().min(0).nullable(),
    comissao_bruta: z.number().min(0).nullable(),
  }),
});

const saida = z.object({
  prioridades: z
    .array(z.object({ tarefa_id: z.string().max(10), motivo: z.string().min(1).max(MAX_MOTIVO) }))
    .max(MAX_PRIORIDADES),
  nota: z.string().min(1).max(MAX_NOTA),
});

export const coach: Contrato<EntradaCoach, SaidaCoach> = {
  id: 'coach/v1',
  rotina: 'pa-coach',
  descricao: 'Revisão semanal do plano: prioridades e nota da semana',
  entrada,
  saida,
  simular: simularCoach,
};
