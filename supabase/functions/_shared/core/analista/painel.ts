// Monta tudo o que a tela Resultados e o resumo semanal mostram, a partir das linhas do banco.
// Código puro: as mesmas contas servem ao painel (navegador) e à função da Analista (Deno).

import { dataCurta, porcento, reais, somarDias } from '../formato.ts';
import {
  cliquesNoPeriodo,
  cliquesPorOferta,
  comissaoBruta,
  comissaoExtra,
  comissaoPorDia,
  comissaoPorHora,
  comissaoPorMil,
  conversao,
  diasDeDados,
  DIAS_MINIMOS_GRAFICO,
  horasOperacao,
  instantesDoPeriodo,
  limitesMes,
  maiorTaxa,
  mesAnterior,
  mesDe,
  mixComissaoExtra,
  noPeriodo,
  pedidos,
  segundaDaSemana,
  seguidoresAtuais,
  taxasPorSemana,
  ticketMedio,
  valorPedidos,
  type LinhaCliques,
  type LinhaConversao,
  type SemanaAudiencia,
  type SemanaTaxas,
  type SessaoTrabalho,
} from './indicadores.ts';
import { avaliarGate, datasGate, gateAberto, semanasDoPeriodo, type AvaliacaoGate, type DatasGate, type IdGate, type Limites } from './gates.ts';
import { gatilhoFormalizacao, gatilhoInvestimento, type AvaliacaoInvestimento, type ValorMes } from './gatilhos.ts';
import type { NumeroResumo } from './resumo.ts';

export const AGUARDANDO = 'aguardando dados';

export interface DadosAnalista {
  hoje: string;
  dataInicio: string;
  conversoes: readonly LinhaConversao[];
  cliques: readonly LinhaCliques[];
  sessoes: readonly SessaoTrabalho[];
  /** null = a audiência ainda não está disponível (pacote da Audiência). */
  audiencia: readonly SemanaAudiencia[] | null;
  /** Comissão líquida paga, por mês de referência (AAAA-MM). */
  pagamentos: readonly { mes: string; valor: number }[];
  /** Ofertas postadas: um registro por post publicado ou enviado em pelo menos um canal. */
  ofertasPostadas: readonly { post_id: string; dia: string }[];
  /** Períodos cobertos pelas importações bem-sucedidas. */
  periodosImportados: readonly { inicio: string | null; fim: string | null }[];
  limites: Limites;
}

export type IdIndicador =
  | 'comissao_bruta_mes'
  | 'comissao_liquida_mes'
  | 'comissao_por_hora'
  | 'seguidores'
  | 'taxa_saida'
  | 'cliques_por_oferta'
  | 'conversao'
  | 'ticket_medio'
  | 'mix_extra'
  | 'comissao_por_mil';

export type FormatoIndicador = 'reais' | 'reais_hora' | 'inteiro' | 'porcento' | 'decimal';

export interface Indicador {
  id: IdIndicador;
  nome: string;
  como: string;
  formato: FormatoIndicador;
  valor: number | null;
  /** Texto quando não há valor ("aguardando dados", "aguardando pagamento"). */
  vazio: string;
  /** Período ou observação mostrada abaixo do valor. */
  nota?: string;
}

export const INDICADORES_DEF: readonly { id: IdIndicador; nome: string; como: string; formato: FormatoIndicador }[] = [
  { id: 'comissao_bruta_mes', nome: 'Comissão bruta do mês', como: 'Relatório de conversões, sem as canceladas', formato: 'reais' },
  { id: 'comissao_liquida_mes', nome: 'Comissão líquida do mês', como: 'Valor pago pela Shopee, após retenções', formato: 'reais' },
  { id: 'comissao_por_hora', nome: 'Comissão por hora trabalhada', como: 'Comissão bruta ÷ horas registradas, sem montagem', formato: 'reais_hora' },
  { id: 'seguidores', nome: 'Seguidores', como: 'Canais do WhatsApp e do Telegram', formato: 'inteiro' },
  { id: 'taxa_saida', nome: 'Taxa de saída semanal', como: 'Quem deixou de seguir ÷ seguidores no início da semana', formato: 'porcento' },
  { id: 'cliques_por_oferta', nome: 'Cliques por oferta', como: 'Cliques ÷ ofertas postadas', formato: 'decimal' },
  { id: 'conversao', nome: 'Conversão', como: 'Pedidos ÷ cliques (aproximada)', formato: 'porcento' },
  { id: 'ticket_medio', nome: 'Ticket médio', como: 'Valor dos pedidos ÷ pedidos', formato: 'reais' },
  { id: 'mix_extra', nome: 'Mix de Comissão Extra', como: 'Comissão Extra ÷ comissão total', formato: 'porcento' },
  { id: 'comissao_por_mil', nome: 'Comissão por 1.000 seguidores', como: 'Comissão ÷ (seguidores ÷ 1.000)', formato: 'reais' },
];

