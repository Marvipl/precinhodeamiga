// Casos de uso dos posts: aprovar oferta (F-04/F-06), post manual (F-16), atualizar preço, publicar bloco (F-08).
// As decisões (limite, cálculo, permissão) vêm do código puro em core/post/. Aqui só se orquestra o banco.
// Não existe nenhum caminho de envio para o WhatsApp: o canal 'wa' só recebe texto pronto e lembrete.

import { dataLocal, horaLocal, instanteLocal, somarDias } from '../core/formato.ts';
import type { ConfigResolvida } from '../core/config.ts';
import { formatarPost, type CanalPost } from '../core/post/formato.ts';
import { blocosLigados, cadenciaDoCanal, contaNaCadencia, fimDoBloco, planejarBloco, type Bloco, type NomeBloco, type RegrasAgenda } from '../core/post/agenda.ts';
import { bloqueia, checarAntesDoEnvio, checarCadencia, checarMontagem, checarRepeticao, liberadoParaTelegram, resolverDePor, type Checagem } from '../core/post/guardia.ts';
import { chaveProduto, hostShopee, itemDoLink, montarSubIds, type SubIds } from '../core/post/links.ts';
import { resumoHistorico } from '../core/post/historico.ts';
import type { GeradorLinkAfiliado } from './links.ts';
import type { ClienteTelegram } from '../telegram/cliente.ts';
import type { EnvioRow, PostRow, PostStore } from './store.ts';

export class ErroPost extends Error {
  constructor(public status: number, mensagem: string) {
    super(mensagem);
  }
}

export interface DepsPost {
  store: PostStore;
  links: GeradorLinkAfiliado;
  agora?: () => Date;
}

export interface ResumoEnvio {
  canal: CanalPost;
  estado: string;
  agendado_para: string | null;
  guardia: Checagem[];
}

const MIN = 60_000;
const DIAS_PROCURA = 7;
const CANAIS: CanalPost[] = ['wa', 'tg'];

function regrasAgenda(cfg: ConfigResolvida): RegrasAgenda {
  return { intervaloMaxMin: cfg.intervaloMaxMin, intervaloMinMin: cfg.intervaloMinMin, checagemAntesEnvioMin: cfg.checagemAntesEnvioMin };
}

function validarCanais(canais: unknown): CanalPost[] {
  if (!Array.isArray(canais) || canais.length === 0) throw new ErroPost(400, 'Escolha ao menos um canal.');
  const unicos = [...new Set(canais)];
  if (!unicos.every((c) => c === 'wa' || c === 'tg')) throw new ErroPost(400, 'Canal inválido (use wa e tg).');
  return CANAIS.filter((c) => unicos.includes(c));
}

function validarFrase(frase: unknown, max: number): string | null {
  if (frase == null) return null;
  if (typeof frase !== 'string') throw new ErroPost(400, 'Frase inválida.');
  const f = frase.replace(/\s+/g, ' ').trim();
  if (!f) return null;
  if (f.length > max) throw new ErroPost(400, `A frase passa de ${max} caracteres.`);
  return f;
}

function preco(v: unknown, campo: string): number {
  const n = typeof v === 'string' ? Number(v.replace(',', '.')) : Number(v);
  if (!Number.isFinite(n) || n <= 0) throw new ErroPost(400, `${campo} inválido.`);
  return Math.round(n * 100) / 100;
}

// ---------------------------------------------------------------------------
// Agendamento (Agendadora + checagens de agendamento da Guardiã)
// ---------------------------------------------------------------------------

interface Vaga {
  data: string;
  bloco: Bloco;
  horario: Date;
  remanejar: Array<{ id: string; agendado_para: string }>;
  checagens: Checagem[];
}

type ResultadoCanal = { ok: true; vaga: Vaga } | { ok: false; checagens: Checagem[] };

/** Envio que ainda pode mudar de horário dentro do bloco. */
function movel(e: EnvioRow, agora: Date, regras: RegrasAgenda): boolean {
  return e.estado === 'agendado' && !e.checado_em && new Date(e.agendado_para).getTime() > agora.getTime() + regras.checagemAntesEnvioMin * MIN;
}

