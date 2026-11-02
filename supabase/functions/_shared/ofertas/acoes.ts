// Ações da fila de ofertas (F-04, F-05), chamadas pela função ofertas-acao.
// Permissão, estado e limites são decididos aqui (código), nunca pela tela.
// Sem Deno.*: as dependências entram por parâmetro.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Papel } from '../core/config.ts';
import { estaExpirada, interpretarPedido, naFila, podeDecidir, validarCanais, validarFrase, validarMotivoPulo, type EstadoOferta } from '../core/ofertas/fila.ts';
import { juntarNoLote, loteRedacao } from '../core/ofertas/redacao.ts';
import { entradaRedacao, type EntradaRedacao, type PedidoRedacao } from '../core/contratos/redacao.ts';
import { lerConfigServidor } from './config.ts';
import { criarJobPedido } from './pedido.ts';

export interface DepsAcoes {
  /** Cliente com o login de quem chamou (RLS e trava S2 valem). */
  usuario: SupabaseClient;
  /** Cliente de serviço (jobs e leituras do sistema). */
  servico: SupabaseClient;
  /** Cabeçalhos repassados ao post-aprovar (Authorization e apikey de quem chamou). */
  cabecalhosUsuario: Record<string, string>;
  urlPostAprovar: string;
  fetch?: typeof fetch;
  agora?: () => Date;
}

export interface Resposta {
  status: number;
  corpo: Record<string, unknown>;
}

const r = (status: number, corpo: Record<string, unknown>): Resposta => ({ status, corpo });
const erro = (status: number, mensagem: string, extra: Record<string, unknown> = {}): Resposta => r(status, { erro: mensagem, ...extra });

interface LinhaOferta {
  id: string;
  estado: EstadoOferta;
  prazo: string | null;
  frase: string | null;
  frase_versao: number;
  preco_atual: number;
  motivos: string[];
  produtos: { nome: string; nichos: { nome: string } | null } | null;
}

async function quem(deps: DepsAcoes): Promise<{ id: string; papel: Papel } | null> {
  const u = await deps.usuario.auth.getUser();
  if (u.error || !u.data.user) return null;
  const p = await deps.usuario.from('perfis').select('papel').eq('user_id', u.data.user.id).maybeSingle();
  if (p.error || !p.data) return null;
  return { id: u.data.user.id, papel: p.data.papel as Papel };
}

async function carregarOferta(deps: DepsAcoes, id: unknown): Promise<LinhaOferta | Resposta> {
  if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id)) return erro(400, 'Oferta inválida.');
  const o = await deps.servico
    .from('ofertas')
    .select('id, estado, prazo, frase, frase_versao, preco_atual, motivos, produtos(nome, nichos(nome))')
    .eq('id', id)
    .maybeSingle();
  if (o.error) return erro(500, o.error.message);
  if (!o.data) return erro(404, 'Oferta não encontrada.');
  return o.data as unknown as LinhaOferta;
}

/** Confere se a oferta ainda pode ser decidida; marca como expirada se o prazo venceu. */
async function conferirNaFila(deps: DepsAcoes, o: LinhaOferta): Promise<Resposta | null> {
  const agora = deps.agora?.() ?? new Date();
  if (estaExpirada(o, agora)) {
    if (o.estado !== 'expirada') await deps.servico.from('ofertas').update({ estado: 'expirada' }).eq('id', o.id).in('estado', ['pendente', 'aguardando_redacao']);
    return erro(409, 'Esta oferta expirou enquanto estava na fila.', { expirada: true });
  }
  if (!naFila(o)) return erro(409, 'Esta oferta já foi decidida.');
  return null;
}

export async function executarAcao(deps: DepsAcoes, corpo: Record<string, unknown>): Promise<Resposta> {
  const eu = await quem(deps);
  if (!eu) return erro(401, 'Entre de novo para continuar.');
  const acao = corpo.acao;

  if (acao === 'pedir_produto') return pedirProduto(deps, eu.id, corpo);

  if (acao !== 'aprovar' && acao !== 'pular' && acao !== 'editar_frase' && acao !== 'outra_versao') return erro(400, 'Ação desconhecida.');
  if (!podeDecidir(eu.papel)) return erro(403, 'Só a Lana decide as ofertas.');
  const o = await carregarOferta(deps, corpo.oferta_id);
  if ('status' in o) return o;
  const bloqueio = await conferirNaFila(deps, o);
  if (bloqueio) return bloqueio;

  switch (acao) {
    case 'aprovar':
      return aprovar(deps, eu.id, o, corpo);
    case 'pular':
      return pular(deps, eu.id, o, corpo);
    case 'editar_frase':
      return editarFrase(deps, o, corpo);
    case 'outra_versao':
      return outraVersao(deps, o);
  }
}

