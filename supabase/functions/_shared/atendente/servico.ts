// Fluxo D (mensagem de um seguidor) e Fluxo B (pedido) aplicados no banco.
// Sem Deno.*: dependências entram por parâmetro (Edge Functions e testes).
import type { SupabaseClient } from '@supabase/supabase-js';
import { resolverConfig, type ConfigResolvida } from '../core/config.ts';
import {
  CATEGORIAS_FECHADAS,
  OFERECE_LANA,
  TEXTOS_NIVEL1,
  eCategoriaNivel1,
  triar,
  type Nivel,
} from '../core/atendente/niveis.ts';
import {
  avisoRecebimento,
  blocosValidos,
  chaveProduto,
  checarLimites,
  decidirNivel2,
  deveAvisar,
  duvidasRepetidas,
  emJanelaDeCiclo,
  gruposAchadoAPedido,
  montarResposta,
  produtosCitados,
  quandoNotificar,
  registrarAprovacao,
  respondeSozinha,
  rotuloCiclo,
  rotuloProximoBloco,
  type EstadoCategoria,
} from '../core/atendente/regras.ts';
import { linkConversaWhatsapp } from '../core/atendente/whatsapp-conversa.ts';
import type { EntradaAtendente, SaidaAtendente } from '../core/contratos/atendente.ts';
import type { Bot } from './bot.ts';
import type { GeradorLinks } from './links.ts';

export interface DepsAtendente {
  db: SupabaseClient;
  bot: Bot;
  links: GeradorLinks;
  agora?: () => Date;
}

function erro(r: { error: { message: string } | null }) {
  if (r.error) throw new Error(r.error.message);
}

export interface Contato {
  id: string;
  origem: 'telegram' | 'formulario';
  telegram_chat_id: number | null;
  preferencia: 'telegram' | 'canal' | 'whatsapp';
  whatsapp: string | null;
  aguardando: string | null;
  ultimo_aviso_em: string | null;
}

export interface ConfigAtendente {
  cfg: ConfigResolvida;
  blocos: string[];
  categorias: Map<string, EstadoCategoria & { modelo: string | null; nivel: number }>;
  temasLigados: string[];
}

export async function lerConfigAtendente(db: SupabaseClient): Promise<ConfigAtendente> {
  const c = await db.from('configuracoes').select('chave, valor');
  erro(c);
  const cfg = resolverConfig(c.data ?? []);
  const k = await db.from('atendente_categorias').select('categoria, nivel, aprovacoes_seguidas, automatica, desligada, modelo');
  erro(k);
  const categorias = new Map((k.data ?? []).map((x) => [x.categoria as string, x as EstadoCategoria & { modelo: string | null; nivel: number }]));
  // Nível 2: tema ligado nas Configurações ou que virou automático por 3 aprovações, e não desligado.
  const ligados = new Set<string>(Array.isArray(cfg.temasAutomaticos) ? cfg.temasAutomaticos : []);
  for (const [cat, est] of categorias) if (est.nivel === 2 && est.automatica) ligados.add(cat);
  for (const [cat, est] of categorias) if (est.desligada) ligados.delete(cat);
  return { cfg, blocos: blocosValidos(cfg.blocosRevisao), categorias, temasLigados: [...ligados] };
}

/** Texto fixo de uma categoria do nível 1 (o aprovado pela Lana ou o sugerido). */
export function textoFixo(conf: ConfigAtendente, categoria: string): string {
  const modelo = conf.categorias.get(categoria)?.modelo;
  if (modelo) return modelo;
  if (eCategoriaNivel1(categoria)) return TEXTOS_NIVEL1[categoria];
  throw new Error(`categoria sem texto fixo: ${categoria}`);
}

