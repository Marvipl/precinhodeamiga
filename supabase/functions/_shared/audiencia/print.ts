// Pedido de leitura de print do canal do WhatsApp (Fluxo E). Cria a leitura e o job da Analista.
// O número lido só vira registro quando a Lana confirma (RPC confirmar_leitura_print).
import type { SupabaseClient } from '@supabase/supabase-js';
import { podeLerPrint, LEITURAS_PRINT_POR_SEMANA } from '../core/audiencia/index.ts';
import { criarJob } from '../jobs/runtime.ts';
import type { JobStore } from '../jobs/store.ts';

export type ResultadoPedidoPrint =
  | { ok: true; leitura_id: string; job_id: string }
  | { ok: false; status: number; motivo: string };

const CAMINHO_VALIDO = /^wa\/[A-Za-z0-9_-]{8,80}\.(png|jpe?g|webp|heic)$/i;
/** Validade da URL assinada da imagem: o job pode esperar o teto do dia. */
export const VALIDADE_URL_SEGUNDOS = 36 * 3600;

export async function pedirLeituraPrint(deps: {
  db: SupabaseClient;
  store: JobStore;
  userId: string;
  printPath: unknown;
  agora?: Date;
}): Promise<ResultadoPedidoPrint> {
  const { db } = deps;
  if (typeof deps.printPath !== 'string' || !CAMINHO_VALIDO.test(deps.printPath)) {
    return { ok: false, status: 400, motivo: 'caminho do print inválido' };
  }
  const agora = deps.agora ?? new Date();
  const desde = new Date(agora.getTime() - 7 * 86_400_000).toISOString();
  const conta = await db.from('leituras_print').select('id', { count: 'exact', head: true }).gte('criado_em', desde);
  if (conta.error) return { ok: false, status: 500, motivo: conta.error.message };
  if (!podeLerPrint(conta.count ?? 0)) {
    return {
      ok: false,
      status: 429,
      motivo: `Já foram ${LEITURAS_PRINT_POR_SEMANA} leituras de print nesta semana. Digite o total no campo.`,
    };
  }
  const assinada = await db.storage.from('prints').createSignedUrl(deps.printPath, VALIDADE_URL_SEGUNDOS);
  if (assinada.error || !assinada.data?.signedUrl) {
    return { ok: false, status: 400, motivo: 'print não encontrado no armazenamento' };
  }
  const nova = await db
    .from('leituras_print')
    .insert({ print_path: deps.printPath, enviado_por: deps.userId })
    .select('id')
    .single();
  if (nova.error) return { ok: false, status: 500, motivo: nova.error.message };
  const leitura_id = (nova.data as { id: string }).id;
  try {
    const { job } = await criarJob(deps.store, {
      rotina: 'pa-analista',
      contrato: 'analista-print/v1',
      entrada: { leitura_id, canal: 'wa', imagem_url: assinada.data.signedUrl },
      chave_unica: `print:${leitura_id}`,
    });
    await db.from('leituras_print').update({ job_id: job.id }).eq('id', leitura_id);
    return { ok: true, leitura_id, job_id: job.id };
  } catch (e) {
    await db.from('leituras_print').update({ estado: 'erro' }).eq('id', leitura_id);
    return { ok: false, status: 500, motivo: (e as Error).message };
  }
}
