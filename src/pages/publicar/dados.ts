// Leituras e ações da tela Publicar. Tudo passa pelo login e pela RLS; as funções do servidor
// (post-manual, post-atualizar-preco, arte-gerar) fazem montagem, Guardiã e agendamento.
import type { SupabaseClient } from '@supabase/supabase-js';
import { useAcao, useConsulta, lista, ok } from '@/lib/dados';
import type { CorpoPostManual } from './manual';
import type { EnvioLinha, PostDoBloco } from './estado';
import { enviosCancelaveis } from './estado';

export const CHAVE_POSTS = (data: string) => ['publicar', 'posts', data];
export const CHAVE_ARTES = (data: string) => ['publicar', 'artes', data];

export function usePostsDoDia(data: string) {
  return useConsulta<EnvioLinha[]>(
    CHAVE_POSTS(data),
    async (sb) =>
      lista<EnvioLinha>(
        (await sb
          .from('post_envios')
          .select('id, post_id, canal, texto, agendado_para, estado, guardia, publicado_em, erro, posts(id, tipo, titulo, preco_atual, produto_id)')
          .eq('bloco_data', data)
          .order('agendado_para')) as unknown as { data: EnvioLinha[] | null; error: { message: string } | null },
      ),
    [],
    { refetchInterval: 30_000 },
  );
}

export interface ArteDoDia {
  id: string;
  oferta_id: string | null;
  arte_path: string | null;
  legenda: string;
  baixada_em: string | null;
  svg: string | null;
}

export function useArtesDoDia(data: string) {
  return useConsulta<ArteDoDia[]>(
    CHAVE_ARTES(data),
    async (sb) => {
      const linhas = lista<Omit<ArteDoDia, 'svg'>>(
        await sb.from('artes_status').select('id, oferta_id, arte_path, legenda, baixada_em').eq('data', data).order('criado_em'),
      );
      return Promise.all(linhas.map(async (l) => ({ ...l, svg: l.arte_path ? await lerSvg(sb, l.arte_path) : null })));
    },
    [],
  );
}

async function lerSvg(sb: SupabaseClient, caminho: string): Promise<string | null> {
  const r = await sb.storage.from('artes').download(caminho);
  if (r.error || !r.data) return null;
  return r.data.text();
}

async function chamar<T>(sb: SupabaseClient, funcao: string, corpo: Record<string, unknown>): Promise<T> {
  const r = await sb.functions.invoke(funcao, { body: corpo });
  if (r.error) {
    let msg = r.error.message;
    const ctx = (r.error as { context?: Response }).context;
    if (ctx && typeof ctx.json === 'function') {
      try {
        const j = await ctx.json();
        if (j && typeof j.erro === 'string') msg = j.erro;
      } catch {
        /* mantém a mensagem original */
      }
    }
    throw new Error(msg);
  }
  return r.data as T;
}

export function useMarcarEnviado(data: string) {
  return useAcao<{ envioId: string; userId: string }>(async (sb, { envioId, userId }) => {
    ok(
      await sb
        .from('post_envios')
        .update({ estado: 'enviado', enviado_por: userId, publicado_em: new Date().toISOString() })
        .eq('id', envioId)
        .eq('canal', 'wa')
        .eq('estado', 'agendado'),
    );
  }, [CHAVE_POSTS(data)]);
}

export function useCancelarPost(data: string) {
  return useAcao<PostDoBloco>(async (sb, p) => {
    const ids = enviosCancelaveis(p).map((e) => e.id);
    if (ids.length === 0) return;
    ok(await sb.from('post_envios').update({ estado: 'cancelado' }).in('id', ids).not('estado', 'in', '(publicado,enviado,nao_enviado,cancelado)'));
  }, [CHAVE_POSTS(data)]);
}

export function useAtualizarPreco(data: string) {
  return useAcao<{ post_id: string; preco_atual?: number }>(
    (sb, corpo) => chamar(sb, 'post-atualizar-preco', corpo),
    [CHAVE_POSTS(data)],
  );
}

export function useCriarPostManual(data: string) {
  return useAcao<CorpoPostManual, { post_id: string }>((sb, corpo) => chamar(sb, 'post-manual', { ...corpo }), [CHAVE_POSTS(data)]);
}

export function useGerarArtes(data: string) {
  return useAcao<{ refazer?: boolean }, { geradas: number; aviso?: string }>(
    (sb, { refazer }) => chamar(sb, 'arte-gerar', { data, refazer }),
    [CHAVE_ARTES(data)],
  );
}

export function useMarcarArteBaixada(data: string) {
  return useAcao<string>(async (sb, id) => {
    ok(await sb.from('artes_status').update({ baixada_em: new Date().toISOString() }).eq('id', id));
  }, [CHAVE_ARTES(data)]);
}