async function notificar(db: SupabaseClient, p: { tipo: string; titulo: string; corpo?: string; enviarEm: Date }) {
  // Uma notificação por bloco para os rascunhos; nível 4 sempre na hora.
  if (p.tipo === 'atendente_bloco') {
    const ja = await db
      .from('notificacoes')
      .select('id')
      .eq('tipo', 'atendente_bloco')
      .eq('enviar_em', p.enviarEm.toISOString())
      .is('enviada_em', null)
      .limit(1);
    erro(ja);
    if (ja.data?.length) return;
  }
  erro(
    await db.from('notificacoes').insert({
      tipo: p.tipo,
      titulo: p.titulo,
      corpo: p.corpo ?? null,
      link: '/comunidade',
      enviar_em: p.enviarEm.toISOString(),
    }),
  );
}

async function atividade(db: SupabaseClient, texto: string) {
  erro(await db.from('atividades').insert({ agente: 'atendente', texto, link: '/comunidade' }));
}

// ---------------------------------------------------------------------------
// Chegada de uma mensagem (bot ou formulário): triagem em código, sem IA
// ---------------------------------------------------------------------------
export interface Chegada {
  /** Textos para devolver na hora à pessoa (resposta do nível 1 e/ou aviso de recebimento). */
  respostas: string[];
  mensagemId: string;
  nivel: Nivel | null;
}

export async function receberMensagem(
  deps: DepsAtendente,
  p: { contato: Contato; texto: string; preco_max?: number | null; categoriaMenu?: string },
): Promise<Chegada> {
  const { db } = deps;
  const agora = deps.agora?.() ?? new Date();
  const conf = await lerConfigAtendente(db);
  const tri = p.categoriaMenu && eCategoriaNivel1(p.categoriaMenu) ? { nivel: 1 as const, categoria: p.categoriaMenu } : triar(p.texto);

  const base = {
    contato_id: p.contato.id,
    origem: p.contato.origem,
    texto: p.texto,
    preco_max: p.preco_max ?? null,
    recebida_em: agora.toISOString(),
  };
  const respostas: string[] = [];

  erro(await db.from('contatos').update({ ultima_interacao: agora.toISOString(), aguardando: null }).eq('id', p.contato.id));

  if (tri.nivel === 4) {
    const r = await db.from('atendente_mensagens').insert({ ...base, nivel: 4, estado: 'urgente', motivo: tri.motivo }).select('id').single();
    erro(r);
    await notificar(db, { tipo: 'atendente_urgente', titulo: 'Mensagem urgente na Comunidade', corpo: `Nível 4: ${tri.motivo}`, enviarEm: agora });
    respostas.push(await avisar(deps, p.contato, conf, agora, true));
    return { respostas: respostas.filter(Boolean), mensagemId: r.data!.id, nivel: 4 };
  }

  if (tri.nivel === 1) {
    const cat = conf.categorias.get(tri.categoria);
    const texto = textoFixo(conf, tri.categoria);
    if (respondeSozinha(cat)) {
      const final = `${texto}\n\n${OFERECE_LANA}`;
      const r = await db
        .from('atendente_mensagens')
        .insert({ ...base, nivel: 1, categoria: tri.categoria, estado: 'respondida_auto', resposta_final: final, respondida_em: agora.toISOString(), resposta_via: 'na_hora' })
        .select('id')
        .single();
      erro(r);
      return { respostas: [final], mensagemId: r.data!.id, nivel: 1 };
    }
    // Texto fixo ainda não aprovado pela Lana: vira rascunho para o bloco de revisão.
    const r = await db
      .from('atendente_mensagens')
      .insert({ ...base, nivel: 1, categoria: tri.categoria, estado: 'rascunho', rascunho: texto, motivo: 'texto fixo ainda não aprovado' })
      .select('id')
      .single();
    erro(r);
    await notificar(db, { tipo: 'atendente_bloco', titulo: 'Mensagens esperando você', enviarEm: quandoNotificar(1, agora, conf.blocos) });
    respostas.push(await avisar(deps, p.contato, conf, agora));
    return { respostas: respostas.filter(Boolean), mensagemId: r.data!.id, nivel: 1 };
  }

  const r = await db.from('atendente_mensagens').insert({ ...base, estado: 'pendente' }).select('id').single();
  erro(r);
  respostas.push(await avisar(deps, p.contato, conf, agora));
  return { respostas: respostas.filter(Boolean), mensagemId: r.data!.id, nivel: null };
}

