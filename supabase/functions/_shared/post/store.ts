// Acesso a dados dos posts (F-06, F-07, F-08, F-16). Implementações: memória (testes) e Supabase.
import type { ConfigResolvida } from '../core/config.ts';
import type { CanalPost } from '../core/post/formato.ts';
import type { Checagem } from '../core/post/guardia.ts';
import type { SubIds } from '../core/post/links.ts';
import type { NomeBloco } from '../core/post/agenda.ts';
import type { Observacao } from '../core/post/historico.ts';

export type EstadoEnvio = 'agendado' | 'pausado' | 'revisar_preco' | 'bloqueado' | 'publicado' | 'enviado' | 'nao_enviado' | 'cancelado';
export type OrigemOferta = 'rodada' | 'pedido' | 'manual';

export interface ProdutoPost {
  id: string;
  shopee_item_id: string;
  shopee_shop_id: string;
  nome: string;
  url_produto: string;
  imagem_url: string | null;
  em_estoque: boolean;
}

export interface OfertaPost {
  id: string;
  produto_id: string;
  estado: string;
  origem: OrigemOferta;
  preco_atual: number;
  preco_referencia: number | null;
  dias_historico: number;
  cupom: string | null;
  prazo: string | null;
  frase: string | null;
}

export interface PostRow {
  id: string;
  tipo: 'oferta' | 'manual' | 'achado_pedido' | 'respostas';
  oferta_id: string | null;
  produto_id: string | null;
  titulo: string;
  preco_atual: number;
  preco_referencia: number | null;
  de_manual: number | null;
  cupom: string | null;
  prazo: string | null;
  frase: string | null;
  imagem_url: string | null;
  origem_oferta: OrigemOferta;
  chave_produto: string;
  aprovado_por: string | null;
  aprovado_em: string | null;
}

export interface EnvioRow {
  id: string;
  post_id: string;
  canal: CanalPost;
  link_afiliado: string | null;
  sub_ids: SubIds | null;
  texto: string;
  bloco_data: string;
  bloco: NomeBloco | null;
  agendado_para: string;
  estado: EstadoEnvio;
  guardia: Checagem[];
  chave_produto: string;
  checado_em: string | null;
  lembrete_em: string | null;
  publicado_em: string | null;
  telegram_message_id: number | null;
  erro: string | null;
}

export type NovoPost = Omit<PostRow, 'id'>;
export type NovoEnvio = Omit<EnvioRow, 'id' | 'publicado_em' | 'telegram_message_id' | 'erro' | 'checado_em' | 'lembrete_em'> &
  Partial<Pick<EnvioRow, 'checado_em'>>;

export interface NovaNotificacao {
  user_id: string | null;
  tipo: string;
  titulo: string;
  corpo: string;
  link: string;
  enviar_em: string;
}

export interface PostStore {
  config(): Promise<ConfigResolvida>;
  buscarOferta(id: string): Promise<{ oferta: OfertaPost; produto: ProdutoPost } | null>;
  buscarProduto(id: string): Promise<ProdutoPost | null>;
  buscarProdutoPorItem(shopId: string, itemId: string): Promise<ProdutoPost | null>;
  /** Observações de preço do produto (todas; a janela é aplicada no código). */
  historico(produtoId: string): Promise<Observacao[]>;
  /** Último preço observado e estoque, para a checagem antes do envio. */
  precoAgora(produtoId: string): Promise<{ preco: number | null; emEstoque: boolean } | null>;
  postDaOferta(ofertaId: string): Promise<PostRow | null>;
  buscarPost(id: string): Promise<PostRow | null>;
  criarPost(p: NovoPost): Promise<PostRow>;
  atualizarPost(id: string, patch: Partial<NovoPost>): Promise<void>;
  enviosDoPost(postId: string): Promise<EnvioRow[]>;
  /** Envios de um canal com bloco_data no dia. */
  enviosDoDia(canal: CanalPost, data: string): Promise<EnvioRow[]>;
  /** Envios de um canal agendados entre dois instantes. */
  enviosEntre(canal: CanalPost, desde: Date, ate: Date): Promise<EnvioRow[]>;
  criarEnvio(e: NovoEnvio): Promise<EnvioRow>;
  atualizarEnvio(id: string, patch: Partial<Omit<EnvioRow, 'id' | 'post_id' | 'canal'>>): Promise<void>;
  /** Estado 'agendado', agendado_para <= ate. */
  enviosAgendadosAte(ate: Date): Promise<EnvioRow[]>;
  /** WhatsApp em 'agendado' ou 'revisar_preco' com agendado_para <= ate. */
  enviosWaAbertosAte(ate: Date): Promise<EnvioRow[]>;
  marcarOfertaAprovada(id: string, userId: string, quando: Date): Promise<void>;
  idOperadora(): Promise<string | null>;
  criarNotificacao(n: NovaNotificacao): Promise<void>;
  registrarAtividade(agente: string, texto: string, link?: string): Promise<void>;
}
