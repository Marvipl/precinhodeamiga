// Gatilhos de formalização e de investimento, valor do seguidor (seção 5.9). Código puro.
// A plataforma não faz nada fiscal e não executa a V4: só mostra quando a regra disparou.

export const FORMALIZACAO_LIMITE = 3000;
export const FORMALIZACAO_MESES = 2;
export const ISENCAO_IR_MENSAL = 5000;
export const INVESTIMENTO_LIQUIDA = 1621;
export const INVESTIMENTO_MESES = 3;
export const INVESTIMENTO_SEMANAS_AUDIENCIA = 8;
export const INVESTIMENTO_SEMANAS_QUEDA = 4;
export const MESES_SEGUIDOR_MAX = 6;

export interface ValorMes {
  mes: string; // AAAA-MM
  valor: number | null; // null = sem dado
}

/** Quantos meses seguidos, terminando no último mês da lista, cumprem a condição. */
export function mesesSeguidos(meses: readonly ValorMes[], cond: (v: number, mes: string) => boolean): number {
  const ord = [...meses].sort((a, b) => a.mes.localeCompare(b.mes));
  let n = 0;
  for (let i = ord.length - 1; i >= 0; i--) {
    const v = ord[i].valor;
    if (v === null || !cond(v, ord[i].mes)) break;
    if (i < ord.length - 1 && !consecutivos(ord[i].mes, ord[i + 1].mes)) break;
    n++;
  }
  return n;
}

function consecutivos(a: string, b: string): boolean {
  const [ya, ma] = a.split('-').map(Number);
  const [yb, mb] = b.split('-').map(Number);
  return yb * 12 + mb - (ya * 12 + ma) === 1;
}

/** Formalização: comissão bruta acima de R$ 3.000 por 2 meses seguidos (meses fechados). */
export function gatilhoFormalizacao(brutaPorMes: readonly ValorMes[]): { disparou: boolean; mesesSeguidos: number } {
  const n = mesesSeguidos(brutaPorMes, (v) => v > FORMALIZACAO_LIMITE);
  return { disparou: n >= FORMALIZACAO_MESES, mesesSeguidos: n };
}

export interface EntradaInvestimento {
  /** Comissão líquida (paga) por mês, só meses com pagamento conhecido. */
  liquidaPorMes: readonly ValorMes[];
  /** Horas de operação por mês (sem montagem). */
  horasPorMes: Readonly<Record<string, number>>;
  /** Semanas com dado de audiência. */
  semanasAudiencia: number;
  /** Maiores taxas de saída semanais (qualquer canal) das últimas 4 semanas, mais recente por último. */
  taxasUltimas4: readonly (number | null)[];
  limiteQueda: number;
  valorHora: number;
}

export interface Condicao {
  ok: boolean;
  texto: string;
}

export interface AvaliacaoInvestimento {
  liberado: boolean;
  mesesSeguidos: number;
  liquidaUltimoMes: ValorMes | null;
  condicoes: { liquida: Condicao; hora: Condicao; audiencia: Condicao; queda: Condicao };
}

/**
 * Gatilho de investimento (V4): líquida ≥ R$ 1.621 por 3 meses seguidos, com R$ 7,37/h ou mais (pela líquida)
 * nos mesmos meses, 8 semanas de dados de audiência e queda dentro do limite nas últimas 4 semanas.
 */
export function gatilhoInvestimento(e: EntradaInvestimento): AvaliacaoInvestimento {
  const nLiq = mesesSeguidos(e.liquidaPorMes, (v) => v >= INVESTIMENTO_LIQUIDA);
  const nHora = mesesSeguidos(e.liquidaPorMes, (v, mes) => {
    const h = e.horasPorMes[mes] ?? 0;
    return v >= INVESTIMENTO_LIQUIDA && h > 0 && v / h >= e.valorHora;
  });
  const ord = [...e.liquidaPorMes].sort((a, b) => a.mes.localeCompare(b.mes));
  const ultimo = ord.at(-1) ?? null;
  const taxas = e.taxasUltimas4;
  const quedaOk = taxas.length >= INVESTIMENTO_SEMANAS_QUEDA && taxas.every((t) => t !== null && t <= e.limiteQueda);
  const condicoes = {
    liquida: { ok: nLiq >= INVESTIMENTO_MESES, texto: `Meses seguidos com líquida de R$ 1.621 ou mais: ${Math.min(nLiq, INVESTIMENTO_MESES)} de 3` },
    hora: { ok: nHora >= INVESTIMENTO_MESES, texto: 'Comissão líquida por hora de R$ 7,37 ou mais nos mesmos meses' },
    audiencia: { ok: e.semanasAudiencia >= INVESTIMENTO_SEMANAS_AUDIENCIA, texto: `Semanas de dados de audiência: ${Math.min(e.semanasAudiencia, 8)} de 8` },
    queda: { ok: quedaOk, texto: 'Queda de seguidores dentro do limite nas últimas 4 semanas' },
  };
  return {
    liberado: condicoes.liquida.ok && condicoes.hora.ok && condicoes.audiencia.ok && condicoes.queda.ok,
    mesesSeguidos: nLiq,
    liquidaUltimoMes: ultimo,
    condicoes,
  };
}

/**
 * Queda mensal = soma das taxas de saída semanais do mês, nos dois canais ponderados pelo tamanho
 * [SUPOSIÇÃO]. Cada semana: (taxaWa × seguidoresWa + taxaTg × seguidoresTg) ÷ (seguidoresWa + seguidoresTg).
 */
export function quedaMensal(semanas: readonly { wa: { taxa: number | null; seguidores: number | null }; tg: { taxa: number | null; seguidores: number | null } }[]): number | null {
  let total = 0;
  let alguma = false;
  for (const s of semanas) {
    let num = 0;
    let den = 0;
    for (const c of [s.wa, s.tg]) {
      if (c.taxa === null || !c.seguidores) continue;
      num += c.taxa * c.seguidores;
      den += c.seguidores;
    }
    if (den > 0) {
      total += num / den;
      alguma = true;
    }
  }
  return alguma ? total : null;
}

/**
 * Valor do seguidor = comissão líquida do mês ÷ seguidores × meses que um seguidor fica.
 * Meses que fica = 1 ÷ queda mensal, no máximo 6; com queda zero ou negativa, 6.
 */
export function valorSeguidor(liquidaMes: number | null, seguidores: number | null, queda: number | null): number | null {
  if (liquidaMes === null || !seguidores || seguidores <= 0 || queda === null) return null;
  const meses = queda <= 0 ? MESES_SEGUIDOR_MAX : Math.min(MESES_SEGUIDOR_MAX, 1 / queda);
  return Math.round((liquidaMes / seguidores) * meses * 100) / 100;
}

/** Progresso visual do gatilho (0 a 1): fração de meses seguidos acima, de 3. */
export const progressoInvestimento = (a: AvaliacaoInvestimento) => Math.min(1, a.mesesSeguidos / INVESTIMENTO_MESES);
