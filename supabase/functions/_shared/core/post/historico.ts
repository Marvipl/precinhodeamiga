// Números do histórico de preço usados pela Guardiã (mediana e maior preço da janela). Código puro.
import { diasEntre, somarDias } from '../formato.ts';

export interface Observacao {
  observado_em: string; // AAAA-MM-DD
  preco: number;
}

export function mediana(valores: number[]): number | null {
  if (valores.length === 0) return null;
  const v = [...valores].sort((a, b) => a - b);
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

/**
 * Mediana e maior preço observados na janela [hoje - janela, hoje], e dias de observação
 * (dias desde a primeira observação do produto, de qualquer data).
 */
export function resumoHistorico(obs: Observacao[], hoje: string, janelaDias: number): { mediana: number | null; maximo: number | null; dias: number } {
  if (obs.length === 0) return { mediana: null, maximo: null, dias: 0 };
  const desde = somarDias(hoje, -janelaDias);
  const naJanela = obs.filter((o) => o.observado_em >= desde && o.observado_em <= hoje).map((o) => Number(o.preco));
  const primeira = obs.reduce((m, o) => (o.observado_em < m ? o.observado_em : m), obs[0].observado_em);
  return {
    mediana: mediana(naJanela),
    maximo: naJanela.length ? Math.max(...naJanela) : null,
    dias: Math.max(0, diasEntre(primeira, hoje)),
  };
}
