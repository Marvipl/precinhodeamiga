import { describe, expect, it } from 'vitest';
import { datasDosGates, datasQueMovemVendas, diaDoPlano, emDiasTexto, faseDoDia, proximaDataPico, rotuloDiaDoPlano, semanaDoPlano, dataDoDia } from './plano/index.ts';
import { CATALOGO, montarRoteiro, rodapeRoteiro, tarefasDoDia, type ContextoDia, type Tarefa } from './roteiro.ts';
import { comissaoPorHora, duracaoMin, duracaoTexto, fechamentoAutomatico, horasMontagem, horasValidas, validarSessaoManual, deveRegistrarAtividade } from './tempo.ts';

const INICIO = '2026-11-02';
const PICOS = [
  { data: '2026-11-11', nome: '11.11' },
  { data: '2026-11-27', nome: 'Black Friday' },
  { data: '2026-12-12', nome: '12.12' },
  { data: '2026-12-25', nome: 'Natal' },
];

describe('plano (seção 5.16)', () => {
  it('dia N de 90 a partir da data de início', () => {
    expect(diaDoPlano(INICIO, '2026-11-02')).toEqual({ estado: 'em_andamento', dia: 1, faltam: null });
    expect(diaDoPlano(INICIO, '2026-12-01').dia).toBe(30);
    expect(diaDoPlano(INICIO, '2027-01-30').dia).toBe(90);
    expect(rotuloDiaDoPlano(diaDoPlano(INICIO, '2026-11-02'))).toBe('dia 1 de 90');
  });
  it('para em 90 e depois diz concluído', () => {
    const d = diaDoPlano(INICIO, '2027-01-31');
    expect(d.estado).toBe('concluido');
    expect(rotuloDiaDoPlano(d)).toBe('plano de 90 dias concluído');
  });
  it('antes do início', () => {
    expect(rotuloDiaDoPlano(diaDoPlano(INICIO, '2026-11-01'))).toBe('o plano começa amanhã');
    expect(rotuloDiaDoPlano(diaDoPlano(INICIO, '2026-10-29'))).toBe('o plano começa em 4 dias');
  });
  it('gates na manhã seguinte ao fim do dia N', () => {
    const g = datasDosGates(INICIO);
    expect(dataDoDia(INICIO, 30)).toBe('2026-12-01');
    expect(g.find((x) => x.dia === 30)?.data).toBe('2026-12-02');
    expect(g.find((x) => x.dia === 90)?.data).toBe('2027-01-31');
    expect(g.find((x) => x.dia === 60)?.pontoDeVerificacao).toBe(true);
  });
  it('fases do mock', () => {
    expect(faseDoDia(1)?.id).toBe('preparacao');
    expect(faseDoDia(7)?.id).toBe('preparacao'); // 8/11
    expect(faseDoDia(8)?.id).toBe('temporada'); // 9/11
    expect(faseDoDia(42)?.id).toBe('temporada'); // 13/12
    expect(faseDoDia(43)?.id).toBe('natal'); // 14/12
    expect(faseDoDia(60)?.id).toBe('natal'); // 31/12
    expect(faseDoDia(61)?.id).toBe('escala'); // 1/1
    expect(faseDoDia(null)).toBeNull();
    expect(semanaDoPlano(1)).toBe(1);
    expect(semanaDoPlano(8)).toBe(2);
  });
  it('próxima data de pico e datas que movem vendas (como no mock)', () => {
    const p = proximaDataPico(PICOS, '2026-11-02');
    expect(p).toMatchObject({ nome: '11.11', emDias: 9 });
    const lista = datasQueMovemVendas(PICOS, INICIO, '2026-11-02');
    expect(lista.map((d) => [d.nome, d.emDias])).toEqual([
      ['11.11', 9],
      ['Black Friday', 25],
      ['Gate do dia 30', 30],
      ['12.12', 40],
    ]);
    expect(datasQueMovemVendas(PICOS, INICIO, '2026-11-12')[0].nome).toBe('Black Friday');
    expect(proximaDataPico(PICOS, '2026-12-26')).toBeNull();
    expect(emDiasTexto(0)).toBe('hoje');
    expect(emDiasTexto(1)).toBe('amanhã');
    expect(emDiasTexto(9)).toBe('em 9 dias');
  });
});

