// Tipos do cliente da API de afiliados da Shopee (Open API, GraphQL).
import type { SubIds } from '../core/subids.ts';

/** Oferta normalizada (o que a coleta grava em `produtos` e `precos_observados`). */
export interface OfertaShopee {
  shopee_item_id: string;
  shopee_shop_id: string;
  nome: string;
  url_produto: string; // link comum do produto (botão "ver na Shopee")
  imagem_url: string | null;
  loja_nome: string | null;
  loja_nota: number | null;
  loja_avaliacoes: number | null;
  produto_nota: number | null;
  vendas: number | null;
  em_estoque: boolean;
  preco: number; // preço atual (menor variação)
  comissao_taxa: number | null; // taxa padrão (fração)
  comissao_extra_taxa: number | null; // Comissão Extra (fração), se houver
  prazo: string | null; // ISO; fim da oferta, se houver
  dados_brutos: unknown;
}

export interface BuscaOfertas {
  palavraChave: string;
  pagina?: number; // começa em 1
  limite?: number; // por página
}

export interface ClienteShopee {
  readonly modo: 'real' | 'simulado';
  buscarOfertas(b: BuscaOfertas): Promise<{ ofertas: OfertaShopee[]; temMais: boolean }>;
  /** Consulta sob demanda de um item (checagem antes do envio). null = item não encontrado ou oferta encerrada. */
  consultarItem(shopId: string, itemId: string): Promise<OfertaShopee | null>;
  /** Link curto de afiliado com os subIDs da seção 5.5 (destino wa, tg ou at). */
  gerarLinkCurto(urlProduto: string, subIds: SubIds): Promise<string>;
}
