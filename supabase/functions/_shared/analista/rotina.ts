// Rotina diária e semanal da Analista (Anexo A.3): importação pela API às 06:13 e resumo às segundas 06:43.
// Sem Deno.*: as dependências entram por parâmetro.
import type { SupabaseClient } from '@supabase/supabase-js';
import { dataLocal } from '../core/formato.ts';
import { numerosDaSemana, ultimaSemanaFechada } from '../core/analista/painel.ts';
import { criarJob } from '../jobs/runtime.ts';
import type { JobStore } from '../jobs/store.ts';
import { lerConfigServidor, lerDadosAnalista } from './leitura.ts';

export const AVISOS_RESUMO = [
  'Funil aproximado: os apps não identificam a pessoa; as taxas comparam totais do mesmo período.',
  'Comissão bruta inclui pedidos pendentes e concluídos, sem os cancelados.',
];

/**
 * Importação diária pela API de afiliados. [SUPOSIÇÃO] A consulta do relatório de conversões depende da
 * documentação da Open API, que só aparece com a conta liberada. Sem chave: nada é importado e a tela
 * orienta a usar o CSV. Com chave: registra a importação com erro até o cliente ser ligado (docs/HUMANO.md).
 */
export async function importarDiario(sb: SupabaseClient, p: { temChaveShopee: boolean }): Promise<{ importado: boolean; motivo: string }> {
  if (!p.temChaveShopee) return { importado: false, motivo: 'sem chave da API de afiliados: use a importação por CSV' };
  const motivo = 'consulta do relatório de conversões pela API ainda não ligada (aguarda a documentação da Open API); use a importação por CSV';
  const r = await sb.from('importacoes_conversoes').insert({ origem: 'api', estado: 'erro', mensagem: motivo });
  if (r.error) throw new Error(r.error.message);
  return { importado: false, motivo };
}

/** Cria o job do resumo da semana fechada. A chave única impede dois resumos da mesma semana. */
export async function criarJobResumo(sb: SupabaseClient, store: JobStore, agora: Date = new Date()) {
  const hoje = dataLocal(agora);
  const cfg = await lerConfigServidor(sb);
  const dados = await lerDadosAnalista(sb, { hoje, cfg });
  const semana = ultimaSemanaFechada(hoje);
  return criarJob(store, {
    rotina: 'pa-analista',
    contrato: 'analista-resumo/v1',
    entrada: { semana_inicio: semana.inicio, semana_fim: semana.fim, numeros: numerosDaSemana(dados, semana), avisos: AVISOS_RESUMO },
    chave_unica: `analista-resumo:${semana.inicio}`,
  });
}
