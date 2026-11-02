// Persistência da coleta (F-02). Implementações: Supabase (store-supabase.ts) e memória (testes).
import type { PrecoObservado } from '../core/curadoria/historico.ts';
import type { ProdutoColetado } from '../core/curadoria/candidata.ts';
import type { OfertaShopee } from '../shopee/tipos.ts';

export interface NichoColeta {
  id: string;
  nome: string;
  palavras_chave: string[];
  principal: boolean;
  bloqueado: boolean;
  ativo: boolean;
}

export interface ColetaStore {
  lerNichos(): Promise<NichoColeta[]>;
  lerConfig(): Promise<{ chave: string; valor: unknown }[]>;
  /** Grava ou atualiza o produto (chave: loja + item). Mantém o nicho já gravado, se houver. Devolve o id. */
  salvarProduto(o: OfertaShopee, nichoId: string | null): Promise<string>;
  /** Um preço por produto por dia (o último do dia vence). */
  registrarPreco(produtoId: string, data: string, preco: number): Promise<void>;
  /** Produtos com preço observado em `hoje`, com os preços desde `desde` (inclusive). */
  produtosDoDia(hoje: string, desde: string): Promise<{ produto: ProdutoColetado; precos: PrecoObservado[] }[]>;
  pedidosAbertos(): Promise<{ id: string; texto: string; preco_max: number | null }[]>;
  pulosDesde(data: string, limite: number): Promise<{ produto_id: string; nome: string; motivo: string | null }[]>;
  registrarAtividade(agente: string, texto: string, link?: string): Promise<void>;
}
