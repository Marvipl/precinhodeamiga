// Endpoint de retorno das rotinas (Anexo A.4, passo 5). Autenticado por AGENT_CALLBACK_TOKEN.
import { clienteServico, exigirTokenAgente, json } from '../_shared/ambiente.ts';
import { receberResultado } from '../_shared/jobs/runtime.ts';
import { JobStoreSupabase } from '../_shared/jobs/store-supabase.ts';
import { processadoresPara } from '../_shared/processadores/index.ts';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ erro: 'use POST' }, 405);
  const negado = exigirTokenAgente(req);
  if (negado) return negado;
  const corpo = await req.json().catch(() => null);
  if (!corpo || typeof corpo !== 'object') return json({ erro: 'JSON inválido' }, 400);
  const db = clienteServico();
  const r = await receberResultado({ store: new JobStoreSupabase(db), processadores: processadoresPara(db) }, corpo);
  return json(r, r.status);
});
