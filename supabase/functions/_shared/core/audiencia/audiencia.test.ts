import { describe, expect, it } from 'vitest';
import {
  calcularEngajamento,
  calcularFunil,
  calcularTotais,
  idsMisturadas,
  inicioDaSemana,
  leituraPorOrigem,
  lerDivulgacoes,
  linhaDeBaseEmConstrucao,
  pedirRegistroWa,
  podeLerPrint,
  serieCrescimento,
  totalValido,
  type Divulgacao,
  type RegistroSeguidores,
} from './index.ts';
import { interpretarChatMember } from './membros.ts';
import { analistaPrint } from '../contratos/analista-print.ts';
import { contrato } from '../contratos/index.ts';

const AGORA = new Date('2026-11-16T15:00:00Z'); // segunda, 12h em Brasília
const h = (iso: string) => new Date(iso);

describe('semana e validação', () => {
  it('segunda-feira da semana', () => {
    expect(inicioDaSemana('2026-11-16')).toBe('2026-11-16');
    expect(inicioDaSemana('2026-11-22')).toBe('2026-11-16'); // domingo
    expect(inicioDaSemana('2026-11-18')).toBe('2026-11-16');
  });
  it('total aceito', () => {
    expect(totalValido(0)).toBe(true);
    expect(totalValido(120)).toBe(true);
    expect(totalValido(-1)).toBe(false);
    expect(totalValido(1.5)).toBe(false);
    expect(totalValido(Number.NaN)).toBe(false);
    expect(totalValido(20_000_000)).toBe(false);
  });
});

describe('totais', () => {
  it('sem nenhum dado: tudo null (a tela mostra "aguardando dados")', () => {
    const t = calcularTotais([], [], AGORA);
    expect(t).toEqual({ seguidoresWa: null, inscritosTg: null, novosNaSemana: null, deixaramDeSeguir: null, linhaDeBaseWa: null });
  });
  it('primeiro registro do WhatsApp vira a linha de base, sem novos nem saídas', () => {
    const rs: RegistroSeguidores[] = [{ canal: 'wa', data: '2026-11-09', total: 50 }];
    const t = calcularTotais(rs, [], AGORA);
    expect(t.seguidoresWa).toBe(50);
    expect(t.linhaDeBaseWa?.data).toBe('2026-11-09');
    expect(t.novosNaSemana).toBeNull();
  });
  it('WhatsApp: alta vira novos, queda vira "deixaram de seguir"; Telegram pelos eventos', () => {
    const rs: RegistroSeguidores[] = [
      { canal: 'wa', data: '2026-11-09', total: 50 },
      { canal: 'wa', data: '2026-11-16', total: 45 },
      { canal: 'tg', data: '2026-11-15', total: 30 },
    ];
    const ev = [
      { tipo: 'entrou' as const, em: h('2026-11-15T10:00:00Z') },
      { tipo: 'entrou' as const, em: h('2026-11-12T10:00:00Z') },
      { tipo: 'saiu' as const, em: h('2026-11-14T10:00:00Z') },
      { tipo: 'entrou' as const, em: h('2026-11-01T10:00:00Z') }, // fora dos 7 dias
    ];
    const t = calcularTotais(rs, ev, AGORA);
    expect(t.seguidoresWa).toBe(45);
    expect(t.inscritosTg).toBe(30);
    expect(t.novosNaSemana).toBe(2);
    expect(t.deixaramDeSeguir).toBe(1 + 5);
  });
  it('sem registro do bot, eventos não viram zero inventado', () => {
    const t = calcularTotais([], [{ tipo: 'entrou', em: h('2026-11-15T10:00:00Z') }], AGORA);
    expect(t.novosNaSemana).toBeNull();
  });
  it('linha de base em construção até 14 dias de registros', () => {
    expect(linhaDeBaseEmConstrucao([])).toBe(true);
    expect(linhaDeBaseEmConstrucao([{ canal: 'wa', data: '2026-11-02', total: 1 }, { canal: 'tg', data: '2026-11-15', total: 1 }])).toBe(true);
    expect(linhaDeBaseEmConstrucao([{ canal: 'wa', data: '2026-11-02', total: 1 }, { canal: 'wa', data: '2026-11-16', total: 1 }])).toBe(false);
  });
});

