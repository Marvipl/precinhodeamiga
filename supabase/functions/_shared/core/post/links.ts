// Links de oferta e códigos de origem (seções 5.1 item 4 e 5.5). Código puro.
//
// Link de oferta só existe para três destinos: canal do WhatsApp (wa), canal do Telegram (tg)
// e resposta individual da Atendente (at). Status e Radar usam só o link de entrada.

export const DESTINOS_LINK_OFERTA = ['wa', 'tg', 'at'] as const;
export type DestinoLinkOferta = (typeof DESTINOS_LINK_OFERTA)[number];

export interface SubIds {
  sub1: DestinoLinkOferta;
  /** ID do post sem hífens. [SUPOSIÇÃO S29] */
  sub2: string;
  /** Data do bloco AAAAMMDD. */
  sub3: string;
  /** Origem da oferta: rodada, pedido ou manual. */
  sub4: 'rodada' | 'pedido' | 'manual';
  sub5?: string;
}

export function destinoPermitido(destino: string): destino is DestinoLinkOferta {
  return (DESTINOS_LINK_OFERTA as readonly string[]).includes(destino);
}

/** Monta os subIDs. Recusa qualquer destino fora de wa/tg/at (ex.: status, radar). */
export function montarSubIds(p: { destino: string; postId: string; blocoData: string; origem: string }): SubIds {
  if (!destinoPermitido(p.destino)) {
    throw new Error(`link de oferta não pode ser gerado para o destino "${p.destino}" (só wa, tg e at)`);
  }
  const origem = p.origem === 'pedido' || p.origem === 'manual' ? p.origem : 'rodada';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.blocoData)) throw new Error(`data do bloco inválida: ${p.blocoData}`);
  return {
    sub1: p.destino,
    sub2: p.postId.replace(/-/g, ''),
    sub3: p.blocoData.replace(/-/g, ''),
    sub4: origem,
  };
}

const HOSTS_SHOPEE = ['shopee.com.br', 's.shopee.com.br', 'shope.ee'];
/** Host dos links simulados (modo sem chave da Shopee). O domínio .invalid nunca resolve. */
export const HOST_SIMULADO = 'exemplo.invalid';

/** Link de afiliado aceito pela Guardiã: Shopee com https, ou link simulado do modo de desenvolvimento. */
export function hostAfiliadoValido(url: string): boolean {
  if (hostShopee(url)) return true;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && u.hostname === HOST_SIMULADO && u.pathname.startsWith('/shopee/');
  } catch {
    return false;
  }
}

export function hostShopee(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') return false;
    const h = u.hostname.toLowerCase();
    return HOSTS_SHOPEE.includes(h) || h.endsWith('.shopee.com.br');
  } catch {
    return false;
  }
}

/**
 * Link de afiliado válido e com o código do canal (Guardiã, na montagem).
 * `subIds` = códigos com que o link foi gerado pela plataforma; null no post manual (F-16),
 * em que a Lana gera o link no painel e o código do canal não pode ser conferido pela URL curta.
 */
export function checarLinkAfiliado(link: string | null | undefined, canal: 'wa' | 'tg', subIds: SubIds | null): { ok: boolean; mensagem: string } {
  if (!link || !link.trim()) return { ok: false, mensagem: 'Post sem link de afiliado.' };
  if (!hostAfiliadoValido(link.trim())) return { ok: false, mensagem: 'O link não é um link da Shopee com https.' };
  if (subIds && subIds.sub1 !== canal) {
    return { ok: false, mensagem: `O link foi gerado com o código "${subIds.sub1}", não com o código do canal "${canal}".` };
  }
  return { ok: true, mensagem: subIds ? 'Link de afiliado com o código do canal.' : 'Link manual da Shopee.' };
}

/** Item da Shopee a partir da URL comum ou longa (…-i.<loja>.<item> ou /product/<loja>/<item>). */
export function itemDoLink(url: string): { shopId: string; itemId: string } | null {
  const m = url.match(/[-.]i\.(\d+)\.(\d+)/) ?? url.match(/\/product\/(\d+)\/(\d+)/);
  return m ? { shopId: m[1], itemId: m[2] } : null;
}

/**
 * Chave usada na regra de "mesmo produto no mesmo canal nas últimas 48 horas":
 * o item da Shopee quando conhecido; senão, o próprio link normalizado.
 */
export function chaveProduto(p: { shopId?: string | null; itemId?: string | null; link?: string | null }): string {
  if (p.shopId && p.itemId) return `shopee:${p.shopId}:${p.itemId}`;
  const item = p.link ? itemDoLink(p.link) : null;
  if (item) return `shopee:${item.shopId}:${item.itemId}`;
  return `link:${(p.link ?? '').trim().toLowerCase().replace(/[?#].*$/, '')}`;
}
