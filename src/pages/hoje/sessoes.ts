// Leituras e escritas do registro de tempo (F-11).
import { dataLocal, instanteLocal, somarDias } from '@core/formato.ts';
import { lista, ok, useAcao, useConsulta } from '@/lib/dados';

export interface SessaoLinha {
  id: string;
  user_id: string;
  inicio: string;
  fim: string | null;
  ultima_atividade: string | null;
  montagem: boolean;
  manual: boolean;
  fechada_automaticamente: boolean;
  confirmada_em: string | null;
  nota: string | null;
}

const CAMPOS = 'id, user_id, inicio, fim, ultima_atividade, montagem, manual, fechada_automaticamente, confirmada_em, nota';
export const CHAVE_SESSOES = ['sessoes_trabalho'];

/** Início do mês corrente (Brasília) como instante. */
export function inicioDoMes(hoje: string = dataLocal()): Date {
  return instanteLocal(`${hoje.slice(0, 8)}01`, '00:00');
}

/** Minhas sessões do mês e dos últimos 14 dias (o que for mais antigo). */
export function useMinhasSessoes(userId: string | undefined) {
  return useConsulta<SessaoLinha[]>(
    [...CHAVE_SESSOES, 'minhas', userId],
    async (sb) => {
      if (!userId) return [];
      const hoje = dataLocal();
      const quinzena = instanteLocal(somarDias(hoje, -14), '00:00');
      const mes = inicioDoMes(hoje);
      const desde = quinzena < mes ? quinzena : mes;
      return lista(
        await sb.from('sessoes_trabalho').select(CAMPOS).eq('user_id', userId).gte('inicio', desde.toISOString()).order('inicio', { ascending: false }).limit(200),
      );
    },
    [],
    { refetchInterval: 60_000 },
  );
}

/** Sessões da operadora no mês, para a comissão por hora (o dono vê as horas da Lana). */
export function useSessoesOperadoraMes() {
  return useConsulta<SessaoLinha[]>(
    [...CHAVE_SESSOES, 'operadora', 'mes', dataLocal().slice(0, 7)],
    async (sb) => {
      const ops = lista(await sb.from('perfis').select('user_id').eq('papel', 'operadora')).map((p) => p.user_id as string);
      if (ops.length === 0) return [];
      return lista(await sb.from('sessoes_trabalho').select(CAMPOS).in('user_id', ops).gte('inicio', inicioDoMes().toISOString()));
    },
    [],
    { refetchInterval: 300_000 },
  );
}

export function useComecarSessao(userId: string | undefined) {
  return useAcao<void>(async (sb) => {
    if (!userId) throw new Error('Entre de novo para registrar o tempo.');
    const agora = new Date().toISOString();
    ok(await sb.from('sessoes_trabalho').insert({ user_id: userId, inicio: agora, ultima_atividade: agora }));
  }, [CHAVE_SESSOES]);
}

export function useEncerrarSessao() {
  return useAcao<{ id: string }>(async (sb, { id }) => {
    const agora = new Date().toISOString();
    ok(await sb.from('sessoes_trabalho').update({ fim: agora, ultima_atividade: agora }).eq('id', id).is('fim', null));
  }, [CHAVE_SESSOES]);
}

export function useAlterarSessao() {
  return useAcao<{ id: string; campos: Partial<Pick<SessaoLinha, 'inicio' | 'fim' | 'montagem' | 'nota' | 'confirmada_em'>> }>(
    async (sb, { id, campos }) => {
      ok(await sb.from('sessoes_trabalho').update(campos).eq('id', id));
    },
    [CHAVE_SESSOES],
  );
}

export function useLancarSessao(userId: string | undefined) {
  return useAcao<{ inicio: string; fim: string; montagem: boolean; nota: string | null }>(async (sb, s) => {
    if (!userId) throw new Error('Entre de novo para registrar o tempo.');
    ok(await sb.from('sessoes_trabalho').insert({ user_id: userId, ...s, ultima_atividade: s.fim, manual: true, confirmada_em: new Date().toISOString() }));
  }, [CHAVE_SESSOES]);
}

export function useApagarSessao() {
  return useAcao<{ id: string }>(async (sb, { id }) => {
    ok(await sb.from('sessoes_trabalho').delete().eq('id', id));
  }, [CHAVE_SESSOES]);
}
