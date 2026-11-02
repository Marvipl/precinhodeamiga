// Grava a revisão semanal da Coach (coach/v1). O código filtra as prioridades (aplicarSaidaCoach).
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Processador } from '../jobs/runtime.ts';
import { aplicarSaidaCoach, type EntradaCoach, type SaidaCoach } from '../core/coach/revisao.ts';

export const processarCoach = (db: SupabaseClient): Processador => async (job, saida) => {
  const entrada = job.entrada as EntradaCoach;
  const valida = aplicarSaidaCoach(entrada, saida as SaidaCoach);
  const r = await db.from('plano_revisoes').upsert(
    {
      semana: entrada.semana,
      dia_plano: entrada.dia_plano,
      prioridades: valida.prioridades,
      nota: valida.nota,
      job_id: job.id,
      simulado: job.simulado,
    },
    { onConflict: 'semana' },
  );
  if (r.error) throw new Error(r.error.message);
  const a = await db.from('atividades').insert({
    agente: 'coach',
    texto: `${job.simulado ? 'Revisão simulada' : 'Revisão'} da semana pronta: ${valida.prioridades.length} prioridade(s) no plano`,
    link: '/plano',
  });
  if (a.error) throw new Error(a.error.message);
};
