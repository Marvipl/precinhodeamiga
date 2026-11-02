// Leitura e gravação das tabelas de Resultados (F-23). Usado pelo painel (com o login, sob RLS)
// e pela função da Analista (com a chave de serviço). Sem Deno.* nem process.*.
import type { SupabaseClient } from '@supabase/supabase-js';
import { resolverConfig, type ConfigResolvida } from '../core/config.ts';
import { estadoImportacao, lerRelatorioCsv, type ResultadoCsv } from '../core/analista/conversoes.ts';
import type { DadosAnalista } from '../core/analista/painel.ts';
import type { SemanaAudiencia } from '../core/analista/indicadores.ts';
import type { Limites } from '../core/analista/gates.ts';

const PAGINA = 1000;

/** Lê todas as linhas de uma consulta, em páginas (o PostgREST corta em 1.000 por padrão). */
async function todas<T>(consulta: (de: number, ate: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let de = 0; ; de += PAGINA) {
    const r = await consulta(de, de + PAGINA - 1);
    if (r.error) throw new Error(r.error.message);
    const linhas = r.data ?? [];
    out.push(...linhas);
    if (linhas.length < PAGINA) return out;
  }
}

const num = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));
const numOuNulo = (v: unknown) => (v === null || v === undefined ? null : Number(v));

export function limitesDaConfig(cfg: ConfigResolvida): Limites {
  // O gate usa os 3% como escritos (seção 5.6, leituras fixadas), não o limite recalibrado.
  return { valorHora: cfg.valorHoraReferencia, valorHoraParar: cfg.valorHoraParar, limiteQueda: 0.03 };
}

export async function lerConfigServidor(sb: SupabaseClient): Promise<ConfigResolvida> {
  const r = await sb.from('configuracoes').select('chave, valor');
  if (r.error) throw new Error(r.error.message);
  return resolverConfig(r.data ?? []);
}

/** Audiência semanal (view do pacote da Audiência). Ausente ou com erro = null ("aguardando dados"). */
export async function lerAudiencia(sb: SupabaseClient): Promise<SemanaAudiencia[] | null> {
  const r = await sb.from('audiencia_semanas').select('canal, semana_inicio, seguidores_inicio, seguidores_fim, saidas');
  if (r.error) return null;
  return (r.data ?? []).map((x: Record<string, unknown>) => ({
    canal: x.canal as 'wa' | 'tg',
    semana_inicio: String(x.semana_inicio),
    seguidores_inicio: numOuNulo(x.seguidores_inicio),
    seguidores_fim: numOuNulo(x.seguidores_fim),
    saidas: numOuNulo(x.saidas),
  }));
}

