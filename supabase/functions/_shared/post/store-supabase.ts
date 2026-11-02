// PostStore sobre o Supabase (service_role). Usado pelas Edge Functions dos posts.
import type { SupabaseClient } from '@supabase/supabase-js';
import { resolverConfig } from '../core/config.ts';
import type { CanalPost } from '../core/post/formato.ts';
import type { Observacao } from '../core/post/historico.ts';
import type { EnvioRow, NovaNotificacao, NovoEnvio, NovoPost, OfertaPost, PostRow, PostStore, ProdutoPost } from './store.ts';

function falha(op: string, e: { message: string } | null): void {
  if (e) throw new Error(`${op}: ${e.message}`);
}

const num = (v: unknown): number | null => (v == null ? null : Number(v));

const COLS_PRODUTO = 'id, shopee_item_id, shopee_shop_id, nome, url_produto, imagem_url, em_estoque';
const COLS_POST =
  'id, tipo, oferta_id, produto_id, titulo, preco_atual, preco_referencia, de_manual, cupom, prazo, frase, imagem_url, origem_oferta, chave_produto, aprovado_por, aprovado_em';

function post(r: Record<string, unknown>): PostRow {
  return { ...(r as unknown as PostRow), preco_atual: Number(r.preco_atual), preco_referencia: num(r.preco_referencia), de_manual: num(r.de_manual) };
}
function envio(r: Record<string, unknown>): EnvioRow {
  return { ...(r as unknown as EnvioRow), guardia: (r.guardia as EnvioRow['guardia']) ?? [], telegram_message_id: num(r.telegram_message_id) };
}

export class PostStoreSupabase implements PostStore {
  constructor(private db: SupabaseClient) {}