async function avisar(deps: DepsAtendente, contato: Contato, conf: ConfigAtendente, agora: Date, forcar = false): Promise<string> {
  const ultimo = contato.ultimo_aviso_em ? new Date(contato.ultimo_aviso_em) : null;
  if (!forcar && !deveAvisar(ultimo, agora, conf.blocos)) return '';
  erro(await deps.db.from('contatos').update({ ultimo_aviso_em: agora.toISOString() }).eq('id', contato.id));
  return avisoRecebimento(agora, conf.blocos);
}

export function proximoBlocoTexto(conf: ConfigAtendente, agora: Date): string {
  return rotuloProximoBloco(agora, conf.blocos);
}

// ---------------------------------------------------------------------------
// Ciclo de 30 minutos: monta a entrada do job atendente/v1
// ---------------------------------------------------------------------------
const ID_SHOPEE = /(?:i\.(\d+)\.(\d+))|(?:product\/(\d+)\/(\d+))/;

/** Anúncio citado na mensagem (link da Shopee com loja e item conhecidos). */
async function anuncioDaMensagem(db: SupabaseClient, texto: string) {
  const m = texto.match(ID_SHOPEE);
  if (!m) return null;
  const loja = m[1] ?? m[3];
  const item = m[2] ?? m[4];
  const r = await db.from('produtos').select('id, nome, dados_brutos').eq('shopee_shop_id', loja).eq('shopee_item_id', item).maybeSingle();
  if (r.error || !r.data) return null;
  return { produto_id: r.data.id as string, titulo: r.data.nome as string, texto: textoDoAnuncio(r.data.nome as string, r.data.dados_brutos) };
}

/** Texto do anúncio guardado pela coleta (nome + descrição, quando houver). */
export function textoDoAnuncio(nome: string, dados: unknown): string {
  const d = (dados ?? {}) as Record<string, unknown>;
  const desc = [d.descricao, d.description, d.productDescription, d.item_description].find((x) => typeof x === 'string') as string | undefined;
  return [nome, desc].filter(Boolean).join('\n').slice(0, 8000);
}