/** Primeira vaga do canal a partir de hoje: cadência do dia e espaço no bloco. Guarda por dia o motivo de cada pulo. */
async function procurarVaga(
  store: PostStore,
  cfg: ConfigResolvida,
  canal: CanalPost,
  prazo: Date | null,
  agora: Date,
): Promise<{ vaga: Vaga | null; diasSemCadencia: Set<string>; ultimaCadencia: Checagem | null; motivo: string }> {
  const regras = regrasAgenda(cfg);
  const blocos = blocosLigados(cfg);
  const diasSemCadencia = new Set<string>();
  let ultimaCadencia: Checagem | null = null;
  if (blocos.length === 0) return { vaga: null, diasSemCadencia, ultimaCadencia, motivo: 'Nenhum bloco de posts ligado em Configurações.' };
  const hoje = dataLocal(agora);
  for (let d = 0; d < DIAS_PROCURA; d++) {
    const data = somarDias(hoje, d);
    const doDia = await store.enviosDoDia(canal, data);
    const ocupados = doDia.filter((e) => contaNaCadencia(e.estado)).length;
    const cad = checarCadencia({ ocupados, cadencia: cadenciaDoCanal(cfg) }, agora);
    if (!cad.ok) {
      diasSemCadencia.add(data);
      ultimaCadencia = cad;
      continue;
    }
    for (const bloco of blocos) {
      if (prazo && instanteLocal(data, bloco.inicioLimite).getTime() > prazo.getTime()) {
        return { vaga: null, diasSemCadencia, ultimaCadencia, motivo: 'A oferta acaba antes do próximo horário livre.' };
      }
      const noBloco = doDia.filter((e) => contaNaCadencia(e.estado) && (e.bloco ?? 'noite') === bloco.nome);
      const moveis = noBloco.filter((e) => movel(e, agora, regras)).sort((a, b) => a.agendado_para.localeCompare(b.agendado_para));
      const fixos = noBloco.filter((e) => !movel(e, agora, regras)).map((e) => new Date(e.agendado_para));
      const plano = planejarBloco({ data, bloco, fixos, moveis: moveis.length + 1, agora, regras });
      if (!plano) continue;
      const horario = plano[plano.length - 1];
      if (prazo && horario.getTime() > prazo.getTime()) continue;
      return {
        vaga: { data, bloco, horario, remanejar: moveis.map((e, i) => ({ id: e.id, agendado_para: plano[i].toISOString() })), checagens: [cad] },
        diasSemCadencia,
        ultimaCadencia,
        motivo: '',
      };
    }
  }
  return { vaga: null, diasSemCadencia, ultimaCadencia, motivo: `Sem vaga nos próximos ${DIAS_PROCURA} dias.` };
}

/**
 * Decide a vaga de cada canal (seção 5.3 e 5.6): se um canal está com a cadência cheia no dia em que o outro
 * tem vaga, o post sai só no outro. Sem vaga em nenhum, fica para o dia seguinte, se ainda valer.
 */
async function decidirVagas(store: PostStore, cfg: ConfigResolvida, canais: CanalPost[], chave: string, prazo: Date | null, agora: Date): Promise<Record<CanalPost, ResultadoCanal>> {
  const busca = await Promise.all(canais.map(async (c) => [c, await procurarVaga(store, cfg, c, prazo, agora)] as const));
  const dias = busca.map(([, b]) => b.vaga?.data).filter((x): x is string => !!x).sort();
  const primeiroDia = dias[0];
  const out = {} as Record<CanalPost, ResultadoCanal>;
  for (const [canal, b] of busca) {
    if (!b.vaga) {
      const msg = b.ultimaCadencia && !b.motivo.startsWith('A oferta') ? b.ultimaCadencia.mensagem : b.motivo;
      out[canal] = { ok: false, checagens: [{ checagem: 'cadencia', ok: false, mensagem: msg, quando: 'agendamento', efeito: 'bloqueia', em: agora.toISOString() }] };
      continue;
    }
    if (primeiroDia && b.vaga.data > primeiroDia && b.diasSemCadencia.has(primeiroDia)) {
      out[canal] = { ok: false, checagens: [b.ultimaCadencia ?? checarCadencia({ ocupados: 1, cadencia: 0 }, agora)] };
      continue;
    }
    const H48 = cfg.repeticaoHoras * 3_600_000;
    const perto = await store.enviosEntre(canal, new Date(b.vaga.horario.getTime() - H48), new Date(b.vaga.horario.getTime() + H48));
    const rep = checarRepeticao({ chave, canal, horario: b.vaga.horario, existentes: perto, horas: cfg.repeticaoHoras }, agora);
    if (!rep.ok) {
      out[canal] = { ok: false, checagens: [rep] };
      continue;
    }
    out[canal] = { ok: true, vaga: { ...b.vaga, checagens: [...b.vaga.checagens, rep] } };
  }
  return out;
}

