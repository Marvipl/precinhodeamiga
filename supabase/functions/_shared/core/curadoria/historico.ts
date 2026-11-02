// Histórico de preço próprio (F-02) e desconto real (seção 5.2).
// O "de" é só a mediana calculada pela plataforma; o "preço original" do anúncio nunca é usado.
// Código puro (navegador, Node e Deno).

import { diasEntre, somarDias } from '../formato.ts';

export interface PrecoObservado {
  data: string; // AAAA-MM-DD (Brasília)
  preco: number;
}

export interface RegrasHistorico {
  janelaHistoricoDias: number; // [SUPOSIÇÃO] 30
  descontoRealMinimo: number; // [SUPOSIÇÃO] 0.10
  historicoCurtoDias: number; // [SUPOSIÇÃO] 7
}

export interface ResumoHistorico {
  /** Preço do dia (última observação até `hoje`). null = produto sem preço observado. */
  precoAtual: number | null;
  /** Mediana da janela, sem o dia de hoje. null = sem observação anterior. */
  mediana: number | null;
  /** Maior preço observado na janela (inclui hoje). Teto do "de" manual (F-16). */
  maiorNaJanela: number | null;
  /** Dias desde a primeira observação (0 = visto hoje pela primeira vez). */
  diasHistorico: number;
  historicoCurto: boolean;
  /** Fração de desconto do preço atual sobre a mediana (0.2 = 20% abaixo). null sem mediana. */
  desconto: number | null;
  /** Desconto confirmado: histórico não curto e desconto >= mínimo. */
  descontoReal: boolean;
  /** Preço "de" que pode ir no post. null = post sai só com "Por R$ [preço atual]". */
  precoReferencia: number | null;
}

export function mediana(valores: readonly number[]): number | null {
  if (valores.length === 0) return null;
  const v = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(v.length / 2);
  const m = v.length % 2 ? v[meio] : (v[meio - 1] + v[meio]) / 2;
  return arred(m);
}

function arred(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Resume o histórico de um produto no dia `hoje`.
 * Janela: os `janelaHistoricoDias` dias anteriores a hoje (hoje entra só como preço atual).
 */
export function resumirHistorico(precos: readonly PrecoObservado[], hoje: string, regras: RegrasHistorico): ResumoHistorico {
  const ate = precos.filter((p) => p.data <= hoje).sort((a, b) => (a.data < b.data ? -1 : 1));
  if (ate.length === 0) {
    return { precoAtual: null, mediana: null, maiorNaJanela: null, diasHistorico: 0, historicoCurto: true, desconto: null, descontoReal: false, precoReferencia: null };
  }
  const atual = ate[ate.length - 1];
  const inicioJanela = somarDias(hoje, -regras.janelaHistoricoDias);
  const janela = ate.filter((p) => p.data >= inicioJanela && p.data < hoje);
  const med = mediana(janela.map((p) => p.preco));
  const comHoje = ate.filter((p) => p.data >= inicioJanela);
  const maior = comHoje.length ? Math.max(...comHoje.map((p) => p.preco)) : null;
  const diasHistorico = Math.max(0, diasEntre(ate[0].data, hoje));
  const historicoCurto = diasHistorico < regras.historicoCurtoDias;
  const desconto = med && med > 0 ? arred4(1 - atual.preco / med) : null;
  const descontoReal = !historicoCurto && desconto !== null && desconto >= regras.descontoRealMinimo - 1e-9;
  return {
    precoAtual: atual.preco,
    mediana: med,
    maiorNaJanela: maior,
    diasHistorico,
    historicoCurto,
    desconto,
    descontoReal,
    precoReferencia: descontoReal ? med : null,
  };
}

function arred4(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}

/** Texto do alerta de histórico curto (seção 5.2). */
export function alertaHistoricoCurto(dias: number): string {
  const n = dias <= 0 ? 'observado só hoje' : dias === 1 ? 'observado há 1 dia' : `observado há ${dias} dias`;
  return `Histórico de preço curto: ${n}. Confira o preço antes de aprovar.`;
}

/**
 * "De" digitado à mão no post manual (F-16, seção 5.3): só vale se houver histórico
 * e não passar do maior preço observado na janela. Devolve o "de" aceito ou null.
 */
export function validarDeManual(deDigitado: number | null, resumo: ResumoHistorico, precoAtual: number): number | null {
  if (deDigitado === null || resumo.maiorNaJanela === null || resumo.historicoCurto) return null;
  if (deDigitado > resumo.maiorNaJanela || deDigitado <= precoAtual) return null;
  return deDigitado;
}
