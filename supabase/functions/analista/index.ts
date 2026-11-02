// Analista (F-23): chamada pelo pg_cron. {"acao":"diario"} importa conversões pela API (quando ligada);
// {"acao":"resumo"} cria o job do resumo semanal. Exige a chave de serviço.
import { clienteServico, env, exigirServico, json, preflight } from '../_shared/ambiente.ts';
import { criarJobResumo, importarDiario } from '../_shared/analista/rotina.ts';
import { JobStoreSupabase } from '../_shared/jobs/store-supabase.ts';

Deno.serve(async (req) => {
  const pf = preflight(req);
  if (pf) return pf;
  const negado = exigirServico(req);
  if (negado) return negado;
  const corpo = (await req.json().catch(() => ({}))) as { acao?: string };
  const sb = clienteServico();
  try {
    if (corpo.acao === 'diario') {
      const temChave = !!env('SHOPEE_AFFILIATE_APP_ID') && !!env('SHOPEE_AFFILIATE_APP_SECRET');
      return json(await importarDiario(sb, { temChaveShopee: temChave }));
    }
    if (corpo.acao === 'resumo') {
      const { job, criado } = await criarJobResumo(sb, new JobStoreSupabase(sb));
      return json({ job_id: job.id, criado });
    }
    return json({ erro: 'acao deve ser "diario" ou "resumo"' }, 400);
  } catch (e) {
    return json({ erro: e instanceof Error ? e.message : String(e) }, 500);
  }
});
