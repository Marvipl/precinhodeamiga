// Testes de aceite obrigatórios da seção 5.1, itens 1 a 4.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PostStoreMemoria } from './store-memoria.ts';
import { GeradorLinkSimulado } from './links.ts';
import { aprovarOferta, criarPostManual, publicarBloco } from './servico.ts';
import { TelegramFalso } from '../telegram/cliente.ts';
import { formatarPost } from '../core/post/formato.ts';
import { montarSubIds } from '../core/post/links.ts';

const RAIZ = join(__dirname, '..', '..', '..', '..');
const LANA = '11111111-1111-4111-8111-111111111111';

function arquivos(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (n === 'node_modules' || n.startsWith('.')) return [];
    return statSync(p).isDirectory() ? arquivos(p) : /\.(ts|tsx|js|sql)$/.test(n) ? [p] : [];
  });
}

function cenario() {
  const store = new PostStoreMemoria();
  store.operadora = LANA;
  store.produtos.set('p-1', {
    id: 'p-1',
    shopee_shop_id: '1000',
    shopee_item_id: '2001',
    nome: 'Produto de teste A',
    url_produto: 'https://shopee.com.br/produto-de-teste-a-i.1000.2001',
    imagem_url: null,
    em_estoque: true,
  });
  store.observacoes.set('p-1', [{ observado_em: '2026-11-02', preco: 50 }]);
  store.ofertas.set('o-1', { id: 'o-1', produto_id: 'p-1', estado: 'pendente', origem: 'rodada', preco_atual: 50, preco_referencia: null, dias_historico: 0, cupom: null, prazo: null, frase: null });
  return store;
}

describe('5.1 item 1: nada vai para o Telegram sem aprovação da Lana e sem a Guardiã', () => {
  it('envio de post sem aprovação nunca é publicado', async () => {
    const store = cenario();
    const tg = new TelegramFalso();
    const post = await store.criarPost({
      tipo: 'oferta', oferta_id: null, produto_id: 'p-1', titulo: 'Produto de teste A', preco_atual: 50, preco_referencia: null, de_manual: null,
      cupom: null, prazo: null, frase: null, imagem_url: null, origem_oferta: 'rodada', chave_produto: 'shopee:1000:2001', aprovado_por: null, aprovado_em: null,
    });
    const link = 'https://exemplo.invalid/shopee/s/teste';
    await store.criarEnvio({
      post_id: post.id, canal: 'tg', link_afiliado: link, sub_ids: montarSubIds({ destino: 'tg', postId: post.id, blocoData: '2026-11-02', origem: 'rodada' }),
      texto: formatarPost({ titulo: 'Produto de teste A', preco_atual: 50, link }, 'tg'), bloco_data: '2026-11-02', bloco: 'noite',
      agendado_para: '2026-11-02T23:00:00.000Z', estado: 'agendado', guardia: [], chave_produto: 'shopee:1000:2001',
    });
    for (const t of ['2026-11-02T22:55:00Z', '2026-11-02T23:00:00Z', '2026-11-02T23:10:00Z']) {
      await publicarBloco({ store, links: new GeradorLinkSimulado(), telegram: tg, agora: () => new Date(t) });
    }
    expect(tg.chamadas).toHaveLength(0);
  });

  it('envio bloqueado ou pausado pela Guardiã nunca é publicado', async () => {
    const store = cenario();
    const tg = new TelegramFalso();
    const agora = () => new Date('2026-11-02T15:00:00Z');
    const r = await aprovarOferta({ store, links: { gerar: async () => 'http://sem-https.example/x' }, agora }, { oferta_id: 'o-1', canais: ['tg'], userId: LANA });
    expect(r.envios[0].estado).toBe('bloqueado');
    for (const t of ['2026-11-02T22:55:00Z', '2026-11-02T23:00:00Z']) {
      await publicarBloco({ store, links: new GeradorLinkSimulado(), telegram: tg, agora: () => new Date(t) });
    }
    expect(tg.chamadas).toHaveLength(0);
  });
});

