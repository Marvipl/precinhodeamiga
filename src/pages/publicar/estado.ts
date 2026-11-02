// Leitura da tela Publicar (F-08 tela): agrupa os envios por post e traduz estado em palavras.
// Só apresentação. Quem decide pausa, bloqueio e cadência é o código do servidor (Guardiã e Agendadora).
import { horaLocal } from '@core/formato.ts';

export type Canal = 'wa' | 'tg';
export type EstadoEnvio =
  | 'agendado'
  | 'pausado'
  | 'revisar_preco'
  | 'bloqueado'
  | 'publicado'
  | 'enviado'
  | 'nao_enviado'
  | 'cancelado';

export interface ItemGuardia {
  checagem: string;
  ok: boolean;
  mensagem?: string | null;
  quando?: string | null;
}

export interface PostResumo {
  id: string;
  tipo: string;
  titulo: string;
  preco_atual: number;
  produto_id: string | null;
}

export interface EnvioLinha {
  id: string;
  post_id: string;
  canal: Canal;
  texto: string;
  agendado_para: string;
  estado: EstadoEnvio;
  guardia: ItemGuardia[] | null;
  publicado_em: string | null;
  erro: string | null;
  posts: PostResumo | null;
}

export interface PostDoBloco {
  post: PostResumo;
  horario: string; // ISO do primeiro envio
  wa?: EnvioLinha;
  tg?: EnvioLinha;
}

export type Tom = 'ok' | 'warn' | 'std' | 'info';

export const FINAIS: readonly EstadoEnvio[] = ['publicado', 'enviado', 'nao_enviado', 'cancelado'];

export function agruparPorPost(envios: readonly EnvioLinha[]): PostDoBloco[] {
  const mapa = new Map<string, PostDoBloco>();
  for (const e of envios) {
    if (!e.posts) continue;
    let p = mapa.get(e.post_id);
    if (!p) {
      p = { post: e.posts, horario: e.agendado_para };
      mapa.set(e.post_id, p);
    }
    p[e.canal] = e;
    if (e.agendado_para < p.horario) p.horario = e.agendado_para;
  }
  return [...mapa.values()].sort((a, b) => a.horario.localeCompare(b.horario) || a.post.id.localeCompare(b.post.id));
}

function envios(p: PostDoBloco): EnvioLinha[] {
  return [p.tg, p.wa].filter((e): e is EnvioLinha => Boolean(e));
}

/** Post parado pela Guardiã na checagem de 5 minutos: Telegram pausado ou WhatsApp com "Revisar preço". */
export function precisaRevisar(p: PostDoBloco): boolean {
  return p.tg?.estado === 'pausado' || p.wa?.estado === 'revisar_preco';
}

export function cancelado(p: PostDoBloco): boolean {
  return envios(p).every((e) => e.estado === 'cancelado');
}

/** Envios que ainda podem ser cancelados (não saíram e não fecharam). */
export function enviosCancelaveis(p: PostDoBloco): EnvioLinha[] {
  return envios(p).filter((e) => !FINAIS.includes(e.estado));
}

export function seloGuardia(p: PostDoBloco): { texto: string; tom: Tom } {
  const es = envios(p);
  if (es.length > 0 && es.every((e) => e.estado === 'cancelado')) return { texto: 'Cancelado', tom: 'std' };
  if (precisaRevisar(p)) return { texto: 'Revisar preço', tom: 'warn' };
  const ativos = es.filter((e) => e.estado !== 'cancelado');
  if (ativos.length > 0 && ativos.every((e) => e.estado === 'bloqueado')) return { texto: 'Bloqueado pela Guardiã', tom: 'warn' };
  return { texto: 'Guardiã aprovou', tom: 'ok' };
}

function motivoBloqueio(e: EnvioLinha): string {
  const falha = (e.guardia ?? []).find((g) => !g.ok && g.mensagem);
  return falha?.mensagem ?? 'a Guardiã barrou este canal';
}

export function textoCanal(e: EnvioLinha): { texto: string; tom: 'auto' | 'manual' } {
  const hora = horaLocal(new Date(e.agendado_para));
  if (e.canal === 'tg') {
    switch (e.estado) {
      case 'agendado':
        return e.erro ? { texto: `Falhou ao publicar: ${e.erro}`, tom: 'manual' } : { texto: `Agendado. Sai sozinho às ${hora}`, tom: 'auto' };
      case 'pausado':
        return { texto: 'Pausado até você revisar', tom: 'manual' };
      case 'publicado':
        return { texto: `Publicado às ${horaLocal(new Date(e.publicado_em ?? e.agendado_para))}`, tom: 'auto' };
      case 'bloqueado':
        return { texto: `Não sai: ${motivoBloqueio(e)}`, tom: 'manual' };
      case 'cancelado':
        return { texto: 'Cancelado', tom: 'manual' };
      default:
        return { texto: 'Agendado', tom: 'auto' };
    }
  }
  switch (e.estado) {
    case 'agendado':
      return { texto: 'Você envia: copiar e colar', tom: 'manual' };
    case 'revisar_preco':
      return { texto: 'Revisar preço antes de enviar', tom: 'manual' };
    case 'enviado':
      return { texto: 'Enviado por você', tom: 'auto' };
    case 'nao_enviado':
      return { texto: 'Não enviado no fim do bloco', tom: 'manual' };
    case 'bloqueado':
      return { texto: `Não sai: ${motivoBloqueio(e)}`, tom: 'manual' };
    case 'cancelado':
      return { texto: 'Cancelado', tom: 'manual' };
    default:
      return { texto: 'Você envia: copiar e colar', tom: 'manual' };
  }
}

