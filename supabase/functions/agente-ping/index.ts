// Marcus testa a ida e volta de uma rotina (Fluxo G). Só o dono.
import { clienteDoUsuario, clienteServico, json, preflight } from '../_shared/ambiente.ts';
import { criarJob } from '../_shared/jobs/runtime.ts';
import { JobStoreSupabase } from '../_shared/jobs/store-supabase.ts';

Deno.serve(async (req) => {
  const pf = preflight(req);
  if (pf) return pf;
  const usuario = clienteDoUsuario(req);
  const { data: dono, error } = await usuario.rpc('e_dono');
  if (error || dono !== true) return json({ erro: 'só o dono pode testar as rotinas' }, 403);
  const { job, criado } = await criarJob(new JobStoreSupabase(clienteServico()), {
    rotina: 'pa-coach',
    contrato: 'ping/v1',
    entrada: { mensagem: 'teste de ida e volta' },
    chave_unica: `ping:${new Date().toISOString().slice(0, 16)}`,
  });
  return json({ job_id: job.id, criado });
});
