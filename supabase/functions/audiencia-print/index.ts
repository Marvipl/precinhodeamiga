// A Lana enviou o print do canal do WhatsApp: cria a leitura e o job da Analista (Fluxo E).
import { clienteDoUsuario, clienteServico, json, preflight } from '../_shared/ambiente.ts';
import { pedirLeituraPrint } from '../_shared/audiencia/print.ts';
import { JobStoreSupabase } from '../_shared/jobs/store-supabase.ts';

Deno.serve(async (req) => {
  const pf = preflight(req);
  if (pf) return pf;
  const usuario = clienteDoUsuario(req);
  const { data: u } = await usuario.auth.getUser();
  const { data: membro, error } = await usuario.rpc('e_membro');
  if (error || membro !== true || !u.user) return json({ erro: 'sem permissão' }, 403);
  const corpo = (await req.json().catch(() => ({}))) as { print_path?: unknown };
  const db = clienteServico();
  const r = await pedirLeituraPrint({ db, store: new JobStoreSupabase(db), userId: u.user.id, printPath: corpo.print_path });
  return r.ok ? json(r) : json({ erro: r.motivo }, r.status);
});
