// Leituras da tela Hoje (F-10). No modo local devolvem vazio e a tela mostra "aguardando dados".
import { instanteLocal } from '@core/formato.ts';
import { lista, ok, useAcao, useConsulta } from '@/lib/dados';

export interface ResumoDia {
  ofertasPendentes: number;
  proximoEnvio: { agendado_para: string; bloco_data: string } | null;
  postsNoProximoBloco: number;
  enviosWhatsappPendentes: number;
  artesStatus: number;
  rotinasPausadas: number;
}

const RESUMO_VAZIO: ResumoDia = {
  ofertasPendentes: 0,
  proximoEnvio: null,
  postsNoProximoBloco: 0,
  enviosWhatsappPendentes: 0,
  artesStatus: 0,
  rotinasPausadas: 0,
};

async function contar(q: PromiseLike<{ count: number | null; error: { message: string } | null }>): Promise<number> {
  const r = await q;
  if (r.error) throw new Error(r.error.message);
  return r.count ?? 0;
}

export function useResumoDia(hoje: string) {
  return useConsulta<ResumoDia>(
    ['hoje', 'resumo', hoje],
    async (sb) => {
      const agora = new Date().toISOString();
      const [ofertasPendentes, proximo, enviosWhatsappPendentes, artesStatus, rotinasPausadas] = await Promise.all([
        contar(sb.from('ofertas').select('id', { count: 'exact', head: true }).eq('data', hoje).eq('estado', 'pendente')),
        sb
          .from('post_envios')
          .select('agendado_para, bloco_data')
          .in('estado', ['agendado', 'revisar_preco'])
          .gte('agendado_para', agora)
          .order('agendado_para', { ascending: true })
          .limit(1),
        contar(
          sb.from('post_envios').select('id', { count: 'exact', head: true }).eq('canal', 'wa').eq('bloco_data', hoje).in('estado', ['agendado', 'revisar_preco']),
        ),
        contar(sb.from('artes_status').select('id', { count: 'exact', head: true }).eq('data', hoje)),
        contar(sb.from('agente_rotinas').select('rotina', { count: 'exact', head: true }).eq('pausada', true)),
      ]);
      const proximoEnvio = lista(proximo)[0] ?? null;
      let postsNoProximoBloco = 0;
      if (proximoEnvio) {
        const r = await sb
          .from('post_envios')
          .select('post_id')
          .eq('bloco_data', proximoEnvio.bloco_data)
          .in('estado', ['agendado', 'revisar_preco'])
          .gte('agendado_para', agora);
        postsNoProximoBloco = new Set(lista(r).map((x) => x.post_id)).size;
      }
      return { ofertasPendentes, proximoEnvio, postsNoProximoBloco, enviosWhatsappPendentes, artesStatus, rotinasPausadas };
    },
    RESUMO_VAZIO,
    { refetchInterval: 60_000 },
  );
}

export interface DataPicoLinha {
  data: string;
  nome: string;
  descricao: string | null;
}

export function useDatasPico() {
  return useConsulta<DataPicoLinha[]>(
    ['datas_pico'],
    async (sb) => lista(await sb.from('datas_pico').select('data, nome, descricao').order('data')),
    [],
  );
}

export interface Atividade {
  id: number;
  agente: string;
  texto: string;
  link: string | null;
  criado_em: string;
}

/** "O que a equipe fez desde a meia-noite" (horário de Brasília). */
export function useAtividadesDesdeMeiaNoite(hoje: string) {
  return useConsulta<Atividade[]>(
    ['atividades', hoje],
    async (sb) =>
      lista(
        await sb
          .from('atividades')
          .select('id, agente, texto, link, criado_em')
          .gte('criado_em', instanteLocal(hoje, '00:00').toISOString())
          .order('criado_em', { ascending: true })
          .limit(30),
      ),
    [],
    { refetchInterval: 120_000 },
  );
}

const CHAVE_MARCAS = (hoje: string) => ['roteiro_marcas', hoje];

export function useMarcasRoteiro(hoje: string) {
  return useConsulta<Record<string, boolean>>(
    CHAVE_MARCAS(hoje),
    async (sb) => {
      const linhas = lista(await sb.from('roteiro_marcas').select('tarefa, feita').eq('data', hoje));
      return Object.fromEntries(linhas.map((l) => [l.tarefa, l.feita]));
    },
    {},
  );
}

export function useMarcarTarefa(hoje: string, userId: string | undefined) {
  return useAcao<{ tarefa: string; feita: boolean }>(async (sb, { tarefa, feita }) => {
    ok(await sb.from('roteiro_marcas').upsert({ data: hoje, tarefa, feita, marcado_por: userId, marcado_em: new Date().toISOString() }));
  }, [CHAVE_MARCAS(hoje)]);
}

export interface PlanoParaRoteiro {
  marcas: Array<{ tarefa: string; feita: boolean }>;
  prioridades: string[];
}

/** Marcas do plano e prioridades da última revisão da Coach (P12), para a tarefa da semana. */
export function usePlanoParaRoteiro() {
  return useConsulta<PlanoParaRoteiro>(
    ['plano', 'roteiro'],
    async (sb) => {
      const [marcas, rev] = await Promise.all([
        sb.from('plano_marcas').select('tarefa, feita'),
        sb.from('plano_revisoes').select('prioridades').order('semana', { ascending: false }).limit(1).maybeSingle(),
      ]);
      const prioridades = ((ok(rev) as { prioridades?: Array<{ tarefa_id: string }> } | null)?.prioridades ?? []).map((p) => p.tarefa_id);
      return { marcas: lista(marcas), prioridades };
    },
    { marcas: [], prioridades: [] },
  );
}
