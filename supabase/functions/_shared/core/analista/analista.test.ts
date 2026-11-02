// Testes das regras da Analista (seções 5.7 a 5.10 e 5.17). Dados todos fictícios.
import { describe, expect, it } from 'vitest';
import { lerNumero } from './numeros.ts';
import { estadoImportacao, lerDataHora, lerRelatorioCsv, lerStatus } from './conversoes.ts';
import {
  comissaoBruta,
  comissaoPorDia,
  diasDeDados,
  horasOperacao,
  pedidos,
  porCanal,
  segundaDaSemana,
  taxaSaida,
  taxasPorSemana,
  seguidoresAtuais,
  type LinhaConversao,
} from './indicadores.ts';
import { avaliarGate, datasGate, gatesVisiveis, proximoGate, semanasDoPeriodo, LIMITES_PADRAO } from './gates.ts';
import { gatilhoFormalizacao, gatilhoInvestimento, mesesSeguidos, quedaMensal, valorSeguidor } from './gatilhos.ts';
import { vendasNecessarias } from './calculadora.ts';
import { checarNumeros, numerosDoTexto } from './resumo.ts';
import { indicadores, lerGate, lerGrafico, numerosDaSemana, ultimaSemanaFechada, type DadosAnalista } from './painel.ts';
import { regrasAutomaticas } from './regras.ts';
import { analistaResumo } from '../contratos/analista-resumo.ts';

describe('lerNumero', () => {
  it.each([
    ['R$ 1.234,56', 1234.56],
    ['1234.56', 1234.56],
    ['1,234.56', 1234.56],
    ['12,5%', 12.5],
    ['1.234', 1234],
    ['0,032', 0.032],
    ['7', 7],
    ['-R$ 3,00', -3],
  ])('%s', (t, n) => expect(lerNumero(t)).toBeCloseTo(n, 6));
  it('sem número', () => {
    expect(lerNumero('')).toBeNull();
    expect(lerNumero('abc')).toBeNull();
    expect(lerNumero(null)).toBeNull();
  });
});

const CSV_BR = [
  'ID do pedido;ID do item;Horário do pedido;Status do pedido;Valor de compra (R$);Comissão total (R$);Comissão Extra (R$);Sub_id1;Sub_id2;Sub_id3;Sub_id4;Sub_id5',
  'PEDIDO-TESTE-1;ITEM-A;2026-11-03 21:10:00;Concluído;"100,00";"8,00";"3,00";wa;post-teste-1;20261103;rodada;',
  'PEDIDO-TESTE-2;ITEM-B;03/11/2026 22:00;Pendente;50,00;2,50;0;tg;post-teste-2;20261103;pedido;',
  'PEDIDO-TESTE-3;ITEM-C;2026-11-04 10:00;Cancelado;80,00;4,00;0;wa;post-teste-3;20261104;rodada;',
  'PEDIDO-TESTE-1;ITEM-A;2026-11-03 21:10:00;Concluído;"10,00";"1,00";"0";wa;post-teste-1;20261103;rodada;',
  'PEDIDO-TESTE-4;ITEM-D;ontem;Concluído;10;1;0;wa;;;;',
  'PEDIDO-TESTE-5;ITEM-E;2026-11-05 10:00;Estado estranho;10;1;0;wa;;;;',
].join('\r\n');

