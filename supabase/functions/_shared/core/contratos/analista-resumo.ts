// Contrato do resumo semanal da Analista (rotina pa-analista, segundas às 06:43).
// Entrada: números da semana já calculados e formatados em código. Saída: texto curto.
// O processador recusa o texto se ele tiver número que não esteja na entrada (seção 5.17).
import { z } from 'zod';
import type { Contrato } from './index.ts';

const data = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const entrada = z.object({
  semana_inicio: data,
  semana_fim: data,
  numeros: z.array(z.object({ rotulo: z.string().min(1).max(120), valor: z.string().min(1).max(60) })).max(40),
  avisos: z.array(z.string().max(300)).max(10),
});

const saida = z.object({
  texto: z.string().trim().min(1).max(2000),
});

export type EntradaResumo = z.infer<typeof entrada>;
export type SaidaResumo = z.infer<typeof saida>;

export const analistaResumo: Contrato<EntradaResumo, SaidaResumo> = {
  id: 'analista-resumo/v1',
  rotina: 'pa-analista',
  descricao: 'Resumo semanal em texto a partir dos números calculados',
  entrada,
  saida,
  // Resposta simulada: só repete os números da entrada, sem acrescentar nenhum.
  simular: (e) => {
    const linhas = e.numeros.map((n) => `${n.rotulo}: ${n.valor}.`);
    return {
      texto: [`Resumo simulado (modo de teste) da semana de ${e.semana_inicio} a ${e.semana_fim}.`, ...linhas, ...e.avisos].join('\n'),
    };
  },
};
