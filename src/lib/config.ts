import { resolverConfig, CONFIG, type ChaveConfig, type ConfigResolvida } from '@core/config.ts';
import { useAcao, useConsulta, ok, lista } from './dados';

const CHAVE = ['configuracoes'];

/** Configuração vigente: valores iniciais do código + o que foi salvo. */
export function useConfig() {
  return useConsulta<ConfigResolvida>(
    CHAVE,
    async (sb) => resolverConfig(lista(await sb.from('configuracoes').select('chave, valor'))),
    resolverConfig([]),
  );
}

export function useSalvarConfig() {
  return useAcao<{ nome: ChaveConfig; valor: unknown }>(async (sb, { nome, valor }) => {
    const def = CONFIG[nome];
    ok(await sb.from('configuracoes').upsert({ chave: def.chave, valor, so_dono: def.soDono, atualizado_em: new Date().toISOString() }));
  }, [CHAVE]);
}

/** Volta uma regra ao valor inicial (apaga a linha salva). */
export function useRestaurarConfig() {
  return useAcao<ChaveConfig>(async (sb, nome) => {
    ok(await sb.from('configuracoes').delete().eq('chave', CONFIG[nome].chave));
  }, [CHAVE]);
}