describe('CSV do relatório de conversões (plano B)', () => {
  it('lê o formato brasileiro, soma linhas repetidas e aponta erros por linha', () => {
    const r = lerRelatorioCsv('﻿' + CSV_BR);
    expect(r.faltando).toEqual([]);
    expect(r.linhasLidas).toBe(6);
    expect(r.conversoes).toHaveLength(3);
    const p1 = r.conversoes.find((c) => c.pedido_id === 'PEDIDO-TESTE-1')!;
    expect(p1).toMatchObject({ item_id: 'ITEM-A', dia: '2026-11-03', status: 'concluida', valor_pedido: 110, comissao: 9, comissao_extra: 3, sub1: 'wa', sub4: 'rodada' });
    expect(r.conversoes.find((c) => c.pedido_id === 'PEDIDO-TESTE-2')).toMatchObject({ status: 'pendente', sub1: 'tg', dia: '2026-11-03' });
    expect(r.erros.map((e) => e.linha)).toEqual([6, 7]);
    expect(r.periodo).toEqual({ inicio: '2026-11-03', fim: '2026-11-04' });
    expect(estadoImportacao(r)).toBe('parcial');
  });

  it('reimportar o mesmo arquivo dá o mesmo resultado', () => {
    expect(lerRelatorioCsv(CSV_BR)).toEqual(lerRelatorioCsv(CSV_BR));
  });

  it('recusa o arquivo sem coluna obrigatória', () => {
    const r = lerRelatorioCsv('Order ID,Order Time,Status\nX,2026-11-03 10:00,Completed\n');
    expect(r.faltando).toEqual(['comissao']);
    expect(r.conversoes).toEqual([]);
    expect(estadoImportacao(r)).toBe('erro');
  });

  it('aceita cabeçalho em inglês com vírgula e aspas', () => {
    const r = lerRelatorioCsv('Order ID,Purchase Time,Order Status,Purchase Value,Total Commission,Sub_id1\n"T-1","2026-11-10T23:30:00-03:00",Completed,"1,234.50",12.30,TG\n');
    expect(r.conversoes[0]).toMatchObject({ pedido_id: 'T-1', dia: '2026-11-10', valor_pedido: 1234.5, comissao: 12.3, sub1: 'tg', item_id: '' });
  });

  it('dia do pedido no fuso de Brasília', () => {
    expect(lerDataHora('2026-11-02T02:00:00Z')).toEqual({ dia: '2026-11-01', iso: '2026-11-02T02:00:00.000Z' });
    expect(lerDataHora('2026-11-02 01:30')?.dia).toBe('2026-11-02');
    expect(lerDataHora('2/11/2026')?.dia).toBe('2026-11-02');
    expect(lerDataHora('amanhã')).toBeNull();
  });

  it('estados do relatório', () => {
    expect(lerStatus('Concluído')).toBe('concluida');
    expect(lerStatus('Completed')).toBe('concluida');
    expect(lerStatus('Pendente')).toBe('pendente');
    expect(lerStatus('Cancelled')).toBe('cancelada');
    expect(lerStatus('Inválido')).toBe('cancelada');
    expect(lerStatus('???')).toBeNull();
  });
});

const conv = (p: Partial<LinhaConversao> & { pedido_id: string; dia: string }): LinhaConversao => ({
  status: 'concluida',
  valor_pedido: 0,
  comissao: 0,
  comissao_extra: 0,
  sub1: null,
  ...p,
});

