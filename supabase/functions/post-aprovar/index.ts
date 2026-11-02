// F-04/F-06: oferta aprovada pela Lana vira post nos canais marcados, passa pela Guardiã e entra no bloco.
// POST {oferta_id, canais: ['wa','tg'], frase: string|null} com o login da operadora.
import { clienteDoUsuario, clienteServico, env, json, preflight } from '../_shared/ambiente.ts';
import { aprovarOferta, ErroPost } from '../_shared/post/servico.ts';
import { PostStoreSupabase } from '../_shared/post/store-supabase.ts';
import { GeradorLinkIndisponivel, GeradorLinkSimulado } from '../_shared/post/links.ts';

Deno.serve(async (req) => {
  const pf = preflight(req);
  if (pf) return pf;
  const usuario = clienteDoUsuario(req);
  const { data: u } = await usuario.auth.getUser();
  const { data: papel } = await usuario.rpc('meu_papel');
  if (!u?.user || papel !== 'operadora') return json({ erro: 'Só a Lana aprova posts.' }, 403);
  const corpo = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const real = env('SHOPEE_MODO') !== 'simulado' && !!env('SHOPEE_AFFILIATE_APP_ID') && !!env('SHOPEE_AFFILIATE_APP_SECRET');
  try {
    const r = await aprovarOferta(
      { store: new PostStoreSupabase(clienteServico()), links: real ? new GeradorLinkIndisponivel() : new GeradorLinkSimulado() },
      { oferta_id: corpo.oferta_id, canais: corpo.canais, frase: corpo.frase, userId: u.user.id },
    );
    return json(r);
  } catch (e) {
    if (e instanceof ErroPost) return json({ erro: e.message }, e.status);
    console.error(e);
    return json({ erro: e instanceof Error ? e.message : String(e) }, 500);
  }
});
