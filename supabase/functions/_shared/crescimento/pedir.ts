// Pedidos de conteúdo extra à Redatora (F-28). O código decide se o pedido vale
// (data dentro da janela, oferta aprovada, dúvida repetida por 3 pessoas) e monta a entrada;
// a Redatora só escreve. Sem Deno.*: as dependências entram por parâmetro.
import type { SupabaseClient } from '@supabase/supabase-js';
import { dataLocal, somarDias, instanteLocal } from '../core/formato.ts';
import type { EntradaRedacaoExtra } from '../core/contratos/redacao-extra.ts';
import {
  datasParaLista,
  escolherAchados,
  referenciaLista,
  referenciaRespostas,
  temasRepetidos,
  podePedirOutraVersao,
  JANELA_ACHADOS_DIAS,
  JANELA_RESPOSTAS_DIAS,
  type DuvidaRegistrada,
  type OfertaAchado,
  type TipoExtra,
} from '../core/crescimento/regras.ts';
import { criarJob } from '../jobs/runtime.ts';
import type { JobStore } from '../jobs/store.ts';

export type PedidoExtra =
  | { tipo: 'lista_data'; data_pico_id: string }
  | { tipo: 'roteiro_video'; oferta_id: string }
  | { tipo: 'respostas_semana' }
  | { tipo: 'outra_versao'; conteudo_id: string };