  async config() {
    const r = await this.db.from('configuracoes').select('chave, valor');
    falha('config', r.error);
    return resolverConfig((r.data ?? []) as Array<{ chave: string; valor: unknown }>);
  }
  async buscarOferta(id: string) {
    const r = await this.db
      .from('ofertas')
      .select(`id, produto_id, estado, origem, preco_atual, preco_referencia, dias_historico, cupom, prazo, frase, produto:produtos(${COLS_PRODUTO})`)
      .eq('id', id)
      .maybeSingle();
    falha('buscarOferta', r.error);
    if (!r.data) return null;
    const { produto, ...o } = r.data as unknown as OfertaPost & { produto: ProdutoPost | null };
    if (!produto) return null;
    return { oferta: { ...o, preco_atual: Number(o.preco_atual), preco_referencia: num(o.preco_referencia) }, produto };
  }
  async buscarProduto(id: string) {
    const r = await this.db.from('produtos').select(COLS_PRODUTO).eq('id', id).maybeSingle();
    falha('buscarProduto', r.error);
    return (r.data as ProdutoPost | null) ?? null;
  }
  async buscarProdutoPorItem(shopId: string, itemId: string) {
    const r = await this.db.from('produtos').select(COLS_PRODUTO).eq('shopee_shop_id', shopId).eq('shopee_item_id', itemId).maybeSingle();
    falha('buscarProdutoPorItem', r.error);
    return (r.data as ProdutoPost | null) ?? null;
  }
  async historico(produtoId: string) {
    const r = await this.db.from('precos_observados').select('observado_em, preco').eq('produto_id', produtoId).order('observado_em');
    falha('historico', r.error);
    return ((r.data ?? []) as Observacao[]).map((o) => ({ observado_em: o.observado_em, preco: Number(o.preco) }));
  }
  async precoAgora(produtoId: string) {
    const p = await this.db.from('produtos').select('em_estoque').eq('id', produtoId).maybeSingle();
    falha('precoAgora/produto', p.error);
    if (!p.data) return null;
    const r = await this.db.from('precos_observados').select('preco').eq('produto_id', produtoId).order('observado_em', { ascending: false }).limit(1);
    falha('precoAgora', r.error);
    return { preco: r.data?.length ? Number(r.data[0].preco) : null, emEstoque: Boolean(p.data.em_estoque) };
  }
  async postDaOferta(ofertaId: string) {
    const r = await this.db.from('posts').select(COLS_POST).eq('oferta_id', ofertaId).order('criado_em').limit(1);
    falha('postDaOferta', r.error);
    return r.data?.length ? post(r.data[0]) : null;
  }
  async buscarPost(id: string) {
    const r = await this.db.from('posts').select(COLS_POST).eq('id', id).maybeSingle();
    falha('buscarPost', r.error);
    return r.data ? post(r.data) : null;
  }
  async criarPost(p: NovoPost) {
    const r = await this.db.from('posts').insert(p).select(COLS_POST).single();
    falha('criarPost', r.error);
    return post(r.data as Record<string, unknown>);
  }
  async atualizarPost(id: string, patch: Partial<NovoPost>) {
    const r = await this.db.from('posts').update(patch).eq('id', id);
    falha('atualizarPost', r.error);
  }
  async enviosDoPost(postId: string) {
    const r = await this.db.from('post_envios').select('*').eq('post_id', postId);
    falha('enviosDoPost', r.error);
    return (r.data ?? []).map(envio);
  }
  async enviosDoDia(canal: CanalPost, data: string) {
    const r = await this.db.from('post_envios').select('*').eq('canal', canal).eq('bloco_data', data);
    falha('enviosDoDia', r.error);
    return (r.data ?? []).map(envio);
  }
  async enviosEntre(canal: CanalPost, desde: Date, ate: Date) {
    const r = await this.db.from('post_envios').select('*').eq('canal', canal).gte('agendado_para', desde.toISOString()).lte('agendado_para', ate.toISOString());
    falha('enviosEntre', r.error);
    return (r.data ?? []).map(envio);
  }
  async criarEnvio(e: NovoEnvio) {
    const r = await this.db.from('post_envios').insert(e).select('*').single();
    falha('criarEnvio', r.error);
    return envio(r.data);
  }
  async atualizarEnvio(id: string, patch: Partial<EnvioRow>) {
    const r = await this.db.from('post_envios').update(patch).eq('id', id);
    falha('atualizarEnvio', r.error);
  }
  async enviosAgendadosAte(ate: Date) {
    const r = await this.db.from('post_envios').select('*').eq('estado', 'agendado').lte('agendado_para', ate.toISOString()).order('agendado_para');
    falha('enviosAgendadosAte', r.error);
    return (r.data ?? []).map(envio);
  }
  async enviosWaAbertosAte(ate: Date) {
    const r = await this.db.from('post_envios').select('*').eq('canal', 'wa').in('estado', ['agendado', 'revisar_preco']).lte('agendado_para', ate.toISOString());
    falha('enviosWaAbertosAte', r.error);
    return (r.data ?? []).map(envio);
  }
  async marcarOfertaAprovada(id: string, userId: string, quando: Date) {
    const r = await this.db
      .from('ofertas')
      .update({ estado: 'aprovada', decidido_por: userId, decidido_em: quando.toISOString() })
      .eq('id', id)
      .eq('estado', 'pendente');
    falha('marcarOfertaAprovada', r.error);
  }
  async idOperadora() {
    const r = await this.db.from('perfis').select('user_id').eq('papel', 'operadora').limit(1);
    falha('idOperadora', r.error);
    return (r.data?.[0]?.user_id as string | undefined) ?? null;
  }
  async criarNotificacao(n: NovaNotificacao) {
    const r = await this.db.from('notificacoes').insert(n);
    falha('criarNotificacao', r.error);
  }
  async registrarAtividade(agente: string, texto: string, link?: string) {
    const r = await this.db.from('atividades').insert({ agente, texto, link: link ?? null });
    falha('registrarAtividade', r.error);
  }
}
