// Geração do link de afiliado por canal (seção 5.5).
// O cliente real da Shopee (link curto com subIDs) fica no pacote da coleta (_shared/shopee/).
// Com as chaves da Shopee, as funções usam GeradorLinkShopee; sem elas, o simulado (aprovação) ou o indisponível.
import type { SubIds } from '../core/post/links.ts';
import { clienteShopee, type ClienteShopee, type EnvShopee } from '../shopee/index.ts';

export interface GeradorLinkAfiliado {
  gerar(urlProduto: string, subIds: SubIds): Promise<string>;
}

/** Link fictício que carrega os códigos de origem no caminho. Só para desenvolvimento e testes. */
export class GeradorLinkSimulado implements GeradorLinkAfiliado {
  async gerar(_urlProduto: string, s: SubIds): Promise<string> {
    return `https://exemplo.invalid/shopee/s/simulado-${s.sub1}-${s.sub2.slice(0, 12)}-${s.sub3}-${s.sub4}`;
  }
}

export class GeradorLinkIndisponivel implements GeradorLinkAfiliado {
  async gerar(): Promise<string> {
    throw new Error('gerador de link da Shopee ainda não ligado (pacote da coleta)');
  }
}

/** Link curto real da Shopee com os subIDs (cliente do pacote da coleta). */
export class GeradorLinkShopee implements GeradorLinkAfiliado {
  constructor(private cliente: ClienteShopee) {}
  gerar(urlProduto: string, s: SubIds): Promise<string> {
    return this.cliente.gerarLinkCurto(urlProduto, s);
  }
}

/**
 * Escolhe o gerador pelas variáveis da Shopee. Com chave (modo real): link curto real.
 * Sem chave: `semChave` (o simulado só onde nada é publicado de verdade).
 */
export function geradorLinkPara(e: EnvShopee, semChave: GeradorLinkAfiliado): GeradorLinkAfiliado {
  const c = clienteShopee(e);
  return c.modo === 'real' ? new GeradorLinkShopee(c) : semChave;
}
