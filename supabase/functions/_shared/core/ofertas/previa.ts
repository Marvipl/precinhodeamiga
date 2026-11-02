// Prévia do post na fila (F-03): o texto como vai sair, no formato padrão da seção 5.4.
// Usa o mesmo formatador e a mesma regra de de/por da montagem do post (core/post/).
// O link real só é gerado na aprovação (um por canal, com os códigos da seção 5.5).
import { formatarPost, prazoPorExtenso } from '../post/formato.ts';
import { resolverDePor } from '../post/guardia.ts';

export const LINK_NA_PREVIA = '(link com comissão do canal, gerado na aprovação)';

export interface DadosPrevia {
  titulo: string;
  preco_atual: number;
  preco_referencia: number | null;
  dias_historico: number;
  cupom: string | null;
  prazo: string | null;
  frase: string | null;
}

export interface RegrasPrevia {
  historicoCurtoDias: number;
  descontoRealMinimo: number;
}

function referencia(d: Pick<DadosPrevia, 'preco_atual' | 'preco_referencia' | 'dias_historico'>, r: RegrasPrevia): number | null {
  if (d.preco_referencia === null || d.preco_referencia <= 0) return null;
  return resolverDePor({ precoAtual: d.preco_atual, mediana: d.preco_referencia, diasHistorico: d.dias_historico }, r).precoReferencia;
}

/** De/por só com histórico suficiente e desconto real confirmado (seções 5.2 e 5.4). */
export function mostraDePor(d: Pick<DadosPrevia, 'preco_atual' | 'preco_referencia' | 'dias_historico'>, r: RegrasPrevia): boolean {
  return referencia(d, r) !== null;
}

/** "25/11 às 23:59" no fuso de Brasília. */
export function prazoCurto(iso: string): string {
  return prazoPorExtenso(iso);
}

/** Texto do post para o WhatsApp (negrito com *texto*). Sempre termina com "Link com comissão". */
export function previaDoPost(d: DadosPrevia, r: RegrasPrevia, link: string = LINK_NA_PREVIA): string {
  return formatarPost({ titulo: d.titulo, preco_atual: d.preco_atual, preco_referencia: referencia(d, r), cupom: d.cupom, prazo: d.prazo, frase: d.frase, link }, 'wa');
}
