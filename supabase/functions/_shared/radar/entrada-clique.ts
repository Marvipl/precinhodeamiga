// Página de entrada (F-20): conta o clique por origem e botão, sem dado pessoal, e leva ao canal escolhido.
// As dependências entram por parâmetro para rodar no Deno e nos testes (Node).
import { lerBotao, ipDoPedido, resolverOrigem, resumoAcesso, ORIGEM_DIRETO, type Botao } from '../core/radar/entrada.ts';

export interface DepsEntrada {
  origemConhecida: (o: string) => Promise<boolean>;
  salDoDia: () => Promise<string>;
  /** Grava o clique se o resumo ainda não foi visto hoje. Devolve true quando contou. */
  registrar: (origem: string, botao: Botao, resumo: string) => Promise<boolean>;
  /** Links dos canais (configurações da Lana). Vazio = ainda não configurado. */
  linksCanais: () => Promise<{ wa: string; tg: string }>;
  /** Endereço do painel, para voltar à página de entrada quando um canal não estiver configurado. */
  urlSite?: string;
}

const LINK_OK = /^https:\/\/\S+$/;

function corpoJson(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    },
  });
}

async function contar(deps: DepsEntrada, req: Request, oBruta: string | null, botao: Botao): Promise<string> {
  let conhecida = false;
  const candidata = (oBruta ?? '').trim().toLowerCase();
  if (candidata && candidata !== ORIGEM_DIRETO) conhecida = await deps.origemConhecida(candidata).catch(() => false);
  const origem = resolverOrigem(oBruta, () => conhecida);
  const resumo = await resumoAcesso({
    sal: await deps.salDoDia(),
    ip: ipDoPedido(req.headers),
    agente: req.headers.get('user-agent') ?? '',
    origem,
    botao,
  });
  await deps.registrar(origem, botao, resumo);
  return origem;
}

export async function tratarEntrada(req: Request, deps: DepsEntrada): Promise<Response> {
  if (req.method === 'OPTIONS') return corpoJson({ ok: true });
  const url = new URL(req.url);

  // GET ?o=<origem>&b=wa|tg: conta o toque no botão e redireciona ao canal.
  if (req.method === 'GET') {
    const botao = lerBotao(url.searchParams.get('b'));
    if (botao !== 'wa' && botao !== 'tg') return corpoJson({ erro: 'botão inválido' }, 400);
    const links = await deps.linksCanais();
    const destino = links[botao];
    const o = url.searchParams.get('o');
    if (!LINK_OK.test(destino)) {
      const volta = deps.urlSite ? `${deps.urlSite.replace(/\/+$/, '')}/entrar?indisponivel=1${o ? `&o=${encodeURIComponent(o)}` : ''}` : null;
      return volta
        ? new Response(null, { status: 302, headers: { location: volta, 'cache-control': 'no-store' } })
        : corpoJson({ erro: 'canal ainda não configurado' }, 404);
    }
    await contar(deps, req, o, botao);
    return new Response(null, { status: 302, headers: { location: destino, 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' } });
  }

  // POST {o}: a página abriu (clique no link de entrada). Devolve quais canais estão disponíveis.
  if (req.method === 'POST') {
    const corpo = (await req.json().catch(() => ({}))) as { o?: unknown };
    const o = typeof corpo.o === 'string' ? corpo.o.slice(0, 80) : null;
    const origem = await contar(deps, req, o, 'pagina');
    const links = await deps.linksCanais();
    return corpoJson({ origem, whatsapp: LINK_OK.test(links.wa), telegram: LINK_OK.test(links.tg) });
  }

  return corpoJson({ erro: 'método não permitido' }, 405);
}
