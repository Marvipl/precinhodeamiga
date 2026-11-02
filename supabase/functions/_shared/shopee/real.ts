// Cliente real da Open API de afiliados da Shopee (GraphQL assinado). Só roda com SHOPEE_AFFILIATE_APP_ID/SECRET.
// [SUPOSIÇÃO S-P1-3] Endpoint, nomes de query e campos seguem a documentação pública conhecida
// (productOfferV2, generateShortLink); conferir na seção Open API do painel antes de ligar.
import { listaSubIds, type SubIds } from '../core/subids.ts';
import { cabecalhoAutorizacao } from './assinatura.ts';
import type { BuscaOfertas, ClienteShopee, OfertaShopee } from './tipos.ts';

export const URL_SHOPEE_BR = 'https://open-api.affiliate.shopee.com.br/graphql';

const CAMPOS = `itemId shopId productName productLink offerLink imageUrl priceMin priceMax
  commissionRate sellerCommissionRate shopeeCommissionRate sales ratingStar shopName shopType
  periodStartTime periodEndTime`;

export interface DepsReal {
  appId: string;
  segredo: string;
  url?: string;
  fetch?: typeof fetch;
  agora?: () => Date;
}

// deno-lint-ignore no-explicit-any
type Bruto = Record<string, any>;

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Converte um nó de productOfferV2 no formato da coleta. Exportado para teste. */
export function normalizarNo(n: Bruto): OfertaShopee {
  const fim = num(n.periodEndTime);
  const extra = num(n.sellerCommissionRate);
  return {
    shopee_item_id: String(n.itemId),
    shopee_shop_id: String(n.shopId),
    nome: String(n.productName ?? '').slice(0, 300),
    url_produto: String(n.productLink ?? ''),
    imagem_url: n.imageUrl ? String(n.imageUrl) : null,
    loja_nome: n.shopName ? String(n.shopName) : null,
    loja_nota: null, // a busca de ofertas não traz a nota da loja
    loja_avaliacoes: null,
    produto_nota: num(n.ratingStar),
    vendas: num(n.sales),
    em_estoque: true, // a busca só devolve ofertas ativas
    preco: num(n.priceMin) ?? num(n.priceMax) ?? 0,
    comissao_taxa: num(n.commissionRate),
    comissao_extra_taxa: extra && extra > 0 ? extra : null, // [SUPOSIÇÃO S-P1-3] Comissão Extra = taxa paga pelo vendedor
    prazo: fim && fim > 0 ? new Date(fim * 1000).toISOString() : null,
    dados_brutos: n,
  };
}

export function clienteReal(deps: DepsReal): ClienteShopee {
  const f = deps.fetch ?? fetch;
  const url = deps.url ?? URL_SHOPEE_BR;

  async function gql(query: string, variables: Record<string, unknown>): Promise<Bruto> {
    const payload = JSON.stringify({ query, variables });
    const ts = Math.floor((deps.agora?.() ?? new Date()).getTime() / 1000);
    const r = await f(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: await cabecalhoAutorizacao(deps.appId, deps.segredo, payload, ts) },
      body: payload,
    });
    const corpo = (await r.json().catch(() => ({}))) as Bruto;
    if (!r.ok || corpo.errors?.length) {
      const msg = corpo.errors?.map((e: Bruto) => e.message).join('; ') ?? `HTTP ${r.status}`;
      throw new Error(`Shopee: ${msg}`);
    }
    return corpo.data ?? {};
  }

  return {
    modo: 'real',
    async buscarOfertas(b: BuscaOfertas) {
      const d = await gql(
        `query($keyword: String, $page: Int, $limit: Int) { productOfferV2(keyword: $keyword, sortType: 2, page: $page, limit: $limit) { nodes { ${CAMPOS} } pageInfo { hasNextPage } } }`,
        { keyword: b.palavraChave, page: b.pagina ?? 1, limit: b.limite ?? 20 },
      );
      const nodes = (d.productOfferV2?.nodes ?? []) as Bruto[];
      return { ofertas: nodes.map(normalizarNo), temMais: !!d.productOfferV2?.pageInfo?.hasNextPage };
    },
    async consultarItem(shopId: string, itemId: string) {
      const d = await gql(
        `query($shopId: Int64, $itemId: Int64) { productOfferV2(shopId: $shopId, itemId: $itemId, limit: 1) { nodes { ${CAMPOS} } } }`,
        { shopId: Number(shopId), itemId: Number(itemId) },
      );
      const n = (d.productOfferV2?.nodes ?? [])[0];
      return n ? normalizarNo(n) : null;
    },
    async gerarLinkCurto(urlProduto: string, subIds: SubIds) {
      const d = await gql(
        `mutation($originUrl: String!, $subIds: [String]) { generateShortLink(input: { originUrl: $originUrl, subIds: $subIds }) { shortLink } }`,
        { originUrl: urlProduto, subIds: listaSubIds(subIds) },
      );
      const link = d.generateShortLink?.shortLink;
      if (!link) throw new Error('Shopee: link curto vazio');
      return String(link);
    },
  };
}