interface MontagemCanal {
  post: PostRow;
  linkPara: (canal: CanalPost, subIds: SubIds | null) => Promise<{ link: string | null; erro?: string }>;
  usarSubIds: boolean;
  checagensPost: Checagem[];
}

async function montarEnvios(deps: DepsPost, cfg: ConfigResolvida, canais: CanalPost[], m: MontagemCanal, agora: Date): Promise<ResumoEnvio[]> {
  const { store } = deps;
  const prazo = m.post.prazo ? new Date(m.post.prazo) : null;
  const vagas = await decidirVagas(store, cfg, canais, m.post.chave_produto, prazo, agora);
  const out: ResumoEnvio[] = [];
  for (const canal of canais) {
    const v = vagas[canal];
    const dataBloco = v.ok ? v.vaga.data : dataLocal(agora);
    const subIds = m.usarSubIds ? montarSubIds({ destino: canal, postId: m.post.id, blocoData: dataBloco, origem: m.post.origem_oferta }) : null;
    const { link, erro } = await m.linkPara(canal, subIds);
    const texto = formatarPost({ ...m.post, link: link ?? '' }, canal);
    const montagem = checarMontagem({ texto, link, canal, subIds }, agora);
    if (erro) montagem.push({ checagem: 'link_afiliado', ok: false, mensagem: erro, quando: 'montagem', efeito: 'bloqueia', em: agora.toISOString() });
    const guardia = [...m.checagensPost, ...montagem, ...(v.ok ? v.vaga.checagens : v.checagens)];
    const okFinal = v.ok && !bloqueia(montagem);
    const horario = v.ok ? v.vaga.horario : agora;
    if (okFinal && v.ok) {
      for (const r of v.vaga.remanejar) await store.atualizarEnvio(r.id, { agendado_para: r.agendado_para });
    }
    const criado = await store.criarEnvio({
      post_id: m.post.id,
      canal,
      link_afiliado: link,
      sub_ids: subIds,
      texto,
      bloco_data: dataBloco,
      bloco: v.ok ? v.vaga.bloco.nome : null,
      agendado_para: horario.toISOString(),
      estado: okFinal ? 'agendado' : 'bloqueado',
      guardia,
      chave_produto: m.post.chave_produto,
    });
    out.push({ canal, estado: criado.estado, agendado_para: okFinal ? criado.agendado_para : null, guardia });
  }
  const agendados = out.filter((e) => e.estado === 'agendado');
  const descr = agendados.length
    ? agendados.map((e) => `${e.canal === 'wa' ? 'WhatsApp' : 'Telegram'} às ${horaLocal(new Date(e.agendado_para!))}`).join(', ')
    : 'nenhum canal (barrado pela Guardiã)';
  await store.registrarAtividade('agendadora', `Post de ${m.post.titulo} agendado: ${descr}.`, '/publicar');
  return out;
}

// ---------------------------------------------------------------------------
// F-04 / F-06 Aprovar oferta
// ---------------------------------------------------------------------------

