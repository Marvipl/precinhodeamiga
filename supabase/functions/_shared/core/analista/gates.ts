// Gates do dia 30, ponto de verificação do dia 60 e gate do dia 90 (seções 5.8 e 5.16). Código puro.
// A plataforma calcula e recomenda; a decisão é registrada por Lana e Marcus.

import { somarDias, diasEntre } from '../formato.ts';

export type IdGate = 'dia30' | 'dia60' | 'dia90';
export type ResultadoGate = 'parar' | 'ajustar' | 'escalar';

export const DIA_DO_GATE: Record<IdGate, number> = { dia30: 30, dia60: 60, dia90: 90 };

export const ROTULO_RESULTADO: Record<ResultadoGate, string> = {
  parar: 'Parar ou repensar',
  ajustar: 'Ajustar nicho ou curadoria',
  escalar: 'Escalar',
};

export const AVISO_NOVEMBRO =
  'Novembro tem 11.11 e Black Friday. O "escalar" do dia 30 só vira definitivo se as semanas comuns de dezembro mantiverem o resultado.';

export interface Limites {
  /** Valor-hora de referência (R$ 7,37). */
  valorHora: number;
  /** Abaixo disto, "parar ou repensar" (R$ 3,68). */
  valorHoraParar: number;
  /** Limite de queda semanal usado no gate (3% como escrito). */
  limiteQueda: number;
}

export const LIMITES_PADRAO: Limites = { valorHora: 7.37, valorHoraParar: 3.68, limiteQueda: 0.03 };

export interface EntradaGate {
  /** Comissão por hora do período (bruta no gate do dia 30). null = sem horas ou sem dados. */
  h: number | null;
  /** Comissão por hora da última e da penúltima semana do período, para "sem alta". */
  hUltimaSemana: number | null;
  hSemanaAnterior: number | null;
  /** Maior taxa de saída semanal (qualquer canal) de cada semana do período. null = semana sem dado. */
  taxasSemanais: readonly (number | null)[];
}

export interface AvaliacaoGate {
  resultado: ResultadoGate | null;
  motivo: string;
  semanaAcima: boolean;
  semAlta: boolean;
}

/** "Semana acima" = pelo menos uma semana do período com taxa de saída acima do limite em algum canal. */
export function semanaAcima(taxas: readonly (number | null)[], limite: number): boolean {
  return taxas.some((t) => t !== null && t > limite);
}

/**
 * "Sem alta nas duas últimas semanas" = a comissão por hora da última semana não é maior que a da
 * semana anterior [SUPOSIÇÃO]. Sem os dois números, não há como ver alta: conta como sem alta.
 */
export function semAlta(ultima: number | null, anterior: number | null): boolean {
  if (ultima === null || anterior === null) return true;
  return !(ultima > anterior);
}

/** Avalia na ordem da tabela da seção 5.8; vale a primeira que se aplicar. */
export function avaliarGate(e: EntradaGate, l: Limites = LIMITES_PADRAO): AvaliacaoGate {
  const acima = semanaAcima(e.taxasSemanais, l.limiteQueda);
  const sem = semAlta(e.hUltimaSemana, e.hSemanaAnterior);
  if (e.h === null) return { resultado: null, motivo: 'Aguardando dados: sem comissão ou sem horas registradas no período.', semanaAcima: acima, semAlta: sem };
  if (e.h < l.valorHoraParar && sem) {
    return { resultado: 'parar', motivo: 'Comissão por hora abaixo do piso e sem alta nas duas últimas semanas.', semanaAcima: acima, semAlta: sem };
  }
  if (e.h < l.valorHora || acima) {
    const motivo = e.h < l.valorHora ? 'Comissão por hora abaixo da referência.' : 'Pelo menos uma semana com queda de seguidores acima do limite.';
    return { resultado: 'ajustar', motivo, semanaAcima: acima, semAlta: sem };
  }
  return { resultado: 'escalar', motivo: 'Comissão por hora na referência ou acima e nenhuma semana acima do limite de queda.', semanaAcima: acima, semAlta: sem };
}

export interface DatasGate {
  gate: IdGate;
  n: number;
  /** Período avaliado: do dia 1 ao dia N do plano. */
  inicio: string;
  fim: string;
  /** O gate acontece na manhã seguinte ao fim do dia N (seção 5.16). */
  data: string;
}

/** Datas de um gate a partir da data de início do plano (dia 1). */
export function datasGate(dataInicio: string, gate: IdGate): DatasGate {
  const n = DIA_DO_GATE[gate];
  return { gate, n, inicio: dataInicio, fim: somarDias(dataInicio, n - 1), data: somarDias(dataInicio, n) };
}

/**
 * Gates que aparecem na tela. O dia 60 só aparece se o dia 30 deu "Ajustar" (decisão registrada ou,
 * sem decisão, a recomendação calculada).
 */
export function gatesVisiveis(resultadoDia30: ResultadoGate | null): IdGate[] {
  return resultadoDia30 === 'ajustar' ? ['dia30', 'dia60', 'dia90'] : ['dia30', 'dia90'];
}

/** Próximo gate a acontecer (ou o último, se todos já passaram). */
export function proximoGate(dataInicio: string, hoje: string, visiveis: readonly IdGate[]): DatasGate {
  const ds = visiveis.map((g) => datasGate(dataInicio, g));
  return ds.find((d) => diasEntre(hoje, d.data) >= 0) ?? ds[ds.length - 1];
}

/** O gate já pode ser registrado? (a partir da manhã do dia do gate) */
export const gateAberto = (d: DatasGate, hoje: string) => hoje >= d.data;

/** Semanas (segunda a domingo) que tocam o período, com o recorte do período. */
export function semanasDoPeriodo(inicio: string, fim: string): { inicio: string; fim: string }[] {
  const out: { inicio: string; fim: string }[] = [];
  let a = inicio;
  while (a <= fim) {
    const dSem = new Date(`${a}T12:00:00Z`).getUTCDay();
    const domingo = somarDias(a, dSem === 0 ? 0 : 7 - dSem);
    const b = domingo < fim ? domingo : fim;
    out.push({ inicio: a, fim: b });
    a = somarDias(b, 1);
  }
  return out;
}
