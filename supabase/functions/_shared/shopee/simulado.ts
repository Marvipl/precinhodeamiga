// Modo simulado da Shopee (SHOPEE_MODO=simulado ou sem chave): respostas gravadas com produtos fictícios.
// Determinístico: o mesmo item na mesma data tem sempre o mesmo preço, para o histórico se formar nos testes.
// Nada aqui imita dado real: nomes "Produto de teste", lojas "Loja de teste" e links em exemplo.invalid.
import { listaSubIds, type SubIds } from '../core/subids.ts';
import type { BuscaOfertas, ClienteShopee, OfertaShopee } from './tipos.ts';

export const BASE_SIMULADA = 'https://exemplo.invalid/shopee';
const LETRAS = 'ABCDEFGH';
export const ITENS_POR_PALAVRA = LETRAS.length;

/** FNV-1a 32 bits (síncrono, determinístico). */
export function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function dataDe(agora: Date): string {
  return new Date(agora.getTime() - 3 * 3_600_000).toISOString().slice(0, 10); // Brasília
}

function oferta(palavra: string, i: number, agora: Date): OfertaShopee {
  const chave = `${palavra.toLowerCase()}#${i}`;
  const h = hash32(chave);
  const itemId = String(100000 + (h % 900000));
  const shopId = String(1000 + (hash32(`loja:${chave}`) % 9000));
  const base = 20 + (h % 380); // R$ 20 a R$ 399
  // Preço do dia: oscila entre 75% e 105% da base, conforme a data (simula promoções).
  const fator = 0.75 + (hash32(`${chave}@${dataDe(agora)}`) % 31) / 100;
  const preco = Math.round(base * fator * 100) / 100;
  const temExtra = h % 4 === 0;
  const temPrazo = h % 3 === 0;
  const fimDoDia = new Date(`${dataDe(agora)}T23:59:00-03:00`);
  return {
    shopee_item_id: itemId,
    shopee_shop_id: shopId,
    nome: `Produto de teste ${LETRAS[i]} (${palavra})`,
    url_produto: `${BASE_SIMULADA}/produto/${shopId}/${itemId}`,
    imagem_url: null,
    loja_nome: `Loja de teste ${(h % 9) + 1}`,
    loja_nota: null,
    loja_avaliacoes: null,
    produto_nota: 3.5 + (h % 16) / 10, // 3,5 a 5,0
    vendas: h % 5000,
    em_estoque: h % 17 !== 0,
    preco,
    comissao_taxa: [0.03, 0.05, 0.07, 0.1][h % 4],
    comissao_extra_taxa: temExtra ? 0.12 : null,
    prazo: temPrazo ? fimDoDia.toISOString() : null,
    dados_brutos: { simulado: true },
  };
}

export interface DepsSimulado {
  agora?: () => Date;
}

export function clienteSimulado(deps: DepsSimulado = {}): ClienteShopee {
  const agora = () => deps.agora?.() ?? new Date();
  return {
    modo: 'simulado',
    async buscarOfertas(b: BuscaOfertas) {
      const palavra = b.palavraChave.trim();
      if (!palavra) return { ofertas: [], temMais: false };
      const limite = b.limite ?? 20;
      const inicio = ((b.pagina ?? 1) - 1) * limite;
      const todas = Array.from({ length: ITENS_POR_PALAVRA }, (_, i) => oferta(palavra, i, agora()));
      return { ofertas: todas.slice(inicio, inicio + limite), temMais: inicio + limite < todas.length };
    },
    async consultarItem(shopId: string, itemId: string) {
      // Sem catálogo para consultar: devolve null (o chamador cai no último preço observado).
      void shopId;
      void itemId;
      return null;
    },
    async gerarLinkCurto(urlProduto: string, subIds: SubIds) {
      const id = hash32(`${urlProduto}|${listaSubIds(subIds).join('|')}`).toString(36);
      const q = new URLSearchParams(Object.entries(subIds).map(([k, v]) => [k, String(v)]));
      return `${BASE_SIMULADA}/s/${id}?${q.toString()}`;
    },
  };
}
