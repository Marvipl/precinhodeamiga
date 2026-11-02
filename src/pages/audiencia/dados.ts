// Leitura dos dados da Audiência. Fontes de outros pacotes (Radar, Resultados) são lidas com tolerância:
// tabela ausente ou erro vira `null` e a tela diz "aguardando dados".
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  Canal,
  CliqueEntrada,
  ConversaoDia,
  Divulgacao,
  EventoMembro,
  RegistroSeguidores,
} from '@core/audiencia/index.ts';
import { dataLocal, somarDias } from '@core/formato.ts';

export interface LeituraPrint {
  id: string;
  estado: 'lendo' | 'lida' | 'sem_numero' | 'confirmada' | 'descartada' | 'erro';
  numero_lido: number | null;
  trecho: string | null;
  criado_em: string;
}

export interface DadosAudiencia {
  registros: RegistroSeguidores[];
  eventos: EventoMembro[];
  divulgacoes: Divulgacao[] | null;
  cliquesEntrada: CliqueEntrada[] | null;
  conversoes: ConversaoDia[] | null;
  postsPorCanal: Record<Canal, number> | null;
}

export const DADOS_VAZIOS: DadosAudiencia = {
  registros: [],
  eventos: [],
  divulgacoes: null,
  cliquesEntrada: null,
  conversoes: null,
  postsPorCanal: null,
};

type Resp<T> = { data: T[] | null; error: { message: string } | null };

async function tolerante<T>(p: PromiseLike<Resp<T>>): Promise<T[] | null> {
  try {
    const r = await p;
    return r.error ? null : (r.data ?? []);
  } catch {
    return null;
  }
}

const JANELA_DIAS = 100;

export async function buscarAudiencia(sb: SupabaseClient, agora = new Date()): Promise<DadosAudiencia> {
  const desde = new Date(agora.getTime() - JANELA_DIAS * 86_400_000).toISOString();
  const hoje = dataLocal(agora);
  const semana = somarDias(hoje, -6);

  const [registros, eventos, divs, lugares, cliques, conversoes, envios] = await Promise.all([
    tolerante(sb.from('seguidores_registros').select('canal, data, total').order('data')),
    tolerante(sb.from('telegram_membros_eventos').select('tipo, ocorrido_em').gte('ocorrido_em', desde)),
    tolerante(sb.from('radar_divulgacoes').select('id, lugar_id, origem, divulgado_em').gte('divulgado_em', desde)),
    tolerante(sb.from('radar_lugares').select('id, nome')),
    tolerante(sb.from('entrada_cliques').select('origem, criado_em').eq('botao', 'pagina').gte('criado_em', desde)),
    tolerante(sb.from('conversoes_por_canal_dia').select('dia, sub1, cliques, pedidos, comissao').gte('dia', semana)),
    tolerante(sb.from('post_envios').select('canal, estado').gte('bloco_data', semana).in('estado', ['publicado', 'enviado'])),
  ]);

  const nomes = new Map(((lugares ?? []) as { id: string; nome: string }[]).map((l) => [l.id, l.nome]));
  const postsPorCanal = envios
    ? (envios as { canal: Canal }[]).reduce<Record<Canal, number>>((acc, e) => ({ ...acc, [e.canal]: acc[e.canal] + 1 }), { wa: 0, tg: 0 })
    : null;

  return {
    registros: ((registros ?? []) as { canal: Canal; data: string; total: number }[]).map((r) => ({ ...r, total: Number(r.total) })),
    eventos: ((eventos ?? []) as { tipo: 'entrou' | 'saiu'; ocorrido_em: string }[]).map((e) => ({ tipo: e.tipo, em: new Date(e.ocorrido_em) })),
    divulgacoes: divs
      ? (divs as { id: string; lugar_id: string; origem: string; divulgado_em: string }[]).map((d) => ({
          id: d.id,
          origem: d.origem,
          lugar: nomes.get(d.lugar_id) ?? d.origem,
          em: new Date(d.divulgado_em),
        }))
      : null,
    cliquesEntrada: cliques ? (cliques as { origem: string; criado_em: string }[]).map((c) => ({ origem: c.origem, em: new Date(c.criado_em) })) : null,
    conversoes: conversoes
      ? (conversoes as ConversaoDia[]).map((c) => ({
          dia: c.dia,
          sub1: c.sub1,
          cliques: Number(c.cliques ?? 0),
          pedidos: Number(c.pedidos ?? 0),
          comissao: Number(c.comissao ?? 0),
        }))
      : null,
    postsPorCanal,
  };
}

/** Leitura de print mais recente que ainda espera a Lana (lendo, lida ou sem número). */
export async function buscarLeituraPendente(sb: SupabaseClient): Promise<LeituraPrint | null> {
  const r = await sb
    .from('leituras_print')
    .select('id, estado, numero_lido, trecho, criado_em')
    .in('estado', ['lendo', 'lida', 'sem_numero'])
    .order('criado_em', { ascending: false })
    .limit(1);
  if (r.error) return null;
  return (r.data?.[0] as LeituraPrint | undefined) ?? null;
}

const EXTENSOES: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/heic': 'heic' };

export function extensaoDoPrint(f: { type: string; name: string }): string | null {
  if (EXTENSOES[f.type]) return EXTENSOES[f.type];
  const m = /\.(png|jpe?g|webp|heic)$/i.exec(f.name);
  return m ? m[1].toLowerCase().replace('jpeg', 'jpg') : null;
}
