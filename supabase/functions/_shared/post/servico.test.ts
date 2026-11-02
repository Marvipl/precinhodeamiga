// Casos de uso dos posts com o store em memória e o Telegram falso. Só dados fictícios.
import { beforeEach, describe, expect, it } from 'vitest';
import { PostStoreMemoria } from './store-memoria.ts';
import { GeradorLinkSimulado } from './links.ts';
import { aprovarOferta, atualizarPreco, criarPostManual, ErroPost, publicarBloco } from './servico.ts';
import { TelegramBotApi, TelegramFalso } from '../telegram/cliente.ts';
import type { OfertaPost, ProdutoPost } from './store.ts';

const LANA = '11111111-1111-4111-8111-111111111111';
// 12:00 em Brasília, segunda 2/11/2026
const MEIO_DIA = new Date('2026-11-02T15:00:00Z');

let store: PostStoreMemoria;
let relogio: Date;
const deps = () => ({ store, links: new GeradorLinkSimulado(), agora: () => relogio });

function produto(n: number, extra: Partial<ProdutoPost> = {}): ProdutoPost {
  const p: ProdutoPost = {
    id: `p-${n}`,
    shopee_shop_id: '1000',
    shopee_item_id: String(2000 + n),
    nome: `Produto de teste ${n}`,
    url_produto: `https://shopee.com.br/produto-de-teste-${n}-i.1000.${2000 + n}`,
    imagem_url: null,
    em_estoque: true,
    ...extra,
  };
  store.produtos.set(p.id, p);
  store.observacoes.set(p.id, [
    { observado_em: '2026-10-20', preco: 100 },
    { observado_em: '2026-11-02', preco: 80 },
  ]);
  return p;
}

function oferta(n: number, extra: Partial<OfertaPost> = {}, produtoN = n): OfertaPost {
  const o: OfertaPost = {
    id: `o-${n}`,
    produto_id: `p-${produtoN}`,
    estado: 'pendente',
    origem: 'rodada',
    preco_atual: 80,
    preco_referencia: 100,
    dias_historico: 13,
    cupom: null,
    prazo: null,
    frase: 'Frase de teste da Redatora.',
    ...extra,
  };
  store.ofertas.set(o.id, o);
  return o;
}

beforeEach(() => {
  store = new PostStoreMemoria();
  store.operadora = LANA;
  relogio = MEIO_DIA;
});