export async function montarEntradaCiclo(
  deps: Pick<DepsAtendente, 'db' | 'agora'>,
): Promise<{ entrada: EntradaAtendente; chave: string; ids: string[] } | { motivo: string }> {
  const { db } = deps;
  const agora = deps.agora?.() ?? new Date();
  if (!emJanelaDeCiclo(agora)) return { motivo: 'fora da janela dos ciclos (8h às 22h30)' };
  const conf = await lerConfigAtendente(db);

  const pend = await db
    .from('atendente_mensagens')
    .select('id, texto, origem, preco_max, rascunho, outra_versao_pedida, estado, pedido_id')
    .or('estado.eq.pendente,and(estado.eq.rascunho,outra_versao_pedida.eq.true)')
    .not('texto', 'is', null)
    .order('recebida_em')
    .limit(200);
  erro(pend);

  // Pedidos de seguidores que já têm opções da Caçadora e ainda não têm rascunho com links.
  const comPedido = await db
    .from('atendente_mensagens')
    .select('id, pedido_id, rascunho')
    .eq('estado', 'rascunho')
    .not('pedido_id', 'is', null)
    .limit(100);
  erro(comPedido);
  const semLinks = (comPedido.data ?? []).filter((m) => !produtosCitados(m.rascunho ?? '').length);
  const pedidosComOpcoes: EntradaAtendente['pedidos_com_opcoes'] = [];
  if (semLinks.length) {
    const peds = await db
      .from('pedidos_produto')
      .select('id, texto, preco_max, estado')
      .in('id', semLinks.map((m) => m.pedido_id))
      .eq('estado', 'opcoes_encontradas');
    erro(peds);
    // pedido_opcoes é do pacote da fila de ofertas; se ainda não existir, segue sem opções.
    const ops = peds.data?.length
      ? await db.from('pedido_opcoes').select('pedido_id, produto_id, ordem, produtos(nome), preco_atual').in('pedido_id', peds.data.map((p) => p.id))
      : { data: [], error: null };
    const lista = ops.error ? [] : ((ops.data ?? []) as unknown as Array<{ pedido_id: string; produto_id: string; ordem: number; preco_atual: number | null; produtos: { nome: string } | null }>);
    for (const p of peds.data ?? []) {
      const opcoes = lista
        .filter((o) => o.pedido_id === p.id)
        .sort((a, b) => a.ordem - b.ordem)
        .map((o) => ({ produto_id: o.produto_id, titulo: o.produtos?.nome ?? 'produto', preco: o.preco_atual == null ? null : Number(o.preco_atual) }));
      if (!opcoes.length) continue;
      const msg = semLinks.find((m) => m.pedido_id === p.id)!;
      pedidosComOpcoes.push({ pedido_id: p.id, mensagem_id: msg.id, texto: p.texto, preco_max: p.preco_max == null ? null : Number(p.preco_max), opcoes });
    }
  }

  const mensagens: EntradaAtendente['mensagens'] = [];
  for (const m of pend.data ?? []) {
    mensagens.push({
      id: m.id,
      texto: m.texto,
      origem: m.origem,
      preco_max: m.preco_max == null ? null : Number(m.preco_max),
      anuncio: await anuncioDaMensagem(db, m.texto),
      outra_versao: m.estado === 'rascunho' && m.outra_versao_pedida ? { rascunho_anterior: m.rascunho ?? '' } : null,
    });
  }
  if (!mensagens.length && !pedidosComOpcoes.length) return { motivo: 'nenhuma mensagem pendente' };

  const aprovadas = await db
    .from('atendente_mensagens')
    .select('categoria, resposta_final')
    .eq('estado', 'respondida')
    .eq('resposta_editada', false)
    .not('resposta_final', 'is', null)
    .order('respondida_em', { ascending: false })
    .limit(20);
  erro(aprovadas);

  const ciclo = rotuloCiclo(agora);
  return {
    chave: `atendente:${ciclo}`,
    ids: mensagens.map((m) => m.id),
    entrada: {
      ciclo,
      temas_ligados: conf.temasLigados.filter((t): t is (typeof CATEGORIAS_FECHADAS)[number] => (CATEGORIAS_FECHADAS as readonly string[]).includes(t)),
      mensagens,
      pedidos_com_opcoes: pedidosComOpcoes,
      respostas_aprovadas: (aprovadas.data ?? []).map((a) => ({ categoria: a.categoria, texto: a.resposta_final as string })),
    },
  };
}

/** Marca as mensagens do ciclo como em processamento, ligadas ao job. */
export async function marcarProcessando(db: SupabaseClient, ids: string[], jobId: string) {
  if (!ids.length) return;
  erro(await db.from('atendente_mensagens').update({ estado: 'processando', job_id: jobId }).in('id', ids));
}

