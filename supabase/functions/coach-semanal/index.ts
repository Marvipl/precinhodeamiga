// Revisão semanal da Coach (F-24). pg_cron chama às segundas 06:23 (Brasília) com a chave de serviço;
// o Marcus pode pedir na hora pela tela do Plano (login de dono). A lógica fica em _shared/coach/semanal.ts.
import { clienteDoUsuario, clienteServico, exigirServico, json, preflight } from '../_shared/ambiente.ts';
import { criarRevisaoSemanal } from '../_shared/coach/semanal.ts';
import { JobStoreSupabase } from '../_shared/jobs/store-supabase.ts';

Deno.serve(async (req) => {
  const pf = preflight(req);
  if (pf) return pf;
  if (exigirServico(req)) {
    const { data: dono, error } = await clienteDoUsuario(req).rpc('e_dono');
    if (error || dono !== true) return json({ erro: 'só o dono pode pedir a revisão' }, 403);
  }
  try {
    const db = clienteServico();
    return json(await criarRevisaoSemanal(db, new JobStoreSupabase(db)));
  } catch (e) {
    console.error(e);
    return json({ erro: e instanceof Error ? e.message : String(e) }, 500);
  }
});