const TUDO: ContextoDia = {
  telasProntas: ['ofertas', 'publicar', 'radar', 'audiencia', 'comunidade', 'plano'],
  diaDaSemana: 1,
  ofertasPendentes: 5,
  enviosWhatsappPendentes: 3,
  artesStatus: 3,
  lugaresLiberados: 1,
  mensagensPendentes: 2,
  tarefaDaSemana: { titulo: 'Preencher a matriz de nicho' },
  roteiroVideoPronto: true,
};

describe('roteiro (seção 5.14)', () => {
  it('catálogo com prioridades e minutos da tabela', () => {
    expect(CATALOGO.map((t) => [t.id, t.prioridade, t.minutos])).toEqual([
      ['aprovar_ofertas', 1, 5],
      ['enviar_bloco_wa', 1, 5],
      ['divulgar_link', 2, 3],
      ['status_wa', 2, 3],
      ['seguidores_wa', 2, 2],
      ['caixa_mensagens', 2, 5],
      ['tarefa_semana', 3, 10],
      ['video_curto', 3, 9],
    ]);
  });
  it('20 min: inclui o que cabe e pula o que não cabe, seguindo para a próxima', () => {
    const r = montarRoteiro(tarefasDoDia(TUDO), 20);
    // 5+5+3+3+2 = 18; caixa (5) não cabe; tarefa da semana (10) e vídeo (9) não cabem.
    expect(r.incluidas.map((t) => t.id)).toEqual(['aprovar_ofertas', 'enviar_bloco_wa', 'divulgar_link', 'status_wa', 'seguidores_wa']);
    expect(r.usados).toBe(18);
    expect(r.ficaram).toBe(3);
    expect(rodapeRoteiro(r)).toBe('18 min de 20 disponíveis. 3 tarefas ficam para quando você tiver mais tempo.');
  });
  it('pula tarefa grande e ainda pega a menor depois', () => {
    const t: Tarefa[] = [
      { ...CATALOGO[0], minutos: 8 },
      { ...CATALOGO[6], minutos: 5 },
      { ...CATALOGO[7], minutos: 2 },
    ];
    const r = montarRoteiro(t, 10);
    expect(r.incluidas.map((x) => x.minutos)).toEqual([8, 2]);
  });
  it('10 e 40 min', () => {
    expect(montarRoteiro(tarefasDoDia(TUDO), 10).incluidas.map((t) => t.id)).toEqual(['aprovar_ofertas', 'enviar_bloco_wa']);
    const r40 = montarRoteiro(tarefasDoDia(TUDO), 40);
    // 5+5+3+3+2+5 = 23; +10 = 33; vídeo 9 não cabe.
    expect(r40.usados).toBe(33);
    expect(r40.ficaram).toBe(1);
    expect(rodapeRoteiro(r40)).toBe('33 min de 40 disponíveis. 1 tarefa fica para quando você tiver mais tempo.');
  });
  it('tudo cabe', () => {
    const r = montarRoteiro(tarefasDoDia({ diaDaSemana: 3, ofertasPendentes: 2, enviosWhatsappPendentes: 0, artesStatus: 0 }), 20);
    expect(rodapeRoteiro(r)).toBe('5 min de 20 disponíveis. Tudo do dia cabe no seu tempo.');
  });
  it('V1: só tarefas de telas que já existem', () => {
    const ids = tarefasDoDia({ ...TUDO, telasProntas: undefined }).map((t) => t.id);
    expect(ids).toEqual(['aprovar_ofertas', 'enviar_bloco_wa', 'status_wa']);
  });
  it('tarefas sem objeto no dia não aparecem', () => {
    const ids = tarefasDoDia({
      ...TUDO,
      diaDaSemana: 2,
      ofertasPendentes: 0,
      enviosWhatsappPendentes: 0,
      lugaresLiberados: 0,
      mensagensPendentes: 0,
      tarefaDaSemana: null,
      roteiroVideoPronto: false,
    }).map((t) => t.id);
    expect(ids).toEqual(['status_wa']);
  });
  it('seguidores do WhatsApp só às segundas', () => {
    expect(tarefasDoDia({ ...TUDO, diaDaSemana: 2 }).some((t) => t.id === 'seguidores_wa')).toBe(false);
    expect(tarefasDoDia(TUDO).some((t) => t.id === 'seguidores_wa')).toBe(true);
  });
  it('tarefa da semana usa o título do plano e minutos recalibrados', () => {
    const t = tarefasDoDia({ ...TUDO, minutosRecalibrados: { aprovar_ofertas: 7 } });
    expect(t.find((x) => x.id === 'tarefa_semana')?.titulo).toBe('Preencher a matriz de nicho');
    expect(t.find((x) => x.id === 'aprovar_ofertas')?.minutos).toBe(7);
  });
});

