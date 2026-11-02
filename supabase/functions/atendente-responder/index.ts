// Ações da Lana na caixa de mensagens: aprovar e enviar (com ou sem edição), pedir outra versão, descartar.
// Só a operadora responde (suposição S2: o dono configura e acompanha).
import { z } from 'zod';
import { clienteDoUsuario, clienteServico, env, json, preflight } from '../_shared/ambiente.ts';
import { depsAtendente } from '../_shared/atendente/deps.ts';
import { executarAcao } from '../_shared/atendente/servico.ts';

const corpo = z.discriminatedUnion('acao', [
  z.object({ acao: z.literal('aprovar'), mensagem_id: z.string().uuid(), texto: z.string().max(1500).optional() }),
  z.object({ acao: z.literal('outra_versao'), mensagem_id: z.string().uuid() }),
  z.object({ acao: z.literal('descartar'), mensagem_id: z.string().uuid() }),
  z.object({ acao: z.literal('respondi_por_fora'), mensagem_id: z.string().uuid() }),
]);

Deno.serve(async (req) => {
  const pf = preflight(req);
  if (pf) return pf;
  if (req.method !== 'POST') return json({ erro: 'use POST' }, 405);
  const usuario = clienteDoUsuario(req);
  const { data: u } = await usuario.auth.getUser();
  const { data: papel, error } = await usuario.rpc('meu_papel');
  if (error || !u.user) return json({ erro: 'entre no painel' }, 401);
  if (papel !== 'operadora') return json({ erro: 'só a Lana responde as mensagens' }, 403);
  const v = corpo.safeParse(await req.json().catch(() => null));
  if (!v.success) return json({ erro: 'pedido inválido' }, 400);
  const r = await executarAcao(depsAtendente(clienteServico(), env), v.data, u.user.id);
  return r.ok ? json(r) : json({ erro: r.motivo }, r.status);
});
