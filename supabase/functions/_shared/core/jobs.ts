// Regras determinísticas do ciclo de um job (Anexo A.4). Código puro, sem I/O.
// O runtime (../jobs-runtime.ts) aplica estas decisões no banco.

import { ROTINAS, type IdRotina } from './agentes.ts';

export const LIMITE_PAYLOAD = 65_536; // caracteres do campo "text" do disparo
export const MAX_TENTATIVAS_5XX = 3;
export const ESPERA_BASE_5XX_MS = 60_000; // 1 min, 2 min, 4 min

export type EstadoJob = 'pendente' | 'disparado' | 'concluido' | 'erro' | 'expirado' | 'cancelado';

export interface JobBase {
  id: string;
  rotina: IdRotina;
  contrato: string;
  entrada: unknown;
  chave_unica: string;
  estado: EstadoJob;
  tentativas: number;
}

/** Pode disparar agora? Confere pausa geral, pausa da rotina e teto do dia. */
export function podeDisparar(p: {
  pausaGeral: boolean;
  rotinaPausada: boolean;
  usoHoje: number;
  tetoDiario: number | null | undefined;
  rotina: IdRotina;
}): { ok: true } | { ok: false; motivo: 'pausa_geral' | 'rotina_pausada' | 'teto_atingido' } {
  if (p.pausaGeral) return { ok: false, motivo: 'pausa_geral' };
  if (p.rotinaPausada) return { ok: false, motivo: 'rotina_pausada' };
  const teto = p.tetoDiario ?? ROTINAS[p.rotina].tetoDiario;
  if (p.usoHoje >= teto) return { ok: false, motivo: 'teto_atingido' };
  return { ok: true };
}

export interface PayloadDisparo {
  contrato: string;
  job_id: string;
  nonce: string;
  retorno: string;
  /** URL para buscar a entrada quando ela não cabe no disparo. */
  leitura?: string;
  entrada?: unknown;
}

/**
 * Monta o texto do disparo. Se passar de 65.536 caracteres, leva só job_id e nonce
 * e a rotina busca a entrada no endpoint de leitura (passo 7).
 */
export function montarPayload(p: {
  job: Pick<JobBase, 'id' | 'contrato' | 'entrada'>;
  nonce: string;
  urlRetorno: string;
  urlLeitura: string;
}): { texto: string; reduzido: boolean } {
  const completo: PayloadDisparo = {
    contrato: p.job.contrato,
    job_id: p.job.id,
    nonce: p.nonce,
    retorno: p.urlRetorno,
    entrada: p.job.entrada,
  };
  const texto = JSON.stringify(completo);
  if (texto.length <= LIMITE_PAYLOAD) return { texto, reduzido: false };
  const reduzido: PayloadDisparo = {
    contrato: p.job.contrato,
    job_id: p.job.id,
    nonce: p.nonce,
    retorno: p.urlRetorno,
    leitura: p.urlLeitura,
  };
  return { texto: JSON.stringify(reduzido), reduzido: true };
}

export type DecisaoResposta =
  | { estado: 'disparado' }
  | { estado: 'pendente'; esperarMs: number; motivo: string }
  | { estado: 'erro'; motivo: string };

/** O que fazer com a resposta HTTP do disparo (passo 3). */
export function decidirResposta(p: {
  status: number;
  retryAfter?: string | null;
  tentativas: number; // já contando esta
  agora?: Date;
}): DecisaoResposta {
  const { status } = p;
  if (status >= 200 && status < 300) return { estado: 'disparado' };
  if (status === 429) {
    return { estado: 'pendente', esperarMs: lerRetryAfter(p.retryAfter, p.agora) ?? 60_000, motivo: 'limite de uso (429)' };
  }
  if (status >= 500) {
    if (p.tentativas >= MAX_TENTATIVAS_5XX) return { estado: 'erro', motivo: `falha do serviço (${status}) após ${p.tentativas} tentativas` };
    return { estado: 'pendente', esperarMs: ESPERA_BASE_5XX_MS * 2 ** (p.tentativas - 1), motivo: `falha do serviço (${status})` };
  }
  const motivos: Record<number, string> = {
    400: 'pedido inválido (400)',
    401: 'token da rotina inválido (401)',
    403: 'sem permissão para a rotina (403)',
    404: 'rotina não encontrada (404)',
  };
  return { estado: 'erro', motivo: motivos[status] ?? `resposta inesperada (${status})` };
}

export function lerRetryAfter(valor: string | null | undefined, agora: Date = new Date()): number | null {
  if (!valor) return null;
  const s = Number(valor);
  if (Number.isFinite(s)) return Math.max(0, s * 1000);
  const t = Date.parse(valor);
  if (Number.isNaN(t)) return null;
  return Math.max(0, t - agora.getTime());
}

/** Job disparado há mais de `minutos` sem retorno expira (passo 6). */
export function expirou(disparadoEm: Date | string | null, agora: Date, minutos: number): boolean {
  if (!disparadoEm) return false;
  const t = typeof disparadoEm === 'string' ? Date.parse(disparadoEm) : disparadoEm.getTime();
  return agora.getTime() - t > minutos * 60_000;
}

/** Ao expirar: curadoria ganha nova tentativa automática; as outras esperam o Marcus. */
export function aoExpirar(rotina: IdRotina): 'pendente' | 'expirado' {
  return ROTINAS[rotina].retentaAoExpirar ? 'pendente' : 'expirado';
}

/** Retorno aceito? Vale o primeiro resultado válido de qualquer tentativa. */
export function aceitaRetorno(estadoAtual: EstadoJob): boolean {
  return estadoAtual === 'disparado' || estadoAtual === 'expirado' || estadoAtual === 'pendente';
}

// ---- nonce ----

/** Nonce aleatório (base64url, 32 bytes). Usa Web Crypto (navegador, Node 19+, Deno). */
export function gerarNonce(): string {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return base64url(b);
}

export async function hashNonce(nonce: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(nonce));
  return base64url(new Uint8Array(d));
}

function base64url(b: Uint8Array): string {
  let s = '';
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Comparação em tempo constante para tokens. */
export function iguaisSeguro(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
