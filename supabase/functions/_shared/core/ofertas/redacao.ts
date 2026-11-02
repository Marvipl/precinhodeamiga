// "Pedir outra versão" (F-04) com a rotina pa-redacao. Código puro.
// Os pedidos de 5 minutos são juntados num só job (Anexo A.3): a chave do lote é o início da janela.
import type { EntradaRedacao, PedidoRedacao, SaidaRedacao } from '../contratos/redacao.ts';
import type { AlertaOferta, EstadoOferta } from './fila.ts';

export const JANELA_LOTE_MIN = 5;

export function loteRedacao(agora: Date): { chave: string; dispararEm: Date } {
  const ms = JANELA_LOTE_MIN * 60_000;
  const inicio = Math.floor(agora.getTime() / ms) * ms;
  return { chave: `redacao:lote:${new Date(inicio).toISOString().slice(0, 16)}`, dispararEm: new Date(inicio + ms) };
}

/** Junta um pedido no lote; o mesmo oferta_id substitui o anterior (vale a versão mais nova). */
export function juntarNoLote(entrada: EntradaRedacao | null, pedido: PedidoRedacao): EntradaRedacao {
  const pedidos = (entrada?.pedidos ?? []).filter((p) => p.oferta_id !== pedido.oferta_id);
  pedidos.push(pedido);
  return { pedidos };
}

export interface OfertaAtual {
  id: string;
  estado: EstadoOferta;
  frase: string | null;
  frase_versao: number;
  alertas: AlertaOferta[];
}

export interface AtualizacaoFrase {
  id: string;
  estado: 'pendente';
  frase: string | null;
  frase_versao: number;
  frase_editada: false;
  alertas: AlertaOferta[];
}

const TIPOS_DE_TEXTO = new Set(['promessa', 'frase_longa', 'sem_versao']);

/**
 * Para cada oferta que espera nova frase, devolve a atualização. Ofertas que já foram decididas
 * ou que pediram uma versão mais nova depois deste lote ficam como estão.
 */
export function aplicarSaidaRedacao(
  entrada: EntradaRedacao,
  saida: SaidaRedacao,
  atuais: readonly OfertaAtual[],
  fraseMax: number,
): AtualizacaoFrase[] {
  const porId = new Map(atuais.map((o) => [o.id, o]));
  const textos = new Map(saida.textos.filter((t) => t.tipo === 'outra_versao').map((t) => [t.oferta_id, t]));
  const out: AtualizacaoFrase[] = [];
  for (const p of entrada.pedidos) {
    const o = porId.get(p.oferta_id);
    if (!o || o.estado !== 'aguardando_redacao' || o.frase_versao + 1 !== p.versao) continue;
    const base = o.alertas.filter((a) => !TIPOS_DE_TEXTO.has(a.tipo));
    const t = textos.get(p.oferta_id);
    if (!t || t.frase === null) {
      out.push({
        id: o.id,
        estado: 'pendente',
        frase: o.frase,
        frase_versao: o.frase_versao,
        frase_editada: false,
        alertas: [...base, { tipo: 'sem_versao', texto: 'A Redatora não devolveu outra versão. A frase anterior foi mantida.' }],
      });
      continue;
    }
    const frase = t.frase.replace(/\s+/g, ' ').trim();
    if (!frase || [...frase].length > fraseMax) {
      out.push({
        id: o.id,
        estado: 'pendente',
        frase: o.frase,
        frase_versao: o.frase_versao,
        frase_editada: false,
        alertas: [...base, { tipo: 'frase_longa', texto: `A nova frase passou de ${fraseMax} caracteres e foi descartada. A frase anterior foi mantida.` }],
      });
      continue;
    }
    out.push({
      id: o.id,
      estado: 'pendente',
      frase,
      frase_versao: p.versao,
      frase_editada: false,
      alertas: [...base, ...t.alertas.map((a) => ({ tipo: 'promessa', texto: a.texto, ...(a.trecho ? { trecho: a.trecho } : {}) }))],
    });
  }
  return out;
}

/** Pedidos de outra versão que expiraram ou deram erro: a oferta volta para a fila com a frase anterior. */
export function devolverSemVersao(o: OfertaAtual): AtualizacaoFrase {
  return {
    id: o.id,
    estado: 'pendente',
    frase: o.frase,
    frase_versao: o.frase_versao,
    frase_editada: false,
    alertas: [...o.alertas.filter((a) => !TIPOS_DE_TEXTO.has(a.tipo)), { tipo: 'sem_versao', texto: 'A Redatora não devolveu outra versão. A frase anterior foi mantida.' }],
  };
}
