// Endpoint de leitura da entrada de um job grande (Anexo A.4, passo 7). Autenticado por AGENT_CALLBACK_TOKEN + nonce.
import { clienteServico, exigirTokenAgente, json } from '../_shared/ambiente.ts';
import { lerEntrada } from '../_shared/jobs/runtime.ts';
import { JobStoreSupabase } from '../_shared/jobs/store-supabase.ts';

Deno.serve(async (req) => {
  const negado = exigirTokenAgente(req);
  if (negado) return negado;
  const corpo = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const r = await lerEntrada(new JobStoreSupabase(clienteServico()), corpo);
  return r.ok ? json({ entrada: r.entrada }) : json({ erro: r.motivo }, r.status);
});