export async function lerDadosAnalista(sb: SupabaseClient, p: { hoje: string; cfg: ConfigResolvida }): Promise<DadosAnalista> {
  const [conversoes, cliques, sessoes, audiencia, pagamentos, envios, importacoes] = await Promise.all([
    todas((de, ate) => sb.from('conversoes').select('pedido_id, item_id, dia, status, valor_pedido, comissao, comissao_extra, sub1').order('dia').order('id').range(de, ate)),
    todas((de, ate) => sb.from('cliques_diarios').select('dia, sub1, cliques').order('dia').order('sub1').range(de, ate)),
    todas((de, ate) => sb.from('sessoes_trabalho').select('inicio, fim, montagem').order('inicio').order('id').range(de, ate)),
    lerAudiencia(sb),
    todas((de, ate) => sb.from('pagamentos_comissao').select('mes, valor_liquido').order('mes').range(de, ate)),
    todas((de, ate) => sb.from('post_envios').select('post_id, bloco_data').in('estado', ['publicado', 'enviado']).order('id').range(de, ate)),
    todas((de, ate) => sb.from('importacoes_conversoes').select('periodo_inicio, periodo_fim').in('estado', ['ok', 'parcial']).order('id').range(de, ate)),
  ]);
  return {
    hoje: p.hoje,
    dataInicio: p.cfg.dataInicioPlano,
    conversoes: conversoes.map((c: Record<string, unknown>) => ({
      pedido_id: String(c.pedido_id),
      item_id: String(c.item_id ?? ''),
      dia: String(c.dia),
      status: c.status as 'pendente' | 'concluida' | 'cancelada',
      valor_pedido: num(c.valor_pedido),
      comissao: num(c.comissao),
      comissao_extra: num(c.comissao_extra),
      sub1: (c.sub1 as string | null) ?? null,
    })),
    cliques: cliques.map((c: Record<string, unknown>) => ({ dia: String(c.dia), sub1: (c.sub1 as string) || null, cliques: num(c.cliques) })),
    sessoes: sessoes.map((s: Record<string, unknown>) => ({ inicio: String(s.inicio), fim: (s.fim as string | null) ?? null, montagem: !!s.montagem })),
    audiencia,
    pagamentos: pagamentos.map((x: Record<string, unknown>) => ({ mes: String(x.mes), valor: num(x.valor_liquido) })),
    ofertasPostadas: envios.map((e: Record<string, unknown>) => ({ post_id: String(e.post_id), dia: String(e.bloco_data) })),
    periodosImportados: importacoes.map((i: Record<string, unknown>) => ({ inicio: (i.periodo_inicio as string | null) ?? null, fim: (i.periodo_fim as string | null) ?? null })),
    limites: limitesDaConfig(p.cfg),
  };
}

export interface ResultadoImportacao {
  importacao_id: string | null;
  estado: 'ok' | 'parcial' | 'erro';
  leitura: ResultadoCsv;
  gravadas: number;
}

/** Importa o CSV do relatório de conversões (plano B). Reimportar o mesmo arquivo não duplica. */
export async function importarCsv(sb: SupabaseClient, p: { arquivo: string; conteudo: string; userId: string | null }): Promise<ResultadoImportacao> {
  const leitura = lerRelatorioCsv(p.conteudo);
  const estado = estadoImportacao(leitura);
  const mensagem = leitura.faltando.length
    ? `colunas obrigatórias não encontradas: ${leitura.faltando.join(', ')}`
    : leitura.conversoes.length === 0
      ? 'nenhuma linha válida no arquivo'
      : null;
  const imp = await sb
    .from('importacoes_conversoes')
    .insert({
      origem: 'csv',
      arquivo_nome: p.arquivo.slice(0, 200),
      periodo_inicio: leitura.periodo?.inicio ?? null,
      periodo_fim: leitura.periodo?.fim ?? null,
      linhas_lidas: leitura.linhasLidas,
      linhas_gravadas: 0,
      linhas_com_erro: leitura.erros.length,
      erros: leitura.erros.slice(0, 50),
      estado,
      mensagem,
      criado_por: p.userId,
    })
    .select('id')
    .single();
  if (imp.error) throw new Error(imp.error.message);
  const id = (imp.data as { id: string }).id;
  if (estado === 'erro') return { importacao_id: id, estado, leitura, gravadas: 0 };

  let gravadas = 0;
  for (let i = 0; i < leitura.conversoes.length; i += 500) {
    const lote = leitura.conversoes.slice(i, i + 500).map((c) => ({ ...c, origem: 'csv', importacao_id: id }));
    const r = await sb.from('conversoes').upsert(lote, { onConflict: 'pedido_id,item_id' });
    if (r.error) {
      await sb.from('importacoes_conversoes').update({ estado: 'erro', mensagem: `erro ao gravar: ${r.error.message}`, linhas_gravadas: gravadas }).eq('id', id);
      throw new Error(r.error.message);
    }
    gravadas += lote.length;
  }
  const u = await sb.from('importacoes_conversoes').update({ linhas_gravadas: gravadas }).eq('id', id);
  if (u.error) throw new Error(u.error.message);
  return { importacao_id: id, estado, leitura, gravadas };
}
