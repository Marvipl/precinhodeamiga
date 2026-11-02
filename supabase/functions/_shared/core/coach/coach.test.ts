import { describe, expect, it } from 'vitest';
import {
  IDS_TAREFAS,
  PERIODOS,
  TAREFAS_PLANO,
  dataGate,
  diaDoPlano,
  estaAtrasada,
  linhaDoTempo,
  pendentesDela,
  periodo,
  progressoPorPeriodo,
  quandoPeriodo,
  rotuloDia,
  segundaDaSemana,
  tarefaDaSemana,
  tarefasFeitas,
  textoTarefa,
} from './plano.ts';
import { aplicarSaidaCoach, montarEntradaCoach, simularCoach } from './revisao.ts';
import { coach } from '../contratos/coach.ts';
import { contrato } from '../contratos/index.ts';
import { somarHoras } from '../../coach/semanal.ts';

const INICIO = '2026-11-02';
const PICOS = [
  { data: '2026-11-11', nome: '11.11' },
  { data: '2026-11-27', nome: 'Black Friday' },
  { data: '2026-12-12', nome: '12.12' },
  { data: '2026-12-25', nome: 'Natal' },
  { data: '2027-11-11', nome: 'Fora do plano' },
];
const tarefa = (id: string) => TAREFAS_PLANO.find((t) => t.id === id)!;

describe('catálogo do plano (mock)', () => {
  it('tem as 23 tarefas do mock, ids únicos, todas num período', () => {
    expect(TAREFAS_PLANO).toHaveLength(23);
    expect(IDS_TAREFAS.size).toBe(23);
    for (const t of TAREFAS_PLANO) expect(PERIODOS.some((p) => p.id === t.periodo)).toBe(true);
  });
  it('itens da plataforma e dos agentes saem da lista da Lana', () => {
    expect(tarefa('p7').dela).toBe(false);
    expect(tarefa('p13').dela).toBe(false);
    expect(tarefa('p14').dela).toBe(false);
    expect(tarefa('p15').dela).toBe(true);
  });
  it('gate do dia 90 com a data calculada', () => {
    expect(textoTarefa(tarefa('p21'), INICIO)).toBe('Gate do dia 90, domingo 31 jan');
  });
});

describe('datas (seção 5.16)', () => {
  it('dias e gates com início em 2/11/2026', () => {
    expect(diaDoPlano(INICIO, '2026-11-02')).toBe(1);
    expect(dataGate(INICIO, 30)).toBe('2026-12-02');
    expect(dataGate(INICIO, 90)).toBe('2027-01-31');
  });
  it('rótulo do dia', () => {
    expect(rotuloDia(INICIO, '2026-11-02')).toBe('Dia 1 de 90');
    expect(rotuloDia(INICIO, '2027-01-30')).toBe('Dia 90 de 90');
    expect(rotuloDia(INICIO, '2027-01-31')).toBe('Plano de 90 dias concluído');
    expect(rotuloDia(INICIO, '2026-11-01')).toBe('O plano começa em segunda, 2 de novembro');
  });
  it('"quando" de cada período igual ao mock', () => {
    expect(PERIODOS.map((p) => quandoPeriodo(p, INICIO))).toEqual([
      '2 a 8 de novembro',
      '9 de novembro a 1 de dezembro',
      'Quarta, 2 de dezembro',
      'Dezembro e janeiro',
    ]);
  });
  it('segunda-feira da semana', () => {
    expect(segundaDaSemana('2026-11-02')).toBe('2026-11-02');
    expect(segundaDaSemana('2026-11-08')).toBe('2026-11-02');
    expect(segundaDaSemana('2026-11-10')).toBe('2026-11-09');
  });
});

describe('linha do tempo', () => {
  const l = linhaDoTempo(INICIO, PICOS, '2026-11-02');
  it('fases com os dias do mock (7, 35, 18, 30)', () => {
    expect(l.fases.map((f) => f.dias)).toEqual([7, 35, 18, 30]);
    expect(l.fases.map((f) => f.legenda)).toEqual([
      'Preparação, 2 a 8 nov',
      'Temporada de ofertas, 9 nov a 13 dez',
      'Natal e ajustes, 14 a 31 dez',
      'Escala, 1 a 30 jan',
    ]);
  });
  it('marcas nas posições do mock, alternando altura; gate 90 no fim', () => {
    const pos = Object.fromEntries(l.marcas.map((m) => [m.rotulo, m.pos]));
    expect(pos).toEqual({ '11.11': 10, 'Black Friday': 27.8, 'Gate 30': 33.3, '12.12': 44.4, Natal: 58.9, 'Gate 90': 100 });
    expect(l.marcas.map((m) => m.baixa)).toEqual([false, true, false, true, false, false]);
    expect(l.marcas.at(-1)).toMatchObject({ gate: true, fim: true });
    expect(l.marcas.some((m) => m.rotulo === 'Fora do plano')).toBe(false);
  });
  it('eixo e hoje', () => {
    expect(l.eixo).toEqual(['2 nov', '1 dez', '31 dez', '31 jan']);
    expect(l.hoje).toBe(0);
    expect(linhaDoTempo(INICIO, [], '2027-02-10').hoje).toBeNull();
  });
});