describe('tempo (seção 5.15)', () => {
  const s = (inicio: string, fim: string | null, montagem = false, ultima: string | null = null) => ({ inicio, fim, montagem, ultima_atividade: ultima });

  it('duração e texto', () => {
    expect(duracaoMin(s('2026-11-02T23:00:00Z', '2026-11-03T00:05:00Z'))).toBe(65);
    expect(duracaoMin(s('2026-11-02T23:00:00Z', null), new Date('2026-11-02T23:30:00Z'))).toBe(30);
    expect(duracaoTexto(65)).toBe('1 h 05 min');
    expect(duracaoTexto(45)).toBe('45 min');
  });
  it('só montagem fica fora das horas válidas', () => {
    const lista = [s('2026-11-02T10:00:00Z', '2026-11-02T11:00:00Z'), s('2026-11-02T12:00:00Z', '2026-11-02T14:00:00Z', true), s('2026-11-02T20:00:00Z', '2026-11-02T20:30:00Z')];
    const de = new Date('2026-11-02T00:00:00Z');
    const ate = new Date('2026-11-03T00:00:00Z');
    expect(horasValidas(lista, de, ate)).toBeCloseTo(1.5);
    expect(horasMontagem(lista, de, ate)).toBeCloseTo(2);
  });
  it('recorta no período e conta a aberta até agora', () => {
    const lista = [s('2026-10-31T23:00:00Z', '2026-11-01T01:00:00Z'), s('2026-11-02T10:00:00Z', null)];
    const de = new Date('2026-11-01T00:00:00Z');
    const ate = new Date('2026-12-01T00:00:00Z');
    expect(horasValidas(lista, de, ate, new Date('2026-11-02T10:30:00Z'))).toBeCloseTo(1.5);
  });
  it('comissão por hora nunca estima', () => {
    expect(comissaoPorHora(null, 10)).toBeNull();
    expect(comissaoPorHora(100, 0)).toBeNull();
    expect(comissaoPorHora(73.7, 10)).toBeCloseTo(7.37);
  });
  it('fecha sozinha no último uso depois de 2 horas sem atividade', () => {
    const aberta = s('2026-11-02T20:00:00Z', null, false, '2026-11-02T20:40:00Z');
    expect(fechamentoAutomatico(aberta, new Date('2026-11-02T22:39:00Z'), 2)).toBeNull();
    expect(fechamentoAutomatico(aberta, new Date('2026-11-02T22:40:00Z'), 2)).toBe('2026-11-02T20:40:00.000Z');
    expect(fechamentoAutomatico(s('2026-11-02T20:00:00Z', null), new Date('2026-11-02T23:00:00Z'), 2)).toBe('2026-11-02T20:00:00.000Z');
    expect(fechamentoAutomatico(s('2026-11-02T20:00:00Z', '2026-11-02T21:00:00Z'), new Date('2026-11-03T20:00:00Z'), 2)).toBeNull();
  });
  it('valida lançamento manual', () => {
    const agora = new Date('2026-11-02T23:00:00Z');
    expect(validarSessaoManual({ inicio: '2026-11-02T20:00:00Z', fim: '2026-11-02T19:00:00Z' }, [], agora)).toMatch(/depois do início/);
    expect(validarSessaoManual({ inicio: '2026-11-03T20:00:00Z', fim: null }, [], agora)).toMatch(/futuro/);
    expect(validarSessaoManual({ inicio: '2026-11-01T00:00:00Z', fim: '2026-11-02T00:00:00Z' }, [], agora)).toMatch(/no máximo/);
    const outra = [s('2026-11-02T19:30:00Z', '2026-11-02T20:30:00Z')];
    expect(validarSessaoManual({ inicio: '2026-11-02T20:00:00Z', fim: '2026-11-02T21:00:00Z' }, outra, agora)).toMatch(/sobrepõe/);
    expect(validarSessaoManual({ inicio: '2026-11-02T20:30:00Z', fim: '2026-11-02T21:00:00Z' }, outra, agora)).toBeNull();
  });
  it('registra o último uso no máximo a cada 5 minutos', () => {
    expect(deveRegistrarAtividade(null, 0)).toBe(true);
    expect(deveRegistrarAtividade(0, 4 * 60_000)).toBe(false);
    expect(deveRegistrarAtividade(0, 5 * 60_000)).toBe(true);
  });
});
