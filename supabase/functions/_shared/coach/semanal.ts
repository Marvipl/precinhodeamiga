// Cria o job da revisão semanal da Coach (coach:<segunda>). Chamado pelo pg_cron às segundas 06:23
// (Brasília) ou pelo Marcus no botão "Pedir revisão agora". A chave única impede dois jobs na mesma semana.
// Sem Deno.*: o cliente do banco entra por parâmetro.
import type { SupabaseClient } from '@supabase/supabase-js';
import { resolverConfig } from '../core/config.ts';
import { dataLocal, instanteLocal, somarDias } from '../core/formato.ts';
import { segundaDaSemana } from '../core/coach/plano.ts';
import { montarEntradaCoach } from '../core/coach/revisao.ts';
import { criarJob } from '../jobs/runtime.ts';
import type { JobStore } from '../jobs/store.ts';

export type ResultadoSemanal =
  | { criado: boolean; job_id: string; semana: string }
  | { criado: false; motivo: 'fora_do_plano'; semana: string };

/** Horas registradas numa semana (segunda a domingo), sem as sessões de montagem (seção 5.15). */
export function somarHoras(sessoes: ReadonlyArray<{ inicio: string; fim: string | null; montagem: boolean }>): number {
  let ms = 0;
  for (const s of sessoes) {
    if (s.montagem || !s.fim) continue;
    ms += Math.max(0, Date.parse(s.fim) - Date.parse(s.inicio));
  }
  return ms / 3_600_000;
}

export async function criarRevisaoSemanal(db: SupabaseClient, store: JobStore, agora: Date = new Date()): Promise<ResultadoSemanal> {
  const config = resolverConfig(ok(await db.from('configuracoes').select('chave, valor')) ?? []);
  const inicio = String(config.dataInicioPlano);
  const semana = segundaDaSemana(dataLocal(agora));

  const marcas = ok(await db.from('plano_marcas').select('tarefa, feita')) ?? [];

  // Resultados da semana anterior (segunda a domingo). Comissão entra quando a importação de conversões existir.
  const de = instanteLocal(somarDias(semana, -7), '00:00').toISOString();
  const ate = instanteLocal(semana, '00:00').toISOString();
  const sessoes = ok(await db.from('sessoes_trabalho').select('inicio, fim, montagem').gte('inicio', de).lt('inicio', ate)) ?? [];

  const entrada = montarEntradaCoach({
    inicio,
    semana,
    marcas,
    horasRegistradas: sessoes.length > 0 ? somarHoras(sessoes) : null,
    comissaoBruta: null,
  });
  if (!entrada) return { criado: false, motivo: 'fora_do_plano', semana };

  const { job, criado } = await criarJob(store, {
    rotina: 'pa-coach',
    contrato: 'coach/v1',
    entrada,
    chave_unica: `coach:${semana}`,
  });
  return { criado, job_id: job.id, semana };
}

function ok<T>(r: { data: T | null; error: { message: string } | null }): T | null {
  if (r.error) throw new Error(r.error.message);
  return r.data;
}
