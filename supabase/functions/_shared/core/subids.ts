// Códigos de origem dos links de afiliado (seção 5.5) e regra inviolável 5.1 item 4:
// link de oferta só existe para `wa`, `tg` (posts dos canais) e `at` (resposta individual da Atendente).
// Código puro (navegador, Node e Deno).

export type DestinoLink = 'wa' | 'tg' | 'at';
export const DESTINOS_LINK: readonly DestinoLink[] = ['wa', 'tg', 'at'];

export interface SubIds {
  sub1: DestinoLink;
  sub2: string; // ID do post (ou da resposta, para `at`)
  sub3: string; // data do bloco AAAAMMDD
  sub4: 'rodada' | 'pedido' | 'manual';
  sub5?: string; // livre (reservado)
}

/** A Shopee aceita subIDs curtos e sem caracteres especiais. [SUPOSIÇÃO] letras, números e "_", até 50. */
const SUB_VALIDO = /^[A-Za-z0-9_]{1,50}$/;

export interface PedidoSubIds {
  destino: string;
  postId: string;
  dataBloco: string; // AAAA-MM-DD
  origem: 'rodada' | 'pedido' | 'manual';
  livre?: string;
}

/** Monta e valida os subIDs. Lança erro para destino fora de wa/tg/at (Status e Radar nunca têm link de oferta). */
export function montarSubIds(p: PedidoSubIds): SubIds {
  if (!DESTINOS_LINK.includes(p.destino as DestinoLink)) {
    throw new Error(`destino sem link de oferta: ${p.destino}`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.dataBloco)) throw new Error(`data do bloco inválida: ${p.dataBloco}`);
  const sub2 = p.postId.replace(/-/g, '');
  const s: SubIds = { sub1: p.destino as DestinoLink, sub2, sub3: p.dataBloco.replace(/-/g, ''), sub4: p.origem };
  if (p.livre) s.sub5 = p.livre;
  for (const [k, v] of Object.entries(s)) {
    if (!SUB_VALIDO.test(v)) throw new Error(`subID ${k} inválido: ${v}`);
  }
  return s;
}

/** Lista na ordem sub1..sub5 (formato pedido pela API de link curto). */
export function listaSubIds(s: SubIds): string[] {
  const l = [s.sub1, s.sub2, s.sub3, s.sub4];
  if (s.sub5) l.push(s.sub5);
  return l;
}
