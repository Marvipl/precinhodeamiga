// ColetaStore sobre o Supabase (service_role). Usado pela função coleta-shopee.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ProdutoColetado } from '../core/curadoria/candidata.ts';
import type { PrecoObservado } from '../core/curadoria/historico.ts';
import type { OfertaShopee } from '../shopee/tipos.ts';
import type { ColetaStore, NichoColeta } from './store.ts';

function falha(op: string, e: { message: string } | null): void {
  if (e) throw new Error(`${op}: ${e.message}`);
}

const LOTE = 200;
/** Pedidos abertos de qualquer origem (lana, bot, formulário), mais antigos primeiro. */
const MAX_PEDIDOS = 20;
const n = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

export class ColetaStoreSupabase implements ColetaStore {
  constructor(private db: SupabaseClient) {}

  async lerNichos() {
    const r = await this.db.from('nichos').select('id, nome, palavras_chave, principal, bloqueado, ativo');
    falha('lerNichos', r.error);
    return (r.data ?? []) as NichoColeta[];
  }
  async lerConfig() {
    const r = await this.db.from('configuracoes').select('chave, valor');
    falha('lerConfig', r.error);
    return r.data ?? [];
  }
  async salvarProduto(o: OfertaShopee, nichoId: string | null) {
    const ex = await this.db.from('produtos').select('id, nicho_id').eq('shopee_shop_id', o.shopee_shop_id).eq('shopee_item_id', o.shopee_item_id).maybeSingle();
    falha('salvarProduto/ler', ex.error);
    const linha = {
      shopee_item_id: o.shopee_item_id,
      shopee_shop_id: o.shopee_shop_id,
      nome: o.nome,
      url_produto: o.url_produto,
      imagem_url: o.imagem_url,
      loja_nome: o.loja_nome,
      loja_nota: o.loja_nota,
      loja_avaliacoes: o.loja_avaliacoes,
      produto_nota: o.produto_nota,
      vendas: o.vendas,
      em_estoque: o.em_estoque,
      comissao_taxa: o.comissao_taxa,
      comissao_extra_taxa: o.comissao_extra_taxa,
      prazo: o.prazo,
      dados_brutos: o.dados_brutos,
      atualizado_em: new Date().toISOString(),
    };
    if (ex.data) {
      const up = await this.db.from('produtos').update({ ...linha, nicho_id: ex.data.nicho_id ?? nichoId }).eq('id', ex.data.id);
      falha('salvarProduto/atualizar', up.error);
      return ex.data.id as string;
    }
    const ins = await this.db.from('produtos').insert({ ...linha, nicho_id: nichoId }).select('id').single();
    falha('salvarProduto/inserir', ins.error);
    return ins.data!.id as string;
  }
  async registrarPreco(produtoId: string, data: string, preco: number) {
    const r = await this.db.from('precos_observados').upsert({ produto_id: produtoId, observado_em: data, preco }, { onConflict: 'produto_id,observado_em' });
    falha('registrarPreco', r.error);
  }
  async produtosDoDia(hoje: string, desde: string) {
    const ids: string[] = [];
    for (let de = 0; ; de += 1000) {
      const r = await this.db.from('precos_observados').select('produto_id').eq('observado_em', hoje).range(de, de + 999);
      falha('produtosDoDia/ids', r.error);
      ids.push(...(r.data ?? []).map((x) => x.produto_id as string));
      if ((r.data ?? []).length < 1000) break;
    }
    const out: { produto: ProdutoColetado; precos: PrecoObservado[] }[] = [];
    for (let i = 0; i < ids.length; i += LOTE) {
      const lote = ids.slice(i, i + LOTE);
      const r = await this.db
        .from('produtos')
        .select('*, nichos(id, nome, principal, bloqueado), precos_observados(observado_em, preco)')
        .in('id', lote)
        .gte('precos_observados.observado_em', desde)
        .lte('precos_observados.observado_em', hoje);
      falha('produtosDoDia', r.error);
      // deno-lint-ignore no-explicit-any
      for (const p of (r.data ?? []) as any[]) {
        out.push({
          produto: {
            id: p.id,
            nome: p.nome,
            imagem_url: p.imagem_url,
            url_produto: p.url_produto,
            loja_nome: p.loja_nome,
            em_estoque: p.em_estoque,
            loja_nota: n(p.loja_nota),
            loja_avaliacoes: n(p.loja_avaliacoes),
            produto_nota: n(p.produto_nota),
            vendas: n(p.vendas),
            comissao_taxa: n(p.comissao_taxa),
            comissao_extra_taxa: n(p.comissao_extra_taxa),
            prazo: p.prazo ?? null,
            nicho: p.nichos ? { id: p.nichos.id, nome: p.nichos.nome, principal: p.nichos.principal, bloqueado: p.nichos.bloqueado } : null,
          },
          precos: (p.precos_observados ?? []).map((x: { observado_em: string; preco: number | string }) => ({ data: x.observado_em, preco: Number(x.preco) })),
        });
      }
    }
    return out;
  }
  async pedidosAbertos() {
    const r = await this.db.from('pedidos_produto').select('id, texto, preco_max').eq('estado', 'procurando').order('criado_em').limit(MAX_PEDIDOS);
    falha('pedidosAbertos', r.error);
    return (r.data ?? []).map((p) => ({ id: p.id as string, texto: p.texto as string, preco_max: n(p.preco_max) }));
  }
  async pulosDesde(data: string, limite: number) {
    const r = await this.db
      .from('ofertas')
      .select('produto_id, pulo_motivo, produtos(nome)')
      .eq('estado', 'pulada')
      .gte('data', data)
      .order('decidido_em', { ascending: false })
      .limit(limite);
    falha('pulosDesde', r.error);
    // deno-lint-ignore no-explicit-any
    return ((r.data ?? []) as any[]).map((o) => ({ produto_id: o.produto_id, nome: o.produtos?.nome ?? '', motivo: o.pulo_motivo ?? null }));
  }
  async registrarAtividade(agente: string, texto: string, link?: string) {
    const r = await this.db.from('atividades').insert({ agente, texto, link });
    falha('registrarAtividade', r.error);
  }
}