export async function aprovarOferta(
  deps: DepsPost,
  p: { oferta_id: unknown; canais: unknown; frase?: unknown; userId: string },
): Promise<{ post_id: string; criado: boolean; envios: ResumoEnvio[] }> {
  const agora = deps.agora?.() ?? new Date();
  const cfg = await deps.store.config();
  if (typeof p.oferta_id !== 'string' || !p.oferta_id) throw new ErroPost(400, 'oferta_id ausente.');
  const canais = validarCanais(p.canais);
  const existente = await deps.store.postDaOferta(p.oferta_id);
  if (existente) {
    const envios = await deps.store.enviosDoPost(existente.id);
    return { post_id: existente.id, criado: false, envios: envios.map((e) => ({ canal: e.canal, estado: e.estado, agendado_para: e.agendado_para, guardia: e.guardia })) };
  }
  const achado = await deps.store.buscarOferta(p.oferta_id);
  if (!achado) throw new ErroPost(422, 'Oferta não encontrada.');
  const { oferta, produto } = achado;
  if (oferta.estado !== 'pendente' && oferta.estado !== 'aprovada') throw new ErroPost(409, `A oferta está "${oferta.estado}" e não pode ser aprovada.`);
  const frase = p.frase === undefined ? validarFrase(oferta.frase, cfg.fraseMaxCaracteres) : validarFrase(p.frase, cfg.fraseMaxCaracteres);

  const dePor = resolverDePor(
    { precoAtual: Number(oferta.preco_atual), mediana: oferta.preco_referencia, diasHistorico: oferta.dias_historico },
    { descontoRealMinimo: cfg.descontoRealMinimo, historicoCurtoDias: cfg.historicoCurtoDias },
    agora,
  );
  const post = await deps.store.criarPost({
    tipo: oferta.origem === 'pedido' ? 'achado_pedido' : 'oferta',
    oferta_id: oferta.id,
    produto_id: produto.id,
    titulo: produto.nome,
    preco_atual: Number(oferta.preco_atual),
    preco_referencia: dePor.precoReferencia,
    de_manual: null,
    cupom: oferta.cupom,
    prazo: oferta.prazo,
    frase,
    imagem_url: produto.imagem_url,
    origem_oferta: oferta.origem,
    chave_produto: chaveProduto({ shopId: produto.shopee_shop_id, itemId: produto.shopee_item_id }),
    aprovado_por: p.userId,
    aprovado_em: agora.toISOString(),
  });
  const envios = await montarEnvios(
    deps,
    cfg,
    canais,
    {
      post,
      usarSubIds: true,
      checagensPost: dePor.checagens,
      linkPara: async (_c, subIds) => {
        try {
          return { link: await deps.links.gerar(produto.url_produto, subIds!) };
        } catch (e) {
          return { link: null, erro: `Link de afiliado indisponível: ${e instanceof Error ? e.message : String(e)}` };
        }
      },
    },
    agora,
  );
  await deps.store.marcarOfertaAprovada(oferta.id, p.userId, agora);
  return { post_id: post.id, criado: true, envios };
}

// ---------------------------------------------------------------------------
// F-16 Post manual
// ---------------------------------------------------------------------------

export interface EntradaPostManual {
  link_afiliado: unknown;
  titulo: unknown;
  preco_atual: unknown;
  preco_referencia?: unknown;
  cupom?: unknown;
  prazo?: unknown;
  frase?: unknown;
  canais: unknown;
  userId: string;
}

