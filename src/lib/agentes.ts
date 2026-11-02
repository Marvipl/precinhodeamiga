// F-12 e F-14: leitura e ações do estado das rotinas dos agentes (agente_rotinas, agente_uso_hoje).
import type { IdRotina } from '@core/agentes.ts';
import type { RespostaIntegracoes } from '@core/integracoes.ts';
import { lista, ok, useAcao, useConsulta } from './dados';

export interface LinhaRotina {
  rotina: IdRotina;
  pausada: boolean;
  teto_diario: number | null;
  ultima_execucao: string | null;
  ultimo_erro: string | null;
  ultimo_erro_em: string | null;
}

const CHAVE_ROTINAS = ['agente_rotinas'];
const CHAVE_USO = ['agente_uso_hoje'];

export function useRotinas() {
  return useConsulta<LinhaRotina[]>(
    [...CHAVE_ROTINAS, 'painel'],
    async (sb) =>
      lista<LinhaRotina>(await sb.from('agente_rotinas').select('rotina, pausada, teto_diario, ultima_execucao, ultimo_erro, ultimo_erro_em').order('rotina')),
    [],
    { refetchInterval: 60_000 },
  );
}

/** Disparos de hoje por rotina. A Lana não lê as tentativas (RLS), então para ela o mapa vem vazio. */
export function useUsoHoje() {
  return useConsulta<Record<string, number>>(
    CHAVE_USO,
    async (sb) => {
      const linhas = lista<{ rotina: string; disparos: number }>(await sb.from('agente_uso_hoje').select('rotina, disparos'));
      return Object.fromEntries(linhas.map((l) => [l.rotina, l.disparos]));
    },
    {},
    { refetchInterval: 60_000 },
  );
}

export function usePausarRotina() {
  return useAcao<{ rotina: IdRotina; pausada: boolean }>(async (sb, { rotina, pausada }) => {
    ok(await sb.from('agente_rotinas').update({ pausada }).eq('rotina', rotina));
  }, [CHAVE_ROTINAS]);
}

export function useSalvarTeto() {
  return useAcao<{ rotina: IdRotina; teto: number | null }>(async (sb, { rotina, teto }) => {
    ok(await sb.from('agente_rotinas').update({ teto_diario: teto }).eq('rotina', rotina));
  }, [CHAVE_ROTINAS]);
}

/** Botão "Testar rotina" (Fluxo G): cria um job ping/v1 pela função agente-ping. */
export function useTestarRotina() {
  return useAcao<void, { job_id: string; criado: boolean }>(async (sb) => {
    const { data, error } = await sb.functions.invoke<{ job_id: string; criado: boolean }>('agente-ping', { body: {} });
    if (error || !data) throw new Error(error?.message ?? 'sem resposta');
    return data;
  }, [CHAVE_ROTINAS]);
}

/** Estado das integrações (só o dono). No modo local, null = aguardando dados. */
export function useIntegracoes(ativo: boolean) {
  return useConsulta<RespostaIntegracoes | null>(
    ['integracoes-estado', ativo],
    async (sb) => {
      if (!ativo) return null;
      const { data, error } = await sb.functions.invoke<RespostaIntegracoes>('integracoes-estado', { body: {} });
      if (error) throw new Error(error.message);
      return data;
    },
    null,
  );
}
