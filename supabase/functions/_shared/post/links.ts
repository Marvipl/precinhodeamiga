// Geração do link de afiliado por canal (seção 5.5).
// O cliente real da Shopee (link curto com subIDs) fica no pacote da coleta (_shared/shopee/).
// Enquanto ele não estiver ligado aqui, o modo real devolve erro e a Guardiã bloqueia o envio por falta de link.
import type { SubIds } from '../core/post/links.ts';

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