describe('aprovar oferta', () => {
  it('monta o post nos dois canais, com link por canal, e agenda às 20h', async () => {
    produto(1);
    oferta(1);
    const r = await aprovarOferta(deps(), { oferta_id: 'o-1', canais: ['wa', 'tg'], frase: null, userId: LANA });
    expect(r.criado).toBe(true);
    expect(r.envios.map((e) => [e.canal, e.estado, e.agendado_para])).toEqual([
      ['wa', 'agendado', '2026-11-02T23:00:00.000Z'],
      ['tg', 'agendado', '2026-11-02T23:00:00.000Z'],
    ]);
    const envios = await store.enviosDoPost(r.post_id);
    for (const e of envios) {
      expect(e.sub_ids?.sub1).toBe(e.canal);
      expect(e.sub_ids?.sub3).toBe('20261102');
      expect(e.texto).toContain(e.link_afiliado!);
      expect(e.texto).toContain('Link com comissão');
      expect(e.texto).toContain('De R$ 100,00 por R$ 80,00');
      expect(e.texto).not.toContain('Frase de teste'); // frase null = sem frase
    }
    expect(store.ofertas.get('o-1')!.estado).toBe('aprovada');
  });

  it('é idempotente e usa a frase da oferta quando não vem frase', async () => {
    produto(1);
    oferta(1);
    const a = await aprovarOferta(deps(), { oferta_id: 'o-1', canais: ['tg'], userId: LANA });
    const b = await aprovarOferta(deps(), { oferta_id: 'o-1', canais: ['tg'], userId: LANA });
    expect(b.criado).toBe(false);
    expect(b.post_id).toBe(a.post_id);
    expect(store.envios.size).toBe(1);
    expect([...store.envios.values()][0].texto).toContain('Frase de teste da Redatora.');
  });

  it('redistribui o bloco a cada aprovação (3 posts: 20:00, 20:40, 21:20)', async () => {
    for (const n of [1, 2, 3]) {
      produto(n);
      oferta(n);
      await aprovarOferta(deps(), { oferta_id: `o-${n}`, canais: ['wa'], userId: LANA });
    }
    const horas = [...store.envios.values()].map((e) => e.agendado_para).sort();
    expect(horas).toEqual(['2026-11-02T23:00:00.000Z', '2026-11-02T23:40:00.000Z', '2026-11-03T00:20:00.000Z']);
  });

  it('histórico curto: sem de/por e com alerta', async () => {
    produto(1);
    oferta(1, { dias_historico: 2 });
    const r = await aprovarOferta(deps(), { oferta_id: 'o-1', canais: ['wa'], userId: LANA });
    const [e] = await store.enviosDoPost(r.post_id);
    expect(e.texto).toContain('Por R$ 80,00');
    expect(e.texto).not.toContain('De R$');
    expect(e.guardia.some((c) => c.checagem === 'historico_curto' && !c.ok)).toBe(true);
  });

  it('cadência cheia num canal: o post sai só no outro', async () => {
    store.configLinhas = [{ chave: 'regras.cadencia_inicial', valor: 1 }];
    produto(1);
    produto(2);
    oferta(1);
    oferta(2);
    await aprovarOferta(deps(), { oferta_id: 'o-1', canais: ['wa'], userId: LANA });
    const r = await aprovarOferta(deps(), { oferta_id: 'o-2', canais: ['wa', 'tg'], userId: LANA });
    expect(r.envios.find((e) => e.canal === 'wa')!.estado).toBe('bloqueado');
    expect(r.envios.find((e) => e.canal === 'wa')!.guardia.some((c) => c.checagem === 'cadencia' && !c.ok)).toBe(true);
    expect(r.envios.find((e) => e.canal === 'tg')).toMatchObject({ estado: 'agendado', agendado_para: '2026-11-02T23:00:00.000Z' });
  });

  it('sem vaga em nenhum canal: fica para o dia seguinte', async () => {
    store.configLinhas = [{ chave: 'regras.cadencia_inicial', valor: 1 }];
    produto(1);
    produto(2);
    oferta(1);
    oferta(2);
    await aprovarOferta(deps(), { oferta_id: 'o-1', canais: ['wa', 'tg'], userId: LANA });
    const r = await aprovarOferta(deps(), { oferta_id: 'o-2', canais: ['wa', 'tg'], userId: LANA });
    expect(r.envios.every((e) => e.estado === 'agendado' && e.agendado_para === '2026-11-03T23:00:00.000Z')).toBe(true);
    const envios = await store.enviosDoPost(r.post_id);
    expect(envios.every((e) => e.sub_ids?.sub3 === '20261103')).toBe(true);
  });

  it('sem vaga e oferta que acaba antes: bloqueia', async () => {
    store.configLinhas = [{ chave: 'regras.cadencia_inicial', valor: 1 }];
    produto(1);
    produto(2);
    oferta(1);
    oferta(2, { prazo: '2026-11-03T12:00:00Z' });
    await aprovarOferta(deps(), { oferta_id: 'o-1', canais: ['tg'], userId: LANA });
    const r = await aprovarOferta(deps(), { oferta_id: 'o-2', canais: ['tg'], userId: LANA });
    expect(r.envios[0].estado).toBe('bloqueado');
  });

  it('mesmo produto no mesmo canal em 48 horas: bloqueia naquele canal', async () => {
    produto(1);
    oferta(1);
    oferta(2, {}, 1);
    await aprovarOferta(deps(), { oferta_id: 'o-1', canais: ['wa'], userId: LANA });
    const r = await aprovarOferta(deps(), { oferta_id: 'o-2', canais: ['wa', 'tg'], userId: LANA });
    expect(r.envios.find((e) => e.canal === 'wa')!.estado).toBe('bloqueado');
    expect(r.envios.find((e) => e.canal === 'wa')!.guardia.some((c) => c.checagem === 'repeticao' && !c.ok)).toBe(true);
    expect(r.envios.find((e) => e.canal === 'tg')!.estado).toBe('agendado');
  });

  it('sem link de afiliado: a Guardiã bloqueia', async () => {
    produto(1);
    oferta(1);
    const r = await aprovarOferta(
      { store, agora: () => relogio, links: { gerar: async () => Promise.reject(new Error('fora do ar')) } },
      { oferta_id: 'o-1', canais: ['tg'], userId: LANA },
    );
    expect(r.envios[0].estado).toBe('bloqueado');
  });

  it('recusa entrada inválida', async () => {
    produto(1);
    oferta(1, { estado: 'pulada' });
    await expect(aprovarOferta(deps(), { oferta_id: 'o-1', canais: [], userId: LANA })).rejects.toBeInstanceOf(ErroPost);
    await expect(aprovarOferta(deps(), { oferta_id: 'o-1', canais: ['status'], userId: LANA })).rejects.toThrow(/Canal/);
    await expect(aprovarOferta(deps(), { oferta_id: 'o-1', canais: ['wa'], userId: LANA })).rejects.toThrow(/pulada/);
    await expect(aprovarOferta(deps(), { oferta_id: 'o-x', canais: ['wa'], userId: LANA })).rejects.toThrow(/não encontrada/);
    oferta(2, {}, 1);
    await expect(aprovarOferta(deps(), { oferta_id: 'o-2', canais: ['wa'], frase: 'x'.repeat(141), userId: LANA })).rejects.toThrow(/140/);
  });
});

