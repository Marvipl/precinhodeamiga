// "Atualizar preço e publicar": remonta o texto com o preço atual e passa de novo pela Guardiã.
// POST {post_id, preco_atual?} com o login da operadora. Sem preco_atual, usa o último preço observado.
import { clienteDoUsuario, clienteServico, env, json, preflight } from '../_shared/ambiente.ts';
import { atualizarPreco, ErroPost } from '../_shared/post/servico.ts';
import { PostStoreSupabase } from '../_shared/post/store-supabase.ts';
import { GeradorLinkIndisponivel, geradorLinkPara } from '../_shared/post/links.ts';

Deno.serve(async (req) => {
  const pf = preflight(req);
  if (pf) return pf;
  const usuario = clienteDoUsuario(req);
  const { data: u } = await usuario.auth.getUser();
  const { data: papel } = await usuario.rpc('meu_papel');
  if (!u?.user || papel !== 'operadora') return json({ erro: 'Só a Lana atualiza posts.' }, 403);
  const corpo = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  try {
    const r = await atualizarPreco(
      { store: new PostStoreSupabase(clienteServico()), links: geradorLinkPara({ SHOPEE_MODO: env('SHOPEE_MODO'), SHOPEE_AFFILIATE_APP_ID: env('SHOPEE_AFFILIATE_APP_ID'), SHOPEE_AFFILIATE_APP_SECRET: env('SHOPEE_AFFILIATE_APP_SECRET') }, new GeradorLinkIndisponivel()) },
      { post_id: corpo.post_id, preco_atual: corpo.preco_atual },
    );
    return json(r);
  } catch (e) {
    if (e instanceof ErroPost) return json({ erro: e.message }, e.status);
    console.error(e);
    return json({ erro: e instanceof Error ? e.message : String(e) }, 500);
  }
});
