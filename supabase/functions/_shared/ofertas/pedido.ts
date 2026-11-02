// Pedido de produto sob demanda (F-05, Fluxo B): cria o job curadoria/v1 só com o pedido.
// As candidatas saem dos produtos já coletados (nome parecido, em estoque, preço até o máximo).
// Provisório até o pacote da coleta estar no main: lá `montarCandidata` (core/curadoria/candidata.ts)
// calcula nota e mediana; aqui o preço "de" fica vazio (o post sai só com "Por R$"), que é o lado seguro.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CandidataCuradoria, EntradaCuradoria } from '../core/contratos/curadoria.ts';
import { dataLocal, diasEntre, somarDias } from '../core/formato.ts';
import { normalizar } from '../core/ofertas/fila.ts';
import { criarJob } from '../jobs/runtime.ts';
import { JobStoreSupabase } from '../jobs/store-supabase.ts';

const PALAVRAS_VAZIAS = new Set(['de', 'da', 'do', 'das', 'dos', 'para', 'pra', 'com', 'sem', 'e', 'o', 'a', 'os', 'as', 'um', 'uma', 'kit']);
const MAX_CANDIDATAS_PEDIDO = 20;

export function palavrasDoPedido(texto: string): string[] {
  return normalizar(texto)
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter((p) => p.length >= 3 && !PALAVRAS_VAZIAS.has(p))
    .slice(0, 4);
}

interface LinhaProduto {
  id: string;
  nome: string;
  nicho_id: string | null;
  imagem_url: string | null;
  url_produto: string;
  loja_nome: string | null;
  loja_nota: number | null;
  produto_nota: number | null;
  vendas: number | null;
  comissao_taxa: number | null;
  comissao_extra_taxa: number | null;
  primeira_vez_em: string;
  nichos: { nome: string; principal: boolean } | null;
}

export async function candidatasParaPedido(db: SupabaseClient, texto: string, precoMax: number | null, agora: Date): Promise<CandidataCuradoria[]> {
  const palavras = palavrasDoPedido(texto);
  if (palavras.length === 0) return [];
  let q = db
    .from('produtos')
    .select('id, nome, nicho_id, imagem_url, url_produto, loja_nome, loja_nota, produto_nota, vendas, comissao_taxa, comissao_extra_taxa, primeira_vez_em, nichos(nome, principal)')
    .eq('em_estoque', true)
    .limit(100);
  // Pelo menos a primeira palavra significativa no nome.
  q = q.ilike('nome', `%${palavras[0]}%`);
  const r = await q;
  if (r.error) throw new Error(`candidatasParaPedido: ${r.error.message}`);
  const produtos = (r.data ?? []) as unknown as LinhaProduto[];
  if (produtos.length === 0) return [];

  const hoje = dataLocal(agora);
  const precos = await db
    .from('precos_observados')
    .select('produto_id, observado_em, preco')
    .in('produto_id', produtos.map((p) => p.id))
    .gte('observado_em', somarDias(hoje, -3))
    .order('observado_em', { ascending: false });
  if (precos.error) throw new Error(`candidatasParaPedido/precos: ${precos.error.message}`);
  const ultimo = new Map<string, number>();
  for (const p of (precos.data ?? []) as { produto_id: string; preco: number }[]) {
    if (!ultimo.has(p.produto_id)) ultimo.set(p.produto_id, Number(p.preco));
  }

  const out: CandidataCuradoria[] = [];
  for (const p of produtos) {
    const preco = ultimo.get(p.id);
    if (preco === undefined) continue; // sem preço recente: não oferece
    if (precoMax !== null && preco > precoMax) continue;
    const alvo = normalizar(p.nome);
    const casam = palavras.filter((w) => alvo.includes(w)).length;
    if (casam === 0) continue;
    const dias = Math.max(0, diasEntre(p.primeira_vez_em.slice(0, 10), hoje));
    const extra = p.comissao_extra_taxa !== null && Number(p.comissao_extra_taxa) > 0;
    const taxa = extra ? Number(p.comissao_extra_taxa) : p.comissao_taxa === null ? null : Number(p.comissao_taxa);
    out.push({
      produto_id: p.id,
      nome: p.nome,
      nicho_id: p.nicho_id,
      nicho_nome: p.nichos?.nome ?? null,
      fora_nicho_principal: p.nichos ? !p.nichos.principal : false,
      imagem_url: p.imagem_url,
      url_produto: p.url_produto,
      preco_atual: preco,
      preco_referencia: null,
      desconto_real: null,
      dias_historico: dias,
      historico_curto: true,
      comissao_taxa: taxa,
      comissao_extra: extra,
      comissao_estimada: taxa === null ? null : Math.round(preco * taxa * 100) / 100,
      loja_nome: p.loja_nome,
      loja_nota: p.loja_nota === null ? null : Number(p.loja_nota),
      produto_nota: p.produto_nota === null ? null : Number(p.produto_nota),
      vendas: p.vendas,
      prazo: null,
      nota: null,
      nota_detalhe: null,
      alertas: [],
    });
    if (out.length >= MAX_CANDIDATAS_PEDIDO) break;
  }
  return out;
}

/**
 * Cria (ou devolve) o job sob demanda do pedido. Chave: curadoria:pedido:<id>.
 * Sem nenhuma candidata, não gasta disparo (teto diário da curadoria): o pedido segue em
 * "procurando" e entra na rodada diária, depois da próxima coleta.
 */
export async function criarJobPedido(db: SupabaseClient, pedidoId: string, agora: Date = new Date()): Promise<{ job_id: string | null; criado: boolean; candidatas: number }> {
  const p = await db.from('pedidos_produto').select('id, texto, preco_max, estado').eq('id', pedidoId).single();
  if (p.error) throw new Error(`criarJobPedido: ${p.error.message}`);
  const pedido = p.data as { id: string; texto: string; preco_max: number | null; estado: string };
  const precoMax = pedido.preco_max === null ? null : Number(pedido.preco_max);
  const candidatas = await candidatasParaPedido(db, pedido.texto, precoMax, agora);
  if (candidatas.length === 0) return { job_id: null, criado: false, candidatas: 0 };
  const nichos = await db.from('nichos').select('id, nome, principal').eq('ativo', true);
  if (nichos.error) throw new Error(`criarJobPedido/nichos: ${nichos.error.message}`);
  const entrada: EntradaCuradoria = {
    data: dataLocal(agora),
    tamanho_fila: 0, // job só do pedido: nenhuma oferta de rodada
    candidatas,
    pedidos: [{ id: pedido.id, texto: pedido.texto, preco_max: precoMax }],
    nichos: (nichos.data ?? []) as EntradaCuradoria['nichos'],
  };
  const { job, criado } = await criarJob(new JobStoreSupabase(db), {
    rotina: 'pa-curadoria',
    contrato: 'curadoria/v1',
    entrada,
    chave_unica: `curadoria:pedido:${pedido.id}`,
  });
  return { job_id: job.id, criado, candidatas: candidatas.length };
}
