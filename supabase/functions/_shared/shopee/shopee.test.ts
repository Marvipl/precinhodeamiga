import { describe, expect, it } from 'vitest';
import { cabecalhoAutorizacao, sha256Hex } from './assinatura.ts';
import { clienteReal, normalizarNo } from './real.ts';
import { clienteSimulado } from './simulado.ts';
import { clienteShopee, modoShopee } from './index.ts';
import { montarSubIds } from '../core/subids.ts';

const SUBS = montarSubIds({ destino: 'wa', postId: 'post1', dataBloco: '2026-11-09', origem: 'rodada' });

describe('Shopee: modo', () => {
  it('sem chave ou com SHOPEE_MODO=simulado fica no simulado', () => {
    expect(modoShopee({})).toBe('simulado');
    expect(modoShopee({ SHOPEE_AFFILIATE_APP_ID: 'x' })).toBe('simulado');
    expect(modoShopee({ SHOPEE_AFFILIATE_APP_ID: 'x', SHOPEE_AFFILIATE_APP_SECRET: 'y', SHOPEE_MODO: 'simulado' })).toBe('simulado');
    expect(modoShopee({ SHOPEE_AFFILIATE_APP_ID: 'x', SHOPEE_AFFILIATE_APP_SECRET: 'y' })).toBe('real');
    expect(clienteShopee({}).modo).toBe('simulado');
  });
});

describe('Shopee: assinatura', () => {
  it('SHA256(AppId + Timestamp + Payload + Secret)', async () => {
    expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    const h = await cabecalhoAutorizacao('app-teste', 'segredo-teste', '{"q":1}', 1700000000);
    expect(h).toBe(`SHA256 Credential=app-teste, Timestamp=1700000000, Signature=${await sha256Hex('app-teste1700000000{"q":1}segredo-teste')}`);
  });
});

describe('Shopee: cliente real (com fetch falso)', () => {
  const no = {
    itemId: 111, shopId: 222, productName: 'Produto de teste A', productLink: 'https://exemplo.invalid/p/222/111', offerLink: 'https://exemplo.invalid/o',
    imageUrl: 'https://exemplo.invalid/i.jpg', priceMin: '49.90', priceMax: '59.90', commissionRate: '0.05', sellerCommissionRate: '0.07',
    sales: 120, ratingStar: '4.7', shopName: 'Loja de teste', periodEndTime: 1767225599,
  };

  it('normaliza o nó de productOfferV2', () => {
    const o = normalizarNo(no);
    expect(o).toMatchObject({ shopee_item_id: '111', shopee_shop_id: '222', preco: 49.9, comissao_taxa: 0.05, comissao_extra_taxa: 0.07, produto_nota: 4.7, vendas: 120, em_estoque: true });
    expect(o.url_produto).toBe('https://exemplo.invalid/p/222/111'); // link comum, não o offerLink
    expect(o.prazo).toBe(new Date(1767225599 * 1000).toISOString());
    expect(normalizarNo({ ...no, sellerCommissionRate: '0', periodEndTime: 0 })).toMatchObject({ comissao_extra_taxa: null, prazo: null });
  });

  it('assina, busca ofertas e gera link curto com subIDs', async () => {
    const chamadas: { url: string; auth: string; corpo: { query: string; variables: Record<string, unknown> } }[] = [];
    const f = (async (url: string, init: RequestInit) => {
      const corpo = JSON.parse(String(init.body));
      chamadas.push({ url, auth: (init.headers as Record<string, string>).Authorization, corpo });
      const data = corpo.query.includes('generateShortLink')
        ? { generateShortLink: { shortLink: 'https://exemplo.invalid/s/abc' } }
        : { productOfferV2: { nodes: [no], pageInfo: { hasNextPage: false } } };
      return new Response(JSON.stringify({ data }), { status: 200 });
    }) as unknown as typeof fetch;
    const c = clienteReal({ appId: 'app-teste', segredo: 'segredo-teste', fetch: f, agora: () => new Date(1700000000_000) });
    const r = await c.buscarOfertas({ palavraChave: 'palavra de teste' });
    expect(r.ofertas).toHaveLength(1);
    expect(chamadas[0].corpo.variables).toEqual({ keyword: 'palavra de teste', page: 1, limit: 20 });
    expect(chamadas[0].auth).toMatch(/^SHA256 Credential=app-teste, Timestamp=1700000000, Signature=[0-9a-f]{64}$/);
    const payload = JSON.stringify(chamadas[0].corpo);
    expect(chamadas[0].auth).toContain(await sha256Hex(`app-teste1700000000${payload}segredo-teste`));
    expect(await c.gerarLinkCurto('https://exemplo.invalid/p/222/111', SUBS)).toBe('https://exemplo.invalid/s/abc');
    expect(chamadas[1].corpo.variables).toEqual({ originUrl: 'https://exemplo.invalid/p/222/111', subIds: ['wa', 'post1', '20261109', 'rodada'] });
    expect((await c.consultarItem('222', '111'))?.preco).toBe(49.9);
  });

  it('erro da API vira exceção com a mensagem', async () => {
    const f = (async () => new Response(JSON.stringify({ errors: [{ message: 'assinatura inválida' }] }), { status: 200 })) as unknown as typeof fetch;
    await expect(clienteReal({ appId: 'a', segredo: 'b', fetch: f }).buscarOfertas({ palavraChave: 'x' })).rejects.toThrow('Shopee: assinatura inválida');
  });
});

describe('Shopee: simulado', () => {
  it('é determinístico, fictício e varia o preço por dia', async () => {
    const dia1 = clienteSimulado({ agora: () => new Date('2026-11-09T08:00:00Z') });
    const dia2 = clienteSimulado({ agora: () => new Date('2026-11-10T08:00:00Z') });
    const a = await dia1.buscarOfertas({ palavraChave: 'palavra de teste', limite: 20 });
    const b = await dia1.buscarOfertas({ palavraChave: 'palavra de teste', limite: 20 });
    expect(a).toEqual(b);
    expect(a.ofertas).toHaveLength(8);
    for (const o of a.ofertas) {
      expect(o.nome).toMatch(/^Produto de teste [A-H] \(palavra de teste\)$/);
      expect(o.url_produto.startsWith('https://exemplo.invalid/')).toBe(true);
    }
    const c = await dia2.buscarOfertas({ palavraChave: 'palavra de teste', limite: 20 });
    expect(c.ofertas.map((o) => o.shopee_item_id)).toEqual(a.ofertas.map((o) => o.shopee_item_id));
    expect(c.ofertas.map((o) => o.preco)).not.toEqual(a.ofertas.map((o) => o.preco));
    const pag = await dia1.buscarOfertas({ palavraChave: 'palavra de teste', limite: 5 });
    expect(pag.temMais).toBe(true);
  });

  it('link curto fictício carrega os subIDs', async () => {
    const l = await clienteSimulado().gerarLinkCurto('https://exemplo.invalid/shopee/produto/1/2', SUBS);
    expect(l).toMatch(/^https:\/\/exemplo\.invalid\/shopee\/s\/[0-9a-z]+\?sub1=wa&sub2=post1&sub3=20261109&sub4=rodada$/);
  });
});
