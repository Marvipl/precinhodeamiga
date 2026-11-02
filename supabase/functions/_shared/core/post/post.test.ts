import { describe, expect, it } from 'vitest';
import { formatarPost, temAvisoComissao, escaparHtml } from './formato.ts';
import { distribuirHorarios, planejarBloco, blocosLigados, contaNaCadencia } from './agenda.ts';
import { checarAntesDoEnvio, checarCadencia, checarMontagem, checarRepeticao, liberadoParaTelegram, resolverDePor } from './guardia.ts';
import { chaveProduto, checarLinkAfiliado, itemDoLink, montarSubIds } from './links.ts';
import { mediana, resumoHistorico } from './historico.ts';

const REGRAS = { intervaloMaxMin: 40, intervaloMinMin: 20 };
const REGRAS_DEPOR = { descontoRealMinimo: 0.1, historicoCurtoDias: 7 };
const LINK = 'https://s.shopee.com.br/link-de-teste';

describe('formato padrão do post (5.4)', () => {
  it('WhatsApp completo', () => {
    const t = formatarPost(
      { titulo: 'Produto de teste A', preco_atual: 149.9, preco_referencia: 199.9, cupom: 'CUPOMTESTE', frase: 'Frase de teste.', link: LINK, prazo: '2026-12-03T02:59:00Z' },
      'wa',
    );
    expect(t.split('\n')).toEqual([
      '*Produto de teste A*',
      'De R$ 199,90 por R$ 149,90',
      'Cupom: CUPOMTESTE',
      'Frase de teste.',
      LINK,
      'Oferta válida até 2/12 às 23:59 | Link com comissão',
    ]);
  });
  it('sem de/por, cupom, frase e prazo', () => {
    const t = formatarPost({ titulo: 'Produto de teste B', preco_atual: 10, link: LINK }, 'wa');
    expect(t.split('\n')).toEqual(['*Produto de teste B*', 'Por R$ 10,00', LINK, 'Link com comissão']);
  });
  it('referência que não é maior que o preço atual não vira de/por', () => {
    expect(formatarPost({ titulo: 'X', preco_atual: 10, preco_referencia: 10, link: LINK }, 'wa')).toContain('Por R$ 10,00');
  });
  it('Telegram em HTML com escape', () => {
    const t = formatarPost({ titulo: 'Kit <teste> & cia', preco_atual: 5, frase: 'a < b', link: LINK }, 'tg');
    expect(t.split('\n')[0]).toBe('<b>Kit &lt;teste&gt; &amp; cia</b>');
    expect(t).toContain('a &lt; b');
    expect(escaparHtml('&')).toBe('&amp;');
  });
  it('todo formato tem o aviso de comissão (5.1 item 3)', () => {
    for (const canal of ['wa', 'tg'] as const) {
      for (const prazo of [null, '2026-12-01T10:00:00Z']) {
        expect(temAvisoComissao(formatarPost({ titulo: 'Y', preco_atual: 1, link: LINK, prazo }, canal))).toBe(true);
      }
    }
  });
});

describe('distribuição no bloco (5.6)', () => {
  it('exemplos do documento', () => {
    expect(distribuirHorarios({ inicio: '20:00', fim: '23:00', n: 3, ...REGRAS })).toEqual(['20:00', '20:40', '21:20']);
    expect(distribuirHorarios({ inicio: '20:00', fim: '23:00', n: 6, ...REGRAS })).toEqual(['20:00', '20:30', '21:00', '21:30', '22:00', '22:30']);
    const dez = distribuirHorarios({ inicio: '20:00', fim: '23:00', n: 10, inicioLimite: '18:00', ...REGRAS });
    expect(dez[0]).toBe('19:40');
    expect(dez).toHaveLength(10);
    expect(dez[9]).toBe('22:40');
  });
  it('não recua antes do limite e devolve só o que cabe', () => {
    const v = distribuirHorarios({ inicio: '20:00', fim: '23:00', n: 20, inicioLimite: '18:00', ...REGRAS });
    expect(v[0]).toBe('18:00');
    expect(v).toHaveLength(15);
  });
  it('bloco do almoço não recua', () => {
    const b = blocosLigados({ blocoAlmoco: { inicio: '12:00', fim: '13:30', ligado: true }, blocoNoite: { inicio: '20:00', fim: '23:00', ligado: true }, inicioLimitePico: '18:00' });
    expect(b.map((x) => [x.nome, x.inicioLimite])).toEqual([['almoco', '12:00'], ['noite', '18:00']]);
  });
  it('planeja com o bloco ainda por começar e com o bloco andando', () => {
    const bloco = { nome: 'noite' as const, inicio: '20:00', fim: '23:00', inicioLimite: '18:00' };
    const regras = { ...REGRAS, checagemAntesEnvioMin: 5 };
    const antes = planejarBloco({ data: '2026-11-02', bloco, fixos: [], moveis: 3, agora: new Date('2026-11-02T15:00:00Z'), regras })!;
    expect(antes.map((d) => d.toISOString())).toEqual(['2026-11-02T23:00:00.000Z', '2026-11-02T23:40:00.000Z', '2026-11-03T00:20:00.000Z']);
    // 21:10 em Brasília, um post já publicado às 20:00
    const andando = planejarBloco({ data: '2026-11-02', bloco, fixos: [new Date('2026-11-02T23:00:00Z')], moveis: 1, agora: new Date('2026-11-03T00:10:00Z'), regras })!;
    expect(andando[0].toISOString()).toBe('2026-11-03T00:16:00.000Z');
    // 22:59: não cabe mais
    expect(planejarBloco({ data: '2026-11-02', bloco, fixos: [], moveis: 1, agora: new Date('2026-11-03T01:59:00Z'), regras })).toBeNull();
  });
  it('não enviado não conta na cadência', () => {
    expect(contaNaCadencia('nao_enviado')).toBe(false);
    expect(contaNaCadencia('enviado')).toBe(true);
    expect(contaNaCadencia('bloqueado')).toBe(false);
  });
});