export async function criarPostManual(deps: DepsPost, p: EntradaPostManual): Promise<{ post_id: string; envios: ResumoEnvio[] }> {
  const agora = deps.agora?.() ?? new Date();
  const cfg = await deps.store.config();
  const canais = validarCanais(p.canais);
  const link = typeof p.link_afiliado === 'string' ? p.link_afiliado.trim() : '';
  if (!hostShopee(link)) throw new ErroPost(400, 'Cole o link de afiliado da Shopee (começa com https).');
  const titulo = typeof p.titulo === 'string' ? p.titulo.replace(/\s+/g, ' ').trim() : '';
  if (!titulo) throw new ErroPost(400, 'Informe o nome do produto.');
  const precoAtual = preco(p.preco_atual, 'Preço');
  const deManual = p.preco_referencia == null || p.preco_referencia === '' ? null : preco(p.preco_referencia, 'Preço "de"');
  const frase = validarFrase(p.frase, cfg.fraseMaxCaracteres);
  const cupom = typeof p.cupom === 'string' && p.cupom.trim() ? p.cupom.trim() : null;
  let prazo: string | null = null;
  if (p.prazo != null && p.prazo !== '') {
    const d = new Date(String(p.prazo));
    if (Number.isNaN(d.getTime())) throw new ErroPost(400, 'Prazo inválido.');
    if (d.getTime() <= agora.getTime()) throw new ErroPost(400, 'O prazo já passou.');
    prazo = d.toISOString();
  }

  const item = itemDoLink(link);
  const produto = item ? await deps.store.buscarProdutoPorItem(item.shopId, item.itemId) : null;
  const hist = produto ? resumoHistorico(await deps.store.historico(produto.id), dataLocal(agora), cfg.janelaHistoricoDias) : { mediana: null, maximo: null, dias: 0 };
  const dePor =
    deManual == null
      ? { precoReferencia: null, checagens: [] as Checagem[] }
      : resolverDePor(
          { precoAtual, mediana: hist.mediana, diasHistorico: hist.dias, maximoJanela: hist.maximo, deManual },
          { descontoRealMinimo: cfg.descontoRealMinimo, historicoCurtoDias: cfg.historicoCurtoDias },
          agora,
        );
  const avisoLink: Checagem = {
    checagem: 'link_manual',
    ok: false,
    efeito: 'alerta',
    quando: 'montagem',
    mensagem: 'Link colado à mão: confira se ele foi gerado no painel com o código do canal.',
    em: agora.toISOString(),
  };
  const post = await deps.store.criarPost({
    tipo: 'manual',
    oferta_id: null,
    produto_id: produto?.id ?? null,
    titulo,
    preco_atual: precoAtual,
    preco_referencia: dePor.precoReferencia,
    de_manual: deManual,
    cupom,
    prazo,
    frase,
    imagem_url: produto?.imagem_url ?? null,
    origem_oferta: 'manual',
    chave_produto: chaveProduto({ shopId: produto?.shopee_shop_id, itemId: produto?.shopee_item_id, link }),
    aprovado_por: p.userId,
    aprovado_em: agora.toISOString(),
  });
  const envios = await montarEnvios(deps, cfg, canais, { post, usarSubIds: false, checagensPost: [...dePor.checagens, avisoLink], linkPara: async () => ({ link }) }, agora);
  return { post_id: post.id, envios };
}

// ---------------------------------------------------------------------------
// Atualizar preço (post pausado ou "Revisar preço")
// ---------------------------------------------------------------------------