describe('indicadores (seção 5.7)', () => {
  const cs = [
    conv({ pedido_id: 'A', dia: '2026-11-03', comissao: 8, valor_pedido: 100, sub1: 'wa' }),
    conv({ pedido_id: 'B', dia: '2026-11-03', comissao: 2.5, valor_pedido: 50, status: 'pendente', sub1: 'tg' }),
    conv({ pedido_id: 'C', dia: '2026-11-04', comissao: 4, status: 'cancelada', sub1: 'wa' }),
    conv({ pedido_id: 'D', dia: '2026-12-01', comissao: 1 }),
  ];
  it('comissão bruta sem canceladas, pendentes incluídas', () => {
    expect(comissaoBruta(cs, '2026-11-01', '2026-11-30')).toBe(10.5);
    expect(pedidos(cs, '2026-11-01', '2026-11-30')).toBe(2);
  });
  it('engajamento por canal agrupa por sub1', () => {
    const r = porCanal(cs, [{ dia: '2026-11-03', sub1: 'wa', cliques: 40 }], '2026-11-01', '2026-11-30');
    expect(r).toEqual([
      { sub1: 'wa', cliques: 40, pedidos: 1, comissao: 8 },
      { sub1: 'tg', cliques: 0, pedidos: 1, comissao: 2.5 },
    ]);
  });
  it('comissão por dia com zeros', () => {
    expect(comissaoPorDia(cs, '2026-11-03', '2026-11-05')).toEqual([
      { dia: '2026-11-03', comissao: 10.5 },
      { dia: '2026-11-04', comissao: 0 },
      { dia: '2026-11-05', comissao: 0 },
    ]);
  });
  it('horas de operação: sem montagem, sem sessão aberta, recortadas ao período', () => {
    const s = [
      { inicio: '2026-11-03T12:00:00Z', fim: '2026-11-03T14:00:00Z', montagem: false },
      { inicio: '2026-11-03T15:00:00Z', fim: '2026-11-03T18:00:00Z', montagem: true },
      { inicio: '2026-11-03T19:00:00Z', fim: null, montagem: false },
      { inicio: '2026-11-04T02:00:00Z', fim: '2026-11-04T04:00:00Z', montagem: false }, // 23h às 1h de Brasília
    ];
    expect(horasOperacao(s, new Date('2026-11-03T03:00:00Z'), new Date('2026-11-04T03:00:00Z'))).toBe(3);
  });
  it('taxa de saída: Telegram pelas saídas; WhatsApp pela informada ou pela queda líquida (nunca negativa)', () => {
    expect(taxaSaida({ canal: 'tg', semana_inicio: '2026-11-02', seguidores_inicio: 200, seguidores_fim: 210, saidas: 4 })).toEqual({ taxa: 0.02, metodo: 'saidas' });
    expect(taxaSaida({ canal: 'wa', semana_inicio: '2026-11-02', seguidores_inicio: 100, seguidores_fim: 95, saidas: null })).toEqual({ taxa: 0.05, metodo: 'queda_liquida' });
    expect(taxaSaida({ canal: 'wa', semana_inicio: '2026-11-02', seguidores_inicio: 100, seguidores_fim: 130, saidas: null }).taxa).toBe(0);
    expect(taxaSaida({ canal: 'wa', semana_inicio: '2026-11-02', seguidores_inicio: 100, seguidores_fim: 130, saidas: 3 })).toEqual({ taxa: 0.03, metodo: 'saidas' });
    expect(taxaSaida({ canal: 'wa', semana_inicio: '2026-11-02', seguidores_inicio: null, seguidores_fim: 130, saidas: null }).taxa).toBeNull();
  });
  it('seguidores somam o último registro de cada canal', () => {
    const a = [
      { canal: 'wa' as const, semana_inicio: '2026-11-02', seguidores_inicio: null, seguidores_fim: 50, saidas: null },
      { canal: 'wa' as const, semana_inicio: '2026-11-09', seguidores_inicio: 50, seguidores_fim: 70, saidas: null },
      { canal: 'tg' as const, semana_inicio: '2026-11-09', seguidores_inicio: 20, seguidores_fim: 30, saidas: 1 },
    ];
    expect(seguidoresAtuais(a)).toBe(100);
    expect(seguidoresAtuais([])).toBeNull();
    expect(taxasPorSemana(a).map((t) => t.semana_inicio)).toEqual(['2026-11-02', '2026-11-09']);
  });
  it('segunda-feira da semana', () => {
    expect(segundaDaSemana('2026-11-08')).toBe('2026-11-02'); // domingo
    expect(segundaDaSemana('2026-11-02')).toBe('2026-11-02');
    expect(segundaDaSemana('2026-11-04')).toBe('2026-11-02');
  });
  it('dias de dados contam a união dos períodos importados', () => {
    expect(diasDeDados([])).toBeNull();
    expect(diasDeDados([{ inicio: '2026-11-02', fim: '2026-11-04' }, { inicio: '2026-11-04', fim: '2026-11-06' }, { inicio: '2026-11-10', fim: '2026-11-10' }])).toEqual({ inicio: '2026-11-02', fim: '2026-11-10', dias: 6 });
  });
});

