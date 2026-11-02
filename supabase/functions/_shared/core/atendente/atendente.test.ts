import { describe, expect, it } from 'vitest';
import { triar, preencher, CATEGORIAS_FECHADAS, TEXTOS_NIVEL1, MENU_BOT } from './niveis.ts';
import {
  AVISO_LINKS,
  avisoRecebimento,
  checarLimites,
  chaveProduto,
  decidirNivel2,
  deveAvisar,
  duvidasRepetidas,
  emJanelaDeCiclo,
  gruposAchadoAPedido,
  linkConversaWhatsapp,
  montarResposta,
  proximoBloco,
  proximoCiclo,
  quandoNotificar,
  registrarAprovacao,
  respondeSozinha,
  rotuloCiclo,
  vencidoParaGuarda,
  celularValido,
} from './regras.ts';
import { formularioFale } from './formulario.ts';
import { atendente } from '../contratos/atendente.ts';
import { contrato } from '../contratos/index.ts';

// 2026-11-02 é segunda; Brasília = UTC-3.
const bsb = (hhmm: string, dia = '2026-11-02') => new Date(`${dia}T${hhmm}:00-03:00`);
const BLOCOS = ['12:00', '21:00'];
const P1 = '11111111-1111-4111-8111-111111111111';
const P2 = '22222222-2222-4222-8222-222222222222';

describe('triagem na chegada (nível 1 e nível 4 por palavra-chave)', () => {
  it('nível 4 vence qualquer outra regra', () => {
    expect(triar('Vou no Procon, o cupom não funcionou')).toEqual({ nivel: 4, motivo: 'reclamação séria' });
    expect(triar('Oi, quero propor uma parceria com a minha loja')).toMatchObject({ nivel: 4, motivo: 'proposta de parceria' });
  });
  it('nível 1 por palavra-chave em mensagem curta', () => {
    expect(triar('Tem cupom?')).toEqual({ nivel: 1, categoria: 'cupom' });
    expect(triar('o link não abre aqui')).toEqual({ nivel: 1, categoria: 'link' });
    expect(triar('Essa oferta ainda vale?')).toEqual({ nivel: 1, categoria: 'oferta_vale' });
    expect(triar('Meu pedido não chegou')).toEqual({ nivel: 1, categoria: 'entrega' });
    expect(triar('Como funciona o canal?')).toEqual({ nivel: 1, categoria: 'como_funciona' });
  });
  it('mensagem longa ou sem palavra-chave vai para o ciclo', () => {
    expect(triar('Procuro uma cadeirinha de carro até R$ 300')).toEqual({ nivel: null });
    expect(triar('cupom '.repeat(40))).toEqual({ nivel: null });
  });
  it('menu tem os cinco botões do nível 1, pedido e falar com a Lana', () => {
    expect(MENU_BOT.map((b) => b.id)).toEqual(['cupom', 'link', 'como_funciona', 'oferta_vale', 'entrega', 'pedido', 'falar_lana']);
  });
  it('textos fixos não pedem dado sensível nem prometem', () => {
    for (const t of Object.values(TEXTOS_NIVEL1)) expect(checarLimites(t)).toEqual([]);
  });
  it('preencher nunca inventa campo', () => {
    expect(preencher('até as {proximo_bloco}', { proximo_bloco: '21h' })).toBe('até as 21h');
    expect(() => preencher('cupom {cupom}', {})).toThrow();
  });
});

