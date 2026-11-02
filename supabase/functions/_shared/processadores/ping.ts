import type { SupabaseClient } from '@supabase/supabase-js';
import type { Processador } from '../jobs/runtime.ts';

export const processarPing = (db: SupabaseClient): Processador => async (job, saida) => {
  const { eco } = saida as { eco: string };
  const r = await db.from('atividades').insert({
    agente: 'coach',
    texto: `${job.simulado ? 'Teste simulado' : 'Teste'} de rotina concluído: "${eco}"`,
  });
  if (r.error) throw new Error(r.error.message);
};