describe('gates (seção 5.8)', () => {
  const g = (h: number | null, extra: Partial<Parameters<typeof avaliarGate>[0]> = {}) =>
    avaliarGate({ h, hUltimaSemana: null, hSemanaAnterior: null, taxasSemanais: [], ...extra }).resultado;
  it('ordem da tabela', () => {
    expect(g(3)).toBe('parar');
    expect(g(3, { hUltimaSemana: 4, hSemanaAnterior: 2 })).toBe('ajustar'); // abaixo de 3,68 com alta
    expect(g(3, { hUltimaSemana: 2, hSemanaAnterior: 2 })).toBe('parar'); // igual não é alta
    expect(g(5)).toBe('ajustar');
    expect(g(7.37)).toBe('escalar');
    expect(g(9, { taxasSemanais: [0.01, 0.031] })).toBe('ajustar');
    expect(g(9, { taxasSemanais: [0.03, null] })).toBe('escalar'); // 3% exatos não é "acima"
    expect(g(null)).toBeNull();
  });
  it('datas da seção 5.16 com início em 2/11/2026', () => {
    expect(datasGate('2026-11-02', 'dia30')).toEqual({ gate: 'dia30', n: 30, inicio: '2026-11-02', fim: '2026-12-01', data: '2026-12-02' });
    expect(datasGate('2026-11-02', 'dia90')).toMatchObject({ fim: '2027-01-30', data: '2027-01-31' });
    expect(datasGate('2026-11-02', 'dia60')).toMatchObject({ fim: '2026-12-31', data: '2027-01-01' });
  });
  it('dia 60 só aparece depois de um "Ajustar" no dia 30', () => {
    expect(gatesVisiveis('ajustar')).toEqual(['dia30', 'dia60', 'dia90']);
    expect(gatesVisiveis('escalar')).toEqual(['dia30', 'dia90']);
    expect(gatesVisiveis(null)).toEqual(['dia30', 'dia90']);
    expect(proximoGate('2026-11-02', '2026-12-03', ['dia30', 'dia90']).gate).toBe('dia90');
    expect(proximoGate('2026-11-02', '2026-12-02', ['dia30', 'dia90']).gate).toBe('dia30');
  });
  it('semanas do período começam na segunda', () => {
    expect(semanasDoPeriodo('2026-11-02', '2026-11-18')).toEqual([
      { inicio: '2026-11-02', fim: '2026-11-08' },
      { inicio: '2026-11-09', fim: '2026-11-15' },
      { inicio: '2026-11-16', fim: '2026-11-18' },
    ]);
  });
  it('limites padrão', () => expect(LIMITES_PADRAO).toEqual({ valorHora: 7.37, valorHoraParar: 3.68, limiteQueda: 0.03 }));
});