// ---------------------------------------------------------------------------
// Processador do atendente/v1: o código decide o que sai sozinho
// ---------------------------------------------------------------------------
export async function aplicarSaidaCiclo(deps: DepsAtendente, jobId: string, entrada: EntradaAtendente, saida: SaidaAtendente) {
  const { db } = deps;
  const agora = deps.agora?.() ?? new Date();
  const conf = await lerConfigAtendente(db);
  const porId = new Map(saida.mensagens.map((m) => [m.id, m]));
  let rascunhos = 0;
  let automaticas = 0;
  let urgentes = 0;

  for (const e of entrada.mensagens) {
    const s = porId.get(e.id);
    const atual = await db.from('atendente_mensagens').select('id, contato_id, estado, rascunho_versao, contatos(telegram_chat_id, origem)').eq('id', e.id).maybeSingle();
    erro(atual);
    if (!atual.data) continue; // contato apagado no meio do ciclo
    // Só a conversa do bot recebe resposta sozinha; formulário sempre passa pela Lana.
    const doBot = (atual.data.contatos as unknown as { origem: string } | null)?.origem === 'telegram';
    if (!s) {
      // A rotina não devolveu esta mensagem: volta para o próximo ciclo.
      erro(await db.from('atendente_mensagens').update({ estado: e.outra_versao ? 'rascunho' : 'pendente' }).eq('id', e.id));
      continue;
    }
    const base = {
      job_id: jobId,
      nivel: s.nivel,
      categoria: s.categoria ?? null,
      produto_id: s.produto_id ?? e.anuncio?.produto_id ?? null,
      tema_duvida: s.tema_duvida ?? null,
      trecho_citado: s.trecho_citado ?? null,
      outra_versao_pedida: false,
    };

    if (s.nivel === 4) {
      erro(await db.from('atendente_mensagens').update({ ...base, estado: 'urgente', motivo: s.motivo ?? 'assunto para a Lana' }).eq('id', e.id));
      urgentes++;
      continue;
    }

    if (s.nivel === 1 && s.categoria && eCategoriaNivel1(s.categoria)) {
      const texto = textoFixo(conf, s.categoria);
      if (doBot && respondeSozinha(conf.categorias.get(s.categoria))) {
        const { whatsapp_link: _w, ...env } = await entregar(deps, e.id, `${texto}\n\n${OFERECE_LANA}`);
        erro(await db.from('atendente_mensagens').update({ ...base, ...env, estado: 'respondida_auto' }).eq('id', e.id));
        automaticas++;
      } else {
        erro(await db.from('atendente_mensagens').update({ ...base, estado: 'rascunho', rascunho: texto, motivo: 'texto fixo ainda não aprovado', alertas: [] }).eq('id', e.id));
        rascunhos++;
      }
      continue;
    }

    const resposta = (s.resposta ?? '').trim();
    const alertas = [...(s.alertas ?? []), ...checarLimites(resposta).map((a) => ({ tipo: a.tipo, trecho: a.trecho }))];

    if (s.nivel === 2) {
      const d = decidirNivel2({ categoria: s.categoria, temasLigados: conf.temasLigados, trechoCitado: s.trecho_citado, textoAnuncio: e.anuncio?.texto, resposta });
      if (doBot && d.enviar && !(s.alertas ?? []).length) {
        try {
          const final = `${montarResposta(resposta, {})}\n\n${OFERECE_LANA}`;
          const { whatsapp_link: _w, ...env } = await entregar(deps, e.id, final);
          erro(await db.from('atendente_mensagens').update({ ...base, ...env, rascunho: resposta, estado: 'respondida_auto', alertas }).eq('id', e.id));
          automaticas++;
          continue;
        } catch (err) {
          alertas.push({ tipo: 'envio', trecho: err instanceof Error ? err.message : String(err) });
        }
      }
      const motivo = !doBot ? 'mensagem do formulário: a Lana aprova' : d.enviar ? 'alerta da Atendente' : d.motivo;
      erro(
        await db
          .from('atendente_mensagens')
          .update({ ...base, nivel: 3, estado: 'rascunho', rascunho: resposta, motivo, alertas, rascunho_versao: (atual.data.rascunho_versao ?? 0) + 1 })
          .eq('id', e.id),
      );
      rascunhos++;
      continue;
    }

    // Nível 3 (ou nível 1 sem categoria conhecida): rascunho para a Lana.
    let pedidoId: string | null = null;
    if (s.pedido) {
      const contato = atual.data.contatos as unknown as { origem: string } | null;
      const ped = await db
        .from('pedidos_produto')
        .insert({
          origem: contato?.origem === 'formulario' ? 'formulario' : 'bot',
          texto: s.pedido.texto,
          preco_max: s.pedido.preco_max ?? e.preco_max ?? null,
          contato_id: atual.data.contato_id,
          chave_produto: chaveProduto(s.pedido.produto_canonico || s.pedido.texto) || null,
        })
        .select('id')
        .single();
      erro(ped);
      pedidoId = ped.data!.id;
    }
    erro(
      await db
        .from('atendente_mensagens')
        .update({
          ...base,
          nivel: 3,
          estado: 'rascunho',
          rascunho: resposta || null,
          motivo: s.motivo ?? (pedidoId ? 'pedido de produto: a Caçadora procura opções' : null),
          alertas,
          rascunho_versao: (atual.data.rascunho_versao ?? 0) + 1,
          ...(pedidoId ? { pedido_id: pedidoId } : {}),
        })
        .eq('id', e.id),
    );
    rascunhos++;
  }

  // Dúvidas classificadas por tema, para "3 pessoas com a mesma dúvida na semana" (tabela do pacote de crescimento).
  for (const e of entrada.mensagens) {
    const s = porId.get(e.id);
    if (!s?.tema_duvida || s.nivel === 4) continue;
    const c = await db.from('atendente_mensagens').select('contato_id').eq('id', e.id).maybeSingle();
    if (c.error || !c.data) continue;
    const r = await db.from('duvidas_registradas').insert({ tema: s.tema_duvida.trim(), contato_ref: c.data.contato_id, pergunta: e.texto.slice(0, 300), mensagem_id: e.id });
    if (r.error) console.error('duvidas_registradas', r.error.message);
  }

  // Rascunhos de resposta para pedidos que já têm opções.
  for (const p of saida.pedidos) {
    const ref = entrada.pedidos_com_opcoes.find((x) => x.pedido_id === p.pedido_id);
    if (!ref) continue;
    const alertas: Array<{ tipo: string; trecho: string }> = checarLimites(p.resposta).map((a) => ({ tipo: a.tipo, trecho: a.trecho }));
    const desconhecidos = produtosCitados(p.resposta).filter((id) => !ref.opcoes.some((o) => o.produto_id === id));
    if (desconhecidos.length) alertas.push({ tipo: 'link', trecho: 'link para produto fora das opções da Caçadora' });
    erro(
      await db
        .from('atendente_mensagens')
        .update({ job_id: jobId, rascunho: p.resposta, alertas, motivo: 'pedido com opções da Caçadora', outra_versao_pedida: false })
        .eq('id', ref.mensagem_id)
        .eq('estado', 'rascunho'),
    );
    rascunhos++;
  }

  await atualizarAgrupamentos(deps, agora);

  if (rascunhos) await notificar(db, { tipo: 'atendente_bloco', titulo: 'Mensagens esperando você', corpo: 'Rascunhos da Atendente para revisar.', enviarEm: quandoNotificar(3, agora, conf.blocos) });
  if (urgentes) await notificar(db, { tipo: 'atendente_urgente', titulo: 'Mensagem urgente na Comunidade', corpo: 'A Atendente pediu você (nível 4).', enviarEm: agora });
  const partes = [automaticas && `${automaticas} respondida(s) sozinha(s)`, rascunhos && `${rascunhos} rascunho(s) para revisar`, urgentes && `${urgentes} urgente(s)`].filter(Boolean);
  if (partes.length) await atividade(db, `Ciclo da Atendente: ${partes.join(', ')}`);
}

