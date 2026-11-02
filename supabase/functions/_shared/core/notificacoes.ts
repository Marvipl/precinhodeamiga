// Regras das notificações (F-15, seção 5.13 "Silêncio"). Código puro: navegador, Node e Deno.
//
// Silêncio: fora dos blocos de revisão, a Atendente só faz o celular tocar no nível 4.
// Lembretes de envio do WhatsApp e avisos da Guardiã seguem tocando (fazem parte do bloco de posts).
// Notificação da Atendente que não é urgente, criada fora de um bloco de revisão, espera o início do próximo bloco.
import { dataLocal, instanteLocal } from './formato.ts';

/** Tipos conhecidos. Outros pacotes podem criar novos; tipo desconhecido que não começa com "atendente_" sempre toca. */
export type TipoNotificacao =
  | 'lembrete_wa' // lembrete de cada envio do WhatsApp (P3)
  | 'guardia_pausa' // post pausado pela Guardiã (P3)
  | 'atendente_urgente' // nível 4 (P13)
  | 'atendente_rascunho' // rascunhos esperando a Lana (P13)
  | 'teste' // botão "Enviar notificação de teste"
  | (string & {});

/** Minutos, a partir do início de cada bloco de revisão, em que a Atendente pode tocar. [SUPOSIÇÃO P7-1] */
export const JANELA_REVISAO_MIN = 60;
/** Tentativas de envio antes de desistir (cada tentativa espera 2 minutos). [SUPOSIÇÃO P7-2] */
export const MAX_TENTATIVAS = 3;

export function eDaAtendente(tipo: string): boolean {
  return tipo.startsWith('atendente_');
}

/** Nível 4 e tudo que faz parte do bloco de posts tocam a qualquer hora. */
export function tocaSempre(tipo: string): boolean {
  return !eDaAtendente(tipo) || tipo === 'atendente_urgente';
}

function somarDias(data: string, dias: number): string {
  const [a, m, d] = data.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d + dias)).toISOString().slice(0, 10);
}

function horaValida(h: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(h);
}

/** Instantes de início dos blocos de revisão de ontem, hoje e amanhã (Brasília), em ordem. */
function iniciosAoRedor(agora: Date, blocos: readonly string[]): Date[] {
  const hoje = dataLocal(agora);
  const validos = blocos.filter(horaValida);
  const out: Date[] = [];
  for (const dia of [-1, 0, 1]) for (const h of validos) out.push(instanteLocal(somarDias(hoje, dia), h));
  return out.sort((x, y) => x.getTime() - y.getTime());
}

export function dentroDeRevisao(agora: Date, blocos: readonly string[], janelaMin = JANELA_REVISAO_MIN): boolean {
  const t = agora.getTime();
  return iniciosAoRedor(agora, blocos).some((i) => t >= i.getTime() && t < i.getTime() + janelaMin * 60_000);
}

/** Início do próximo bloco de revisão depois de `agora`. `null` se não há bloco configurado. */
export function proximoInicioRevisao(agora: Date, blocos: readonly string[]): Date | null {
  return iniciosAoRedor(agora, blocos).find((i) => i.getTime() > agora.getTime()) ?? null;
}

export type Decisao = { acao: 'enviar' } | { acao: 'adiar'; ate: Date };

export function decidirEnvio(tipo: string, agora: Date, blocosRevisao: readonly string[]): Decisao {
  if (tocaSempre(tipo)) return { acao: 'enviar' };
  if (dentroDeRevisao(agora, blocosRevisao)) return { acao: 'enviar' };
  const ate = proximoInicioRevisao(agora, blocosRevisao);
  return ate ? { acao: 'adiar', ate } : { acao: 'enviar' };
}

export interface Membro {
  user_id: string;
  papel: 'operadora' | 'dono';
}

/** `user_id` nulo = para todos os membros. Usuário que não é membro não recebe nada. */
export function destinatarios(userId: string | null, membros: readonly Membro[]): Membro[] {
  return userId === null ? [...membros] : membros.filter((m) => m.user_id === userId);
}

export interface NotificacaoBasica {
  id: string;
  tipo: string;
  titulo: string;
  corpo: string | null;
  link: string | null;
}

export interface PayloadPush {
  id: string;
  titulo: string;
  corpo: string;
  link: string;
  tag: string;
  urgente: boolean;
}

/** Só caminhos internos do painel ("/publicar") ou URLs https. Qualquer outra coisa vira "/". */
export function linkSeguro(link: string | null): string {
  if (!link) return '/';
  if (link.startsWith('/') && !link.startsWith('//')) return link;
  return /^https:\/\/[^\s]+$/.test(link) ? link : '/';
}

export function payloadPush(n: NotificacaoBasica): PayloadPush {
  return {
    id: n.id,
    titulo: n.titulo,
    corpo: n.corpo ?? '',
    link: linkSeguro(n.link),
    tag: n.tipo === 'lembrete_wa' ? `lembrete_wa:${n.id}` : n.tipo,
    urgente: n.tipo === 'atendente_urgente' || n.tipo === 'guardia_pausa',
  };
}

/** Prioridade para o serviço de push (RFC 8030). */
export function urgenciaPush(tipo: string): 'high' | 'normal' {
  return tocaSempre(tipo) ? 'high' : 'normal';
}

function escaparHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Texto da alternativa pelo bot do Telegram (parse_mode HTML). O link do painel fica absoluto quando há URL do site. */
export function textoTelegram(n: NotificacaoBasica, urlSite?: string): string {
  const partes = [`<b>${escaparHtml(n.titulo)}</b>`];
  if (n.corpo) partes.push(escaparHtml(n.corpo));
  const link = linkSeguro(n.link);
  const absoluto = link.startsWith('/') ? (urlSite ? urlSite.replace(/\/+$/, '') + link : null) : link;
  if (absoluto) partes.push(escaparHtml(absoluto));
  return partes.join('\n\n');
}
