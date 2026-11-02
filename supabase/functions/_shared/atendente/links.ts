// Links de oferta nas respostas individuais da Atendente: sempre de afiliado com sub1=at (seção 5.1, item 4).
// Usa o gerador do pacote de posts (`_shared/post/links.ts`), que escolhe o cliente da Shopee pelas chaves.
import type { SupabaseClient } from '@supabase/supabase-js';
import { montarSubIds } from '../core/post/links.ts';
import { dataLocal } from '../core/formato.ts';
import type { GeradorLinkAfiliado } from '../post/links.ts';

/** Gera os links de afiliado (destino `at`) dos produtos citados numa resposta. */
export type GeradorLinks = (produtoIds: string[], ctx: { mensagemId: string; agora: Date }) => Promise<Record<string, string>>;

export function geradorLinksAtendente(db: SupabaseClient, gerador: GeradorLinkAfiliado): GeradorLinks {
  return async (ids, ctx) => {
    if (!ids.length) return {};
    const r = await db.from('produtos').select('id, url_produto').in('id', ids);
    if (r.error) throw new Error(r.error.message);
    const out: Record<string, string> = {};
    for (const p of r.data ?? []) {
      // sub2 = resposta (mensagem); sub4 = pedido: a resposta individual nasce de uma pergunta ou pedido.
      const s = montarSubIds({ destino: 'at', postId: ctx.mensagemId, blocoData: dataLocal(ctx.agora), origem: 'pedido' });
      out[p.id as string] = await gerador.gerar(p.url_produto as string, s);
    }
    return out;
  };
}

/** Simulado para testes: link fictício que carrega o destino `at`. */
export const linksSimulados: GeradorLinks = async (ids) =>
  Object.fromEntries(ids.map((id) => [id, `https://exemplo.invalid/shopee/s/simulado-at-${id.replace(/-/g, '').slice(0, 12)}`]));
