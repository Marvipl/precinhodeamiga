// Prévia do post na fila (F-03): o texto como vai sair, no formato padrão da seção 5.4.
// Provisória: quando core/post/formato.ts (pacote de posts) estiver no main, `previaDoPost`
// passa a chamar `formatarPost` de lá e as regras de/por de core/post/guardia.ts.
// O link real só é gerado na aprovação (um por canal, com os códigos da seção 5.5).
import { reais } from '../formato.ts';

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

/** De/por só com histórico suficiente e desconto real confirmado (seções 5.2 e 5.4). */
export function mostraDePor(d: Pick<DadosPrevia, 'preco_atual' | 'preco_referencia' | 'dias_historico'>, r: RegrasPrevia): boolean {
  if (d.preco_referencia === null || d.preco_referencia <= 0) return false;
  if (d.dias_historico < r.historicoCurtoDias) return false;
  return d.preco_atual <= d.preco_referencia * (1 - r.descontoRealMinimo) + 1e-9;
}

/** "25/11 às 23:59" no fuso de Brasília. */
export function prazoCurto(iso: string): string {
  const t = new Date(iso);
  const dia = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: 'numeric', month: 'numeric' }).format(t);
  const hora = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false }).format(t);
  return `${dia} às ${hora}`;
}

/** Texto do post para o WhatsApp (negrito com *texto*). Sempre termina com "Link com comissão". */
export function previaDoPost(d: DadosPrevia, r: RegrasPrevia, link: string = LINK_NA_PREVIA): string {
  const linhas: string[] = [`*${d.titulo.trim()}*`];
  linhas.push(mostraDePor(d, r) ? `De ${reais(d.preco_referencia as number)} por ${reais(d.preco_atual)}` : `Por ${reais(d.preco_atual)}`);
  if (d.cupom && d.cupom.trim()) linhas.push(`Cupom: ${d.cupom.trim()}`);
  if (d.frase && d.frase.trim()) linhas.push(d.frase.trim());
  linhas.push(link);
  linhas.push(d.prazo ? `Oferta válida até ${prazoCurto(d.prazo)} | Link com comissão` : 'Link com comissão');
  return linhas.join('\n');
}