describe('post manual (F-16)', () => {
  it('segue o mesmo caminho e só mostra o de dentro do histórico', async () => {
    produto(1);
    const r = await criarPostManual(deps(), {
      link_afiliado: 'https://shopee.com.br/produto-de-teste-1-i.1000.2001?af=1',
      titulo: 'Produto de teste 1',
      preco_atual: 70,
      preco_referencia: 95,
      cupom: null,
      prazo: '2026-11-05T02:59:00Z',
      frase: null,
      canais: ['wa', 'tg'],
      userId: LANA,
    });
    const envios = await store.enviosDoPost(r.post_id);
    expect(envios.map((e) => e.estado)).toEqual(['agendado', 'agendado']);
    expect(envios[0].texto).toContain('De R$ 95,00 por R$ 70,00');
    expect(envios[0].texto).toContain('Oferta válida até 4/11 às 23:59 | Link com comissão');
    expect(envios[0].guardia.some((c) => c.checagem === 'link_manual' && c.efeito === 'alerta')).toBe(true);
    expect(store.posts.get(r.post_id)).toMatchObject({ tipo: 'manual', origem_oferta: 'manual', aprovado_por: LANA, chave_produto: 'shopee:1000:2001' });
  });

  it('de acima do maior preço observado ou sem histórico: sai só com o preço atual', async () => {
    const r = await criarPostManual(deps(), { link_afiliado: 'https://s.shopee.com.br/AbCdE', titulo: 'Produto de teste Z', preco_atual: 70, preco_referencia: 95, canais: ['tg'], userId: LANA });
    const [e] = await store.enviosDoPost(r.post_id);
    expect(e.texto).toContain('Por R$ 70,00');
    expect(e.texto).not.toContain('De R$');
  });

  it('recusa link que não é da Shopee e prazo passado', async () => {
    const base = { titulo: 'Produto de teste', preco_atual: 10, canais: ['wa'], userId: LANA };
    await expect(criarPostManual(deps(), { ...base, link_afiliado: 'https://outro.example/x' })).rejects.toThrow(/Shopee/);
    await expect(criarPostManual(deps(), { ...base, link_afiliado: 'https://s.shopee.com.br/x', prazo: '2026-11-01T00:00:00Z' })).rejects.toThrow(/passou/);
    await expect(criarPostManual(deps(), { ...base, link_afiliado: 'https://s.shopee.com.br/x', preco_atual: 0 })).rejects.toThrow(/Preço/);
  });
});