describe('gatilhos (seção 5.9)', () => {
  it('meses seguidos terminam no último mês e exigem meses consecutivos', () => {
    const m = [
      { mes: '2027-01', valor: 3500 },
      { mes: '2027-03', valor: 3500 },
      { mes: '2027-04', valor: 3500 },
    ];
    expect(mesesSeguidos(m, (v) => v > 3000)).toBe(2);
    expect(gatilhoFormalizacao(m)).toEqual({ disparou: true, mesesSeguidos: 2 });
    expect(gatilhoFormalizacao([{ mes: '2027-03', valor: 3000 }, { mes: '2027-04', valor: 3500 }]).disparou).toBe(false);
    expect(gatilhoFormalizacao([{ mes: '2027-03', valor: 3500 }, { mes: '2027-04', valor: null }]).disparou).toBe(false);
  });
  it('investimento exige as quatro condições', () => {
    const base = {
      liquidaPorMes: [
        { mes: '2027-01', valor: 1700 },
        { mes: '2027-02', valor: 1621 },
        { mes: '2027-03', valor: 2000 },
      ],
      horasPorMes: { '2027-01': 100, '2027-02': 200, '2027-03': 100 },
      semanasAudiencia: 8,
      taxasUltimas4: [0.01, 0.02, 0.03, 0.01],
      limiteQueda: 0.03,
      valorHora: 7.37,
    };
    expect(gatilhoInvestimento(base).liberado).toBe(true);
    expect(gatilhoInvestimento({ ...base, horasPorMes: { ...base.horasPorMes, '2027-02': 300 } }).liberado).toBe(false); // 5,40/h
    expect(gatilhoInvestimento({ ...base, semanasAudiencia: 7 }).liberado).toBe(false);
    expect(gatilhoInvestimento({ ...base, taxasUltimas4: [0.01, 0.04, 0.01, 0.01] }).liberado).toBe(false);
    expect(gatilhoInvestimento({ ...base, taxasUltimas4: [0.01, null, 0.01, 0.01] }).liberado).toBe(false);
    const parcial = gatilhoInvestimento({ ...base, liquidaPorMes: [{ mes: '2027-03', valor: 1700 }] });
    expect(parcial.mesesSeguidos).toBe(1);
    expect(parcial.condicoes.liquida.texto).toContain('1 de 3');
  });
  it('valor do seguidor', () => {
    expect(valorSeguidor(1000, 500, 0.25)).toBe(8); // (1000 ÷ 500) × 4
    expect(valorSeguidor(1000, 500, 0.1)).toBe(12); // máximo de 6 meses
    expect(valorSeguidor(1000, 500, 0)).toBe(12);
    expect(valorSeguidor(null, 500, 0.1)).toBeNull();
    expect(valorSeguidor(1000, 0, 0.1)).toBeNull();
  });
  it('queda mensal ponderada pelo tamanho dos canais', () => {
    expect(quedaMensal([{ wa: { taxa: 0.02, seguidores: 300 }, tg: { taxa: 0.04, seguidores: 100 } }, { wa: { taxa: 0.01, seguidores: 300 }, tg: { taxa: null, seguidores: 100 } }])).toBeCloseTo(0.025 + 0.01, 10);
    expect(quedaMensal([])).toBeNull();
  });
});

describe('calculadora (seção 5.10)', () => {
  it('padrões do mock', () => expect(vendasNecessarias(1000, 0.08)).toEqual({ mes: 12500, dia: 416.67 }));
  it('entradas inválidas', () => {
    expect(vendasNecessarias(1000, 0)).toBeNull();
    expect(vendasNecessarias(-1, 0.08)).toBeNull();
  });
});

describe('checagem de números do resumo (seção 5.17)', () => {
  const entrada = {
    semana_inicio: '2026-11-09',
    semana_fim: '2026-11-15',
    numeros: [
      { rotulo: 'Comissão bruta da semana', valor: 'R$ 1.234,56' },
      { rotulo: 'Taxa de saída no WhatsApp', valor: '3,2%' },
      { rotulo: 'Pedidos na semana', valor: '12' },
    ],
    avisos: [],
  };
  it('aceita texto só com números da entrada', () => {
    expect(checarNumeros('Na semana de 9/11 a 15/11 foram 12 pedidos e R$ 1.234,56 de comissão; a saída no WhatsApp ficou em 3,2%.', entrada)).toEqual({ ok: true, desconhecidos: [] });
  });
  it('recusa número inventado', () => {
    expect(checarNumeros('Foram 12 pedidos, 20% a mais que antes, rumo a R$ 2.000.', entrada)).toEqual({ ok: false, desconhecidos: [20, 2000] });
  });
  it('resposta simulada passa na checagem', () => {
    const e = analistaResumo.entrada.parse(entrada);
    expect(checarNumeros(analistaResumo.simular(e).texto, e).ok).toBe(true);
  });
  it('extrai números do texto', () => expect(numerosDoTexto('R$ 1.621,00 e 7,37/h em 2026-11-09')).toEqual([1621, 7.37, 2026, 11, 9]));
});