/** Texto que a Lana copia: o do WhatsApp (negrito com *texto*). Sem envio de WhatsApp, o do Telegram. */
export function textoParaCopiar(p: PostDoBloco): string {
  return (p.wa ?? p.tg)?.texto ?? '';
}

export function podeMarcarEnviado(p: PostDoBloco): boolean {
  return p.wa?.estado === 'agendado';
}

/** O post saiu (ou fechou) em todos os canais: o card fica esmaecido, como no mock. */
export function concluido(p: PostDoBloco): boolean {
  const es = envios(p);
  return es.length > 0 && es.every((e) => FINAIS.includes(e.estado) || e.estado === 'bloqueado');
}

export const AVISO_WHATSAPP =
  'Nada é enviado automaticamente no WhatsApp. As diretrizes do WhatsApp tratam mensagens automáticas em massa como violação e isso pode derrubar o número.';

const NOME_CANAL: Record<Canal, string> = { wa: 'WhatsApp', tg: 'Telegram' };

/** Cartão "Checagem da Guardiã": resume as checagens gravadas nos envios do bloco. */
export function resumoGuardia(posts: readonly PostDoBloco[], cadencia: number): { tom: Tom; texto: string }[] {
  const itens: { tom: Tom; texto: string }[] = [];
  const ativos = posts.filter((p) => !cancelado(p));
  if (ativos.length > 0) {
    const semAviso = ativos.filter((p) => envios(p).some((e) => e.estado !== 'cancelado' && !e.texto.includes('Link com comissão')));
    itens.push(
      semAviso.length === 0
        ? { tom: 'ok', texto: 'Aviso "link com comissão" em todos os posts' }
        : { tom: 'warn', texto: `Sem o aviso "link com comissão": ${semAviso.map((p) => horaLocal(new Date(p.horario))).join(', ')}. Esses posts não saem.` },
    );

    const vistos = new Set<string>();
    for (const p of ativos) {
      for (const e of envios(p)) {
        if (e.estado === 'cancelado') continue;
        for (const g of e.guardia ?? []) {
          if (g.ok || !g.mensagem) continue;
          const t = `Post das ${horaLocal(new Date(p.horario))} (${NOME_CANAL[e.canal]}): ${g.mensagem}`;
          if (vistos.has(t)) continue;
          vistos.add(t);
          itens.push({ tom: 'warn', texto: t });
        }
      }
    }
    const nenhumAlerta = vistos.size === 0;
    if (nenhumAlerta) itens.push({ tom: 'ok', texto: 'Nenhum alerta da Guardiã nos posts de hoje' });

    const conta = (c: Canal) =>
      ativos.filter((p) => {
        const e = p[c];
        return e && !['cancelado', 'bloqueado', 'nao_enviado'].includes(e.estado);
      }).length;
    itens.push({
      tom: 'ok',
      texto: `Cadência de hoje: ${conta('tg')} no Telegram e ${conta('wa')} no WhatsApp. Limite atual: ${cadencia} por dia por canal, que sobe pelas regras de cadência.`,
    });
  }
  itens.push({ tom: 'info', texto: AVISO_WHATSAPP });
  return itens;
}

/** "20h" ou "20h30" a partir de "HH:MM". */
export function horaCurta(hhmm: string): string {
  const [h, m] = hhmm.split(':');
  return `${Number(h)}h${m && m !== '00' ? m : ''}`;
}

export function tituloDoBloco(blocos: { noite: { inicio: string; ligado: boolean }; almoco: { inicio: string; ligado: boolean } }): string {
  if (blocos.almoco.ligado && blocos.noite.ligado) return `Blocos de hoje, ${horaCurta(blocos.almoco.inicio)} e ${horaCurta(blocos.noite.inicio)}`;
  if (blocos.almoco.ligado) return `Bloco do almoço, ${horaCurta(blocos.almoco.inicio)}`;
  return `Bloco da noite, ${horaCurta(blocos.noite.inicio)}`;
}
