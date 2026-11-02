// Página de entrada pública (F-20): conta o clique por origem e botão e leva ao canal. Sem login.
// Não guarda IP nem cookie: só um resumo irreversível com sal diário, apagado em 24 horas (seção 7.1).
import { clienteServico, env } from '../_shared/ambiente.ts';
import { tratarEntrada } from '../_shared/radar/entrada-clique.ts';
import { depsEntrada } from '../_shared/radar/store-supabase.ts';

Deno.serve(async (req) => {
  try {
    return await tratarEntrada(req, depsEntrada(clienteServico(), env('SITE_URL')));
  } catch (e) {
    console.error('entrada-clique', (e as Error).message);
    return new Response(JSON.stringify({ erro: 'falha ao registrar' }), {
      status: 500,
      headers: { 'content-type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' },
    });
  }
});
