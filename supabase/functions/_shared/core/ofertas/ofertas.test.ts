import { describe, expect, it } from 'vitest';
import { curadoria, entradaCuradoria, saidaCuradoria, type CandidataCuradoria, type EntradaCuradoria } from '../contratos/curadoria.ts';
import { redacao, saidaRedacao } from '../contratos/redacao.ts';
import { contrato } from '../contratos/index.ts';
import { aplicarSaidaCuradoria, MAX_OPCOES_PEDIDO } from './curadoria.ts';
import { aplicarSaidaRedacao, juntarNoLote, loteRedacao, devolverSemVersao } from './redacao.ts';
import {
  comissaoEstimada,
  estadoDaTela,
  estaExpirada,
  filtrarOfertas,
  interpretarPedido,
  lerValor,
  ordenarFila,
  podeDecidir,
  rotuloAprovadas,
  validarCanais,
  validarFrase,
  validarMotivoPulo,
  type OfertaFila,
} from './fila.ts';
import { mostraDePor, previaDoPost, LINK_NA_PREVIA } from './previa.ts';

// Dados claramente fictícios.
const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

function candidata(n: number, extra: Partial<CandidataCuradoria> = {}): CandidataCuradoria {
  return {
    produto_id: ID(n),
    nome: `Produto de teste ${n}`,
    nicho_id: ID(900),
    nicho_nome: 'Nicho de teste',
    fora_nicho_principal: false,
    imagem_url: null,
    url_produto: `https://exemplo.invalid/produto/${n}`,
    preco_atual: 50,
    preco_referencia: 70,
    desconto_real: 0.28,
    dias_historico: 20,
    historico_curto: false,
    comissao_taxa: 0.05,
    comissao_extra: false,
    comissao_estimada: 2.5,
    loja_nome: 'Loja de teste',
    loja_nota: 4.8,
    produto_nota: 4.7,
    vendas: 100,
    prazo: null,
    nota: 90 - n,
    nota_detalhe: { desconto: 30, comissao: 20, avaliacao: 15, aderencia: 10, prazo: 0 },
    alertas: [],
    ...extra,
  };
}

function entrada(cands: CandidataCuradoria[], extra: Partial<EntradaCuradoria> = {}): EntradaCuradoria {
  return entradaCuradoria.parse({
    data: '2026-11-02',
    tamanho_fila: 8,
    candidatas: cands,
    pedidos: [],
    nichos: [{ id: ID(900), nome: 'Nicho de teste', principal: true }],
    ...extra,
  });
}

const REGRAS = { fraseMax: 140, historicoCurtoDias: 7, jobId: ID(800) };

describe('contratos registrados', () => {
  it('curadoria/v1 e redacao/v1 estão no registro com as rotinas certas', () => {
    expect(contrato('curadoria/v1')?.rotina).toBe('pa-curadoria');
    expect(contrato('redacao/v1')?.rotina).toBe('pa-redacao');
  });
  it('a simulação respeita o próprio contrato e o tamanho da fila', () => {
    const e = entrada([1, 2, 3, 4].map((n) => candidata(n)), { tamanho_fila: 2, pedidos: [{ id: ID(500), texto: 'pedido de teste', preco_max: 60 }] });
    const s = curadoria.simular(e);
    expect(saidaCuradoria.safeParse(s).success).toBe(true);
    expect(s.ofertas.map((o) => o.produto_id)).toEqual([ID(1), ID(2)]);
    expect(s.ofertas[0].frase).toMatch(/simulado/);
    expect(s.pedidos[0].opcoes.length).toBe(2);
    const r = redacao.simular({ pedidos: [{ oferta_id: ID(1), tipo: 'outra_versao', versao: 2, nome: 'Produto de teste', nicho: null, preco_atual: 10, frase_atual: null, motivos: [], frase_max: 140 }] });
    expect(saidaRedacao.safeParse(r).success).toBe(true);
  });
  it('recusa entrada com data fora do formato', () => {
    expect(entradaCuradoria.safeParse({ data: '02/11/2026', tamanho_fila: 8, candidatas: [], pedidos: [], nichos: [] }).success).toBe(false);
  });
});