describe('progresso e atrasos', () => {
  it('"Nome e logo da marca" já vem feita; marca salva vence; id estranho é ignorado', () => {
    expect(tarefasFeitas([]).has('p4')).toBe(true);
    expect(tarefasFeitas([{ tarefa: 'p4', feita: false }]).has('p4')).toBe(false);
    expect(tarefasFeitas([{ tarefa: 'x9', feita: true }]).size).toBe(1);
  });
  it('atrasada só depois do fim do período e só se for da Lana', () => {
    const f = tarefasFeitas([]);
    expect(estaAtrasada(tarefa('p1'), 7, f)).toBe(false);
    expect(estaAtrasada(tarefa('p1'), 8, f)).toBe(true);
    expect(estaAtrasada(tarefa('p7'), 8, f)).toBe(false);
    expect(estaAtrasada(tarefa('p1'), 8, tarefasFeitas([{ tarefa: 'p1', feita: true }]))).toBe(false);
  });
  it('gate do dia 30 é o período atual no dia 31, junto com dias 31 a 90', () => {
    const atuais = progressoPorPeriodo(31, tarefasFeitas([])).filter((p) => p.estado === 'atual').map((p) => p.periodo.id);
    expect(atuais).toEqual(['gate30', 'dias31a90']);
  });
  it('pendentes: atrasadas primeiro, sem futuras nem da plataforma', () => {
    const ids = pendentesDela(8, tarefasFeitas([])).map((t) => t.id);
    expect(ids.slice(0, 6)).toEqual(['p1', 'p2', 'p3', 'p5', 'p6', 'p8']);
    expect(ids).toContain('p9');
    expect(ids).not.toContain('p7');
    expect(ids).not.toContain('p15');
  });
  it('tarefa da semana para o roteiro: prioridade da Coach vence', () => {
    const f = tarefasFeitas([]);
    expect(tarefaDaSemana(1, f)?.id).toBe('p1');
    expect(tarefaDaSemana(1, f, ['p99', 'p3'])?.id).toBe('p3');
    const tudo = tarefasFeitas(TAREFAS_PLANO.map((t) => ({ tarefa: t.id, feita: true })));
    expect(tarefaDaSemana(1, tudo)).toBeNull();
  });
});

describe('revisão semanal (coach/v1)', () => {
  const entrada = montarEntradaCoach({ inicio: INICIO, semana: '2026-11-09', marcas: [], horasRegistradas: 2.345, comissaoBruta: null })!;

  it('entrada válida no contrato, com atrasadas marcadas e horas arredondadas', () => {
    expect(coach.entrada.safeParse(entrada).success).toBe(true);
    expect(entrada.dia_plano).toBe(8);
    expect(entrada.periodos_atuais).toEqual([periodo('semanas2a4').titulo]);
    expect(entrada.tarefas_pendentes[0]).toMatchObject({ id: 'p1', atrasada: true });
    expect(entrada.resultados).toEqual({ horas_registradas: 2.3, comissao_bruta: null });
  });
  it('sem revisão fora do plano', () => {
    expect(montarEntradaCoach({ inicio: INICIO, semana: '2026-10-26', marcas: [], horasRegistradas: null, comissaoBruta: null })).toBeNull();
    expect(montarEntradaCoach({ inicio: INICIO, semana: '2027-02-01', marcas: [], horasRegistradas: null, comissaoBruta: null })).toBeNull();
  });
  it('o código descarta prioridades fora da entrada, repetidas e além de três', () => {
    const r = aplicarSaidaCoach(entrada, {
      prioridades: [
        { tarefa_id: 'p7', motivo: 'da plataforma' },
        { tarefa_id: 'p1', motivo: ' a ' },
        { tarefa_id: 'p1', motivo: 'repetida' },
        { tarefa_id: 'p2', motivo: 'b' },
        { tarefa_id: 'p3', motivo: 'c' },
        { tarefa_id: 'p5', motivo: 'd' },
      ],
      nota: ' Nota de teste. ',
    });
    expect(r.prioridades.map((p) => p.tarefa_id)).toEqual(['p1', 'p2', 'p3']);
    expect(r.prioridades[0].motivo).toBe('a');
    expect(r.nota).toBe('Nota de teste.');
  });
  it('resposta simulada passa no contrato e diz que é simulada', () => {
    const s = simularCoach(entrada);
    expect(coach.saida.safeParse(s).success).toBe(true);
    expect(s.nota).toContain('simulada');
    expect(s.prioridades).toHaveLength(3);
    expect(contrato('coach/v1')?.rotina).toBe('pa-coach');
  });
  it('horas da semana sem montagem nem sessão aberta', () => {
    expect(
      somarHoras([
        { inicio: '2026-11-02T23:00:00Z', fim: '2026-11-03T00:30:00Z', montagem: false },
        { inicio: '2026-11-03T23:00:00Z', fim: '2026-11-04T01:00:00Z', montagem: true },
        { inicio: '2026-11-04T23:00:00Z', fim: null, montagem: false },
      ]),
    ).toBe(1.5);
  });
});