const vazio = (p: Partial<DadosAnalista> = {}): DadosAnalista => ({
  hoje: '2026-11-18',
  dataInicio: '2026-11-02',
  conversoes: [],
  cliques: [],
  sessoes: [],
  audiencia: null,
  pagamentos: [],
  ofertasPostadas: [],
  periodosImportados: [],
  limites: LIMITES_PADRAO,
  ...p,
});

describe('painel de Resultados', () => {
  it('sem dados, nenhum número: tudo "aguardando"', () => {
    const ind = indicadores(vazio());
    expect(ind.every((i) => i.valor === null)).toBe(true);
    expect(ind.find((i) => i.id === 'comissao_liquida_mes')?.vazio).toBe('aguardando pagamento');
    expect(lerGate(vazio(), 'dia30').avaliacao.resultado).toBeNull();
    expect(lerGrafico(vazio()).mostrar).toBe(false);
    expect(numerosDaSemana(vazio(), ultimaSemanaFechada('2026-11-18')).find((n) => n.rotulo === 'Comissão bruta da semana')?.valor).toBe('aguardando dados');
  });

  it('com dados fictícios, calcula os indicadores e a leitura parcial do gate', () => {
    const d = vazio({
      conversoes: [
        conv({ pedido_id: 'A', dia: '2026-11-03', comissao: 30, comissao_extra: 6, valor_pedido: 300, sub1: 'wa' }),
        conv({ pedido_id: 'B', dia: '2026-11-10', comissao: 10, valor_pedido: 100, sub1: 'tg' }),
      ],
      cliques: [{ dia: '2026-11-10', sub1: 'wa', cliques: 50 }],
      sessoes: [{ inicio: '2026-11-03T12:00:00Z', fim: '2026-11-03T17:00:00Z', montagem: false }],
      ofertasPostadas: [
        { post_id: 'p1', dia: '2026-11-10' },
        { post_id: 'p2', dia: '2026-11-10' },
      ],
      periodosImportados: [{ inicio: '2026-11-02', fim: '2026-11-15' }],
      audiencia: [{ canal: 'tg', semana_inicio: '2026-11-09', seguidores_inicio: 100, seguidores_fim: 200, saidas: 5 }],
    });
    const v = Object.fromEntries(indicadores(d).map((i) => [i.id, i.valor]));
    expect(v.comissao_bruta_mes).toBe(40);
    expect(v.comissao_por_hora).toBe(8);
    expect(v.seguidores).toBe(200);
    expect(v.taxa_saida).toBe(0.05);
    expect(v.cliques_por_oferta).toBe(25);
    expect(v.conversao).toBeCloseTo(1 / 50, 10);
    expect(v.ticket_medio).toBe(200);
    expect(v.mix_extra).toBeCloseTo(0.15, 10);
    expect(v.comissao_por_mil).toBe(200);
    expect(v.comissao_liquida_mes).toBeNull();

    const gate = lerGate(d, 'dia30');
    expect(gate.parcial).toBe(true);
    expect(gate.periodo).toEqual({ inicio: '2026-11-02', fim: '2026-11-17' });
    expect(gate.h).toBe(8);
    expect(gate.avaliacao.resultado).toBe('ajustar'); // semana de 9/11 com 5% de saída
    expect(lerGrafico(d)).toMatchObject({ mostrar: true, dias: 14 });
  });

  it('regras automáticas mostram o valor vigente', () => {
    const r = regrasAutomaticas({ cadenciaInicial: 5, cadenciaMaxima: 9, cadenciaMinima: 2, limiteQuedaInicial: 0.04 });
    expect(r[0].acontece).toBe('5 posts por dia por canal');
    expect(r[1].acontece).toContain('até 9');
    expect(r[2].quando).toContain('4%');
  });
});