describe('aplicar saída da curadoria (o código decide)', () => {
  it('só aceita produtos das candidatas, sem repetir, até o tamanho da fila', () => {
    const e = entrada([1, 2, 3].map((n) => candidata(n)), { tamanho_fila: 2 });
    const r = aplicarSaidaCuradoria(
      e,
      saidaCuradoria.parse({
        ofertas: [
          { produto_id: ID(99), motivos: ['inventado'], frase: 'x' },
          { produto_id: ID(1), motivos: ['ok'], frase: 'Frase de teste' },
          { produto_id: ID(1), motivos: ['ok'], frase: 'Frase de teste' },
          { produto_id: ID(2), motivos: ['ok'], frase: null },
          { produto_id: ID(3), motivos: ['ok'], frase: null },
        ],
      }),
      REGRAS,
    );
    expect(r.ofertas.map((o) => o.produto_id)).toEqual([ID(1), ID(2)]);
    expect(r.descartes.length).toBe(3);
    expect(r.ofertas[0]).toMatchObject({ origem: 'rodada', preco_atual: 50, preco_referencia: 70, job_id: ID(800), data: '2026-11-02' });
  });

  it('histórico curto: alerta do código e sem preço "de"', () => {
    const e = entrada([candidata(1, { dias_historico: 3, historico_curto: true })]);
    const r = aplicarSaidaCuradoria(e, saidaCuradoria.parse({ ofertas: [{ produto_id: ID(1), motivos: ['ok'], frase: null }] }), REGRAS);
    expect(r.ofertas[0].preco_referencia).toBeNull();
    expect(r.ofertas[0].alertas[0]).toEqual({
      tipo: 'historico_curto',
      texto: 'Histórico de preço curto: observado há 3 dias. Confira o preço antes de aprovar.',
    });
  });

  it('frase acima do limite sai (post sem frase) com alerta; alertas de promessa ficam marcados', () => {
    const e = entrada([candidata(1)]);
    const longa = 'a'.repeat(141);
    const r = aplicarSaidaCuradoria(
      e,
      saidaCuradoria.parse({ ofertas: [{ produto_id: ID(1), motivos: ['ok'], frase: longa, alertas: [{ tipo: 'promessa', texto: 'Promessa sem base', trecho: 'garantido' }] }] }),
      REGRAS,
    );
    expect(r.ofertas[0].frase).toBeNull();
    expect(r.ofertas[0].alertas.map((a) => a.tipo)).toEqual(['promessa', 'frase_longa']);
    expect(r.ofertas[0].alertas[0].trecho).toBe('garantido');
  });

  it('pedidos: até 2 opções, dentro do preço máximo; só vão para a fila os marcados', () => {
    const cands = [candidata(1, { preco_atual: 40 }), candidata(2, { preco_atual: 80 }), candidata(3, { preco_atual: 45 }), candidata(4, { preco_atual: 30 })];
    const e = entrada(cands, {
      pedidos: [
        { id: ID(500), texto: 'pedido de teste A', preco_max: 50 },
        { id: ID(501), texto: 'pedido de teste B', preco_max: null },
        { id: ID(502), texto: 'pedido de teste C', preco_max: 10 },
      ],
    });
    const saida = saidaCuradoria.parse({
      ofertas: [],
      pedidos: [
        { pedido_id: ID(500), opcoes: [2, 1, 3, 4].map((n) => ({ produto_id: ID(n), motivos: ['ok'], frase: null })) },
        { pedido_id: ID(501), opcoes: [{ produto_id: ID(2), motivos: ['ok'], frase: null }] },
        { pedido_id: ID(502), opcoes: [{ produto_id: ID(1), motivos: ['ok'], frase: null }] },
        { pedido_id: ID(503), opcoes: [] },
      ],
    });
    const r = aplicarSaidaCuradoria(e, saida, { ...REGRAS, pedidosNaFila: new Set([ID(500)]) });
    expect(r.opcoes.filter((o) => o.pedido_id === ID(500)).map((o) => o.produto_id)).toEqual([ID(1), ID(3)]);
    expect(r.opcoes.filter((o) => o.pedido_id === ID(500)).length).toBeLessThanOrEqual(MAX_OPCOES_PEDIDO);
    expect(r.ofertas.map((o) => [o.origem, o.pedido_id, o.produto_id])).toEqual([
      ['pedido', ID(500), ID(1)],
      ['pedido', ID(500), ID(3)],
    ]);
    expect(r.pedidosComOpcao.sort()).toEqual([ID(500), ID(501)].sort());
    expect(r.pedidosSemOpcao).toEqual([ID(502)]);
    expect(r.descartes.some((d) => d.includes(ID(503)))).toBe(true);
  });
});