export function formatar(valor: number | null, formato: FormatoIndicador, vazio = AGUARDANDO): string {
  if (valor === null) return vazio;
  switch (formato) {
    case 'reais':
      return reais(valor);
    case 'reais_hora':
      return `${reais(valor)}/h`;
    case 'inteiro':
      return Math.round(valor).toLocaleString('pt-BR');
    case 'porcento':
      return porcento(valor);
    case 'decimal':
      return valor.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  }
}

const ontem = (hoje: string) => somarDias(hoje, -1);

function horas(d: DadosAnalista, inicio: string, fim: string): number {
  const { de, ate } = instantesDoPeriodo(inicio, fim);
  return horasOperacao(d.sessoes, de, ate);
}

function postadas(d: DadosAnalista, inicio: string, fim: string): number {
  return new Set(d.ofertasPostadas.filter((o) => noPeriodo(o.dia, inicio, fim)).map((o) => o.post_id)).size;
}

const temConversoes = (d: DadosAnalista) => d.periodosImportados.some((p) => p.inicio && p.fim);

/** Última semana (segunda a domingo) já fechada antes de hoje. */
export function ultimaSemanaFechada(hoje: string): { inicio: string; fim: string } {
  const inicio = somarDias(segundaDaSemana(hoje), -7);
  return { inicio, fim: somarDias(inicio, 6) };
}

export function indicadores(d: DadosAnalista): Indicador[] {
  const mes = mesDe(d.hoje);
  const { inicio: iniMes } = limitesMes(mes);
  const fimMes = d.hoje;
  const tem = temConversoes(d);
  const semana = ultimaSemanaFechada(d.hoje);
  const taxas = d.audiencia ? taxasPorSemana(d.audiencia) : [];
  const ultTaxa = [...taxas].reverse().find((t) => maiorTaxa(t) !== null);
  const seg = d.audiencia ? seguidoresAtuais(d.audiencia) : null;
  const bruta = tem ? comissaoBruta(d.conversoes, iniMes, fimMes) : null;
  const pag = d.pagamentos.find((p) => p.mes === mes);
  const pagAnterior = d.pagamentos.find((p) => p.mes === mesAnterior(mes));
  const hMes = horas(d, iniMes, fimMes);
  const cliquesSem = cliquesNoPeriodo(d.cliques, semana.inicio, semana.fim);
  const cliquesMes = cliquesNoPeriodo(d.cliques, iniMes, fimMes);
  const pedSem = pedidos(d.conversoes, semana.inicio, semana.fim);
  const pedMes = pedidos(d.conversoes, iniMes, fimMes);

  const v: Record<IdIndicador, { valor: number | null; vazio?: string; nota?: string }> = {
    comissao_bruta_mes: { valor: bruta, nota: 'mês até hoje, pendentes e concluídas' },
    comissao_liquida_mes: {
      valor: pag?.valor ?? null,
      vazio: 'aguardando pagamento',
      nota: !pag && pagAnterior ? `mês anterior: ${reais(pagAnterior.valor)}` : undefined,
    },
    comissao_por_hora: {
      valor: bruta === null ? null : comissaoPorHora(bruta, hMes),
      vazio: tem && hMes === 0 ? 'sem horas registradas no mês' : AGUARDANDO,
      nota: 'mês até hoje, pela bruta',
    },
    seguidores: { valor: seg },
    taxa_saida: {
      valor: ultTaxa ? maiorTaxa(ultTaxa) : null,
      nota: ultTaxa ? notaTaxa(ultTaxa) : undefined,
    },
    cliques_por_oferta: { valor: cliquesMes > 0 ? cliquesPorOferta(cliquesMes, postadas(d, iniMes, fimMes)) : null, nota: 'mês até hoje' },
    conversao: { valor: tem && cliquesSem > 0 ? conversao(pedSem, cliquesSem) : null, nota: `semana de ${dataCurta(semana.inicio)} a ${dataCurta(semana.fim)}` },
    ticket_medio: { valor: tem ? ticketMedio(valorPedidos(d.conversoes, iniMes, fimMes), pedMes) : null, nota: 'mês até hoje' },
    mix_extra: { valor: tem && bruta ? mixComissaoExtra(comissaoExtra(d.conversoes, iniMes, fimMes), bruta) : null, nota: 'mês até hoje' },
    comissao_por_mil: { valor: bruta === null ? null : comissaoPorMil(bruta, seg), nota: 'mês até hoje, pela bruta' },
  };
  return INDICADORES_DEF.map((def) => ({ ...def, valor: v[def.id].valor, vazio: v[def.id].vazio ?? AGUARDANDO, nota: v[def.id].nota }));
}

