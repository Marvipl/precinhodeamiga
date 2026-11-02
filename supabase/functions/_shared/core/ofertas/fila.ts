// Regras da fila "Ofertas para aprovar" (F-03, F-04, F-05). Código puro: navegador, Node e Deno.
import type { Papel } from '../config.ts';

export type EstadoOferta = 'pendente' | 'aprovada' | 'pulada' | 'expirada' | 'aguardando_redacao';
export type Canal = 'wa' | 'tg';
export const CANAIS: readonly Canal[] = ['wa', 'tg'];

export interface AlertaOferta {
  tipo: string; // historico_curto, promessa, fora_nicho, frase_longa, ...
  texto: string;
  trecho?: string;
}

/** Oferta como a tela recebe (linha de `ofertas` com o produto e o nicho). */
export interface OfertaFila {
  id: string;
  data: string;
  origem: 'rodada' | 'pedido' | 'manual';
  pedido_id: string | null;
  nota: number | null;
  motivos: string[];
  alertas: AlertaOferta[];
  fora_nicho_principal: boolean;
  preco_atual: number;
  preco_referencia: number | null;
  dias_historico: number;
  comissao_taxa: number | null;
  comissao_extra: boolean;
  cupom: string | null;
  prazo: string | null;
  frase: string | null;
  frase_versao: number;
  frase_editada: boolean;
  estado: EstadoOferta;
  produto: {
    nome: string;
    imagem_url: string | null;
    url_produto: string;
    nicho_id: string | null;
    nicho_nome: string | null;
  };
}

// ---------------------------------------------------------------------------
// Permissão: só a operadora decide ofertas (suposição S2). O dono vê, mas não aprova.
// ---------------------------------------------------------------------------
export function podeDecidir(papel: Papel | null | undefined): boolean {
  return papel === 'operadora';
}

/** Oferta expirada: marcada assim ou com prazo já vencido. */
export function estaExpirada(o: Pick<OfertaFila, 'estado' | 'prazo'>, agora: Date = new Date()): boolean {
  if (o.estado === 'expirada') return true;
  if (!o.prazo) return false;
  const t = Date.parse(o.prazo);
  return Number.isFinite(t) && t <= agora.getTime();
}

/** Na fila = ainda precisa de decisão da Lana (inclui as que esperam nova frase). */
export function naFila(o: Pick<OfertaFila, 'estado'>): boolean {
  return o.estado === 'pendente' || o.estado === 'aguardando_redacao';
}

// ---------------------------------------------------------------------------
// Comissão estimada (seção 5.2): preço atual × taxa, sempre rotulada "cerca de".
// ---------------------------------------------------------------------------
export function comissaoEstimada(precoAtual: number, taxa: number | null | undefined): number | null {
  if (taxa === null || taxa === undefined || !Number.isFinite(taxa) || taxa <= 0) return null;
  return Math.round(precoAtual * taxa * 100) / 100;
}

// ---------------------------------------------------------------------------
// Filtros (F-03): busca por texto, nicho e "Só Comissão Extra".
// ---------------------------------------------------------------------------
export interface Filtros {
  busca: string;
  nichoId: string | null; // null = todos
  soExtra: boolean;
}

export const FILTROS_INICIAIS: Filtros = { busca: '', nichoId: null, soExtra: false };

