// Indicadores da seção 5.7. Código puro: recebe linhas já lidas do banco e devolve números.
// Regra geral: sem dado, o resultado é null e a tela diz "aguardando dados". Nada é estimado.

import { centavos, soma } from './numeros.ts';
import type { StatusConversao } from './conversoes.ts';
import { somarDias, diaDaSemana } from '../formato.ts';

export interface LinhaConversao {
  pedido_id: string;
  item_id?: string;
  dia: string;
  status: StatusConversao;
  valor_pedido: number;
  comissao: number;
  comissao_extra: number;
  sub1: string | null;
}

export interface LinhaCliques {
  dia: string;
  sub1: string | null;
  cliques: number;
}

/** Semana de audiência por canal (view `audiencia_semanas`, pacote da Audiência). */
export interface SemanaAudiencia {
  canal: 'wa' | 'tg';
  semana_inicio: string; // segunda-feira
  seguidores_inicio: number | null;
  seguidores_fim: number | null;
  saidas: number | null;
}

export interface SessaoTrabalho {
  inicio: string;
  fim: string | null;
  montagem: boolean;
}

export const noPeriodo = (dia: string, inicio: string, fim: string) => dia >= inicio && dia <= fim;

export function semCanceladas<T extends { status: StatusConversao }>(cs: readonly T[]): T[] {
  return cs.filter((c) => c.status !== 'cancelada');
}

/** Comissão bruta: soma das comissões do relatório no período, sem as canceladas. */
export function comissaoBruta(cs: readonly LinhaConversao[], inicio: string, fim: string): number {
  return soma(semCanceladas(cs).filter((c) => noPeriodo(c.dia, inicio, fim)).map((c) => c.comissao));
}

/** "AAAA-MM" de uma data AAAA-MM-DD. */
export const mesDe = (dia: string) => dia.slice(0, 7);

/** Primeiro e último dia de um mês "AAAA-MM". */
export function limitesMes(mes: string): { inicio: string; fim: string } {
  const [a, m] = mes.split('-').map(Number);
  const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate();
  return { inicio: `${mes}-01`, fim: `${mes}-${String(ultimo).padStart(2, '0')}` };
}

export function mesAnterior(mes: string, n = 1): string {
  const [a, m] = mes.split('-').map(Number);
  const d = new Date(Date.UTC(a, m - 1 - n, 1));
  return d.toISOString().slice(0, 7);
}

/** Pedidos distintos (sem cancelados) no período. */
export function pedidos(cs: readonly LinhaConversao[], inicio: string, fim: string): number {
  return new Set(semCanceladas(cs).filter((c) => noPeriodo(c.dia, inicio, fim)).map((c) => c.pedido_id)).size;
}

export function valorPedidos(cs: readonly LinhaConversao[], inicio: string, fim: string): number {
  return soma(semCanceladas(cs).filter((c) => noPeriodo(c.dia, inicio, fim)).map((c) => c.valor_pedido));
}

export function cliquesNoPeriodo(cl: readonly LinhaCliques[], inicio: string, fim: string): number {
  return cl.filter((c) => noPeriodo(c.dia, inicio, fim)).reduce((a, c) => a + c.cliques, 0);
}

const razao = (a: number, b: number | null | undefined): number | null => (b && b > 0 ? a / b : null);

/** Comissão por hora: comissão ÷ horas de operação (sem montagem). */
export const comissaoPorHora = (comissao: number, horas: number) => (horas > 0 ? centavos(comissao / horas) : null);
/** Cliques ÷ ofertas postadas. */
export const cliquesPorOferta = (cliques: number, ofertasPostadas: number) => razao(cliques, ofertasPostadas);
/** Pedidos ÷ cliques (aproximada: os apps não identificam a pessoa). */
export const conversao = (nPedidos: number, cliques: number) => razao(nPedidos, cliques);
/** Valor dos pedidos ÷ pedidos. */
export const ticketMedio = (valor: number, nPedidos: number) => (nPedidos > 0 ? centavos(valor / nPedidos) : null);
/** Comissão de itens com Comissão Extra ÷ comissão total. */
export const mixComissaoExtra = (extra: number, total: number) => razao(extra, total);
/** Comissão ÷ (seguidores ÷ 1.000). */
export const comissaoPorMil = (comissao: number, seguidores: number | null) =>
  seguidores && seguidores > 0 ? centavos(comissao / (seguidores / 1000)) : null;