export async function atualizarPreco(deps: DepsPost, p: { post_id: unknown; preco_atual?: unknown }): Promise<{ post_id: string; envios: ResumoEnvio[] }> {
  const agora = deps.agora?.() ?? new Date();
  const cfg = await deps.store.config();
  if (typeof p.post_id !== 'string' || !p.post_id) throw new ErroPost(400, 'post_id ausente.');
  const post = await deps.store.buscarPost(p.post_id);
  if (!post) throw new ErroPost(422, 'Post não encontrado.');
  const abertos = (await deps.store.enviosDoPost(post.id)).filter((e) => e.estado === 'pausado' || e.estado === 'revisar_preco' || e.estado === 'agendado');
  if (abertos.length === 0) throw new ErroPost(409, 'Este post não tem envio para atualizar.');

  let novoPreco: number;
  let emEstoque: boolean | null = null;
  if (p.preco_atual != null && p.preco_atual !== '') {
    novoPreco = preco(p.preco_atual, 'Preço');
    if (post.produto_id) emEstoque = (await deps.store.precoAgora(post.produto_id))?.emEstoque ?? null;
  } else {
    const agoraP = post.produto_id ? await deps.store.precoAgora(post.produto_id) : null;
    if (!agoraP || agoraP.preco == null) throw new ErroPost(400, 'Informe o preço atual (sem preço observado para este post).');
    novoPreco = agoraP.preco;
    emEstoque = agoraP.emEstoque;
  }

  const hist = post.produto_id ? resumoHistorico(await deps.store.historico(post.produto_id), dataLocal(agora), cfg.janelaHistoricoDias) : { mediana: null, maximo: null, dias: 0 };
  const regrasDePor = { descontoRealMinimo: cfg.descontoRealMinimo, historicoCurtoDias: cfg.historicoCurtoDias };
  const dePor =
    post.tipo === 'manual'
      ? post.de_manual == null
        ? { precoReferencia: null, checagens: [] as Checagem[] }
        : resolverDePor({ precoAtual: novoPreco, mediana: hist.mediana, diasHistorico: hist.dias, maximoJanela: hist.maximo, deManual: post.de_manual }, regrasDePor, agora)
      : resolverDePor({ precoAtual: novoPreco, mediana: hist.mediana, diasHistorico: hist.dias }, regrasDePor, agora);
  const atualizado: PostRow = { ...post, preco_atual: novoPreco, preco_referencia: dePor.precoReferencia };
  await deps.store.atualizarPost(post.id, { preco_atual: novoPreco, preco_referencia: dePor.precoReferencia });

  const limite = new Date(Math.ceil((agora.getTime() + MIN) / MIN) * MIN);
  const out: ResumoEnvio[] = [];
  for (const e of abertos) {
    const texto = formatarPost({ ...atualizado, link: e.link_afiliado ?? '' }, e.canal);
    const montagem = checarMontagem({ texto, link: e.link_afiliado, canal: e.canal, subIds: e.sub_ids }, agora);
    const vaiAgora = new Date(e.agendado_para).getTime() <= agora.getTime() + cfg.checagemAntesEnvioMin * MIN;
    const horario = vaiAgora ? limite : new Date(e.agendado_para);
    const antes = checarAntesDoEnvio({ canal: e.canal, precoPost: novoPreco, precoAgora: novoPreco, emEstoque, prazo: post.prazo, horarioEnvio: horario }, agora);
    const guardia = [...e.guardia, ...dePor.checagens, ...montagem, ...(vaiAgora ? [antes.checagem] : [])];
    const estado = bloqueia(montagem) ? 'bloqueado' : vaiAgora ? antes.novoEstado : 'agendado';
    await deps.store.atualizarEnvio(e.id, {
      texto,
      estado,
      guardia,
      agendado_para: horario.toISOString(),
      checado_em: vaiAgora ? agora.toISOString() : null,
      erro: null,
    });
    out.push({ canal: e.canal, estado, agendado_para: horario.toISOString(), guardia });
  }
  await deps.store.registrarAtividade('guardia', `Preço do post de ${post.titulo} atualizado e conferido de novo.`, '/publicar');
  return { post_id: post.id, envios: out };
}

// ---------------------------------------------------------------------------
// F-08 Publicar bloco (cron a cada minuto)
// ---------------------------------------------------------------------------

export interface ResultadoPublicar {
  checados: number;
  pausados: number;
  publicados: number;
  lembretes: number;
  naoEnviados: number;
  erros: string[];
}

const ATRASO_MAX_TG_MIN = 30;