describe('entradas por origem (48 horas)', () => {
  const divs: Divulgacao[] = [
    { id: 'a', origem: 'lugar-a', lugar: 'Lugar de teste A', em: h('2026-11-05T12:00:00Z') },
    { id: 'b', origem: 'lugar-b', lugar: 'Lugar de teste B', em: h('2026-11-09T12:00:00Z') },
    { id: 'c', origem: 'lugar-c', lugar: 'Lugar de teste C', em: h('2026-11-10T12:00:00Z') }, // 24 h depois de B
    { id: 'd', origem: 'lugar-a', lugar: 'Lugar de teste A', em: h('2026-11-15T12:00:00Z') }, // janela aberta
  ];
  it('marca como misturadas as divulgações a menos de 48 h uma da outra', () => {
    expect([...idsMisturadas(divs)].sort()).toEqual(['b', 'c']);
    expect(idsMisturadas([divs[0], { ...divs[1], em: h('2026-11-07T12:00:00Z') }]).size).toBe(0); // exatamente 48 h: limpa
  });
  it('conta cliques da origem e entradas do Telegram dentro da janela', () => {
    const cliques = [
      { origem: 'lugar-a', em: h('2026-11-05T13:00:00Z') },
      { origem: 'lugar-a', em: h('2026-11-07T11:59:00Z') },
      { origem: 'lugar-a', em: h('2026-11-07T12:00:00Z') }, // fim da janela, fora
      { origem: 'lugar-b', em: h('2026-11-05T13:00:00Z') }, // outra origem
    ];
    const ev = [
      { tipo: 'entrou' as const, em: h('2026-11-06T00:00:00Z') },
      { tipo: 'saiu' as const, em: h('2026-11-06T01:00:00Z') },
    ];
    const ls = lerDivulgacoes(divs, cliques, ev, AGORA, true);
    const a = ls.find((l) => l.divulgacao.id === 'a')!;
    expect(a).toMatchObject({ cliques: 2, novosTelegram: 1, estado: 'limpa' });
    expect(ls.find((l) => l.divulgacao.id === 'b')!.estado).toBe('misturada');
    expect(ls.find((l) => l.divulgacao.id === 'd')!.estado).toBe('aguardando');
    expect(lerDivulgacoes(divs, cliques, ev, AGORA, false)[0].novosTelegram).toBeNull();
  });
  it('uma linha por origem, com a última divulgação', () => {
    const linhas = leituraPorOrigem(lerDivulgacoes(divs, [], [], AGORA, true));
    expect(linhas.map((l) => l.divulgacao.id)).toEqual(['d', 'c', 'b']);
  });
});

describe('funil e engajamento', () => {
  const conv = [
    { dia: '2026-11-15', sub1: 'wa', cliques: 40, pedidos: 2, comissao: 6.5 },
    { dia: '2026-11-14', sub1: 'tg', cliques: 10, pedidos: 1, comissao: 3 },
    { dia: '2026-11-14', sub1: 'at', cliques: 99, pedidos: 9, comissao: 99 }, // Atendente não entra
    { dia: '2026-11-01', sub1: 'wa', cliques: 99, pedidos: 9, comissao: 99 }, // fora da semana
  ];
  it('sem fontes: tudo null', () => {
    const f = calcularFunil({ totais: calcularTotais([], [], AGORA), cliquesEntrada: null, conversoes: null, hoje: '2026-11-16' });
    expect(Object.values(f).every((v) => v === null)).toBe(true);
  });
  it('taxas aproximadas do mesmo período', () => {
    const rs: RegistroSeguidores[] = [
      { canal: 'wa', data: '2026-11-09', total: 40 },
      { canal: 'wa', data: '2026-11-16', total: 50 },
      { canal: 'tg', data: '2026-11-16', total: 50 },
    ];
    const f = calcularFunil({ totais: calcularTotais(rs, [], AGORA), cliquesEntrada: 20, conversoes: conv, hoje: '2026-11-16' });
    expect(f.novosSeguidores).toBe(10);
    expect(f.viramSeguidores).toBeCloseTo(0.5);
    expect(f.cliquesOfertas).toBe(50);
    expect(f.cliquesPorSeguidor).toBeCloseTo(0.5);
    expect(f.pedidos).toBe(3);
    expect(f.viramPedidos).toBeCloseTo(0.06);
  });
  it('engajamento por canal (sub1)', () => {
    const e = calcularEngajamento({ postsPorCanal: { wa: 20, tg: 0 }, conversoes: conv, hoje: '2026-11-16' });
    expect(e[0]).toEqual({ canal: 'wa', posts: 20, cliquesPorPost: 2, pedidos: 2, comissao: 6.5 });
    expect(e[1]).toEqual({ canal: 'tg', posts: 0, cliquesPorPost: null, pedidos: 1, comissao: 3 });
    expect(calcularEngajamento({ postsPorCanal: null, conversoes: null, hoje: '2026-11-16' })[0].posts).toBeNull();
  });
});