export function comissaoExtra(cs: readonly LinhaConversao[], inicio: string, fim: string): number {
  return soma(semCanceladas(cs).filter((c) => noPeriodo(c.dia, inicio, fim)).map((c) => c.comissao_extra));
}

// ---------------------------------------------------------------------------
// Horas de operação (seção 5.15): só as sessões fechadas, sem as marcadas como montagem,
// recortadas ao período [inicio, fim) em instantes.
// ---------------------------------------------------------------------------
export function horasOperacao(sessoes: readonly SessaoTrabalho[], inicio: Date, fim: Date): number {
  let ms = 0;
  for (const s of sessoes) {
    if (s.montagem || !s.fim) continue;
    const a = Math.max(Date.parse(s.inicio), inicio.getTime());
    const b = Math.min(Date.parse(s.fim), fim.getTime());
    if (b > a) ms += b - a;
  }
  return Math.round((ms / 3_600_000) * 100) / 100;
}

/** Instantes [início do dia, início do dia seguinte) de um período em datas de Brasília. */
export function instantesDoPeriodo(inicio: string, fim: string): { de: Date; ate: Date } {
  return { de: new Date(`${inicio}T00:00:00-03:00`), ate: new Date(`${somarDias(fim, 1)}T00:00:00-03:00`) };
}

// ---------------------------------------------------------------------------
// Audiência (seção 5.7)
// ---------------------------------------------------------------------------
export type MetodoSaida = 'saidas' | 'queda_liquida';

/**
 * Taxa de saída semanal de um canal. Telegram: saídas ÷ inscritos no início. WhatsApp: "deixaram de seguir"
 * informado ÷ início; sem essa informação, queda líquida (início − fim, nunca negativa) ÷ início.
 */
export function taxaSaida(s: SemanaAudiencia): { taxa: number | null; metodo: MetodoSaida } {
  const inicio = s.seguidores_inicio;
  if (s.saidas !== null && s.saidas !== undefined) return { taxa: razao(s.saidas, inicio), metodo: 'saidas' };
  if (s.canal === 'tg') return { taxa: null, metodo: 'saidas' };
  if (inicio === null || s.seguidores_fim === null) return { taxa: null, metodo: 'queda_liquida' };
  return { taxa: razao(Math.max(0, inicio - s.seguidores_fim), inicio), metodo: 'queda_liquida' };
}

/** Seguidores: último registro de cada canal (WhatsApp semanal + Telegram). null se nenhum canal tem dado. */
export function seguidoresAtuais(semanas: readonly SemanaAudiencia[]): number | null {
  let total: number | null = null;
  for (const canal of ['wa', 'tg'] as const) {
    const ult = semanas
      .filter((s) => s.canal === canal && s.seguidores_fim !== null)
      .sort((a, b) => a.semana_inicio.localeCompare(b.semana_inicio))
      .at(-1);
    if (ult) total = (total ?? 0) + (ult.seguidores_fim as number);
  }
  return total;
}

export interface SemanaTaxas {
  semana_inicio: string;
  wa: number | null;
  tg: number | null;
  metodoWa: MetodoSaida | null;
}