describe('outra versão (redação)', () => {
  const pedido = (id: string, versao: number) => ({ oferta_id: id, tipo: 'outra_versao' as const, versao, nome: 'Produto de teste', nicho: null, preco_atual: 10, frase_atual: 'velha', motivos: [], frase_max: 140 });

  it('lote de 5 minutos', () => {
    const a = loteRedacao(new Date('2026-11-02T15:03:20Z'));
    const b = loteRedacao(new Date('2026-11-02T15:04:59Z'));
    const c = loteRedacao(new Date('2026-11-02T15:05:00Z'));
    expect(a.chave).toBe(b.chave);
    expect(a.chave).not.toBe(c.chave);
    expect(a.dispararEm.toISOString()).toBe('2026-11-02T15:05:00.000Z');
    const l = juntarNoLote(juntarNoLote(null, pedido(ID(1), 2)), pedido(ID(1), 3));
    expect(l.pedidos).toEqual([pedido(ID(1), 3)]);
  });

  it('aplica só a versão esperada e só em quem espera redação', () => {
    const atuais = [
      { id: ID(1), estado: 'aguardando_redacao' as const, frase: 'velha', frase_versao: 1, alertas: [{ tipo: 'historico_curto', texto: 'curto' }, { tipo: 'promessa', texto: 'antiga' }] },
      { id: ID(2), estado: 'aprovada' as const, frase: 'velha', frase_versao: 1, alertas: [] },
      { id: ID(3), estado: 'aguardando_redacao' as const, frase: 'velha', frase_versao: 2, alertas: [] },
      { id: ID(4), estado: 'aguardando_redacao' as const, frase: 'velha', frase_versao: 1, alertas: [] },
    ];
    const saida = saidaRedacao.parse({
      textos: [
        { oferta_id: ID(1), tipo: 'outra_versao', frase: 'Frase nova de teste', alertas: [{ tipo: 'promessa', texto: 'nova' }] },
        { oferta_id: ID(2), tipo: 'outra_versao', frase: 'x' },
        { oferta_id: ID(3), tipo: 'outra_versao', frase: 'x' },
      ],
    });
    const r = aplicarSaidaRedacao({ pedidos: [pedido(ID(1), 2), pedido(ID(2), 2), pedido(ID(3), 2), pedido(ID(4), 2)] }, saida, atuais, 140);
    expect(r.map((x) => x.id)).toEqual([ID(1), ID(4)]);
    expect(r[0]).toMatchObject({ estado: 'pendente', frase: 'Frase nova de teste', frase_versao: 2 });
    expect(r[0].alertas.map((a) => a.texto)).toEqual(['curto', 'nova']);
    expect(r[1]).toMatchObject({ frase: 'velha', frase_versao: 1 });
    expect(r[1].alertas[0].tipo).toBe('sem_versao');
    expect(devolverSemVersao(atuais[0]).estado).toBe('pendente');
  });
});

