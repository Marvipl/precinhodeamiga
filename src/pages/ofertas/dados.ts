// Leitura e ações da fila de ofertas. As ações passam pela função ofertas-acao, que decide
// permissão, estado e limites; a tela só mostra o resultado.
import { FunctionsHttpError } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { dataLocal } from '@core/formato.ts';
import type { AlertaOferta, Canal, OfertaFila } from '@core/ofertas/fila.ts';
import { lista, useAcao, useConsulta } from '@/lib/dados';

export const CHAVE_OFERTAS = ['ofertas'];

const CAMPOS =
  'id, data, origem, pedido_id, nota, motivos, alertas, fora_nicho_principal, preco_atual, preco_referencia, dias_historico, comissao_taxa, comissao_extra, cupom, prazo, frase, frase_versao, frase_editada, estado, produtos(nome, imagem_url, url_produto, nicho_id, nichos(nome))';

interface Linha extends Omit<OfertaFila, 'produto' | 'preco_atual' | 'preco_referencia' | 'comissao_taxa' | 'alertas'> {
  preco_atual: number | string;
  preco_referencia: number | string | null;
  comissao_taxa: number | string | null;
  alertas: AlertaOferta[] | null;
  produtos: { nome: string; imagem_url: string | null; url_produto: string; nicho_id: string | null; nichos: { nome: string } | null } | null;
}

const num = (v: number | string | null): number | null => (v === null ? null : Number(v));

export function paraOferta(l: Linha): OfertaFila {
  const { produtos, ...resto } = l;
  return {
    ...resto,
    motivos: l.motivos ?? [],
    alertas: Array.isArray(l.alertas) ? l.alertas : [],
    preco_atual: Number(l.preco_atual),
    preco_referencia: num(l.preco_referencia),
    comissao_taxa: num(l.comissao_taxa),
    produto: {
      nome: produtos?.nome ?? 'Produto sem nome',
      imagem_url: produtos?.imagem_url ?? null,
      url_produto: produtos?.url_produto ?? '',
      nicho_id: produtos?.nicho_id ?? null,
      nicho_nome: produtos?.nichos?.nome ?? null,
    },
  };
}

export function useOfertasDoDia() {
  const hoje = dataLocal();
  return useConsulta<OfertaFila[]>(
    [...CHAVE_OFERTAS, 'fila', hoje],
    async (sb) => lista((await sb.from('ofertas').select(CAMPOS).eq('data', hoje)) as unknown as { data: Linha[] | null; error: { message: string } | null }).map(paraOferta),
    [],
    { refetchInterval: 30_000 },
  );
}

export interface Nicho {
  id: string;
  nome: string;
  principal: boolean;
}

export function useNichos() {
  return useConsulta<Nicho[]>(['nichos'], async (sb) => lista<Nicho>(await sb.from('nichos').select('id, nome, principal').eq('ativo', true).order('nome')), []);
}

export interface PedidoLana {
  id: string;
  texto: string;
  preco_max: number | null;
  estado: 'procurando' | 'opcoes_encontradas' | 'respondido' | 'cancelado';
  criado_em: string;
}

export function usePedidosAbertos() {
  return useConsulta<PedidoLana[]>(
    [...CHAVE_OFERTAS, 'pedidos'],
    async (sb) =>
      lista<PedidoLana>(
        await sb
          .from('pedidos_produto')
          .select('id, texto, preco_max, estado, criado_em')
          .eq('origem', 'lana')
          .in('estado', ['procurando', 'opcoes_encontradas'])
          .order('criado_em', { ascending: false })
          .limit(10),
      ),
    [],
    { refetchInterval: 30_000 },
  );
}

export type AcaoOferta =
  | { acao: 'aprovar'; oferta_id: string; canais: Canal[]; frase?: string | null }
  | { acao: 'pular'; oferta_id: string; motivo: string | null }
  | { acao: 'editar_frase'; oferta_id: string; frase: string | null }
  | { acao: 'outra_versao'; oferta_id: string }
  | { acao: 'pedir_produto'; texto: string };

export interface RespostaAcao {
  ok?: boolean;
  aviso?: string;
  candidatas?: number;
  job_id?: string | null;
}

export class ErroAcao extends Error {
  constructor(
    message: string,
    public expirada = false,
  ) {
    super(message);
  }
}

export async function chamarAcao(sb: SupabaseClient, corpo: AcaoOferta): Promise<RespostaAcao> {
  const { data, error } = await sb.functions.invoke('ofertas-acao', { body: corpo });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const c = (await (error.context as Response).json().catch(() => null)) as { erro?: string; expirada?: boolean } | null;
      throw new ErroAcao(c?.erro ?? 'Não foi possível concluir. Tente de novo.', c?.expirada === true);
    }
    throw new ErroAcao('Sem conexão com o servidor. Tente de novo.');
  }
  return (data ?? {}) as RespostaAcao;
}

export function useAcaoOferta() {
  return useAcao<AcaoOferta, RespostaAcao>(chamarAcao, [CHAVE_OFERTAS]);
}
