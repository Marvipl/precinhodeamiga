// Ciclo da Atendente (pg_cron a cada 30 minutos, das 8h às 22h30): cria o job atendente/v1 só se houver mensagem pendente.
import { clienteServico, exigirServico, json } from '../_shared/ambiente.ts';
import { criarJob } from '../_shared/jobs/runtime.ts';
import { JobStoreSupabase } from '../_shared/jobs/store-supabase.ts';
import { marcarProcessando, montarEntradaCiclo } from '../_shared/atendente/servico.ts';

Deno.serve(async (req) => {
  const negado = exigirServico(req);
  if (negado) return negado;
  const db = clienteServico();
  const m = await montarEntradaCiclo({ db });
  if ('motivo' in m) return json({ criado: false, motivo: m.motivo });
  const { job, criado } = await criarJob(new JobStoreSupabase(db), {
    rotina: 'pa-atendente',
    contrato: 'atendente/v1',
    entrada: m.entrada,
    chave_unica: m.chave,
  });
  if (criado) await marcarProcessando(db, m.ids, job.id);
  return json({ job_id: job.id, criado, mensagens: m.ids.length, pedidos: m.entrada.pedidos_com_opcoes.length });
});