describe('publicar bloco (F-08)', () => {
  async function aprovado(canais: Array<'wa' | 'tg'> = ['wa', 'tg']) {
    produto(1);
    oferta(1);
    return aprovarOferta(deps(), { oferta_id: 'o-1', canais, userId: LANA });
  }

  it('checa 5 min antes, publica o Telegram no horário e lembra o WhatsApp', async () => {
    await aprovado();
    const tg = new TelegramFalso();
    relogio = new Date('2026-11-02T22:54:00Z');
    expect((await publicarBloco({ ...deps(), telegram: tg })).checados).toBe(0);
    relogio = new Date('2026-11-02T22:55:00Z');
    expect((await publicarBloco({ ...deps(), telegram: tg })).checados).toBe(2);
    expect(tg.chamadas).toHaveLength(0);
    relogio = new Date('2026-11-02T23:00:00Z');
    const r = await publicarBloco({ ...deps(), telegram: tg });
    expect(r).toMatchObject({ publicados: 1, lembretes: 1 });
    expect(tg.chamadas).toHaveLength(1);
    expect(tg.chamadas[0].texto).toContain('<b>Produto de teste 1</b>');
    expect(tg.chamadas[0].texto).toContain('Link com comissão');
    const envios = [...store.envios.values()];
    expect(envios.find((e) => e.canal === 'tg')).toMatchObject({ estado: 'publicado', telegram_message_id: 1 });
    expect(envios.find((e) => e.canal === 'wa')!.estado).toBe('agendado');
    expect(store.notificacoes).toEqual([expect.objectContaining({ tipo: 'lembrete_wa', user_id: LANA, enviar_em: '2026-11-02T23:00:00.000Z' })]);
    // Não repete lembrete nem publicação
    relogio = new Date('2026-11-02T23:01:00Z');
    expect(await publicarBloco({ ...deps(), telegram: tg })).toMatchObject({ publicados: 0, lembretes: 0 });
  });

  it('preço subiu: pausa o Telegram, "Revisar preço" no WhatsApp e avisa a Lana', async () => {
    await aprovado();
    store.observacoes.get('p-1')!.push({ observado_em: '2026-11-03', preco: 95 });
    const tg = new TelegramFalso();
    relogio = new Date('2026-11-02T22:56:00Z');
    const r = await publicarBloco({ ...deps(), telegram: tg });
    expect(r.pausados).toBe(2);
    const envios = [...store.envios.values()];
    expect(envios.find((e) => e.canal === 'tg')!.estado).toBe('pausado');
    expect(envios.find((e) => e.canal === 'wa')!.estado).toBe('revisar_preco');
    expect(store.notificacoes.filter((n) => n.tipo === 'guardia_pausa')).toHaveLength(2);
    relogio = new Date('2026-11-02T23:00:00Z');
    await publicarBloco({ ...deps(), telegram: tg });
    expect(tg.chamadas).toHaveLength(0);

    // Atualizar preço e publicar
    const post = [...store.posts.values()][0];
    const a = await atualizarPreco(deps(), { post_id: post.id });
    expect(a.envios.map((e) => e.estado)).toEqual(['agendado', 'agendado']);
    const tgEnvio = [...store.envios.values()].find((e) => e.canal === 'tg')!;
    expect(tgEnvio.texto).toContain('Por R$ 95,00');
    expect(tgEnvio.agendado_para).toBe('2026-11-02T23:01:00.000Z');
    relogio = new Date('2026-11-02T23:01:00Z');
    expect((await publicarBloco({ ...deps(), telegram: tg })).publicados).toBe(1);
  });

  it('atualizar preço de post manual exige o preço', async () => {
    const r = await criarPostManual(deps(), { link_afiliado: 'https://s.shopee.com.br/AbCdE', titulo: 'Produto de teste Z', preco_atual: 70, canais: ['tg'], userId: LANA });
    await expect(atualizarPreco(deps(), { post_id: r.post_id })).rejects.toThrow(/Informe o preço/);
    const a = await atualizarPreco(deps(), { post_id: r.post_id, preco_atual: 65 });
    expect(a.envios[0].estado).toBe('agendado');
  });

  it('WhatsApp não marcado até o fim do bloco vira "não enviado"', async () => {
    await aprovado(['wa']);
    const tg = new TelegramFalso();
    relogio = new Date('2026-11-02T23:00:00Z');
    await publicarBloco({ ...deps(), telegram: tg });
    relogio = new Date('2026-11-03T01:59:00Z');
    expect((await publicarBloco({ ...deps(), telegram: tg })).naoEnviados).toBe(0);
    relogio = new Date('2026-11-03T02:00:00Z');
    expect((await publicarBloco({ ...deps(), telegram: tg })).naoEnviados).toBe(1);
    expect([...store.envios.values()][0].estado).toBe('nao_enviado');
  });

  it('falha do bot: tenta de novo e pausa depois de 30 minutos', async () => {
    await aprovado(['tg']);
    const tg = new TelegramFalso();
    tg.falhar = true;
    relogio = new Date('2026-11-02T22:55:00Z');
    await publicarBloco({ ...deps(), telegram: tg });
    relogio = new Date('2026-11-02T23:00:00Z');
    const r = await publicarBloco({ ...deps(), telegram: tg });
    expect(r.erros).toHaveLength(1);
    expect([...store.envios.values()][0].estado).toBe('agendado');
    relogio = new Date('2026-11-02T23:31:00Z');
    await publicarBloco({ ...deps(), telegram: tg });
    expect([...store.envios.values()][0].estado).toBe('pausado');
  });
});

describe('cliente da Bot API', () => {
  it('foto com legenda, texto longo como mensagem, erro vira exceção', async () => {
    const chamadas: Array<{ url: string; corpo: Record<string, unknown> }> = [];
    let resposta = { ok: true, result: { message_id: 7 } };
    const api = new TelegramBotApi('TOKEN-DE-TESTE', '@canal_de_teste', async (url, init) => {
      chamadas.push({ url, corpo: JSON.parse(init.body) });
      return { ok: resposta.ok, status: resposta.ok ? 200 : 400, json: async () => resposta };
    });
    expect(await api.publicarNoCanal({ texto: 'oi', fotoUrl: 'https://exemplo.invalid/foto.png' })).toEqual({ message_id: 7 });
    expect(chamadas[0].url).toBe('https://api.telegram.org/botTOKEN-DE-TESTE/sendPhoto');
    expect(chamadas[0].corpo).toMatchObject({ chat_id: '@canal_de_teste', caption: 'oi', parse_mode: 'HTML' });
    await api.publicarNoCanal({ texto: 'x'.repeat(1100), fotoUrl: 'https://exemplo.invalid/foto.png' });
    expect(chamadas[1].url).toMatch(/sendMessage$/);
    resposta = { ok: false, result: { message_id: 0 } };
    await expect(api.enviarMensagem('1', 'oi')).rejects.toThrow(/sendMessage falhou/);
  });
});