describe('ciclos e blocos de revisão', () => {
  it('janela das 8h às 22h30', () => {
    expect(emJanelaDeCiclo(bsb('07:59'))).toBe(false);
    expect(emJanelaDeCiclo(bsb('08:00'))).toBe(true);
    expect(emJanelaDeCiclo(bsb('22:30'))).toBe(true);
    expect(emJanelaDeCiclo(bsb('22:31'))).toBe(false);
  });
  it('mensagem depois do último ciclo espera o das 8h', () => {
    expect(proximoCiclo(bsb('23:10')).toISOString()).toBe(bsb('08:00', '2026-11-03').toISOString());
    expect(proximoCiclo(bsb('10:05')).toISOString()).toBe(bsb('10:30').toISOString());
    expect(rotuloCiclo(bsb('10:44'))).toBe('2026-11-02T10:30');
  });
  it('aviso na hora com o próximo bloco; à noite, o de amanhã', () => {
    expect(avisoRecebimento(bsb('09:00'), BLOCOS)).toBe(
      'Oi! Sou a assistente da Precinho de Amiga. Respondo agora o que der, e o resto a Lana responde até as 12h.',
    );
    expect(avisoRecebimento(bsb('15:00'), BLOCOS)).toMatch(/até as 21h\.$/);
    expect(avisoRecebimento(bsb('22:00'), BLOCOS)).toMatch(/até as 12h de amanhã\.$/);
    expect(avisoRecebimento(bsb('22:00'), ['21:00'])).toMatch(/até as 21h de amanhã\.$/);
  });
  it('aviso não se repete para o mesmo bloco', () => {
    expect(deveAvisar(null, bsb('09:00'), BLOCOS)).toBe(true);
    expect(deveAvisar(bsb('09:00'), bsb('11:00'), BLOCOS)).toBe(false);
    expect(deveAvisar(bsb('09:00'), bsb('13:00'), BLOCOS)).toBe(true);
  });
  it('silêncio: fora dos blocos só o nível 4 toca na hora', () => {
    const agora = bsb('15:00');
    expect(quandoNotificar(4, agora, BLOCOS).toISOString()).toBe(agora.toISOString());
    expect(quandoNotificar(3, agora, BLOCOS).toISOString()).toBe(bsb('21:00').toISOString());
    expect(quandoNotificar(3, bsb('21:10'), BLOCOS).toISOString()).toBe(bsb('21:10').toISOString());
  });
  it('bloco inválido volta ao padrão', () => {
    expect(proximoBloco(bsb('09:00'), ['xx'] as string[]).hora).toBe('12:00');
  });
});

describe('nível 2: sai sozinho só com tema ligado e trecho no anúncio', () => {
  const anuncio = 'Organizador de teste A\nMedidas: 30 cm x 20 cm x 10 cm. Cor única.';
  const base = { categoria: 'medidas', temasLigados: ['medidas'], trechoCitado: 'Medidas: 30 cm x 20 cm x 10 cm', textoAnuncio: anuncio };
  it('envia quando tudo confere', () => {
    expect(decidirNivel2({ ...base, resposta: 'Pelo anúncio, ele tem 30 cm x 20 cm x 10 cm.' })).toEqual({ enviar: true });
  });
  it('tema desligado vira rascunho', () => {
    expect(decidirNivel2({ ...base, temasLigados: [], resposta: 'tem 30 cm' })).toMatchObject({ enviar: false });
  });
  it('trecho que não está no anúncio vira rascunho', () => {
    expect(decidirNivel2({ ...base, trechoCitado: 'Medidas: 40 cm', resposta: 'tem 40 cm' })).toMatchObject({
      enviar: false,
      motivo: 'o trecho citado não aparece no anúncio',
    });
  });
  it('número na resposta que não está no anúncio vira rascunho', () => {
    expect(decidirNivel2({ ...base, resposta: 'Tem 30 cm e cabe em gaveta de 15 cm.' })).toMatchObject({ enviar: false });
  });
  it('tema fora de medidas, cores e prazo nunca sai sozinho', () => {
    expect(decidirNivel2({ ...base, categoria: 'cupom', temasLigados: ['cupom'], resposta: 'x' })).toMatchObject({ enviar: false });
  });
});

describe('limites da Atendente', () => {
  it('bloqueia pedido de CPF, endereço ou pagamento', () => {
    expect(checarLimites('Me passa seu CPF para eu conferir')[0]).toMatchObject({ tipo: 'dado_sensivel', bloqueia: true });
    expect(checarLimites('Qual o seu endereço?')[0]).toMatchObject({ tipo: 'dado_sensivel', bloqueia: true });
  });
  it('dizer que nunca pede CPF não é alerta', () => {
    expect(checarLimites('Fica tranquila: nunca peço CPF nem dados de pagamento.')).toEqual([]);
  });
  it('promessa vira alerta e fingir ser a Lana bloqueia', () => {
    expect(checarLimites('É o menor preço do Brasil!')[0]).toMatchObject({ tipo: 'promessa', bloqueia: false });
    expect(checarLimites('Oi, aqui é a Lana!')[0]).toMatchObject({ tipo: 'finge_lana', bloqueia: true });
  });
});

