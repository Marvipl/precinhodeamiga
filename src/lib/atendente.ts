// Leitura e ações da caixa de mensagens da Atendente (F-25) e dos pedidos das amigas (F-26).
import { dataLocal, instanteLocal } from '@core/formato.ts';
import { lista, ok, useAcao, useConsulta } from './dados';

export interface MensagemCaixa {
  id: string;
  origem: 'telegram' | 'formulario';
  texto: string | null;
  recebida_em: string;
  nivel: number | null;
  categoria: string | null;
  estado: string;
  motivo: string | null;
  rascunho: string | null;
  alertas: Array<{ tipo: string; trecho: string }>;
  pedido_id: string | null;
  erro_envio: string | null;
  contatos: { nome_exibido: string | null; primeiro_nome: string | null; preferencia: string; whatsapp: string | null } | null;
}

export interface PedidoAmiga {
  id: string;
  origem: 'lana' | 'formulario' | 'bot';
  texto: string;
  preco_max: number | null;
  estado: 'procurando' | 'opcoes_encontradas' | 'respondido' | 'cancelado';
  achado_a_pedido: boolean;
  atualizado_em: string;
  contatos: { nome_exibido: string | null; primeiro_nome: string | null } | null;
}

export interface CategoriaAtendente {
  categoria: string;
  nivel: number;
  aprovacoes_seguidas: number;
  automatica: boolean;
  desligada: boolean;
  modelo: string | null;
}

const CHAVE = ['atendente'];

export function useCaixa() {
  return useConsulta<MensagemCaixa[]>(
    [...CHAVE, 'caixa'],
    async (sb) =>
      lista(
        await sb
          .from('atendente_mensagens')
          .select('id, origem, texto, recebida_em, nivel, categoria, estado, motivo, rascunho, alertas, pedido_id, erro_envio, contatos(nome_exibido, primeiro_nome, preferencia, whatsapp)')
          .in('estado', ['rascunho', 'urgente', 'pendente', 'processando'])
          .order('recebida_em', { ascending: true })
          .limit(200),
      ) as unknown as MensagemCaixa[],
    [],
    { refetchInterval: 60_000 },
  );
}

/** Respondidas sozinhas desde a meia-noite (Brasília). */
export function useRespondidasHoje() {
  return useConsulta<number>(
    [...CHAVE, 'auto-hoje', dataLocal()],
    async (sb) => {
      const r = await sb
        .from('atendente_mensagens')
        .select('id', { count: 'exact', head: true })
        .eq('estado', 'respondida_auto')
        .gte('respondida_em', instanteLocal(dataLocal(), '00:00').toISOString());
      ok(r);
      return r.count ?? 0;
    },
    0,
    { refetchInterval: 60_000 },
  );
}

export function usePedidos() {
  return useConsulta<PedidoAmiga[]>(
    [...CHAVE, 'pedidos'],
    async (sb) =>
      lista(
        await sb
          .from('pedidos_produto')
          .select('id, origem, texto, preco_max, estado, achado_a_pedido, atualizado_em, contatos(nome_exibido, primeiro_nome)')
          .neq('estado', 'cancelado')
          .order('criado_em', { ascending: false })
          .limit(30),
      ) as unknown as PedidoAmiga[],
    [],
  );
}

export function useCategorias() {
  return useConsulta<CategoriaAtendente[]>(
    [...CHAVE, 'categorias'],
    async (sb) => lista(await sb.from('atendente_categorias').select('categoria, nivel, aprovacoes_seguidas, automatica, desligada, modelo').order('nivel')),
    [],
  );
}

export type AcaoCaixa =
  | { acao: 'aprovar'; mensagem_id: string; texto?: string }
  | { acao: 'outra_versao'; mensagem_id: string }
  | { acao: 'descartar'; mensagem_id: string }
  | { acao: 'respondi_por_fora'; mensagem_id: string };

export interface RespostaAcao {
  ok: true;
  whatsapp_link?: string;
  via?: string;
  virou_automatica?: boolean;
}

export function useAcaoCaixa() {
  return useAcao<AcaoCaixa, RespostaAcao>(async (sb, corpo) => {
    const { data, error } = await sb.functions.invoke('atendente-responder', { body: corpo });
    if (error) {
      // A função devolve { erro } com status 4xx; o cliente embrulha num FunctionsHttpError.
      const ctx = (error as { context?: Response }).context;
      const det = ctx ? ((await ctx.json().catch(() => null)) as { erro?: string } | null) : null;
      throw new Error(det?.erro ?? error.message);
    }
    return data as RespostaAcao;
  }, [CHAVE]);
}

export function useAtualizarCategoria() {
  return useAcao<{ categoria: string; patch: Partial<Pick<CategoriaAtendente, 'automatica' | 'desligada' | 'modelo' | 'aprovacoes_seguidas'>> }>(
    async (sb, { categoria, patch }) => {
      ok(await sb.from('atendente_categorias').update(patch).eq('categoria', categoria));
    },
    [[...CHAVE, 'categorias']],
  );
}

/** Nome para mostrar na caixa: nome exibido do Telegram ou primeiro nome do formulário. */
export function quemEscreveu(c: MensagemCaixa['contatos'] | PedidoAmiga['contatos']): string {
  return c?.nome_exibido || c?.primeiro_nome || 'Alguém';
}