export function normalizar(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

export function filtrarOfertas<T extends OfertaFila>(ofertas: readonly T[], f: Filtros): T[] {
  const termos = normalizar(f.busca).split(/\s+/).filter(Boolean);
  return ofertas.filter((o) => {
    if (f.soExtra && !o.comissao_extra) return false;
    if (f.nichoId && o.produto.nicho_id !== f.nichoId) return false;
    if (termos.length) {
      const alvo = normalizar([o.produto.nome, o.produto.nicho_nome ?? '', ...o.motivos].join(' '));
      if (!termos.every((t) => alvo.includes(t))) return false;
    }
    return true;
  });
}

/** Ordem da fila: pedidos primeiro, depois maior nota. */
export function ordenarFila<T extends OfertaFila>(ofertas: readonly T[]): T[] {
  return [...ofertas].sort(
    (a, b) =>
      Number(b.origem === 'pedido') - Number(a.origem === 'pedido') ||
      (b.nota ?? -1) - (a.nota ?? -1) ||
      a.produto.nome.localeCompare(b.produto.nome, 'pt-BR'),
  );
}

// ---------------------------------------------------------------------------
// Estado da tela (seção 4.2): carregando; vazio; tudo revisado; com ofertas.
// ---------------------------------------------------------------------------
export type EstadoTela = 'carregando' | 'vazio' | 'tudo_revisado' | 'com_ofertas';

export function estadoDaTela(p: { carregando: boolean; total: number; naFila: number }): EstadoTela {
  if (p.carregando) return 'carregando';
  if (p.total === 0) return 'vazio';
  if (p.naFila === 0) return 'tudo_revisado';
  return 'com_ofertas';
}

export function contarAprovadas(ofertas: readonly Pick<OfertaFila, 'estado'>[]): number {
  return ofertas.filter((o) => o.estado === 'aprovada').length;
}

export function rotuloAprovadas(n: number): string {
  return n === 1 ? '1 aprovada hoje' : `${n} aprovadas hoje`;
}

// ---------------------------------------------------------------------------
// Validações das ações (F-04)
// ---------------------------------------------------------------------------
export type Validacao<T> = { ok: true; valor: T } | { ok: false; erro: string };

/** Frase editada à mão: tira espaços, vazia vira null (o post sai sem frase), limite em caracteres. */
export function validarFrase(frase: string | null | undefined, max: number): Validacao<string | null> {
  const f = (frase ?? '').replace(/\s+/g, ' ').trim();
  if (!f) return { ok: true, valor: null };
  if ([...f].length > max) return { ok: false, erro: `A frase pode ter até ${max} caracteres.` };
  return { ok: true, valor: f };
}

export function validarCanais(canais: unknown): Validacao<Canal[]> {
  if (!Array.isArray(canais)) return { ok: false, erro: 'Escolha pelo menos um canal.' };
  const unicos = [...new Set(canais)];
  if (unicos.some((c) => !CANAIS.includes(c as Canal))) return { ok: false, erro: 'Canal desconhecido.' };
  if (unicos.length === 0) return { ok: false, erro: 'Escolha pelo menos um canal.' };
  return { ok: true, valor: CANAIS.filter((c) => unicos.includes(c)) };
}

export const PULO_MOTIVO_MAX = 200;

export function validarMotivoPulo(motivo: string | null | undefined): Validacao<string | null> {
  const m = (motivo ?? '').replace(/\s+/g, ' ').trim();
  if (!m) return { ok: true, valor: null };
  if (m.length > PULO_MOTIVO_MAX) return { ok: false, erro: `O motivo pode ter até ${PULO_MOTIVO_MAX} caracteres.` };
  return { ok: true, valor: m };
}

/** Motivos rápidos para o pulo (o motivo é opcional; texto livre também vale). */
export const MOTIVOS_PULO = ['Não indicaria para uma amiga', 'Preço não convence', 'Já postei algo parecido', 'Fora do nicho'] as const;

// ---------------------------------------------------------------------------
// Pedido de produto (F-05): "procure [produto] até R$ [valor]".
// ---------------------------------------------------------------------------
export interface PedidoInterpretado {
  texto: string;
  preco_max: number | null;
}

export const PEDIDO_TEXTO_MAX = 200;

/** Lê "organizador de geladeira até R$ 50" ou "procure fone até 89,90". O valor é opcional. */
export function interpretarPedido(entrada: string): Validacao<PedidoInterpretado> {
  let s = entrada.replace(/\s+/g, ' ').trim();
  s = s.replace(/^(procure|procura|procurar|busque|busca|buscar|ache|achar)\s+/i, '');
  let preco: number | null = null;
  const m = s.match(/\s*(?:at[eé]|por no m[aá]ximo|no m[aá]ximo|max\.?|<=?)\s*(?:r\$\s*)?(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)\s*(?:reais)?\s*$/i);
  if (m && m.index !== undefined) {
    preco = lerValor(m[1]);
    s = s.slice(0, m.index).trim();
  }
  if (!s) return { ok: false, erro: 'Diga o que procurar. Ex.: organizador de geladeira até R$ 50.' };
  if (s.length > PEDIDO_TEXTO_MAX) return { ok: false, erro: `O pedido pode ter até ${PEDIDO_TEXTO_MAX} caracteres.` };
  if (preco !== null && !(preco > 0)) return { ok: false, erro: 'O valor máximo precisa ser maior que zero.' };
  return { ok: true, valor: { texto: s, preco_max: preco } };
}

/** "1.234,56" / "89,90" / "89.90" / "50" -> número. */
export function lerValor(v: string): number | null {
  let s = v.trim();
  if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  else s = s.replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// ---------------------------------------------------------------------------
// Alertas (seção 5.2 e 5.3)
// ---------------------------------------------------------------------------
export function alertaHistoricoCurto(dias: number): AlertaOferta {
  const n = dias === 1 ? '1 dia' : `${dias} dias`;
  return { tipo: 'historico_curto', texto: `Histórico de preço curto: observado há ${n}. Confira o preço antes de aprovar.` };
}

export function textoForaDoNicho(nicho: string | null): string {
  return nicho ? `Fora do nicho principal. Útil para testar ${nicho} na matriz de nicho.` : 'Fora do nicho principal.';
}