describe('links nas respostas: afiliado com sub1=at e aviso de comissão', () => {
  const links = { [P1]: 'https://s.shopee.com.br/teste?sub1=at' };
  it('troca o token e acrescenta o aviso', () => {
    const r = montarResposta(`Achei esta opção: {link:${P1}}`, links);
    expect(r).toContain('https://s.shopee.com.br/teste?sub1=at');
    expect(r.endsWith(AVISO_LINKS)).toBe(true);
  });
  it('não duplica o aviso', () => {
    const r = montarResposta(`Opção: {link:${P1}}. Os links geram comissão para a Precinho.`, links);
    expect(r.split('comissão').length).toBe(2);
  });
  it('recusa link escrito à mão e produto sem link gerado', () => {
    expect(() => montarResposta('veja https://shopee.com.br/x', {})).toThrow();
    expect(() => montarResposta(`{link:${P2}}`, links)).toThrow();
  });
  it('sem link, sem aviso', () => {
    expect(montarResposta('Boa pergunta!', {})).toBe('Boa pergunta!');
  });
});

describe('vira automática', () => {
  const zero = { aprovacoes_seguidas: 0, automatica: false, desligada: false };
  it('3 aprovações seguidas sem editar', () => {
    let e = { ...zero };
    for (let i = 0; i < 2; i++) e = registrarAprovacao(e, { categoria: 'cupom', nivel: 1, editada: false });
    expect(e.automatica).toBe(false);
    const r = registrarAprovacao(e, { categoria: 'cupom', nivel: 1, editada: false });
    expect(r.virouAutomatica).toBe(true);
    expect(respondeSozinha(r)).toBe(true);
  });
  it('edição zera a sequência', () => {
    let e = registrarAprovacao({ ...zero, aprovacoes_seguidas: 2 }, { categoria: 'cupom', nivel: 1, editada: true });
    expect(e.aprovacoes_seguidas).toBe(0);
    e = registrarAprovacao(e, { categoria: 'cupom', nivel: 1, editada: false });
    expect(e.automatica).toBe(false);
  });
  it('nunca vira automática no nível 3 ou 4, nem desligada', () => {
    expect(registrarAprovacao({ ...zero, aprovacoes_seguidas: 5 }, { categoria: 'cupom', nivel: 3, editada: false }).automatica).toBe(false);
    expect(registrarAprovacao({ ...zero, aprovacoes_seguidas: 2, desligada: true }, { categoria: 'cupom', nivel: 1, editada: false }).automatica).toBe(false);
    expect(respondeSozinha({ aprovacoes_seguidas: 3, automatica: true, desligada: true })).toBe(false);
  });
  it('categorias fechadas são as oito do documento', () => {
    expect(CATEGORIAS_FECHADAS).toHaveLength(8);
  });
});

describe('uma resposta para todas', () => {
  it('chave de produto ignora ordem, plural, preço e palavras de pedido', () => {
    expect(chaveProduto('Procuro cadeirinha de carro até R$ 300')).toBe(chaveProduto('quero uma cadeirinha para carros'));
    expect(chaveProduto('jogo de lençol casal')).not.toBe(chaveProduto('cadeirinha de carro'));
  });
  it('2 pedidos do mesmo produto, de pessoas diferentes, viram achado a pedido', () => {
    const k = chaveProduto('produto de teste A');
    expect(gruposAchadoAPedido([{ id: 'a', chave: k, contato_id: 'c1', estado: 'procurando' }])).toEqual([]);
    expect(
      gruposAchadoAPedido([
        { id: 'a', chave: k, contato_id: 'c1', estado: 'procurando' },
        { id: 'b', chave: k, contato_id: 'c1', estado: 'procurando' },
      ]),
    ).toEqual([]);
    expect(
      gruposAchadoAPedido([
        { id: 'a', chave: k, contato_id: 'c1', estado: 'procurando' },
        { id: 'b', chave: k, contato_id: null, estado: 'opcoes_encontradas' },
      ]),
    ).toEqual([{ chave: k, ids: ['a', 'b'] }]);
  });
  it('3 pessoas com a mesma dúvida na semana', () => {
    const agora = bsb('12:00');
    const m = (c: string, dias = 1) => ({ tema_duvida: 'Altura do organizador', contato_id: c, recebida_em: new Date(agora.getTime() - dias * 86_400_000).toISOString() });
    expect(duvidasRepetidas([m('a'), m('b'), m('b')], agora)).toEqual([]);
    expect(duvidasRepetidas([m('a'), m('b'), m('c')], agora)).toEqual(['altura do organizador']);
    expect(duvidasRepetidas([m('a'), m('b'), m('c', 8)], agora)).toEqual([]);
  });
});