describe('Guardiã (5.3)', () => {
  it('histórico curto tira o de/por', () => {
    const r = resolverDePor({ precoAtual: 80, mediana: 100, diasHistorico: 3 }, REGRAS_DEPOR);
    expect(r.precoReferencia).toBeNull();
    expect(r.checagens[0]).toMatchObject({ checagem: 'historico_curto', ok: false, efeito: 'ajusta' });
    expect(r.checagens[0].mensagem).toContain('observado há 3 dias');
  });
  it('de/por só com a mediana e desconto real', () => {
    expect(resolverDePor({ precoAtual: 90, mediana: 100, diasHistorico: 10 }, REGRAS_DEPOR).precoReferencia).toBe(100);
    expect(resolverDePor({ precoAtual: 91, mediana: 100, diasHistorico: 10 }, REGRAS_DEPOR).precoReferencia).toBeNull();
    expect(resolverDePor({ precoAtual: 50, mediana: 100, diasHistorico: 10, deProposto: 150 }, REGRAS_DEPOR).precoReferencia).toBeNull();
    expect(resolverDePor({ precoAtual: 50, mediana: null, diasHistorico: 10 }, REGRAS_DEPOR).precoReferencia).toBeNull();
  });
  it('de manual (F-16)', () => {
    const base = { precoAtual: 50, mediana: 80, diasHistorico: 10, maximoJanela: 100 };
    expect(resolverDePor({ ...base, deManual: 90 }, REGRAS_DEPOR).precoReferencia).toBe(90);
    expect(resolverDePor({ ...base, deManual: 120 }, REGRAS_DEPOR).precoReferencia).toBeNull();
    expect(resolverDePor({ ...base, mediana: null, maximoJanela: null, deManual: 90 }, REGRAS_DEPOR).precoReferencia).toBeNull();
    expect(resolverDePor({ ...base, deManual: 40 }, REGRAS_DEPOR).precoReferencia).toBeNull();
  });
  it('montagem bloqueia sem aviso ou com link de outro canal', () => {
    const subWa = montarSubIds({ destino: 'wa', postId: 'p-1', blocoData: '2026-11-02', origem: 'rodada' });
    const ok = checarMontagem({ texto: `x\n${LINK}\nLink com comissão`, link: LINK, canal: 'wa', subIds: subWa });
    expect(ok.every((c) => c.ok)).toBe(true);
    const semAviso = checarMontagem({ texto: `x\n${LINK}`, link: LINK, canal: 'wa', subIds: subWa });
    expect(semAviso.find((c) => c.checagem === 'aviso_comissao')).toMatchObject({ ok: false, efeito: 'bloqueia' });
    const outroCanal = checarMontagem({ texto: `x\n${LINK}\nLink com comissão`, link: LINK, canal: 'tg', subIds: subWa });
    expect(outroCanal.find((c) => c.checagem === 'link_afiliado')?.ok).toBe(false);
    expect(checarLinkAfiliado('http://shopee.com.br/x', 'wa', null).ok).toBe(false);
    expect(checarLinkAfiliado('https://golpe.example/x', 'wa', null).ok).toBe(false);
  });
  it('repetição de 48 horas por canal e cadência', () => {
    const existentes = [{ chave_produto: 'shopee:1:2', canal: 'wa' as const, agendado_para: '2026-11-01T23:00:00Z', estado: 'enviado' }];
    expect(checarRepeticao({ chave: 'shopee:1:2', canal: 'wa', horario: new Date('2026-11-02T23:00:00Z'), existentes, horas: 48 }).ok).toBe(false);
    expect(checarRepeticao({ chave: 'shopee:1:2', canal: 'tg', horario: new Date('2026-11-02T23:00:00Z'), existentes, horas: 48 }).ok).toBe(true);
    expect(checarRepeticao({ chave: 'shopee:1:2', canal: 'wa', horario: new Date('2026-11-04T00:00:00Z'), existentes, horas: 48 }).ok).toBe(true);
    expect(checarCadencia({ ocupados: 5, cadencia: 6 }).ok).toBe(true);
    expect(checarCadencia({ ocupados: 6, cadencia: 6 }).ok).toBe(false);
  });
  it('antes do envio: Telegram pausa, WhatsApp vira Revisar preço', () => {
    const base = { precoPost: 100, emEstoque: true, prazo: null, horarioEnvio: new Date('2026-11-02T23:00:00Z') };
    expect(checarAntesDoEnvio({ ...base, canal: 'tg', precoAgora: 100 }).novoEstado).toBe('agendado');
    expect(checarAntesDoEnvio({ ...base, canal: 'tg', precoAgora: 110 }).novoEstado).toBe('pausado');
    expect(checarAntesDoEnvio({ ...base, canal: 'wa', precoAgora: 110 }).novoEstado).toBe('revisar_preco');
    expect(checarAntesDoEnvio({ ...base, canal: 'tg', precoAgora: 90, emEstoque: false }).novoEstado).toBe('pausado');
    expect(checarAntesDoEnvio({ ...base, canal: 'tg', precoAgora: 90, prazo: '2026-11-02T22:00:00Z' }).novoEstado).toBe('pausado');
  });
  it('Telegram só publica com aprovação, checagem e montagem ok (5.1 item 1)', () => {
    const subTg = montarSubIds({ destino: 'tg', postId: 'p', blocoData: '2026-11-02', origem: 'rodada' });
    const base = { canal: 'tg', estado: 'agendado', aprovadoPor: 'u', texto: `x\n${LINK}\nLink com comissão`, link: LINK, subIds: subTg, checadoAntes: true };
    expect(liberadoParaTelegram(base).ok).toBe(true);
    expect(liberadoParaTelegram({ ...base, aprovadoPor: null }).ok).toBe(false);
    expect(liberadoParaTelegram({ ...base, checadoAntes: false }).ok).toBe(false);
    expect(liberadoParaTelegram({ ...base, estado: 'pausado' }).ok).toBe(false);
    expect(liberadoParaTelegram({ ...base, canal: 'wa' }).ok).toBe(false);
    expect(liberadoParaTelegram({ ...base, texto: `x\n${LINK}` }).ok).toBe(false);
  });
});

