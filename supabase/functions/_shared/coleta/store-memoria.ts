// ColetaStore em memória, para testes e simulações locais.
import type { ProdutoColetado } from '../core/curadoria/candidata.ts';
import type { PrecoObservado } from '../core/curadoria/historico.ts';
import type { OfertaShopee } from '../shopee/tipos.ts';
import type { ColetaStore, NichoColeta } from './store.ts';

interface ProdutoMem extends OfertaShopee {
  id: string;
  nicho_id: string | null;
}

export class ColetaStoreMemoria implements ColetaStore {
  nichos: NichoColeta[] = [];
  config: { chave: string; valor: unknown }[] = [];
  produtos = new Map<string, ProdutoMem>(); // chave loja:item
  precos = new Map<string, Map<string, number>>(); // produto_id -> data -> preço
  pedidos: { id: string; texto: string; preco_max: number | null }[] = [];
  pulos: { produto_id: string; nome: string; motivo: string | null; data: string }[] = [];
  atividades: { agente: string; texto: string; link?: string }[] = [];
  private seq = 0;

  async lerNichos() {
    return this.nichos;
  }
  async lerConfig() {
    return this.config;
  }
  async salvarProduto(o: OfertaShopee, nichoId: string | null) {
    const k = `${o.shopee_shop_id}:${o.shopee_item_id}`;
    const ex = this.produtos.get(k);
    if (ex) {
      this.produtos.set(k, { ...ex, ...o, id: ex.id, nicho_id: ex.nicho_id ?? nichoId });
      return ex.id;
    }
    this.seq += 1;
    const id = `00000000-0000-4000-9000-${String(this.seq).padStart(12, '0')}`;
    this.produtos.set(k, { ...o, id, nicho_id: nichoId });
    return id;
  }
  async registrarPreco(produtoId: string, data: string, preco: number) {
    if (!this.precos.has(produtoId)) this.precos.set(produtoId, new Map());
    this.precos.get(produtoId)!.set(data, preco);
  }
  async produtosDoDia(hoje: string, desde: string) {
    const out: { produto: ProdutoColetado; precos: PrecoObservado[] }[] = [];
    for (const p of this.produtos.values()) {
      const m = this.precos.get(p.id);
      if (!m?.has(hoje)) continue;
      const n = this.nichos.find((x) => x.id === p.nicho_id);
      out.push({
        produto: {
          id: p.id,
          nome: p.nome,
          imagem_url: p.imagem_url,
          url_produto: p.url_produto,
          loja_nome: p.loja_nome,
          em_estoque: p.em_estoque,
          loja_nota: p.loja_nota,
          loja_avaliacoes: p.loja_avaliacoes,
          produto_nota: p.produto_nota,
          vendas: p.vendas,
          comissao_taxa: p.comissao_taxa,
          comissao_extra_taxa: p.comissao_extra_taxa,
          prazo: p.prazo,
          nicho: n ? { id: n.id, nome: n.nome, principal: n.principal, bloqueado: n.bloqueado } : null,
        },
        precos: [...m.entries()].filter(([d]) => d >= desde && d <= hoje).map(([data, preco]) => ({ data, preco })),
      });
    }
    return out;
  }
  async pedidosAbertos() {
    return this.pedidos.slice(0, 20);
  }
  async pulosDesde(data: string, limite: number) {
    return this.pulos.filter((p) => p.data >= data).slice(0, limite).map(({ produto_id, nome, motivo }) => ({ produto_id, nome, motivo }));
  }
  async registrarAtividade(agente: string, texto: string, link?: string) {
    this.atividades.push({ agente, texto, link });
  }
}