/** 2 pedidos do mesmo produto viram achado a pedido; 3 pessoas com a mesma dúvida na semana viram post de respostas. */
export async function atualizarAgrupamentos(deps: Pick<DepsAtendente, 'db'>, agora: Date) {
  const { db } = deps;
  const peds = await db.from('pedidos_produto').select('id, chave_produto, contato_id, estado, achado_a_pedido').not('chave_produto', 'is', null);
  erro(peds);
  const grupos = gruposAchadoAPedido((peds.data ?? []).map((p) => ({ id: p.id, chave: p.chave_produto, contato_id: p.contato_id, estado: p.estado })));
  for (const g of grupos) {
    const novos = (peds.data ?? []).filter((p) => g.ids.includes(p.id) && !p.achado_a_pedido).map((p) => p.id);
    if (!novos.length) continue;
    erro(await db.from('pedidos_produto').update({ achado_a_pedido: true }).in('id', g.ids));
    await atividade(db, `Pedidos repetidos de "${g.chave}": viram um achado a pedido para a fila de ofertas`);
  }

  const semana = new Date(agora.getTime() - 7 * 86_400_000).toISOString();
  const duv = await db.from('atendente_mensagens').select('tema_duvida, contato_id, recebida_em').not('tema_duvida', 'is', null).gte('recebida_em', semana);
  erro(duv);
  const temas = duvidasRepetidas((duv.data ?? []) as Array<{ tema_duvida: string; contato_id: string; recebida_em: string }>, agora);
  for (const t of temas) {
    const texto = `Mesma dúvida de 3 pessoas na semana ("${t}"): vira post de respostas no canal`;
    const ja = await db.from('atividades').select('id').eq('texto', texto).gte('criado_em', semana).limit(1);
    erro(ja);
    if (!ja.data?.length) await atividade(db, texto);
  }
}

