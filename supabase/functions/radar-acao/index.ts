// Ações da Lana no Radar (F-21): adicionar, descartar, já pedi, aprovou, recusou, divulguei hoje.
// Exige login de membro; as regras ficam em core/radar e a gravação usa a chave de serviço.
import { clienteDoUsuario, clienteServico, json, preflight } from '../_shared/ambiente.ts';
import { aplicarAcao, type PedidoAcao } from '../_shared/radar/acoes.ts';
import { storeRadar } from '../_shared/radar/store-supabase.ts';

Deno.serve(async (req) => {
  const pf = preflight(req);
  if (pf) return pf;
  const usuario = clienteDoUsuario(req);
  const { data: membro, error } = await usuario.rpc('e_membro');
  if (error || membro !== true) return json({ erro: 'sem acesso' }, 403);
  const { data: u } = await usuario.auth.getUser();
  const corpo = (await req.json().catch(() => null)) as PedidoAcao | null;
  if (!corpo) return json({ erro: 'pedido inválido' }, 400);
  const r = await aplicarAcao(storeRadar(clienteServico()), corpo, u.user?.id ?? null);
  return r.ok ? json(r) : json({ erro: r.motivo }, r.status);
});