describe('fila', () => {
  const oferta = (n: number, extra: Partial<OfertaFila> = {}): OfertaFila => ({
    id: ID(n),
    data: '2026-11-02',
    origem: 'rodada',
    pedido_id: null,
    nota: 50 + n,
    motivos: ['Motivo de teste'],
    alertas: [],
    fora_nicho_principal: false,
    preco_atual: 50,
    preco_referencia: null,
    dias_historico: 3,
    comissao_taxa: 0.03,
    comissao_extra: false,
    cupom: null,
    prazo: null,
    frase: null,
    frase_versao: 1,
    frase_editada: false,
    estado: 'pendente',
    produto: { nome: `Produto de teste ${n}`, imagem_url: null, url_produto: 'https://exemplo.invalid', nicho_id: ID(900), nicho_nome: 'Organização' },
    ...extra,
  });

  it('só a operadora decide (S2)', () => {
    expect(podeDecidir('operadora')).toBe(true);
    expect(podeDecidir('dono')).toBe(false);
    expect(podeDecidir(null)).toBe(false);
  });

  it('filtros: texto sem acento, nicho e só Comissão Extra', () => {
    const lista = [oferta(1, { comissao_extra: true }), oferta(2, { produto: { ...oferta(2).produto, nome: 'Organizador de gaveta', nicho_id: ID(901) } })];
    expect(filtrarOfertas(lista, { busca: 'organizacao', nichoId: null, soExtra: false }).length).toBe(2);
    expect(filtrarOfertas(lista, { busca: 'organizador', nichoId: null, soExtra: false }).length).toBe(1);
    expect(filtrarOfertas(lista, { busca: 'GAVETA', nichoId: null, soExtra: false }).map((o) => o.id)).toEqual([ID(2)]);
    expect(filtrarOfertas(lista, { busca: '', nichoId: ID(901), soExtra: false }).map((o) => o.id)).toEqual([ID(2)]);
    expect(filtrarOfertas(lista, { busca: '', nichoId: null, soExtra: true }).map((o) => o.id)).toEqual([ID(1)]);
  });

  it('ordem: pedidos primeiro, depois nota', () => {
    const r = ordenarFila([oferta(1), oferta(9), oferta(2, { origem: 'pedido' })]);
    expect(r.map((o) => o.id)).toEqual([ID(2), ID(9), ID(1)]);
  });

  it('estados da tela e contador', () => {
    expect(estadoDaTela({ carregando: true, total: 0, naFila: 0 })).toBe('carregando');
    expect(estadoDaTela({ carregando: false, total: 0, naFila: 0 })).toBe('vazio');
    expect(estadoDaTela({ carregando: false, total: 3, naFila: 0 })).toBe('tudo_revisado');
    expect(estadoDaTela({ carregando: false, total: 3, naFila: 1 })).toBe('com_ofertas');
    expect(rotuloAprovadas(1)).toBe('1 aprovada hoje');
    expect(rotuloAprovadas(0)).toBe('0 aprovadas hoje');
  });

  it('expirada pelo estado ou pelo prazo', () => {
    const agora = new Date('2026-11-02T20:00:00Z');
    expect(estaExpirada({ estado: 'expirada', prazo: null }, agora)).toBe(true);
    expect(estaExpirada({ estado: 'pendente', prazo: '2026-11-02T19:59:00Z' }, agora)).toBe(true);
    expect(estaExpirada({ estado: 'pendente', prazo: '2026-11-02T21:00:00Z' }, agora)).toBe(false);
    expect(estaExpirada({ estado: 'pendente', prazo: null }, agora)).toBe(false);
  });

  it('comissão estimada = preço × taxa', () => {
    expect(comissaoEstimada(89.9, 0.03)).toBe(2.7);
    expect(comissaoEstimada(50, null)).toBeNull();
    expect(comissaoEstimada(50, 0)).toBeNull();
  });

  it('validações das ações', () => {
    expect(validarFrase('  oi   amiga ', 140)).toEqual({ ok: true, valor: 'oi amiga' });
    expect(validarFrase('', 140)).toEqual({ ok: true, valor: null });
    expect(validarFrase('a'.repeat(141), 140).ok).toBe(false);
    expect(validarCanais(['tg', 'wa', 'wa'])).toEqual({ ok: true, valor: ['wa', 'tg'] });
    expect(validarCanais([]).ok).toBe(false);
    expect(validarCanais(['sms']).ok).toBe(false);
    expect(validarMotivoPulo('  ')).toEqual({ ok: true, valor: null });
    expect(validarMotivoPulo('x'.repeat(201)).ok).toBe(false);
  });

  it('pedido "procure [produto] até R$ [valor]"', () => {
    expect(interpretarPedido('organizador de geladeira até R$ 50')).toEqual({ ok: true, valor: { texto: 'organizador de geladeira', preco_max: 50 } });
    expect(interpretarPedido('procure fone sem fio ate 89,90')).toEqual({ ok: true, valor: { texto: 'fone sem fio', preco_max: 89.9 } });
    expect(interpretarPedido('Procure kit de potes')).toEqual({ ok: true, valor: { texto: 'kit de potes', preco_max: null } });
    expect(interpretarPedido('mesa até R$ 1.250,00')).toEqual({ ok: true, valor: { texto: 'mesa', preco_max: 1250 } });
    expect(interpretarPedido('até R$ 50').ok).toBe(false);
    expect(interpretarPedido('   ').ok).toBe(false);
    expect(lerValor('1.234,56')).toBe(1234.56);
  });
});

describe('prévia do post (seção 5.4)', () => {
  const R = { historicoCurtoDias: 7, descontoRealMinimo: 0.1 };
  const base = { titulo: 'Produto de teste A', preco_atual: 63, preco_referencia: 70, dias_historico: 20, cupom: null, prazo: null, frase: null };

  it('de/por só com histórico e desconto real', () => {
    expect(mostraDePor(base, R)).toBe(true);
    expect(mostraDePor({ ...base, preco_atual: 63.01 }, R)).toBe(false);
    expect(mostraDePor({ ...base, dias_historico: 6 }, R)).toBe(false);
    expect(mostraDePor({ ...base, preco_referencia: null }, R)).toBe(false);
  });

  it('formato completo e mínimo; sempre com "Link com comissão"', () => {
    const completo = previaDoPost({ ...base, cupom: 'CUPOMTESTE', frase: 'Frase de teste.', prazo: '2026-11-25T02:59:00Z' }, R);
    expect(completo.split('\n')).toEqual([
      '*Produto de teste A*',
      'De R$ 70,00 por R$ 63,00',
      'Cupom: CUPOMTESTE',
      'Frase de teste.',
      LINK_NA_PREVIA,
      'Oferta válida até 24/11 às 23:59 | Link com comissão',
    ]);
    const minimo = previaDoPost({ ...base, dias_historico: 2 }, R);
    expect(minimo.split('\n')).toEqual(['*Produto de teste A*', 'Por R$ 63,00', LINK_NA_PREVIA, 'Link com comissão']);
  });
});
