// Guardiã: checagens determinísticas do post (seções 5.2, 5.3 e 5.4). Código puro.
// A revisão de promessas no texto é feita pela IA dentro das rotinas (alertas na fila), não aqui.

import { checarLinkAfiliado, type SubIds } from './links.ts';
import { temAvisoComissao, type CanalPost } from './formato.ts';
import { contaNaCadencia } from './agenda.ts';

export type Momento = 'montagem' | 'agendamento' | 'envio';
/** O que a falha provoca: bloqueia o canal, ajusta o post (tira o de/por), só alerta, ou pausa. */
export type Efeito = 'bloqueia' | 'ajusta' | 'alerta' | 'pausa';

export interface Checagem {
  checagem: string;
  ok: boolean;
  mensagem: string;
  quando: Momento;
  efeito?: Efeito;
  em?: string; // instante ISO
}

function ch(checagem: string, ok: boolean, mensagem: string, quando: Momento, efeito: Efeito, em?: Date): Checagem {
  return { checagem, ok, mensagem, quando, ...(ok ? {} : { efeito }), ...(em ? { em: em.toISOString() } : {}) };
}

export function bloqueia(cs: Checagem[]): boolean {
  return cs.some((c) => !c.ok && c.efeito === 'bloqueia');
}

// ---------------------------------------------------------------------------
// De/por (na montagem)
// ---------------------------------------------------------------------------

export interface EntradaDePor {
  precoAtual: number;
  /** Mediana calculada pela plataforma na janela (null = sem histórico). */
  mediana: number | null;
  /** Dias de observação do produto. */
  diasHistorico: number;
  /** Maior preço observado na janela (para o "de" manual do F-16). */
  maximoJanela?: number | null;
  /** "De" digitado pela Lana no post manual (F-16). */
  deManual?: number | null;
  /** "De" proposto por quem chamou, quando não é manual (deve ser a mediana). */
  deProposto?: number | null;
}

export interface RegrasDePor {
  descontoRealMinimo: number; // 0.10
  historicoCurtoDias: number; // 7
}

/**
 * Decide se o post leva "De R$ X por R$ Y" e qual X (seções 5.2, 5.3, 5.4).
 * - Histórico curto: sem de/por, com alerta.
 * - Rodada/pedido: só a mediana calculada, e só com desconto real confirmado.
 * - Manual: o "de" digitado só aparece com histórico e sem passar do maior preço observado na janela.
 */
export function resolverDePor(e: EntradaDePor, r: RegrasDePor, quando: Date = new Date()): { precoReferencia: number | null; checagens: Checagem[] } {
  const cs: Checagem[] = [];
  if (e.diasHistorico < r.historicoCurtoDias) {
    cs.push(ch('historico_curto', false, `Histórico de preço curto: observado há ${e.diasHistorico} dias. O post sai sem "de/por", só com o preço atual.`, 'montagem', 'ajusta', quando));
    return { precoReferencia: null, checagens: cs };
  }
  if (e.deManual != null) {
    if (e.mediana == null || e.maximoJanela == null) {
      cs.push(ch('de_manual', false, 'Preço "de" digitado sem histórico observado: o post sai só com o preço atual.', 'montagem', 'ajusta', quando));
      return { precoReferencia: null, checagens: cs };
    }
    if (e.deManual > e.maximoJanela) {
      cs.push(ch('de_manual', false, 'Preço "de" digitado acima do maior preço observado: o post sai só com o preço atual.', 'montagem', 'ajusta', quando));
      return { precoReferencia: null, checagens: cs };
    }
    if (e.deManual <= e.precoAtual) {
      cs.push(ch('de_manual', false, 'Preço "de" não é maior que o preço atual: o post sai só com o preço atual.', 'montagem', 'ajusta', quando));
      return { precoReferencia: null, checagens: cs };
    }
    cs.push(ch('de_manual', true, 'Preço "de" dentro do histórico observado.', 'montagem', 'ajusta', quando));
    return { precoReferencia: e.deManual, checagens: cs };
  }
  if (e.mediana == null) {
    cs.push(ch('de_por', false, 'Sem preço de referência calculado: o post sai só com o preço atual.', 'montagem', 'ajusta', quando));
    return { precoReferencia: null, checagens: cs };
  }
  if (e.deProposto != null && Math.abs(e.deProposto - e.mediana) > 0.005) {
    cs.push(ch('de_por', false, 'O preço "de" não é a mediana calculada: o post sai só com o preço atual.', 'montagem', 'ajusta', quando));
    return { precoReferencia: null, checagens: cs };
  }
  const limite = e.mediana * (1 - r.descontoRealMinimo);
  if (e.precoAtual > limite + 1e-9) {
    cs.push(ch('de_por', false, 'Sem desconto real confirmado sobre a mediana: o post sai só com o preço atual.', 'montagem', 'ajusta', quando));
    return { precoReferencia: null, checagens: cs };
  }
  cs.push(ch('de_por', true, 'Preço "de" é a mediana observada, com desconto real.', 'montagem', 'ajusta', quando));
  return { precoReferencia: Math.round(e.mediana * 100) / 100, checagens: cs };
}

