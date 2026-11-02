// Disparador de jobs (F-13). Chamado pelo pg_cron a cada minuto; com {"acao":"expirar"} expira jobs sem retorno.
import { clienteServico, credencialRotina, exigirServico, json, modoAgentes, urlFuncao } from '../_shared/ambiente.ts';
import { dispararPendentes, expirarJobs } from '../_shared/jobs/runtime.ts';
import { JobStoreSupabase } from '../_shared/jobs/store-supabase.ts';
import { processadoresPara } from '../_shared/processadores/index.ts';

Deno.serve(async (req) => {
  const negado = exigirServico(req);
  if (negado) return negado;
  const corpo = (await req.json().catch(() => ({}))) as { acao?: string };
  const db = clienteServico();
  const store = new JobStoreSupabase(db);
  try {
    if (corpo.acao === 'expirar') return json({ expirados: await expirarJobs({ store }) });
    const resultado = await dispararPendentes({
      store,
      modo: modoAgentes(),
      urlRetorno: urlFuncao('agente-resultado'),
      urlLeitura: urlFuncao('agente-entrada'),
      credencial: credencialRotina,
      processadores: processadoresPara(db),
    });
    return json({ modo: modoAgentes(), resultado });
  } catch (e) {
    console.error(e);
    return json({ erro: e instanceof Error ? e.message : String(e) }, 500);
  }
});
