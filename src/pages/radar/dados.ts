// Leitura e ações da tela Radar (F-21). As regras de estado e de agenda vêm de @core/radar.
import { dataLocal } from '@core/formato.ts';
import type { EstadoLugar } from '@core/radar/lugares.ts';
import { lista, useAcao, useConsulta } from '@/lib/dados';
import { modoLocal } from '@/lib/supabase';

export interface Mensagens {
  pedido_admin?: string;
  troca?: string | null;
  convite?: string;
}

export interface Lugar {
  id: string;
  nome: string;
  tipo: string;
  regiao: string | null;
  url: string | null;
  membros: number | null;
  nota: number | null;
  regra: string;
  proibe_links: boolean;
  motivo: string | null;
  aviso: string | null;
  mensagens: Mensagens;
  alertas: { trecho: string; texto: string }[];
  estado: EstadoLugar;
  origem: string | null;
  dias_permitidos: number[];
  intervalo_dias: number | null;
  pedido_em: string | null;
  criado_em: string;
}

export interface DadosRadar {
  lugares: Lugar[];
  /** Última divulgação (ISO) por lugar. */
  ultimas: Record<string, string>;
  /** Cliques no link de entrada neste mês, por origem. `null` = aguardando dados. */
  cliques: Record<string, number> | null;
}

const VAZIO: DadosRadar = { lugares: [], ultimas: {}, cliques: null };
export const CHAVE_RADAR = ['radar'];

export function inicioDoMes(hoje = dataLocal()): string {
  return `${hoje.slice(0, 7)}-01`;
}

export function useRadar() {
  return useConsulta<DadosRadar>(
    CHAVE_RADAR,
    async (sb) => {
      const [lugares, divs, cliques] = await Promise.all([
        sb.from('radar_lugares').select('*').not('estado', 'in', '(recusou,descartado)').order('criado_em', { ascending: false }),
        sb.from('radar_divulgacoes').select('lugar_id, divulgado_em').order('divulgado_em', { ascending: false }).limit(1000),
        sb.from('entrada_cliques_diarios').select('origem, total').eq('botao', 'pagina').gte('data', inicioDoMes()),
      ]);
      const ultimas: Record<string, string> = {};
      for (const d of lista<{ lugar_id: string; divulgado_em: string }>(divs)) ultimas[d.lugar_id] ??= d.divulgado_em;
      const porOrigem: Record<string, number> = {};
      for (const c of lista<{ origem: string; total: number }>(cliques)) porOrigem[c.origem] = (porOrigem[c.origem] ?? 0) + c.total;
      return { lugares: lista<Lugar>(lugares), ultimas, cliques: porOrigem };
    },
    VAZIO,
    { refetchInterval: 60_000 },
  );
}

export type AcaoRadar =
  | { lugar_id: string; acao: 'adicionar' | 'descartar' | 'ja_pedi' | 'recusou' | 'divulguei' }
  | { lugar_id: string; acao: 'aprovou'; dias_permitidos: number[]; intervalo_dias: number };

export function useAcaoRadar() {
  return useAcao<AcaoRadar, { estado: EstadoLugar; proxima: string | null }>(async (sb, corpo) => {
    const { data, error } = await sb.functions.invoke('radar-acao', { body: corpo });
    if (error) {
      // A função devolve {erro} com o motivo da regra (ex.: "Hoje não é um dia permitido").
      const ctx = (error as { context?: Response }).context;
      const motivo = ctx && typeof ctx.json === 'function' ? await ctx.json().then((j: { erro?: string }) => j.erro).catch(() => null) : null;
      throw new Error(motivo ?? error.message);
    }
    return data as { estado: EstadoLugar; proxima: string | null };
  }, [CHAVE_RADAR]);
}

export { modoLocal };
