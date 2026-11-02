import type { SupabaseClient } from '@supabase/supabase-js';
import type { Processador } from '../jobs/runtime.ts';
import type { EntradaAtendente, SaidaAtendente } from '../core/contratos/atendente.ts';
import { depsAtendente, envDoAmbiente } from '../atendente/deps.ts';
import { aplicarSaidaCiclo } from '../atendente/servico.ts';

export const processarAtendente = (db: SupabaseClient): Processador => async (job, saida) => {
  await aplicarSaidaCiclo(depsAtendente(db, envDoAmbiente), job.id, job.entrada as EntradaAtendente, saida as SaidaAtendente);
};