describe('links e códigos de origem (5.5)', () => {
  it('subIDs', () => {
    expect(montarSubIds({ destino: 'tg', postId: 'aaaa-bbbb', blocoData: '2026-11-02', origem: 'pedido' })).toEqual({ sub1: 'tg', sub2: 'aaaabbbb', sub3: '20261102', sub4: 'pedido' });
  });
  it('item e chave do produto', () => {
    expect(itemDoLink('https://shopee.com.br/Produto-de-teste-i.123.456?x=1')).toEqual({ shopId: '123', itemId: '456' });
    expect(itemDoLink('https://shopee.com.br/product/123/456')).toEqual({ shopId: '123', itemId: '456' });
    expect(chaveProduto({ shopId: '1', itemId: '2' })).toBe('shopee:1:2');
    expect(chaveProduto({ link: 'https://shopee.com.br/x-i.1.2' })).toBe('shopee:1:2');
    expect(chaveProduto({ link: 'https://s.shopee.com.br/AbC?x=1' })).toBe('link:https://s.shopee.com.br/abc');
  });
});

describe('histórico', () => {
  it('mediana e resumo da janela', () => {
    expect(mediana([3, 1, 2])).toBe(2);
    expect(mediana([1, 2, 3, 4])).toBe(2.5);
    const r = resumoHistorico(
      [
        { observado_em: '2026-09-01', preco: 500 },
        { observado_em: '2026-10-25', preco: 100 },
        { observado_em: '2026-10-30', preco: 120 },
      ],
      '2026-11-02',
      30,
    );
    expect(r).toEqual({ mediana: 110, maximo: 120, dias: 62 });
  });
});