function notaTaxa(t: SemanaTaxas): string {
  const partes = [`semana de ${dataCurta(t.semana_inicio)}`, `maior entre os canais`];
  if (t.wa !== null) partes.push(`WhatsApp ${porcento(t.wa)}${t.metodoWa === 'queda_liquida' ? ' pela queda líquida do total' : ''}`);
  if (t.tg !== null) partes.push(`Telegram ${porcento(t.tg)}`);
  return partes.join('; ');
}

// ---------------------------------------------------------------------------
// Gates
// ---------------------------------------------------------------------------
export interface LeituraGate {
  datas: DatasGate;
  aberto: boolean;
  /** Antes do dia do gate, a leitura vai até ontem e é parcial. */
  parcial: boolean;
  periodo: { inicio: string; fim: string };
  comissao: number | null;
  horas: number;
  h: number | null;
  porMil: number | null;
  taxasSemanais: { inicio: string; fim: string; taxa: number | null }[];
  avaliacao: AvaliacaoGate;
}

export function lerGate(d: DadosAnalista, gate: IdGate): LeituraGate {
  const datas = datasGate(d.dataInicio, gate);
  const aberto = gateAberto(datas, d.hoje);
  const fim = aberto ? datas.fim : ontem(d.hoje) < datas.fim ? ontem(d.hoje) : datas.fim;
  const periodo = { inicio: datas.inicio, fim };
  const semDados = fim < datas.inicio || !temConversoes(d);
  const comissao = semDados ? null : comissaoBruta(d.conversoes, periodo.inicio, periodo.fim);
  const hs = fim < datas.inicio ? 0 : horas(d, periodo.inicio, periodo.fim);
  const h = comissao === null ? null : comissaoPorHora(comissao, hs);
  const semanas = fim < datas.inicio ? [] : semanasDoPeriodo(periodo.inicio, periodo.fim);
  const hSemana = semanas.map((s) => (comissao === null ? null : comissaoPorHora(comissaoBruta(d.conversoes, s.inicio, s.fim), horas(d, s.inicio, s.fim))));
  const taxas = d.audiencia ? taxasPorSemana(d.audiencia) : [];
  const taxasSemanais = semanas.map((s) => {
    const t = taxas.find((x) => x.semana_inicio === segundaDaSemana(s.inicio));
    return { ...s, taxa: t ? maiorTaxa(t) : null };
  });
  const avaliacao = avaliarGate(
    { h, hUltimaSemana: hSemana.at(-1) ?? null, hSemanaAnterior: hSemana.at(-2) ?? null, taxasSemanais: taxasSemanais.map((t) => t.taxa) },
    d.limites,
  );
  const seg = d.audiencia ? seguidoresAtuais(d.audiencia) : null;
  return { datas, aberto, parcial: !aberto, periodo, comissao, horas: hs, h, porMil: comissao === null ? null : comissaoPorMil(comissao, seg), taxasSemanais, avaliacao };
}

// ---------------------------------------------------------------------------
// Gatilhos
// ---------------------------------------------------------------------------
export function mesesFechados(hoje: string, n: number): string[] {
  const atual = mesDe(hoje);
  return Array.from({ length: n }, (_, i) => mesAnterior(atual, n - i));
}

export function lerFormalizacao(d: DadosAnalista) {
  if (!temConversoes(d)) return { disparou: false, mesesSeguidos: 0, semDados: true };
  const meses: ValorMes[] = mesesFechados(d.hoje, 6).map((m) => {
    const { inicio, fim } = limitesMes(m);
    return { mes: m, valor: comissaoBruta(d.conversoes, inicio, fim) };
  });
  return { ...gatilhoFormalizacao(meses), semDados: false };
}

