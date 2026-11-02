// Grava o número lido do print em `leituras_print`. Nunca salva em `seguidores_registros`:
// o total só vira registro quando a Lana confirma (RPC confirmar_leitura_print).
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Processador } from '../jobs/runtime.ts';

export const processarAnalistaPrint = (db: SupabaseClient): Processador => async (job, saida) => {
  const { leitura_id } = job.entrada as { leitura_id: string };
  const s = saida as { numero: number | null; trecho: string; confianca: string };
  const r = await db
    .from('leituras_print')
    .update({
      numero_lido: s.numero,
      trecho: s.trecho,
      confianca: s.confianca,
      estado: s.numero === null ? 'sem_numero' : 'lida',
    })
    .eq('id', leitura_id)
    .eq('estado', 'lendo');
  if (r.error) throw new Error(r.error.message);
  const a = await db.from('atividades').insert({
    agente: 'analista',
    texto:
      s.numero === null
        ? `${job.simulado ? 'Leitura simulada do print' : 'Leitura do print'}: número não identificado; falta digitar o total`
        : 'Leitura do print pronta para você confirmar',
    link: '/audiencia',
  });
  if (a.error) throw new Error(a.error.message);
};
