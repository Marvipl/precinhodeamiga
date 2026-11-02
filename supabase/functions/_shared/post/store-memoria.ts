// PostStore em memória para testes. Só dados fictícios.
import { resolverConfig, type ConfigResolvida } from '../core/config.ts';
import type { CanalPost } from '../core/post/formato.ts';
import type { Observacao } from '../core/post/historico.ts';
import type { EnvioRow, NovaNotificacao, NovoEnvio, NovoPost, OfertaPost, PostRow, PostStore, ProdutoPost } from './store.ts';

let seq = 0;
function id(prefixo: string): string {
  seq += 1;
  const n = String(seq).padStart(12, '0');
  return `${prefixo.padEnd(8, '0').slice(0, 8)}-0000-4000-8000-${n}`;
}

export class PostStoreMemoria implements PostStore {
  configLinhas: Array<{ chave: string; valor: unknown }> = [];
  produtos = new Map<string, ProdutoPost>();
  ofertas = new Map<string, OfertaPost>();
  observacoes = new Map<string, Observacao[]>();
  posts = new Map<string, PostRow>();
  envios = new Map<string, EnvioRow>();
  notificacoes: NovaNotificacao[] = [];
  atividades: Array<{ agente: string; texto: string; link?: string }> = [];
  aprovacoes: Array<{ id: string; userId: string }> = [];
  operadora: string | null = null;

  async config(): Promise<ConfigResolvida> {
    return resolverConfig(this.configLinhas);
  }
  async buscarOferta(idOferta: string) {
    const oferta = this.ofertas.get(idOferta);
    if (!oferta) return null;
    const produto = this.produtos.get(oferta.produto_id);
    return produto ? { oferta, produto } : null;
  }
  async buscarProduto(idProduto: string) {
    return this.produtos.get(idProduto) ?? null;
  }
  async buscarProdutoPorItem(shopId: string, itemId: string) {
    return [...this.produtos.values()].find((p) => p.shopee_shop_id === shopId && p.shopee_item_id === itemId) ?? null;
  }
  async historico(produtoId: string) {
    return this.observacoes.get(produtoId) ?? [];
  }
  async precoAgora(produtoId: string) {
    const p = this.produtos.get(produtoId);
    if (!p) return null;
    const obs = [...(this.observacoes.get(produtoId) ?? [])].sort((a, b) => a.observado_em.localeCompare(b.observado_em));
    return { preco: obs.length ? obs[obs.length - 1].preco : null, emEstoque: p.em_estoque };
  }
  async postDaOferta(ofertaId: string) {
    return [...this.posts.values()].find((p) => p.oferta_id === ofertaId) ?? null;
  }
  async buscarPost(idPost: string) {
    return this.posts.get(idPost) ?? null;
  }
  async criarPost(p: NovoPost) {
    const row = { ...p, id: id('a0000000') };
    this.posts.set(row.id, row);
    return row;
  }
  async atualizarPost(idPost: string, patch: Partial<NovoPost>) {
    const p = this.posts.get(idPost);
    if (p) this.posts.set(idPost, { ...p, ...patch });
  }
  async enviosDoPost(postId: string) {
    return [...this.envios.values()].filter((e) => e.post_id === postId);
  }
  async enviosDoDia(canal: CanalPost, data: string) {
    return [...this.envios.values()].filter((e) => e.canal === canal && e.bloco_data === data);
  }
  async enviosEntre(canal: CanalPost, desde: Date, ate: Date) {
    return [...this.envios.values()].filter((e) => {
      const t = new Date(e.agendado_para).getTime();
      return e.canal === canal && t >= desde.getTime() && t <= ate.getTime();
    });
  }
  async criarEnvio(e: NovoEnvio) {
    const row: EnvioRow = { publicado_em: null, telegram_message_id: null, erro: null, checado_em: null, lembrete_em: null, ...e, id: id('b0000000') };
    this.envios.set(row.id, row);
    return row;
  }
  async atualizarEnvio(idEnvio: string, patch: Partial<EnvioRow>) {
    const e = this.envios.get(idEnvio);
    if (e) this.envios.set(idEnvio, { ...e, ...patch });
  }
  async enviosAgendadosAte(ate: Date) {
    return [...this.envios.values()]
      .filter((e) => e.estado === 'agendado' && new Date(e.agendado_para).getTime() <= ate.getTime())
      .sort((a, b) => a.agendado_para.localeCompare(b.agendado_para));
  }
  async enviosWaAbertosAte(ate: Date) {
    return [...this.envios.values()].filter(
      (e) => e.canal === 'wa' && (e.estado === 'agendado' || e.estado === 'revisar_preco') && new Date(e.agendado_para).getTime() <= ate.getTime(),
    );
  }
  async marcarOfertaAprovada(idOferta: string, userId: string) {
    const o = this.ofertas.get(idOferta);
    if (o) this.ofertas.set(idOferta, { ...o, estado: 'aprovada' });
    this.aprovacoes.push({ id: idOferta, userId });
  }
  async idOperadora() {
    return this.operadora;
  }
  async criarNotificacao(n: NovaNotificacao) {
    this.notificacoes.push(n);
  }
  async registrarAtividade(agente: string, texto: string, link?: string) {
    this.atividades.push({ agente, texto, link });
  }
}
