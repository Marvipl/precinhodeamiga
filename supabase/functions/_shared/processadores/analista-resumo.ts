// Grava o resumo semanal da Analista depois da checagem de números (seção 5.17).
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Processador } from '../jobs/runtime.ts';
import { checarNumeros } from '../core/analista/resumo.ts';
import type { EntradaResumo, SaidaResumo } from '../core/contratos/analista-resumo.ts';

/** Erro de checagem: o texto cita número que não veio dos dados. O job vira "erro" com o motivo. */
export function validarResumo(entrada: EntradaResumo, saida: SaidaResumo): void {
  const r = checarNumeros(saida.texto, entrada);
  if (!r.ok) {
    throw new Error(`resumo recusado: números que não estão nos dados de entrada: ${r.desconhecidos.map((n) => String(n).replace('.', ',')).join(', ')}`);
  }
}

export const processarAnalistaResumo = (db: SupabaseClient): Processador => async (job, saida) => {
  const entrada = job.entrada as EntradaResumo;
  const s = saida as SaidaResumo;
  validarResumo(entrada, s);
  const r = await db.from('resumos_semanais').upsert({
    semana_inicio: entrada.semana_inicio,
    semana_fim: entrada.semana_fim,
    texto: s.texto,
    numeros: entrada.numeros,
    job_id: job.id,
    simulado: job.simulado,
  });
  if (r.error) throw new Error(r.error.message);
  const a = await db.from('atividades').insert({
    agente: 'analista',
    texto: `${job.simulado ? 'Resumo simulado' : 'Resumo'} da semana pronto em Resultados`,
    link: '/resultados',
  });
  if (a.error) throw new Error(a.error.message);
};