describe('gráfico de crescimento', () => {
  it('só depois de duas semanas; repete o último valor conhecido', () => {
    expect(serieCrescimento([{ canal: 'wa', data: '2026-11-02', total: 10 }])).toBeNull();
    const s = serieCrescimento([
      { canal: 'wa', data: '2026-11-02', total: 10 },
      { canal: 'tg', data: '2026-11-03', total: 5 },
      { canal: 'wa', data: '2026-11-16', total: 14 },
    ])!;
    expect(s).toHaveLength(15);
    expect(s[0]).toEqual({ data: '2026-11-02', wa: 10, tg: null });
    expect(s[7]).toEqual({ data: '2026-11-09', wa: 10, tg: 5 });
    expect(s[14]).toEqual({ data: '2026-11-16', wa: 14, tg: 5 });
  });
});

describe('registro semanal e print', () => {
  it('pede o registro do WhatsApp só na segunda, se ainda não houver nesta semana', () => {
    expect(pedirRegistroWa([], AGORA)).toBe(true);
    expect(pedirRegistroWa([{ canal: 'wa', data: '2026-11-16', total: 1 }], AGORA)).toBe(false);
    expect(pedirRegistroWa([{ canal: 'wa', data: '2026-11-09', total: 1 }], AGORA)).toBe(true);
    expect(pedirRegistroWa([], h('2026-11-17T15:00:00Z'))).toBe(false);
  });
  it('limite de leituras de print por semana', () => {
    expect(podeLerPrint(3)).toBe(true);
    expect(podeLerPrint(4)).toBe(false);
  });
  it('contrato analista-print/v1 registrado; simulado não inventa número', () => {
    expect(contrato('analista-print/v1')).toBe(analistaPrint);
    const e = { leitura_id: '6f1c2a3e-0000-4000-8000-000000000001', canal: 'wa' as const, imagem_url: 'https://exemplo.invalid/print.png' };
    expect(analistaPrint.entrada.safeParse(e).success).toBe(true);
    const s = analistaPrint.simular(e);
    expect(analistaPrint.saida.parse(s).numero).toBeNull();
    expect(analistaPrint.saida.safeParse({ numero: -3, trecho: '', confianca: 'alta' }).success).toBe(false);
    expect(analistaPrint.saida.safeParse({ numero: 1.5, trecho: '', confianca: 'alta' }).success).toBe(false);
  });
});

describe('chat_member do Telegram', () => {
  const upd = (antes: object, depois: object, chat: object = { id: -1001 }) => ({
    update_id: 7,
    chat_member: { chat, date: 1_763_300_000, old_chat_member: antes, new_chat_member: depois },
  });
  it('entrou e saiu', () => {
    expect(interpretarChatMember(upd({ status: 'left' }, { status: 'member' }), '-1001')).toMatchObject({ tipo: 'entrou', updateId: 7 });
    expect(interpretarChatMember(upd({ status: 'member' }, { status: 'kicked' }), '-1001')?.tipo).toBe('saiu');
    expect(interpretarChatMember(upd({ status: 'restricted', is_member: false }, { status: 'restricted', is_member: true }), '-1001')?.tipo).toBe('entrou');
  });
  it('ignora mudança de cargo, outro chat e update de outro tipo', () => {
    expect(interpretarChatMember(upd({ status: 'member' }, { status: 'administrator' }), '-1001')).toBeNull();
    expect(interpretarChatMember(upd({ status: 'left' }, { status: 'member' }, { id: -999 }), '-1001')).toBeNull();
    expect(interpretarChatMember({ update_id: 1, message: {} }, '-1001')).toBeNull();
    expect(interpretarChatMember(upd({ status: 'left' }, { status: 'member' }, { id: -5, username: 'canalteste' }), '@CanalTeste')?.tipo).toBe('entrou');
  });
});