describe('privacidade e formulário', () => {
  it('guarda de 90 dias', () => {
    const agora = bsb('12:00');
    expect(vencidoParaGuarda(new Date(agora.getTime() - 91 * 86_400_000), agora)).toBe(true);
    expect(vencidoParaGuarda(new Date(agora.getTime() - 89 * 86_400_000), agora)).toBe(false);
  });
  it('resposta por WhatsApp só abre a conversa com o texto; nada é enviado', () => {
    expect(linkConversaWhatsapp('(11) 90000-0000', 'Oi')).toBe('https://wa.me/5511900000000?text=Oi');
    expect(celularValido('11 90000-0000')).toBe(true);
    expect(celularValido('123')).toBe(false);
  });
  it('WhatsApp exige número e consentimento explícito', () => {
    expect(formularioFale.safeParse({ texto: 'Procuro produto de teste A', preferencia: 'canal' }).success).toBe(true);
    expect(formularioFale.safeParse({ texto: 'Procuro produto de teste A', preferencia: 'whatsapp', whatsapp: '11900000000' }).success).toBe(false);
    expect(
      formularioFale.safeParse({ texto: 'Procuro produto de teste A', preferencia: 'whatsapp', whatsapp: '11900000000', consentimento_whatsapp: true }).success,
    ).toBe(true);
  });
});

describe('contrato atendente/v1', () => {
  it('está registrado na rotina pa-atendente', () => {
    expect(contrato('atendente/v1')?.rotina).toBe('pa-atendente');
  });
  it('a resposta simulada respeita o próprio contrato e é fictícia', () => {
    const entrada = atendente.entrada.parse({
      ciclo: '2026-11-02T10:30',
      temas_ligados: ['medidas'],
      mensagens: [
        { id: P1, texto: 'Procuro produto de teste A até 50 reais', origem: 'formulario', preco_max: 50 },
        { id: P2, texto: 'Qual a medida?', origem: 'telegram', anuncio: { produto_id: P1, titulo: 'Produto de teste A', texto: 'Produto de teste A. Medidas: 30 cm.' } },
      ],
      pedidos_com_opcoes: [
        { pedido_id: P2, mensagem_id: P1, texto: 'produto de teste B', preco_max: null, opcoes: [{ produto_id: P1, titulo: 'Produto de teste B', preco: null }] },
      ],
    });
    const saida = atendente.simular(entrada);
    expect(atendente.saida.safeParse(saida).success).toBe(true);
    expect(saida.mensagens[0]).toMatchObject({ nivel: 3, pedido: { preco_max: 50 } });
    expect(saida.mensagens[1]).toMatchObject({ nivel: 2, categoria: 'medidas', trecho_citado: 'Medidas: 30 cm' });
    expect(saida.pedidos[0].resposta).toContain(`{link:${P1}}`);
    for (const m of saida.mensagens) expect(m.resposta).toMatch(/simulad/i);
  });
  it('a entrada não aceita campo de contato (nome, número, ID do Telegram)', () => {
    const r = atendente.entrada.safeParse({
      ciclo: 'x',
      temas_ligados: [],
      mensagens: [{ id: P1, texto: 'oi', origem: 'telegram', nome: 'Fulana' }],
    });
    // zod remove chaves desconhecidas: o nome nunca chega à rotina.
    expect(r.success && 'nome' in (r.data.mensagens[0] as object)).toBe(false);
  });
});
