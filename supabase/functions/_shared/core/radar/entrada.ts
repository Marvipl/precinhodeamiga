// Página de entrada com link por origem (F-20) e mensagens do Radar (5.11; 5.1 item 4).
// Código puro: roda no navegador, no Node (testes) e no Deno (Edge Functions).

import { normalizar } from './lugares.ts';

/** Origens que não são lugares do Radar. "direto" = sem origem ou origem desconhecida (seção 4.3). */
export const ORIGENS_FIXAS = ['direto', 'status', 'convite'] as const;
export const ORIGEM_DIRETO = 'direto';

export type Botao = 'pagina' | 'wa' | 'tg';
export const BOTOES: readonly Botao[] = ['pagina', 'wa', 'tg'];

const RE_ORIGEM = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;

export function origemValida(o: string): boolean {
  return RE_ORIGEM.test(o);
}

/** Origem a contar: a informada, se for conhecida; senão "direto". */
export function resolverOrigem(o: string | null | undefined, conhecida: (o: string) => boolean): string {
  const v = (o ?? '').trim().toLowerCase();
  if (!v || !origemValida(v)) return ORIGEM_DIRETO;
  if ((ORIGENS_FIXAS as readonly string[]).includes(v)) return v;
  return conhecida(v) ? v : ORIGEM_DIRETO;
}

/** Origem única (`o=<slug>`) para um lugar aprovado (5.11, item 9). */
export function gerarOrigem(nome: string, existentes: ReadonlySet<string>): string {
  let base = normalizar(nome).slice(0, 36).replace(/-+$/g, '');
  if (!base) base = 'lugar';
  const ocupada = (s: string) => existentes.has(s) || (ORIGENS_FIXAS as readonly string[]).includes(s);
  if (!ocupada(base)) return base;
  for (let i = 2; ; i++) {
    const s = `${base}-${i}`;
    if (!ocupada(s)) return s;
  }
}

/** Link de entrada de uma origem. Ex.: https://exemplo.invalid/entrar?o=lugar-de-teste */
export function linkEntrada(base: string, origem: string): string {
  const b = base.replace(/\/+$/, '');
  return origem === ORIGEM_DIRETO ? `${b}/entrar` : `${b}/entrar?o=${encodeURIComponent(origem)}`;
}

export function lerBotao(b: string | null | undefined): Botao | null {
  return (BOTOES as readonly string[]).includes(b ?? '') ? (b as Botao) : null;
}

/** Primeiro IP do cabeçalho do proxy. Usado só dentro do resumo; nunca é gravado. */
export function ipDoPedido(h: { get(nome: string): string | null }): string {
  const xff = h.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return h.get('cf-connecting-ip') ?? h.get('x-real-ip') ?? '';
}

/**
 * Resumo irreversível do acesso (seção 7.1): SHA-256 de sal diário + IP + navegador + origem + botão.
 * Serve só para não contar duas vezes o mesmo clique no mesmo dia; é apagado em 24 horas com o sal.
 */
export async function resumoAcesso(p: { sal: string; ip: string; agente: string; origem: string; botao: Botao }): Promise<string> {
  const dados = new TextEncoder().encode([p.sal, p.ip, p.agente, p.origem, p.botao].join('\u0000'));
  const h = await crypto.subtle.digest('SHA-256', dados);
  return Array.from(new Uint8Array(h), (b) => b.toString(16).padStart(2, '0')).join('');
}

// ---------------------------------------------------------------------------
// Mensagens do Radar: só o link de entrada sai daqui (5.1, item 4; 5.11, item 1).
// ---------------------------------------------------------------------------

/** Onde o código coloca o link de entrada do lugar dentro do convite. */
export const MARCA_LINK = '{link}';
/** Onde entra o total de seguidores, que só vem da Audiência; até lá a Lana completa. */
export const MARCA_SEGUIDORES = '{seguidores}';

const RE_LINK = /(https?:\/\/|www\.)\S+|\b[a-z0-9-]+(\.[a-z0-9-]+)*\.(com|br|ee|me|ly|gl|link|app|io|net|org|co)(\/\S*)?\b/i;

/** Texto escrito pela IA não pode trazer link nenhum: o único link é o de entrada, posto pelo código. */
export function contemLink(texto: string): boolean {
  return RE_LINK.test(texto);
}

/** Convite pronto para copiar: troca a marca pelo link de entrada do lugar (ou acrescenta no fim). */
export function montarConvite(texto: string, link: string): string {
  return texto.includes(MARCA_LINK) ? texto.split(MARCA_LINK).join(link) : `${texto.trim()} ${link}`;
}

/** Troca a marca de seguidores pelo número real ou por um lugar para a Lana completar. */
export function completarSeguidores(texto: string, seguidores: number | null): string {
  return texto.split(MARCA_SEGUIDORES).join(seguidores == null ? '[número de seguidores]' : String(seguidores));
}