export function lerInvestimento(d: DadosAnalista, limiteQuedaAtual: number): AvaliacaoInvestimento {
  const meses = [...new Set(d.pagamentos.map((p) => p.mes))].sort();
  const horasPorMes: Record<string, number> = {};
  for (const m of meses) {
    const { inicio, fim } = limitesMes(m);
    horasPorMes[m] = horas(d, inicio, fim);
  }
  const taxas = d.audiencia ? taxasPorSemana(d.audiencia) : [];
  const semanaAtual = segundaDaSemana(d.hoje);
  const fechadas = taxas.filter((t) => t.semana_inicio < semanaAtual);
  return gatilhoInvestimento({
    liquidaPorMes: d.pagamentos.map((p) => ({ mes: p.mes, valor: p.valor })),
    horasPorMes,
    semanasAudiencia: fechadas.filter((t) => maiorTaxa(t) !== null).length,
    taxasUltimas4: fechadas.slice(-4).map(maiorTaxa),
    limiteQueda: limiteQuedaAtual,
    valorHora: d.limites.valorHora,
  });
}

// ---------------------------------------------------------------------------
// Gráfico de comissão por dia
// ---------------------------------------------------------------------------
export function lerGrafico(d: DadosAnalista): { mostrar: boolean; dias: number; serie: { dia: string; comissao: number }[] } {
  const cob = diasDeDados(d.periodosImportados);
  if (!cob || cob.dias < DIAS_MINIMOS_GRAFICO) return { mostrar: false, dias: cob?.dias ?? 0, serie: [] };
  const inicio = somarDias(cob.fim, -29) > cob.inicio ? somarDias(cob.fim, -29) : cob.inicio;
  return { mostrar: true, dias: cob.dias, serie: comissaoPorDia(d.conversoes, inicio, cob.fim) };
}

// ---------------------------------------------------------------------------
// Resumo semanal: números da semana fechada, já formatados, que entram no job da Analista
// ---------------------------------------------------------------------------
export function numerosDaSemana(d: DadosAnalista, semana: { inicio: string; fim: string }): NumeroResumo[] {
  const tem = temConversoes(d);
  const bruta = tem ? comissaoBruta(d.conversoes, semana.inicio, semana.fim) : null;
  const hs = horas(d, semana.inicio, semana.fim);
  const cl = cliquesNoPeriodo(d.cliques, semana.inicio, semana.fim);
  const ped = tem ? pedidos(d.conversoes, semana.inicio, semana.fim) : null;
  const taxas = d.audiencia ? taxasPorSemana(d.audiencia) : [];
  const t = taxas.find((x) => x.semana_inicio === semana.inicio);
  const seg = d.audiencia ? seguidoresAtuais(d.audiencia) : null;
  const mes = limitesMes(mesDe(semana.fim));
  const brutaMes = tem ? comissaoBruta(d.conversoes, mes.inicio, semana.fim) : null;
  const n = (rotulo: string, valor: number | null, f: FormatoIndicador, vazio = AGUARDANDO): NumeroResumo => ({ rotulo, valor: formatar(valor, f, vazio) });
  return [
    n('Comissão bruta da semana', bruta, 'reais'),
    n('Comissão bruta do mês até o fim da semana', brutaMes, 'reais'),
    n('Pedidos na semana', ped, 'inteiro'),
    n('Cliques na semana', cl > 0 ? cl : null, 'inteiro'),
    n('Ofertas postadas na semana', postadas(d, semana.inicio, semana.fim), 'inteiro'),
    n('Conversão da semana (aproximada)', ped !== null && cl > 0 ? conversao(ped, cl) : null, 'porcento'),
    n('Horas de operação na semana', hs > 0 ? hs : null, 'decimal', 'nenhuma hora registrada'),
    n('Comissão por hora na semana', bruta === null ? null : comissaoPorHora(bruta, hs), 'reais_hora'),
    n('Seguidores', seg, 'inteiro'),
    n('Taxa de saída no WhatsApp', t?.wa ?? null, 'porcento'),
    n('Taxa de saída no Telegram', t?.tg ?? null, 'porcento'),
  ];
}