describe('5.1 item 2: não existe caminho de código que envie mensagem ao WhatsApp', () => {
  it('nenhum arquivo do sistema fala com APIs ou links de envio do WhatsApp', () => {
    const proibido = /graph\.facebook\.com|api\.whatsapp\.com|wa\.me\/|whatsapp\.com\/send|web\.whatsapp\.com|whatsapp-web|baileys|venom-bot|wppconnect/i;
    const achados = [...arquivos(join(RAIZ, 'supabase')), ...arquivos(join(RAIZ, 'src'))]
      .filter((f) => !f.endsWith('aceite.test.ts'))
      // Exceção da seção 5.13: link de conversa 1:1 que a Lana abre e ela mesma envia (nenhuma chamada de envio).
      .filter((f) => !f.endsWith(join('core', 'atendente', 'whatsapp-conversa.ts')))
      .filter((f) => proibido.test(readFileSync(f, 'utf8')))
      .map((f) => relative(RAIZ, f));
    expect(achados).toEqual([]);
  });

  it('a publicação só chama o Telegram, e só com envios do canal tg', async () => {
    const store = cenario();
    const tg = new TelegramFalso();
    await aprovarOferta({ store, links: new GeradorLinkSimulado(), agora: () => new Date('2026-11-02T15:00:00Z') }, { oferta_id: 'o-1', canais: ['wa', 'tg'], userId: LANA });
    for (const t of ['2026-11-02T22:55:00Z', '2026-11-02T23:00:00Z', '2026-11-03T02:00:00Z']) {
      await publicarBloco({ store, links: new GeradorLinkSimulado(), telegram: tg, agora: () => new Date(t) });
    }
    expect(tg.chamadas).toHaveLength(1);
    expect(tg.chamadas[0].texto).toContain('simulado-tg-');
    const wa = [...store.envios.values()].find((e) => e.canal === 'wa')!;
    expect(['agendado', 'nao_enviado']).toContain(wa.estado); // só a Lana marca "enviado"
    expect(wa.publicado_em).toBeNull();
  });
});

describe('5.1 item 3: todo post publicado contém "Link com comissão"', () => {
  it('em todas as combinações do formato', () => {
    const link = 'https://exemplo.invalid/shopee/s/teste';
    for (const canal of ['wa', 'tg'] as const)
      for (const preco_referencia of [null, 100])
        for (const cupom of [null, 'CUPOMTESTE'])
          for (const frase of [null, 'Frase de teste.'])
            for (const prazo of [null, '2026-12-01T10:00:00Z']) {
              expect(formatarPost({ titulo: 'Produto de teste A', preco_atual: 50, preco_referencia, cupom, frase, prazo, link }, canal)).toContain('Link com comissão');
            }
  });

  it('o que o bot publicou e o texto do WhatsApp têm o aviso', async () => {
    const store = cenario();
    const tg = new TelegramFalso();
    await criarPostManual(
      { store, links: new GeradorLinkSimulado(), agora: () => new Date('2026-11-02T15:00:00Z') },
      { link_afiliado: 'https://s.shopee.com.br/teste', titulo: 'Produto de teste B', preco_atual: 20, canais: ['wa', 'tg'], userId: LANA },
    );
    for (const t of ['2026-11-02T22:55:00Z', '2026-11-02T23:00:00Z']) {
      await publicarBloco({ store, links: new GeradorLinkSimulado(), telegram: tg, agora: () => new Date(t) });
    }
    expect(tg.chamadas.length).toBe(1);
    for (const c of tg.chamadas) expect(c.texto).toContain('Link com comissão');
    for (const e of store.envios.values()) expect(e.texto).toContain('Link com comissão');
  });
});

describe('5.1 item 4: link de oferta só para wa, tg e at', () => {
  it('recusa Status, Radar e qualquer outro destino', () => {
    for (const destino of ['status', 'radar', 'entrada', '', 'WA']) {
      expect(() => montarSubIds({ destino, postId: 'p', blocoData: '2026-11-02', origem: 'rodada' })).toThrow(/só wa, tg e at/);
    }
    for (const destino of ['wa', 'tg', 'at']) {
      expect(montarSubIds({ destino, postId: 'p', blocoData: '2026-11-02', origem: 'rodada' }).sub1).toBe(destino);
    }
  });
});
