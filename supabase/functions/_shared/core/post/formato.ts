// Formato padrão do post (seção 5.4) para o canal do WhatsApp e o canal do Telegram.
// Código puro. A decisão de mostrar ou não o "de/por" é da Guardiã (guardia.ts: resolverDePor);
// aqui o preço de referência só aparece se vier preenchido.
//
// *[Produto]*
// De R$ [preço de referência] por R$ [preço atual]
// Cupom: [código]
// [Frase da Redatora]
// [link]
// Oferta válida até [prazo] | Link com comissão

import { dataCurta, dataLocal, horaLocal, reais } from '../formato.ts';

export type CanalPost = 'wa' | 'tg';

export const AVISO_COMISSAO = 'Link com comissão';

export interface DadosPost {
  titulo: string;
  preco_atual: number;
  /** Já liberado pela Guardiã; null/undefined = linha "Por R$ [preço atual]". */
  preco_referencia?: number | null;
  cupom?: string | null;
  /** Instante ISO ou Date. */
  prazo?: string | Date | null;
  /** Frase da Redatora. Sem frase, o post sai sem ela (nunca texto inventado pelo código). */
  frase?: string | null;
  link: string;
}

/** Escapa texto para o modo HTML do bot do Telegram. */
export function escaparHtml(t: string): string {
  return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** "2/12 às 23:59" (Brasília). [SUPOSIÇÃO S28] */
export function prazoPorExtenso(prazo: string | Date): string {
  const d = typeof prazo === 'string' ? new Date(prazo) : prazo;
  return `${dataCurta(dataLocal(d))} às ${horaLocal(d)}`;
}

function limpo(t: string | null | undefined): string {
  return (t ?? '').replace(/\s+/g, ' ').trim();
}

/** Linha do preço: "De R$ X por R$ Y" ou "Por R$ Y". */
export function linhaPreco(precoAtual: number, precoReferencia?: number | null): string {
  if (precoReferencia != null && precoReferencia > precoAtual) {
    return `De ${reais(precoReferencia)} por ${reais(precoAtual)}`;
  }
  return `Por ${reais(precoAtual)}`;
}

/** Monta o texto final do post para o canal. */
export function formatarPost(d: DadosPost, canal: CanalPost): string {
  const titulo = limpo(d.titulo);
  const esc = canal === 'tg' ? escaparHtml : (t: string) => t;
  const negrito = canal === 'tg' ? `<b>${esc(titulo)}</b>` : `*${titulo.replace(/\*/g, '')}*`;
  const linhas: string[] = [negrito, linhaPreco(d.preco_atual, d.preco_referencia)];
  const cupom = limpo(d.cupom);
  if (cupom) linhas.push(`Cupom: ${esc(cupom)}`);
  const frase = limpo(d.frase);
  if (frase) linhas.push(esc(frase));
  linhas.push(esc(d.link.trim()));
  linhas.push(d.prazo ? `Oferta válida até ${prazoPorExtenso(d.prazo)} | ${AVISO_COMISSAO}` : AVISO_COMISSAO);
  return linhas.join('\n');
}

/** O texto tem o aviso obrigatório (seção 5.1, item 3)? */
export function temAvisoComissao(texto: string): boolean {
  return texto.includes(AVISO_COMISSAO);
}
