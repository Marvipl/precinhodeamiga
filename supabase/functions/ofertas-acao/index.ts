// Ações da fila de ofertas (F-04, F-05): aprovar, pular, editar a frase, pedir outra versão, pedir produto.
// Exige login do Supabase; a lógica está em _shared/ofertas/acoes.ts.
import { clienteDoUsuario, clienteServico, env, json, preflight, urlFuncao } from '../_shared/ambiente.ts';
import { executarAcao } from '../_shared/ofertas/acoes.ts';

Deno.serve(async (req) => {
  const pf = preflight(req);
  if (pf) return pf;
  if (req.method !== 'POST') return json({ erro: 'use POST' }, 405);
  const corpo = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!corpo || typeof corpo !== 'object') return json({ erro: 'JSON inválido' }, 400);
  const cabecalhos: Record<string, string> = { Authorization: req.headers.get('Authorization') ?? '' };
  const apikey = req.headers.get('apikey') ?? env('SUPABASE_ANON_KEY');
  if (apikey) cabecalhos.apikey = apikey;
  try {
    const r = await executarAcao(
      {
        usuario: clienteDoUsuario(req),
        servico: clienteServico(),
        cabecalhosUsuario: cabecalhos,
        urlPostAprovar: urlFuncao('post-aprovar'),
      },
      corpo,
    );
    return json(r.corpo, r.status);
  } catch (e) {
    console.error(e);
    return json({ erro: e instanceof Error ? e.message : String(e) }, 500);
  }
});