async function aprovar(deps: DepsAcoes, eu: string, o: LinhaOferta, corpo: Record<string, unknown>): Promise<Resposta> {
  const canais = validarCanais(corpo.canais ?? ['wa', 'tg']);
  if (!canais.ok) return erro(400, canais.erro);
  const cfg = await lerConfigServidor(deps.servico);
  let frase = o.frase;
  if ('frase' in corpo) {
    const f = validarFrase(corpo.frase as string | null, cfg.fraseMaxCaracteres);
    if (!f.ok) return erro(400, f.erro);
    frase = f.valor;
  }
  // Aprovar enquanto espera outra versão: vale a frase atual; a nova é descartada ao chegar.
  if (frase !== o.frase || o.estado !== 'pendente') {
    const patch: Record<string, unknown> = { estado: 'pendente' };
    if (frase !== o.frase) Object.assign(patch, { frase, frase_editada: true });
    const u = await deps.usuario.from('ofertas').update(patch).eq('id', o.id).in('estado', ['pendente', 'aguardando_redacao']);
    if (u.error) return erro(500, u.error.message);
  }

  // Monta o post na hora (pacote de posts). Contrato: POST {oferta_id, canais, frase}.
  let post: unknown = null;
  let aviso: string | undefined;
  try {
    const resp = await (deps.fetch ?? fetch)(deps.urlPostAprovar, {
      method: 'POST',
      headers: { ...deps.cabecalhosUsuario, 'content-type': 'application/json' },
      body: JSON.stringify({ oferta_id: o.id, canais: canais.valor, frase }),
    });
    const dados = (await resp.json().catch(() => null)) as Record<string, unknown> | null;
    if (resp.ok) {
      post = dados;
    } else if (resp.status === 404 && !(dados && typeof dados.erro === 'string')) {
      // Função de montagem ainda não publicada: a oferta fica aprovada e o post é montado depois.
      aviso = 'montagem do post ainda não disponível';
    } else {
      return erro(resp.status >= 400 && resp.status < 600 ? resp.status : 502, (dados?.erro as string) ?? 'Não foi possível montar o post.');
    }
  } catch (e) {
    return erro(502, `Não foi possível montar o post: ${e instanceof Error ? e.message : String(e)}`);
  }

  const agora = (deps.agora?.() ?? new Date()).toISOString();
  const u = await deps.usuario.from('ofertas').update({ estado: 'aprovada', decidido_por: eu, decidido_em: agora }).eq('id', o.id).eq('estado', 'pendente');
  if (u.error) return erro(500, u.error.message);
  return r(200, { ok: true, oferta_id: o.id, canais: canais.valor, post, ...(aviso ? { aviso } : {}) });
}

async function pular(deps: DepsAcoes, eu: string, o: LinhaOferta, corpo: Record<string, unknown>): Promise<Resposta> {
  const m = validarMotivoPulo(corpo.motivo as string | null);
  if (!m.ok) return erro(400, m.erro);
  const agora = (deps.agora?.() ?? new Date()).toISOString();
  const u = await deps.usuario
    .from('ofertas')
    .update({ estado: 'pulada', pulo_motivo: m.valor, decidido_por: eu, decidido_em: agora })
    .eq('id', o.id)
    .in('estado', ['pendente', 'aguardando_redacao'])
    .select('id');
  if (u.error) return erro(500, u.error.message);
  if (!u.data?.length) return erro(409, 'Esta oferta já foi decidida.');
  return r(200, { ok: true, oferta_id: o.id });
}

async function editarFrase(deps: DepsAcoes, o: LinhaOferta, corpo: Record<string, unknown>): Promise<Resposta> {
  const cfg = await lerConfigServidor(deps.servico);
  const f = validarFrase(corpo.frase as string | null, cfg.fraseMaxCaracteres);
  if (!f.ok) return erro(400, f.erro);
  // Editar à mão encerra o pedido de outra versão em andamento.
  const u = await deps.usuario
    .from('ofertas')
    .update({ frase: f.valor, frase_editada: true, estado: 'pendente' })
    .eq('id', o.id)
    .in('estado', ['pendente', 'aguardando_redacao'])
    .select('id');
  if (u.error) return erro(500, u.error.message);
  if (!u.data?.length) return erro(409, 'Esta oferta já foi decidida.');
  return r(200, { ok: true, oferta_id: o.id, frase: f.valor });
}