// ---------------------------------------------------------------------------
// Entrega de uma resposta à pessoa, pelo caminho que ela escolheu
// ---------------------------------------------------------------------------
type Entrega = {
  resposta_final: string;
  resposta_via: string;
  respondida_em: string;
  erro_envio: string | null;
};

async function entregar(deps: DepsAtendente, mensagemId: string, texto: string): Promise<Entrega & { whatsapp_link?: string }> {
  const { db } = deps;
  const agora = (deps.agora?.() ?? new Date()).toISOString();
  const r = await db.from('atendente_mensagens').select('contato_id, contatos(telegram_chat_id, preferencia, whatsapp, origem)').eq('id', mensagemId).single();
  erro(r);
  const c = r.data!.contatos as unknown as { telegram_chat_id: number | null; preferencia: string; whatsapp: string | null; origem: string };
  if (c.origem === 'telegram' && c.telegram_chat_id) {
    const env = await deps.bot.enviar(c.telegram_chat_id, texto);
    if (!env.ok) throw new Error(env.erro ?? 'falha no envio pelo Telegram');
    return { resposta_final: texto, resposta_via: deps.bot.simulado ? 'simulado' : 'telegram', respondida_em: agora, erro_envio: null };
  }
  if (c.preferencia === 'whatsapp' && c.whatsapp) {
    // Sem número oficial: abre o WhatsApp da Lana com o texto pronto. Nada é enviado sozinho.
    return { resposta_final: texto, resposta_via: 'whatsapp_manual', respondida_em: agora, erro_envio: null, whatsapp_link: linkConversaWhatsapp(c.whatsapp, texto) };
  }
  return { resposta_final: texto, resposta_via: 'canal', respondida_em: agora, erro_envio: null };
}

// ---------------------------------------------------------------------------
// Ações da Lana na caixa de mensagens
// ---------------------------------------------------------------------------
export type AcaoResposta =
  | { acao: 'aprovar'; mensagem_id: string; texto?: string }
  | { acao: 'outra_versao'; mensagem_id: string }
  | { acao: 'descartar'; mensagem_id: string }
  | { acao: 'respondi_por_fora'; mensagem_id: string };

export type ResultadoAcao = { ok: true; whatsapp_link?: string; via?: string; virou_automatica?: boolean } | { ok: false; status: 400 | 404 | 409 | 422; motivo: string };

