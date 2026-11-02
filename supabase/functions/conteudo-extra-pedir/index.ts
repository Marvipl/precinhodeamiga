// F-28: a Lana (ou o Marcus) pede conteúdo extra à Redatora. Lógica em _shared/crescimento/pedir.ts.
import { clienteDoUsuario, clienteServico, json, preflight } from '../_shared/ambiente.ts';
import { JobStoreSupabase } from '../_shared/jobs/store-supabase.ts';
import { lerPedido, pedirConteudo } from '../_shared/crescimento/pedir.ts';

Deno.serve(async (req) => {
  const pf = preflight(req);
  if (pf) return pf;
  if (req.method !== 'POST') return json({ erro: 'use POST' }, 405);
  const usuario = clienteDoUsuario(req);
  const { data: membro, error } = await usuario.rpc('e_membro');
  if (error || membro !== true) return json({ erro: 'sem acesso' }, 403);
  const { data: u } = await usuario.auth.getUser();

  const pedido = lerPedido(await req.json().catch(() => null));
  if (!pedido) return json({ erro: 'pedido inválido' }, 400);

  const db = clienteServico();
  try {
    const r = await pedirConteudo({ db, store: new JobStoreSupabase(db), userId: u.user?.id ?? null }, pedido);
    return r.ok ? json({ conteudo_id: r.conteudo_id, criado: r.criado }) : json({ erro: r.motivo }, r.status);
  } catch (e) {
    console.error('conteudo-extra-pedir', e);
    return json({ erro: 'não deu para pedir agora. Tente de novo em alguns minutos.' }, 500);
  }
});
