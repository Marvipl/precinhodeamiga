// Implementações com Supabase (service_role) das dependências do Radar e da página de entrada.
import type { SupabaseClient } from '@supabase/supabase-js';
import { resolverConfig } from '../core/config.ts';
import type { DepsEntrada } from './entrada-clique.ts';
import type { LugarAcao, StoreRadar } from './acoes.ts';

function ok<T>(r: { data: T; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message);
  return r.data;
}

export function storeRadar(db: SupabaseClient): StoreRadar {
  return {
    lerLugar: async (id) =>
      ok(
        await db
          .from('radar_lugares')
          .select('id, nome, estado, proibe_links, origem, dias_permitidos, intervalo_dias')
          .eq('id', id)
          .maybeSingle(),
      ) as LugarAcao | null,
    origensUsadas: async () =>
      (ok(await db.from('radar_lugares').select('origem').not('origem', 'is', null)) ?? []).map((r: { origem: string }) => r.origem),
    ultimaDivulgacao: async (lugarId) => {
      const r = ok(
        await db.from('radar_divulgacoes').select('divulgado_em').eq('lugar_id', lugarId).order('divulgado_em', { ascending: false }).limit(1),
      ) as { divulgado_em: string }[] | null;
      return r?.[0]?.divulgado_em ?? null;
    },
    atualizarLugar: async (id, campos) => {
      ok(await db.from('radar_lugares').update(campos).eq('id', id));
    },
    inserirDivulgacao: async (d) => {
      ok(await db.from('radar_divulgacoes').insert(d));
    },
    atividade: async (texto) => {
      ok(await db.from('atividades').insert({ agente: 'radar', texto, link: '/radar' }));
    },
  };
}

export function depsEntrada(db: SupabaseClient, urlSite?: string): DepsEntrada {
  return {
    urlSite,
    origemConhecida: async (o) => {
      const r = ok(await db.from('radar_lugares').select('id').eq('origem', o).limit(1)) as unknown[] | null;
      return (r?.length ?? 0) > 0;
    },
    salDoDia: async () => ok(await db.rpc('entrada_sal_do_dia')) as string,
    registrar: async (origem, botao, resumo) => ok(await db.rpc('entrada_registrar', { p_origem: origem, p_botao: botao, p_resumo: resumo })) as boolean,
    linksCanais: async () => {
      const linhas = ok(await db.from('configuracoes').select('chave, valor').in('chave', ['canais.whatsapp_link', 'canais.telegram_link'])) ?? [];
      const c = resolverConfig(linhas as { chave: string; valor: unknown }[]);
      return { wa: String(c.linkCanalWhatsapp ?? ''), tg: String(c.linkCanalTelegram ?? '') };
    },
  };
}
