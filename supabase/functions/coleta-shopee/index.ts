// Coleta da Shopee (F-02) e job diário da curadoria.
// pg_cron: {"acao":"coletar"} às 04:47 e {"acao":"curadoria"} às 05:37 (Brasília), com a chave de serviço.
// Painel (Lana ou Marcus logados): {"acao":"primeiro-uso"} roda a primeira coleta na hora e já cria a curadoria (Fluxo G);
// {"acao":"coletar","palavras":["..."]} busca palavras avulsas (pedido de produto).
import { clienteDoUsuario, clienteServico, env, exigirServico, json, preflight } from '../_shared/ambiente.ts';
import { clienteShopee } from '../_shared/shopee/index.ts';
import { coletar, criarJobCuradoria } from '../_shared/coleta/servico.ts';
import { ColetaStoreSupabase } from '../_shared/coleta/store-supabase.ts';
import { JobStoreSupabase } from '../_shared/jobs/store-supabase.ts';

// Sem as duas chaves, ou com SHOPEE_MODO=simulado, usa o modo simulado (produtos fictícios).
const clienteShopeeDoAmbiente = () =>
  clienteShopee({
    SHOPEE_MODO: env('SHOPEE_MODO'),
    SHOPEE_AFFILIATE_APP_ID: env('SHOPEE_AFFILIATE_APP_ID'),
    SHOPEE_AFFILIATE_APP_SECRET: env('SHOPEE_AFFILIATE_APP_SECRET'),
  });

type Corpo = { acao?: string; palavras?: unknown };

async function autorizado(req: Request): Promise<'servico' | 'membro' | null> {
  if (!exigirServico(req)) return 'servico';
  const { data, error } = await clienteDoUsuario(req).rpc('e_membro');
  return !error && data === true ? 'membro' : null;
}

Deno.serve(async (req) => {
  const pf = preflight(req);
  if (pf) return pf;
  if (req.method !== 'POST') return json({ erro: 'use POST' }, 405);
  const quem = await autorizado(req);
  if (!quem) return json({ erro: 'não autorizado' }, 401);

  const corpo = (await req.json().catch(() => ({}))) as Corpo;
  const acao = corpo.acao ?? 'coletar';
  if (quem === 'membro' && acao === 'curadoria') return json({ erro: 'ação reservada ao relógio' }, 403);
  const palavras = Array.isArray(corpo.palavras)
    ? corpo.palavras.filter((p): p is string => typeof p === 'string').map((p) => p.slice(0, 80)).slice(0, 5)
    : undefined;

  const db = clienteServico();
  const store = new ColetaStoreSupabase(db);
  try {
    if (acao === 'coletar') return json({ coleta: await coletar({ store, cliente: clienteShopeeDoAmbiente(), palavras }) });
    if (acao === 'curadoria') return json({ curadoria: await criarJobCuradoria({ store, jobs: new JobStoreSupabase(db) }) });
    if (acao === 'primeiro-uso') {
      const coleta = await coletar({ store, cliente: clienteShopeeDoAmbiente() });
      const curadoria = await criarJobCuradoria({ store, jobs: new JobStoreSupabase(db) });
      return json({ coleta, curadoria });
    }
    return json({ erro: `ação desconhecida: ${acao}` }, 400);
  } catch (e) {
    console.error(e);
    return json({ erro: e instanceof Error ? e.message : String(e) }, 500);
  }
});
