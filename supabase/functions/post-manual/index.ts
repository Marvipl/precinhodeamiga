// F-16: post manual (plano B). A Lana cola o link de afiliado que gerou no painel, informa preço e prazo.
// POST {link_afiliado, titulo, preco_atual, preco_referencia?, cupom?, prazo?, frase?, canais} com o login da operadora.
import { clienteDoUsuario, clienteServico, env, json, preflight } from '../_shared/ambiente.ts';
import { criarPostManual, ErroPost } from '../_shared/post/servico.ts';
import { PostStoreSupabase } from '../_shared/post/store-supabase.ts';
import { GeradorLinkIndisponivel, geradorLinkPara } from '../_shared/post/links.ts';

Deno.serve(async (req) => {
  const pf = preflight(req);
  if (pf) return pf;
  const usuario = clienteDoUsuario(req);
  const { data: u } = await usuario.auth.getUser();
  const { data: papel } = await usuario.rpc('meu_papel');
  if (!u?.user || papel !== 'operadora') return json({ erro: 'Só a Lana cria posts.' }, 403);
  const corpo = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  try {
    const r = await criarPostManual(
      { store: new PostStoreSupabase(clienteServico()), links: geradorLinkPara({ SHOPEE_MODO: env('SHOPEE_MODO'), SHOPEE_AFFILIATE_APP_ID: env('SHOPEE_AFFILIATE_APP_ID'), SHOPEE_AFFILIATE_APP_SECRET: env('SHOPEE_AFFILIATE_APP_SECRET') }, new GeradorLinkIndisponivel()) },
      {
        link_afiliado: corpo.link_afiliado,
        titulo: corpo.titulo,
        preco_atual: corpo.preco_atual,
        preco_referencia: corpo.preco_referencia,
        cupom: corpo.cupom,
        prazo: corpo.prazo,
        frase: corpo.frase,
        canais: corpo.canais,
        userId: u.user.id,
      },
    );
    return json(r);
  } catch (e) {
    if (e instanceof ErroPost) return json({ erro: e.message }, e.status);
    console.error(e);
    return json({ erro: e instanceof Error ? e.message : String(e) }, 500);
  }
});