// ---------------------------------------------------------------------------
// Montagem
// ---------------------------------------------------------------------------

export function checarMontagem(p: { texto: string; link: string | null; canal: CanalPost; subIds: SubIds | null }, quando: Date = new Date()): Checagem[] {
  const aviso = temAvisoComissao(p.texto);
  const link = checarLinkAfiliado(p.link, p.canal, p.subIds);
  const linkNoTexto = !!p.link && p.texto.includes(p.link.trim().replace(/&/g, p.canal === 'tg' ? '&amp;' : '&'));
  return [
    ch('aviso_comissao', aviso, aviso ? 'Aviso "Link com comissão" presente.' : 'Falta o aviso "Link com comissão".', 'montagem', 'bloqueia', quando),
    ch('link_afiliado', link.ok && linkNoTexto, link.ok && !linkNoTexto ? 'O link de afiliado não está no texto.' : link.mensagem, 'montagem', 'bloqueia', quando),
  ];
}

// ---------------------------------------------------------------------------
// Agendamento
// ---------------------------------------------------------------------------

export interface EnvioExistente {
  chave_produto: string;
  canal: CanalPost;
  agendado_para: string | Date;
  estado: string;
}

const H = 3_600_000;

/** Mesmo produto (mesmo item da Shopee) no mesmo canal nas últimas N horas (48). */
export function checarRepeticao(p: { chave: string; canal: CanalPost; horario: Date; existentes: EnvioExistente[]; horas: number }, quando: Date = new Date()): Checagem {
  const conflito = p.existentes.find(
    (e) =>
      e.canal === p.canal &&
      e.chave_produto === p.chave &&
      contaNaCadencia(e.estado) &&
      Math.abs(new Date(e.agendado_para).getTime() - p.horario.getTime()) < p.horas * H,
  );
  return conflito
    ? ch('repeticao', false, `O mesmo produto já está neste canal nas últimas ${p.horas} horas.`, 'agendamento', 'bloqueia', quando)
    : ch('repeticao', true, `Produto não repetido no canal em ${p.horas} horas.`, 'agendamento', 'bloqueia', quando);
}

export function checarCadencia(p: { ocupados: number; cadencia: number }, quando: Date = new Date()): Checagem {
  const ok = p.ocupados < p.cadencia;
  return ch('cadencia', ok, ok ? `Cadência do dia: ${p.ocupados + 1} de ${p.cadencia}.` : `Cadência do dia atingida no canal (${p.cadencia}).`, 'agendamento', 'bloqueia', quando);
}

// ---------------------------------------------------------------------------
// Antes do envio (5 minutos antes)
// ---------------------------------------------------------------------------

export function checarAntesDoEnvio(
  p: { canal: CanalPost; precoPost: number; precoAgora: number | null; emEstoque: boolean | null; prazo: string | Date | null; horarioEnvio: Date },
  quando: Date = new Date(),
): { checagem: Checagem; novoEstado: 'agendado' | 'pausado' | 'revisar_preco' } {
  const problemas: string[] = [];
  if (p.precoAgora != null && p.precoAgora > p.precoPost + 0.004) problemas.push('o preço atual está acima do preço do post');
  if (p.emEstoque === false) problemas.push('o produto está sem estoque');
  if (p.prazo && new Date(p.prazo).getTime() < p.horarioEnvio.getTime()) problemas.push('a oferta já terá acabado no horário do envio');
  if (problemas.length === 0) {
    return { checagem: ch('preco_antes_envio', true, 'Preço e oferta conferidos antes do envio.', 'envio', 'pausa', quando), novoEstado: 'agendado' };
  }
  const msg = problemas.join('; ');
  if (p.canal === 'tg') {
    return { checagem: ch('preco_antes_envio', false, `Pausado até você revisar: ${msg}.`, 'envio', 'pausa', quando), novoEstado: 'pausado' };
  }
  return { checagem: ch('preco_antes_envio', false, `Revisar preço: ${msg}.`, 'envio', 'pausa', quando), novoEstado: 'revisar_preco' };
}

/** Pode ser publicado pelo bot agora? (seção 5.1, item 1: aprovação + Guardiã). */
export function liberadoParaTelegram(p: { canal: string; estado: string; aprovadoPor: string | null; texto: string; link: string | null; subIds: SubIds | null; checadoAntes: boolean }): { ok: boolean; motivo?: string } {
  if (p.canal !== 'tg') return { ok: false, motivo: 'só o canal do Telegram é publicado pelo bot' };
  if (!p.aprovadoPor) return { ok: false, motivo: 'post sem aprovação da Lana' };
  if (p.estado !== 'agendado') return { ok: false, motivo: `estado ${p.estado}` };
  if (!p.checadoAntes) return { ok: false, motivo: 'sem a checagem antes do envio' };
  const m = checarMontagem({ texto: p.texto, link: p.link, canal: 'tg', subIds: p.subIds });
  if (bloqueia(m)) return { ok: false, motivo: m.filter((c) => !c.ok).map((c) => c.mensagem).join(' ') };
  return { ok: true };
}
