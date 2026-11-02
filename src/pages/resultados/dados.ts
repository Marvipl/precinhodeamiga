// Consultas e ações da tela Resultados (F-23).
import { dataLocal } from '@core/formato.ts';
import type { ConfigResolvida } from '@core/config.ts';
import type { IdGate, ResultadoGate } from '@core/analista/gates.ts';
import type { DadosAnalista, IdIndicador } from '@core/analista/painel.ts';
import { importarCsv, lerDadosAnalista, limitesDaConfig } from '../../../supabase/functions/_shared/analista/leitura.ts';
import { lista, ok, useAcao, useConsulta } from '@/lib/dados';

export const CHAVE = ['resultados'];

export function dadosVazios(cfg: ConfigResolvida, hoje = dataLocal()): DadosAnalista {
  return {
    hoje,
    dataInicio: cfg.dataInicioPlano,
    conversoes: [],
    cliques: [],
    sessoes: [],
    audiencia: null,
    pagamentos: [],
    ofertasPostadas: [],
    periodosImportados: [],
    limites: limitesDaConfig(cfg),
  };
}

export function useDadosAnalista(cfg: ConfigResolvida) {
  const hoje = dataLocal();
  return useConsulta<DadosAnalista>([...CHAVE, 'dados', hoje, cfg], (sb) => lerDadosAnalista(sb, { hoje, cfg }), dadosVazios(cfg, hoje));
}

export interface Importacao {
  id: string;
  origem: 'api' | 'csv';
  arquivo_nome: string | null;
  periodo_inicio: string | null;
  periodo_fim: string | null;
  linhas_lidas: number;
  linhas_gravadas: number;
  linhas_com_erro: number;
  erros: { linha: number; motivo: string }[];
  estado: 'ok' | 'parcial' | 'erro';
  mensagem: string | null;
  criado_em: string;
}

export function useUltimaImportacao() {
  return useConsulta<Importacao | null>(
    [...CHAVE, 'importacao'],
    async (sb) => lista(await sb.from('importacoes_conversoes').select('*').order('criado_em', { ascending: false }).limit(1))[0] ?? null,
    null,
  );
}

export interface Decisao {
  gate: IdGate;
  recomendacao: ResultadoGate | null;
  decisao: ResultadoGate;
  nota: string | null;
  registrado_em: string;
}

export function useDecisoes() {
  return useConsulta<Decisao[]>([...CHAVE, 'decisoes'], async (sb) => lista(await sb.from('gate_decisoes').select('gate, recomendacao, decisao, nota, registrado_em')), []);
}

export function useMetas() {
  return useConsulta<Partial<Record<IdIndicador, number>>>(
    [...CHAVE, 'metas'],
    async (sb) => Object.fromEntries(lista(await sb.from('metas_fase2').select('indicador, valor')).map((m: { indicador: string; valor: number }) => [m.indicador, Number(m.valor)])),
    {},
  );
}

export interface Resumo {
  semana_inicio: string;
  semana_fim: string;
  texto: string;
  simulado: boolean;
}

export function useUltimoResumo() {
  return useConsulta<Resumo | null>(
    [...CHAVE, 'resumo'],
    async (sb) => lista(await sb.from('resumos_semanais').select('semana_inicio, semana_fim, texto, simulado').order('semana_inicio', { ascending: false }).limit(1))[0] ?? null,
    null,
  );
}

export function useImportarCsv() {
  return useAcao<{ arquivo: string; conteudo: string }, Awaited<ReturnType<typeof importarCsv>>>(async (sb, a) => {
    const { data } = await sb.auth.getUser();
    return importarCsv(sb, { ...a, userId: data.user?.id ?? null });
  }, [CHAVE]);
}

export function useInformarPagamento() {
  return useAcao<{ mes: string; valor: number }>(async (sb, { mes, valor }) => {
    const { data } = await sb.auth.getUser();
    ok(await sb.from('pagamentos_comissao').upsert({ mes, valor_liquido: valor, origem: 'manual', informado_por: data.user?.id ?? null }));
  }, [CHAVE]);
}

export function useRegistrarGate() {
  return useAcao<{ gate: IdGate; recomendacao: ResultadoGate | null; decisao: ResultadoGate; nota: string; numeros: unknown; metas: Partial<Record<IdIndicador, number>> }>(
    async (sb, a) => {
      const { data } = await sb.auth.getUser();
      const uid = data.user?.id ?? null;
      ok(await sb.from('gate_decisoes').upsert({ gate: a.gate, recomendacao: a.recomendacao, decisao: a.decisao, nota: a.nota || null, numeros: a.numeros, registrado_por: uid, registrado_em: new Date().toISOString() }));
      const metas = Object.entries(a.metas).filter(([, v]) => v !== undefined && Number.isFinite(v));
      if (metas.length) ok(await sb.from('metas_fase2').upsert(metas.map(([indicador, valor]) => ({ indicador, valor, definido_por: uid, definido_em: new Date().toISOString() }))));
    },
    [CHAVE],
  );
}