export async function executarAcao(deps: DepsAtendente, a: AcaoResposta, userId: string): Promise<ResultadoAcao> {
  const { db } = deps;
  const agora = deps.agora?.() ?? new Date();
  const r = await db.from('atendente_mensagens').select('id, estado, nivel, categoria, rascunho, pedido_id, contato_id').eq('id', a.mensagem_id).maybeSingle();
  erro(r);
  const m = r.data;
  if (!m) return { ok: false, status: 404, motivo: 'mensagem não encontrada' };
  if (!['rascunho', 'urgente'].includes(m.estado)) return { ok: false, status: 409, motivo: 'esta mensagem já foi tratada' };

  if (a.acao === 'outra_versao') {
    if (m.estado !== 'rascunho') return { ok: false, status: 409, motivo: 'só rascunhos ganham outra versão' };
    erro(await db.from('atendente_mensagens').update({ outra_versao_pedida: true }).eq('id', m.id));
    return { ok: true };
  }
  if (a.acao === 'descartar' || a.acao === 'respondi_por_fora') {
    erro(
      await db
        .from('atendente_mensagens')
        .update({
          estado: a.acao === 'descartar' ? 'descartada' : 'respondida',
          resposta_via: a.acao === 'descartar' ? null : 'por_fora',
          respondida_em: agora.toISOString(),
          respondida_por: userId,
        })
        .eq('id', m.id),
    );
    if (a.acao === 'respondi_por_fora' && m.pedido_id) erro(await db.from('pedidos_produto').update({ estado: 'respondido' }).eq('id', m.pedido_id));
    return { ok: true };
  }

  const original = (m.rascunho ?? '').trim();
  const texto = (a.texto ?? original).trim();
  if (!texto) return { ok: false, status: 400, motivo: 'escreva a resposta antes de enviar' };
  if (texto.length > 1500) return { ok: false, status: 400, motivo: 'resposta longa demais (até 1.500 caracteres)' };
  const bloqueio = checarLimites(texto).find((x) => x.bloqueia);
  if (bloqueio) return { ok: false, status: 422, motivo: `a resposta fere um limite da Atendente ("${bloqueio.trecho}"); edite antes de enviar` };

  let final: string;
  try {
    const ids = produtosCitados(texto);
    final = montarResposta(texto, ids.length ? await deps.links(ids, { mensagemId: m.id, agora }) : {});
  } catch (e) {
    return { ok: false, status: 422, motivo: e instanceof Error ? e.message : String(e) };
  }
  final = `${final}\n\n${OFERECE_LANA}`;

  let env: Awaited<ReturnType<typeof entregar>>;
  try {
    env = await entregar(deps, m.id, final);
  } catch (e) {
    const motivo = e instanceof Error ? e.message : String(e);
    erro(await db.from('atendente_mensagens').update({ erro_envio: motivo }).eq('id', m.id));
    return { ok: false, status: 422, motivo };
  }
  const editada = texto !== original;
  const { whatsapp_link, ...gravar } = env;
  erro(await db.from('atendente_mensagens').update({ ...gravar, estado: 'respondida', resposta_editada: editada, respondida_por: userId }).eq('id', m.id));

  if (m.pedido_id) {
    const via = env.resposta_via;
    erro(await db.from('pedidos_produto').update({ estado: 'respondido', ...(via === 'canal' ? { achado_a_pedido: true } : {}) }).eq('id', m.pedido_id));
  }

  // Vira automática: 3 aprovações seguidas sem editar (só categorias fechadas).
  let virou = false;
  if (m.categoria && m.nivel && m.nivel <= 2) {
    const cat = await db.from('atendente_categorias').select('aprovacoes_seguidas, automatica, desligada').eq('categoria', m.categoria).maybeSingle();
    erro(cat);
    if (cat.data) {
      const novo = registrarAprovacao(cat.data, { categoria: m.categoria, nivel: m.nivel as Nivel, editada });
      virou = novo.virouAutomatica;
      erro(
        await db
          .from('atendente_categorias')
          .update({
            aprovacoes_seguidas: novo.aprovacoes_seguidas,
            automatica: novo.automatica,
            ...(virou && m.nivel === 1 ? { modelo: original } : {}),
          })
          .eq('categoria', m.categoria),
      );
      if (virou) await atividade(db, `Resposta de "${m.categoria}" aprovada 3 vezes sem edição: agora sai sozinha (dá para desligar)`);
    }
  }
  return { ok: true, whatsapp_link, via: env.resposta_via, virou_automatica: virou };
}

// ---------------------------------------------------------------------------
// Exclusão a pedido (seção 7.2): apaga mensagens, pedidos e contato da pessoa
// ---------------------------------------------------------------------------
export async function apagarContato(db: SupabaseClient, contatoId: string): Promise<void> {
  // pedidos_produto e atendente_mensagens caem em cascata pela chave estrangeira.
  const d = await db.from('duvidas_registradas').delete().eq('contato_ref', contatoId);
  if (d.error) console.error('duvidas_registradas', d.error.message);
  erro(await db.from('contatos').delete().eq('id', contatoId));
  await atividade(db, 'Um seguidor pediu a exclusão dos próprios dados: mensagens, pedidos e contato apagados');
}
