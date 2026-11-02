// Aplica a saída da curadoria/v1 (Fluxo A passo 2, Fluxo B passo 2). Código puro.
// A IA escolhe e escreve; aqui o código decide o que vira oferta:
//  * só produtos que estavam nas candidatas (a IA não inventa produto nem preço);
//  * no máximo `tamanho_fila` ofertas da rodada, sem repetir produto;
//  * preço, preço "de", comissão e prazo vêm da entrada (código), nunca da IA;
//  * frase acima do limite é descartada (o post sai sem frase, seção 5.4), com alerta;
//  * alerta de histórico curto e de fora do nicho principal são do código;
//  * pedidos: até 2 opções, dentro do preço máximo.
import type { CandidataCuradoria, EntradaCuradoria, SaidaCuradoria } from '../contratos/curadoria.ts';
import { alertaHistoricoCurto, type AlertaOferta } from './fila.ts';

export const MAX_OPCOES_PEDIDO = 2; // Fluxo B: até [2] opções [SUPOSIÇÃO a partir do mock]

export interface NovaOferta {
  produto_id: string;
  data: string;
  origem: 'rodada' | 'pedido';
  pedido_id: string | null;
  nota: number | null;
  nota_detalhe: Record<string, number> | null;
  motivos: string[];
  alertas: AlertaOferta[];
  fora_nicho_principal: boolean;
  preco_atual: number;
  preco_referencia: number | null;
  dias_historico: number;
  comissao_taxa: number | null;
  comissao_extra: boolean;
  prazo: string | null;
  frase: string | null;
  job_id: string | null;
}

export interface OpcaoPedido {
  pedido_id: string;
  produto_id: string;
  ordem: number;
  motivos: string[];
  preco_atual: number;
}

export interface ResultadoCuradoria {
  ofertas: NovaOferta[];
  opcoes: OpcaoPedido[];
  /** Pedidos atendidos (com ao menos uma opção) e os sem opção. */
  pedidosComOpcao: string[];
  pedidosSemOpcao: string[];
  /** O que o código recusou da saída da IA, para o registro do job. */
  descartes: string[];
}

export interface RegrasCuradoria {
  fraseMax: number;
  historicoCurtoDias: number;
  jobId?: string | null;
  /** Pedidos cujas opções também entram na fila (pedido da Lana ou "achado a pedido"). */
  pedidosNaFila?: ReadonlySet<string>;
}

type Escolha = SaidaCuradoria['ofertas'][number];

export function aplicarSaidaCuradoria(entrada: EntradaCuradoria, saida: SaidaCuradoria, regras: RegrasCuradoria): ResultadoCuradoria {
  const porId = new Map(entrada.candidatas.map((c) => [c.produto_id, c]));
  const descartes: string[] = [];
  const ofertas: NovaOferta[] = [];
  const usados = new Set<string>();

  for (const e of saida.ofertas) {
    if (ofertas.length >= entrada.tamanho_fila) {
      descartes.push(`fila cheia (${entrada.tamanho_fila}): ${e.produto_id}`);
      continue;
    }
    const c = porId.get(e.produto_id);
    if (!c) {
      descartes.push(`produto fora das candidatas: ${e.produto_id}`);
      continue;
    }
    if (usados.has(c.produto_id)) {
      descartes.push(`produto repetido: ${c.produto_id}`);
      continue;
    }
    usados.add(c.produto_id);
    ofertas.push(montarOferta(entrada.data, c, e, regras, 'rodada', null, descartes));
  }

  const pedidosAbertos = new Map(entrada.pedidos.map((p) => [p.id, p]));
  const opcoes: OpcaoPedido[] = [];
  const atendidos = new Set<string>();
  for (const p of saida.pedidos) {
    const pedido = pedidosAbertos.get(p.pedido_id);
    if (!pedido) {
      descartes.push(`pedido desconhecido: ${p.pedido_id}`);
      continue;
    }
    if (atendidos.has(pedido.id)) {
      descartes.push(`pedido repetido: ${pedido.id}`);
      continue;
    }
    let ordem = 0;
    const vistos = new Set<string>();
    for (const e of p.opcoes) {
      if (ordem >= MAX_OPCOES_PEDIDO) {
        descartes.push(`pedido ${pedido.id}: mais de ${MAX_OPCOES_PEDIDO} opções`);
        break;
      }
      const c = porId.get(e.produto_id);
      if (!c) {
        descartes.push(`pedido ${pedido.id}: produto fora das candidatas ${e.produto_id}`);
        continue;
      }
      if (vistos.has(c.produto_id)) continue;
      if (pedido.preco_max !== null && c.preco_atual > pedido.preco_max) {
        descartes.push(`pedido ${pedido.id}: ${c.produto_id} acima do preço máximo`);
        continue;
      }
      vistos.add(c.produto_id);
      ordem += 1;
      opcoes.push({ pedido_id: pedido.id, produto_id: c.produto_id, ordem, motivos: e.motivos, preco_atual: c.preco_atual });
      if (regras.pedidosNaFila?.has(pedido.id)) {
        ofertas.push(montarOferta(entrada.data, c, e, regras, 'pedido', pedido.id, descartes));
      }
    }
    if (ordem > 0) atendidos.add(pedido.id);
  }

  return {
    ofertas,
    opcoes,
    pedidosComOpcao: [...atendidos],
    pedidosSemOpcao: entrada.pedidos.map((p) => p.id).filter((id) => !atendidos.has(id)),
    descartes,
  };
}

function montarOferta(
  data: string,
  c: CandidataCuradoria,
  e: Escolha,
  regras: RegrasCuradoria,
  origem: 'rodada' | 'pedido',
  pedidoId: string | null,
  descartes: string[],
): NovaOferta {
  const alertas: AlertaOferta[] = [];
  const curto = c.historico_curto || c.dias_historico < regras.historicoCurtoDias;
  if (curto) alertas.push(alertaHistoricoCurto(c.dias_historico));
  // Alertas da coleta (código), sem repetir o de histórico curto.
  for (const a of c.alertas) if (a.tipo !== 'historico_curto') alertas.push({ tipo: a.tipo, texto: a.texto });
  for (const a of e.alertas) alertas.push({ tipo: 'promessa', texto: a.texto, ...(a.trecho ? { trecho: a.trecho } : {}) });

  let frase = e.frase === null ? null : e.frase.replace(/\s+/g, ' ').trim() || null;
  if (frase && [...frase].length > regras.fraseMax) {
    descartes.push(`frase acima de ${regras.fraseMax} caracteres: ${c.produto_id}`);
    alertas.push({ tipo: 'frase_longa', texto: `A frase da Redatora passou de ${regras.fraseMax} caracteres e foi tirada. Escreva uma ou peça outra versão.` });
    frase = null;
  }

  // "Fora do nicho principal" vem da flag (a tela mostra a linha neutra), não dos motivos.
  const motivos = [...e.motivos];

  return {
    produto_id: c.produto_id,
    data,
    origem,
    pedido_id: pedidoId,
    nota: c.nota,
    nota_detalhe: c.nota_detalhe,
    motivos,
    alertas,
    fora_nicho_principal: c.fora_nicho_principal,
    preco_atual: c.preco_atual,
    // Preço "de" só a mediana da plataforma e nunca com histórico curto (seção 5.2).
    preco_referencia: curto ? null : c.preco_referencia,
    dias_historico: c.dias_historico,
    comissao_taxa: c.comissao_taxa,
    comissao_extra: c.comissao_extra,
    prazo: c.prazo,
    frase,
    job_id: regras.jobId ?? null,
  };
}