async function outraVersao(deps: DepsAcoes, o: LinhaOferta): Promise<Resposta> {
  if (o.estado === 'aguardando_redacao') return erro(409, 'A Redatora já está escrevendo outra versão.');
  const cfg = await lerConfigServidor(deps.servico);
  const agora = deps.agora?.() ?? new Date();
  const pedido: PedidoRedacao = {
    oferta_id: o.id,
    tipo: 'outra_versao',
    versao: o.frase_versao + 1,
    nome: o.produtos?.nome ?? 'Produto',
    nicho: o.produtos?.nichos?.nome ?? null,
    preco_atual: Number(o.preco_atual),
    frase_atual: o.frase,
    motivos: (o.motivos ?? []).slice(0, 5),
    frase_max: cfg.fraseMaxCaracteres,
  };

  const lote = loteRedacao(agora);
  const job = await juntarAoLote(deps.servico, lote, pedido);
  if ('erro' in job) return erro(500, job.erro);

  const u = await deps.usuario.from('ofertas').update({ estado: 'aguardando_redacao' }).eq('id', o.id).eq('estado', 'pendente');
  if (u.error) return erro(500, u.error.message);
  return r(200, { ok: true, oferta_id: o.id, job_id: job.id, dispara_em: lote.dispararEm.toISOString() });
}

/** Junta o pedido no job do lote de 5 minutos; se o lote já saiu, cria um job só para ele. */
async function juntarAoLote(db: SupabaseClient, lote: { chave: string; dispararEm: Date }, pedido: PedidoRedacao): Promise<{ id: string } | { erro: string }> {
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    const ex = await db.from('agente_jobs').select('id, estado, entrada').eq('chave_unica', lote.chave).maybeSingle();
    if (ex.error) return { erro: ex.error.message };
    if (!ex.data) {
      const entrada: EntradaRedacao = juntarNoLote(null, pedido);
      const ins = await db
        .from('agente_jobs')
        .insert({ rotina: 'pa-redacao', contrato: 'redacao/v1', entrada, chave_unica: lote.chave, proxima_tentativa_em: lote.dispararEm.toISOString() })
        .select('id')
        .single();
      if (!ins.error) return { id: ins.data.id as string };
      if (ins.error.code !== '23505') return { erro: ins.error.message };
      continue; // outro pedido criou o lote ao mesmo tempo: tenta juntar
    }
    if (ex.data.estado === 'pendente') {
      const atual = entradaRedacao.safeParse(ex.data.entrada);
      const entrada = juntarNoLote(atual.success ? atual.data : null, pedido);
      const up = await db.from('agente_jobs').update({ entrada }).eq('id', ex.data.id).eq('estado', 'pendente').select('id');
      if (up.error) return { erro: up.error.message };
      if (up.data?.length) return { id: ex.data.id as string };
      continue; // o lote saiu entre a leitura e a escrita
    }
    // Lote já disparado: job próprio, sai no próximo minuto.
    const proprio = `redacao:oferta:${pedido.oferta_id}:v${pedido.versao}`;
    const ins = await db
      .from('agente_jobs')
      .insert({ rotina: 'pa-redacao', contrato: 'redacao/v1', entrada: juntarNoLote(null, pedido), chave_unica: proprio })
      .select('id')
      .single();
    if (!ins.error) return { id: ins.data.id as string };
    if (ins.error.code === '23505') {
      const j = await db.from('agente_jobs').select('id').eq('chave_unica', proprio).single();
      return j.error ? { erro: j.error.message } : { id: j.data.id as string };
    }
    return { erro: ins.error.message };
  }
  return { erro: 'Não foi possível juntar o pedido ao lote da Redatora. Tente de novo.' };
}

async function pedirProduto(deps: DepsAcoes, eu: string, corpo: Record<string, unknown>): Promise<Resposta> {
  const p = interpretarPedido(typeof corpo.texto === 'string' ? corpo.texto : '');
  if (!p.ok) return erro(400, p.erro);
  const ins = await deps.usuario
    .from('pedidos_produto')
    .insert({ origem: 'lana', texto: p.valor.texto, preco_max: p.valor.preco_max, criado_por: eu })
    .select('id')
    .single();
  if (ins.error) return erro(500, ins.error.message);
  const pedidoId = ins.data.id as string;
  try {
    const j = await criarJobPedido(deps.servico, pedidoId, deps.agora?.() ?? new Date());
    return r(200, { ok: true, pedido_id: pedidoId, ...p.valor, job_id: j.job_id, candidatas: j.candidatas });
  } catch (e) {
    // O pedido fica gravado e entra na rodada diária.
    console.error(e);
    return r(200, { ok: true, pedido_id: pedidoId, ...p.valor, job_id: null, candidatas: 0 });
  }
}