export async function publicarBloco(deps: DepsPost & { telegram: ClienteTelegram }): Promise<ResultadoPublicar> {
  const agora = deps.agora?.() ?? new Date();
  const { store, telegram } = deps;
  const cfg = await store.config();
  const res: ResultadoPublicar = { checados: 0, pausados: 0, publicados: 0, lembretes: 0, naoEnviados: 0, erros: [] };
  const posts = new Map<string, PostRow | null>();
  const postDe = async (id: string) => {
    if (!posts.has(id)) posts.set(id, await store.buscarPost(id));
    return posts.get(id)!;
  };
  const operadora = await store.idOperadora();

  // 1. Checagem antes do envio (5 minutos antes).
  const janela = new Date(agora.getTime() + cfg.checagemAntesEnvioMin * MIN);
  for (const e of await store.enviosAgendadosAte(janela)) {
    if (e.checado_em) continue;
    const post = await postDe(e.post_id);
    if (!post) continue;
    const atual = post.produto_id ? await store.precoAgora(post.produto_id) : null;
    const { checagem, novoEstado } = checarAntesDoEnvio(
      { canal: e.canal, precoPost: post.preco_atual, precoAgora: atual?.preco ?? null, emEstoque: atual?.emEstoque ?? null, prazo: post.prazo, horarioEnvio: new Date(e.agendado_para) },
      agora,
    );
    await store.atualizarEnvio(e.id, { estado: novoEstado, checado_em: agora.toISOString(), guardia: [...e.guardia, checagem] });
    e.estado = novoEstado;
    e.checado_em = agora.toISOString();
    res.checados++;
    if (novoEstado !== 'agendado') {
      res.pausados++;
      await store.criarNotificacao({
        user_id: operadora,
        tipo: 'guardia_pausa',
        titulo: novoEstado === 'pausado' ? 'Post do Telegram pausado' : 'Revisar preço no WhatsApp',
        corpo: `${post.titulo}: ${checagem.mensagem}`,
        link: '/publicar',
        enviar_em: agora.toISOString(),
      });
      await store.registrarAtividade('guardia', `${post.titulo}: ${checagem.mensagem}`, '/publicar');
    }
  }

  // 2. Publicação no Telegram e lembrete do WhatsApp no horário.
  for (const e of await store.enviosAgendadosAte(agora)) {
    const post = await postDe(e.post_id);
    if (!post) continue;
    if (e.canal === 'wa') {
      if (e.lembrete_em) continue;
      await store.criarNotificacao({
        user_id: operadora,
        tipo: 'lembrete_wa',
        titulo: 'Hora do post no WhatsApp',
        corpo: `${post.titulo}: copie o texto e cole no canal.`,
        link: '/publicar',
        enviar_em: e.agendado_para,
      });
      await store.atualizarEnvio(e.id, { lembrete_em: agora.toISOString() });
      res.lembretes++;
      continue;
    }
    const lib = liberadoParaTelegram({ canal: e.canal, estado: e.estado, aprovadoPor: post.aprovado_por, texto: e.texto, link: e.link_afiliado, subIds: e.sub_ids, checadoAntes: !!e.checado_em });
    if (!lib.ok) {
      if (e.checado_em) {
        await store.atualizarEnvio(e.id, { estado: 'bloqueado', erro: lib.motivo ?? null });
        res.erros.push(`${e.id}: ${lib.motivo}`);
      }
      continue;
    }
    try {
      const r = await telegram.publicarNoCanal({ texto: e.texto, fotoUrl: post.imagem_url });
      await store.atualizarEnvio(e.id, { estado: 'publicado', publicado_em: agora.toISOString(), telegram_message_id: r.message_id, erro: null });
      await store.registrarAtividade('agendadora', `${telegram.simulado ? '(simulado) ' : ''}Publicado no Telegram: ${post.titulo}.`, '/publicar');
      res.publicados++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.erros.push(`${e.id}: ${msg}`);
      const atrasado = agora.getTime() - new Date(e.agendado_para).getTime() > ATRASO_MAX_TG_MIN * MIN;
      await store.atualizarEnvio(e.id, { erro: msg, ...(atrasado ? { estado: 'pausado' as const } : {}) });
      if (atrasado) {
        await store.criarNotificacao({
          user_id: operadora,
          tipo: 'guardia_pausa',
          titulo: 'Post do Telegram não saiu',
          corpo: `${post.titulo}: o bot não conseguiu publicar. Confira em Publicar.`,
          link: '/publicar',
          enviar_em: agora.toISOString(),
        });
      }
    }
  }

  // 3. Fim do bloco: WhatsApp não marcado vira "não enviado" (não conta na cadência).
  const nomes: Record<NomeBloco, Bloco | undefined> = { almoco: undefined, noite: undefined };
  for (const b of blocosLigados({ ...cfg, blocoAlmoco: { ...cfg.blocoAlmoco, ligado: true }, blocoNoite: { ...cfg.blocoNoite, ligado: true } })) nomes[b.nome] = b;
  for (const e of await store.enviosWaAbertosAte(agora)) {
    const bloco = nomes[e.bloco ?? 'noite'];
    if (!bloco) continue;
    if (agora.getTime() >= fimDoBloco(e.bloco_data, bloco).getTime()) {
      await store.atualizarEnvio(e.id, { estado: 'nao_enviado' });
      res.naoEnviados++;
    }
  }
  return res;
}