/** Taxas de saída por semana nos dois canais, em ordem. */
export function taxasPorSemana(semanas: readonly SemanaAudiencia[]): SemanaTaxas[] {
  const porSemana = new Map<string, SemanaTaxas>();
  for (const s of semanas) {
    const t = porSemana.get(s.semana_inicio) ?? { semana_inicio: s.semana_inicio, wa: null, tg: null, metodoWa: null };
    const { taxa, metodo } = taxaSaida(s);
    if (s.canal === 'wa') {
      t.wa = taxa;
      t.metodoWa = taxa === null ? null : metodo;
    } else t.tg = taxa;
    porSemana.set(s.semana_inicio, t);
  }
  return [...porSemana.values()].sort((a, b) => a.semana_inicio.localeCompare(b.semana_inicio));
}

/** Maior taxa entre os canais numa semana (para "semana acima do limite"). */
export const maiorTaxa = (t: SemanaTaxas) => (t.wa === null && t.tg === null ? null : Math.max(t.wa ?? 0, t.tg ?? 0));

// ---------------------------------------------------------------------------
// Semanas, canais e série diária
// ---------------------------------------------------------------------------

/** Segunda-feira da semana de uma data. */
export function segundaDaSemana(dia: string): string {
  const s = diaDaSemana(dia);
  return somarDias(dia, s === 0 ? -6 : 1 - s);
}

export interface Canal {
  sub1: string;
  cliques: number;
  pedidos: number;
  comissao: number;
}

/** Engajamento por canal: agrupa cliques, pedidos e comissão por sub1 (seção 5.5). */
export function porCanal(cs: readonly LinhaConversao[], cl: readonly LinhaCliques[], inicio: string, fim: string): Canal[] {
  const m = new Map<string, { cliques: number; pedidos: Set<string>; comissao: number[] }>();
  const de = (k: string | null) => {
    const chave = k ?? 'sem_codigo';
    if (!m.has(chave)) m.set(chave, { cliques: 0, pedidos: new Set(), comissao: [] });
    return m.get(chave)!;
  };
  for (const c of semCanceladas(cs)) {
    if (!noPeriodo(c.dia, inicio, fim)) continue;
    const g = de(c.sub1);
    g.pedidos.add(c.pedido_id);
    g.comissao.push(c.comissao);
  }
  for (const c of cl) if (noPeriodo(c.dia, inicio, fim)) de(c.sub1).cliques += c.cliques;
  return [...m.entries()]
    .map(([sub1, g]) => ({ sub1, cliques: g.cliques, pedidos: g.pedidos.size, comissao: soma(g.comissao) }))
    .sort((a, b) => b.comissao - a.comissao);
}

/** Comissão bruta por dia, com zeros nos dias sem venda, de `inicio` a `fim`. */
export function comissaoPorDia(cs: readonly LinhaConversao[], inicio: string, fim: string): { dia: string; comissao: number }[] {
  const m = new Map<string, number[]>();
  for (const c of semCanceladas(cs)) if (noPeriodo(c.dia, inicio, fim)) m.set(c.dia, [...(m.get(c.dia) ?? []), c.comissao]);
  const out: { dia: string; comissao: number }[] = [];
  for (let d = inicio; d <= fim; d = somarDias(d, 1)) out.push({ dia: d, comissao: soma(m.get(d) ?? []) });
  return out;
}

export const DIAS_MINIMOS_GRAFICO = 7;

/**
 * Dias cobertos pelo relatório: do primeiro ao último dia dos períodos importados com sucesso.
 * O gráfico de comissão por dia só aparece a partir de 7 dias (F-23).
 */
export function diasDeDados(periodos: readonly { inicio: string | null; fim: string | null }[]): { inicio: string; fim: string; dias: number } | null {
  const v = periodos.filter((p): p is { inicio: string; fim: string } => !!p.inicio && !!p.fim);
  if (!v.length) return null;
  const inicio = v.map((p) => p.inicio).sort()[0];
  const fim = v.map((p) => p.fim).sort().at(-1)!;
  let dias = 0;
  for (let d = inicio; d <= fim; d = somarDias(d, 1)) if (v.some((p) => noPeriodo(d, p.inicio, p.fim))) dias++;
  return { inicio, fim, dias };
}