export type RespostaPedido =
  | { ok: true; conteudo_id: string; criado: boolean }
  | { ok: false; status: 400 | 404 | 409 | 422; motivo: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function lerPedido(corpo: unknown): PedidoExtra | null {
  if (!corpo || typeof corpo !== 'object') return null;
  const c = corpo as Record<string, unknown>;
  const id = (k: string) => (typeof c[k] === 'string' && UUID.test(c[k] as string) ? (c[k] as string) : null);
  switch (c.tipo) {
    case 'lista_data':
      return id('data_pico_id') ? { tipo: 'lista_data', data_pico_id: id('data_pico_id')! } : null;
    case 'roteiro_video':
      return id('oferta_id') ? { tipo: 'roteiro_video', oferta_id: id('oferta_id')! } : null;
    case 'respostas_semana':
      return { tipo: 'respostas_semana' };
    case 'outra_versao':
      return id('conteudo_id') ? { tipo: 'outra_versao', conteudo_id: id('conteudo_id')! } : null;
    default:
      return null;
  }
}

type EntradaSemId = { [K in EntradaRedacaoExtra['tipo']]: Omit<Extract<EntradaRedacaoExtra, { tipo: K }>, 'conteudo_id' | 'versao'> }[EntradaRedacaoExtra['tipo']];

interface Montado {
  tipo: TipoExtra;
  referencia: string;
  data_pico_id?: string;
  oferta_id?: string;
  entrada: EntradaSemId;
}

type Falha = Extract<RespostaPedido, { ok: false }>;
const falha = (status: Falha['status'], motivo: string): Falha => ({ ok: false, status, motivo });

interface LinhaOferta {
  id: string;
  nota: number | null;
  motivos: string[] | null;
  preco_atual: number | string;
  produto_id: string;
  produtos: { nome: string } | { nome: string }[] | null;
}

function nomeProduto(o: LinhaOferta): string {
  const p = Array.isArray(o.produtos) ? o.produtos[0] : o.produtos;
  return p?.nome ?? 'Produto';
}

function paraAchado(o: LinhaOferta): OfertaAchado {
  return { id: o.id, nome: nomeProduto(o), preco: Number(o.preco_atual), nota: o.nota, motivos: o.motivos ?? [], produto_id: o.produto_id };
}

async function montar(db: SupabaseClient, p: Exclude<PedidoExtra, { tipo: 'outra_versao' }>, agora: Date): Promise<Montado | Falha> {
  const hoje = dataLocal(agora);
  if (p.tipo === 'lista_data') {
    const d = await db.from('datas_pico').select('id, data, nome').eq('id', p.data_pico_id).maybeSingle();
    if (d.error) throw new Error(d.error.message);
    if (!d.data) return falha(404, 'data de pico não encontrada');
    if (datasParaLista(hoje, [d.data]).length === 0) return falha(422, 'a lista só é preparada nos 30 dias antes da data');
    const o = await db
      .from('ofertas')
      .select('id, nota, motivos, preco_atual, produto_id, produtos(nome)')
      .eq('estado', 'aprovada')
      .gte('data', somarDias(hoje, -JANELA_ACHADOS_DIAS))
      .limit(200);
    if (o.error) throw new Error(o.error.message);
    const achados = escolherAchados(((o.data ?? []) as unknown as LinhaOferta[]).map(paraAchado));
    if (achados.length === 0) return falha(422, 'ainda não há ofertas aprovadas nos últimos 14 dias para montar a lista');
    return {
      tipo: 'lista_data',
      referencia: referenciaLista(d.data.id),
      data_pico_id: d.data.id,
      entrada: {
        tipo: 'lista_data',
        data_pico: { nome: d.data.nome, data: d.data.data },
        achados: achados.map((a) => ({ ref: a.id, nome: a.nome, preco: a.preco, motivos: a.motivos.slice(0, 5) })),
      },
    };
  }
  if (p.tipo === 'roteiro_video') {
    const o = await db
      .from('ofertas')
      .select('id, nota, motivos, preco_atual, produto_id, estado, produtos(nome)')
      .eq('id', p.oferta_id)
      .maybeSingle();
    if (o.error) throw new Error(o.error.message);
    if (!o.data) return falha(404, 'oferta não encontrada');
    if (o.data.estado !== 'aprovada') return falha(422, 'o roteiro de vídeo só é feito para oferta aprovada');
    const a = paraAchado(o.data as unknown as LinhaOferta);
    return {
      tipo: 'roteiro_video',
      referencia: `roteiro_video:${a.id}`,
      oferta_id: a.id,
      entrada: { tipo: 'roteiro_video', produto: { ref: a.id, nome: a.nome, preco: a.preco, motivos: a.motivos.slice(0, 5) } },
    };
  }
  // respostas_semana
  const desde = instanteLocal(somarDias(hoje, -JANELA_RESPOSTAS_DIAS), '00:00').toISOString();
  const r = await db.from('duvidas_registradas').select('tema, contato_ref, pergunta, criado_em').gte('criado_em', desde).limit(1000);
  if (r.error) throw new Error(r.error.message);
  const temas = temasRepetidos((r.data ?? []) as DuvidaRegistrada[], agora);
  if (temas.length === 0) return falha(422, 'nenhuma dúvida se repetiu com 3 pessoas nesta semana');
  return {
    tipo: 'respostas_semana',
    referencia: referenciaRespostas(hoje),
    entrada: { tipo: 'respostas_semana', temas: temas.map((t) => ({ tema: t.tema, perguntas: t.perguntas.length ? t.perguntas : [t.tema] })) },
  };
}

async function disparar(store: JobStore, db: SupabaseClient, conteudoId: string, versao: number, base: EntradaSemId): Promise<void> {
  const entrada = { ...base, conteudo_id: conteudoId, versao } as EntradaRedacaoExtra;
  let jobId: string;
  try {
    const { job } = await criarJob(store, {
      rotina: 'pa-redacao',
      contrato: 'redacao-extra/v1',
      entrada,
      chave_unica: `extra:${conteudoId}:v${versao}`,
    });
    jobId = job.id;
  } catch (e) {
    await db.from('conteudos_extra').update({ estado: 'erro', erro: (e as Error).message }).eq('id', conteudoId);
    throw e;
  }
  const u = await db.from('conteudos_extra').update({ job_id: jobId, entrada }).eq('id', conteudoId);
  if (u.error) throw new Error(u.error.message);
}

export async function pedirConteudo(deps: { db: SupabaseClient; store: JobStore; userId: string | null; agora?: Date }, p: PedidoExtra): Promise<RespostaPedido> {
  const { db, store } = deps;
  const agora = deps.agora ?? new Date();

  if (p.tipo === 'outra_versao') {
    const c = await db.from('conteudos_extra').select('id, versao, estado, entrada, atualizado_em').eq('id', p.conteudo_id).maybeSingle();
    if (c.error) throw new Error(c.error.message);
    if (!c.data) return falha(404, 'conteúdo não encontrado');
    if (!podePedirOutraVersao(c.data.estado, c.data.atualizado_em, agora)) {
      return falha(409, 'a Redatora ainda está escrevendo a versão atual');
    }
    const versao = c.data.versao + 1;
    const u = await db.from('conteudos_extra').update({ versao, estado: 'em_preparo', erro: null, copiado_em: null }).eq('id', c.data.id).eq('versao', c.data.versao);
    if (u.error) throw new Error(u.error.message);
    const { conteudo_id: _c, versao: _v, ...base } = c.data.entrada as EntradaRedacaoExtra;
    await disparar(store, db, c.data.id, versao, base as EntradaSemId);
    return { ok: true, conteudo_id: c.data.id, criado: false };
  }

  const m = await montar(db, p, agora);
  if ('ok' in m) return m;

  const existente = await db.from('conteudos_extra').select('id, versao, estado').eq('referencia', m.referencia).maybeSingle();
  if (existente.error) throw new Error(existente.error.message);
  if (existente.data && existente.data.estado !== 'descartado') {
    // Já existe: não duplica. Para um texto novo, a Lana usa "Pedir outra versão".
    return { ok: true, conteudo_id: existente.data.id, criado: false };
  }

  let id: string;
  let versao = 1;
  if (existente.data) {
    versao = existente.data.versao + 1;
    id = existente.data.id;
    const u = await db
      .from('conteudos_extra')
      .update({ versao, estado: 'em_preparo', erro: null, copiado_em: null, titulo: null, texto: null, cenas: null, alertas: [] })
      .eq('id', id);
    if (u.error) throw new Error(u.error.message);
  } else {
    const ins = await db
      .from('conteudos_extra')
      .insert({
        tipo: m.tipo,
        referencia: m.referencia,
        data_pico_id: m.data_pico_id ?? null,
        oferta_id: m.oferta_id ?? null,
        criado_por: deps.userId,
      })
      .select('id')
      .single();
    if (ins.error) throw new Error(ins.error.message);
    id = ins.data.id;
  }
  await disparar(store, db, id, versao, m.entrada);
  return { ok: true, conteudo_id: id, criado: true };
}
