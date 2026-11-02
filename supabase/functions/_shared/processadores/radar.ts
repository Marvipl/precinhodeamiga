// Grava os lugares novos do Radar (radar/v1). Lugar já visto (inclusive recusado ou descartado) não volta.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Processador } from '../jobs/runtime.ts';
import type { SaidaRadar } from '../core/contratos/radar.ts';
import { linhasDosLugares } from '../radar/linhas.ts';

export const processarRadar = (db: SupabaseClient): Processador => async (job, saida) => {
  const linhas = linhasDosLugares(saida as SaidaRadar, job.id);
  let novos = 0;
  if (linhas.length) {
    const r = await db.from('radar_lugares').upsert(linhas, { onConflict: 'chave', ignoreDuplicates: true }).select('id');
    if (r.error) throw new Error(r.error.message);
    novos = r.data?.length ?? 0;
  }
  const a = await db.from('atividades').insert({
    agente: 'radar',
    texto: `${job.simulado ? 'Busca simulada' : 'Busca'} do Radar: ${novos === 1 ? '1 lugar novo' : `${novos} lugares novos`} para avaliar`,
    link: '/radar',
  });
  if (a.error) throw new Error(a.error.message);
};
