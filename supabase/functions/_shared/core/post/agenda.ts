// Agendadora: distribuição dos posts no bloco e cadência (seção 5.6). Código puro.

import { instanteLocal } from '../formato.ts';

export type NomeBloco = 'almoco' | 'noite';

export interface Bloco {
  nome: NomeBloco;
  inicio: string; // HH:MM
  fim: string; // HH:MM
  /** Até onde o início pode recuar quando os posts não cabem (só o bloco de pico). */
  inicioLimite: string;
}

export interface RegrasAgenda {
  intervaloMaxMin: number; // 40
  intervaloMinMin: number; // 20
  checagemAntesEnvioMin: number; // 5
}

export function minutos(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

export function hhmm(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Horários de n posts num bloco (seção 5.6).
 * Intervalo = o menor entre 40 min e (duração ÷ n), nunca abaixo de 20 min. O primeiro post sai no início.
 * Se n posts a 20 min não cabem, o início recua até `inicioLimite` (18h no bloco de pico).
 * Devolve só os horários que cabem (pode ser menos que n).
 */
export function distribuirHorarios(p: { inicio: string; fim: string; n: number; inicioLimite?: string } & Pick<RegrasAgenda, 'intervaloMaxMin' | 'intervaloMinMin'>): string[] {
  if (p.n <= 0) return [];
  const ini = minutos(p.inicio);
  const fim = minutos(p.fim);
  const limite = Math.min(ini, minutos(p.inicioLimite ?? p.inicio));
  const dur = fim - ini;
  if (dur <= 0) return [];
  let intervalo = Math.min(p.intervaloMaxMin, Math.floor(dur / p.n));
  let comeco = ini;
  if (intervalo < p.intervaloMinMin) {
    intervalo = p.intervaloMinMin;
    comeco = Math.max(limite, fim - p.n * intervalo);
  }
  const out: string[] = [];
  for (let i = 0; i < p.n; i++) {
    const t = comeco + i * intervalo;
    if (t >= fim) break;
    out.push(hhmm(t));
  }
  return out;
}

/** Blocos ligados do dia, em ordem. */
export function blocosLigados(cfg: {
  blocoAlmoco: { inicio: string; fim: string; ligado: boolean };
  blocoNoite: { inicio: string; fim: string; ligado: boolean };
  inicioLimitePico: string;
}): Bloco[] {
  const out: Bloco[] = [];
  if (cfg.blocoAlmoco.ligado) out.push({ nome: 'almoco', inicio: cfg.blocoAlmoco.inicio, fim: cfg.blocoAlmoco.fim, inicioLimite: cfg.blocoAlmoco.inicio });
  if (cfg.blocoNoite.ligado) {
    const lim = minutos(cfg.inicioLimitePico) < minutos(cfg.blocoNoite.inicio) ? cfg.inicioLimitePico : cfg.blocoNoite.inicio;
    out.push({ nome: 'noite', inicio: cfg.blocoNoite.inicio, fim: cfg.blocoNoite.fim, inicioLimite: lim });
  }
  return out;
}

export function fimDoBloco(data: string, bloco: Pick<Bloco, 'fim'>): Date {
  return instanteLocal(data, bloco.fim);
}

const MIN = 60_000;

function arredondarParaCima(d: Date): Date {
  return new Date(Math.ceil(d.getTime() / MIN) * MIN);
}

/**
 * Horários para os posts que ainda podem mudar de lugar num bloco de um dia.
 * - `fixos`: horários de envios que não se movem (já publicados, enviados, checados ou perto demais do envio).
 * - `moveis`: quantos posts precisam de horário (os já agendados que podem mudar + o novo).
 * Sem fixos e com o bloco ainda por começar, redistribui tudo pela regra. Com o bloco andando,
 * distribui os móveis entre o último fixo (+ intervalo mínimo) e o fim do bloco.
 * Devolve null se não couber.
 */
export function planejarBloco(p: { data: string; bloco: Bloco; fixos: Date[]; moveis: number; agora: Date; regras: RegrasAgenda }): Date[] | null {
  if (p.moveis <= 0) return [];
  const minimo = arredondarParaCima(new Date(p.agora.getTime() + p.regras.checagemAntesEnvioMin * MIN + MIN));
  const fim = instanteLocal(p.data, p.bloco.fim);
  if (p.fixos.length === 0) {
    const hs = distribuirHorarios({ inicio: p.bloco.inicio, fim: p.bloco.fim, n: p.moveis, inicioLimite: p.bloco.inicioLimite, ...p.regras });
    if (hs.length === p.moveis) {
      const ts = hs.map((h) => instanteLocal(p.data, h));
      if (ts[0].getTime() >= minimo.getTime()) return ts;
    }
  }
  const ultimoFixo = p.fixos.reduce((m, d) => Math.max(m, d.getTime()), 0);
  const inicioLivre = new Date(Math.max(minimo.getTime(), ultimoFixo ? ultimoFixo + p.regras.intervaloMinMin * MIN : 0, instanteLocal(p.data, p.bloco.inicio).getTime()));
  const janelaMin = Math.floor((fim.getTime() - inicioLivre.getTime()) / MIN);
  if (janelaMin <= 0) return null;
  const intervalo = Math.min(p.regras.intervaloMaxMin, Math.floor(janelaMin / p.moveis));
  if (intervalo < p.regras.intervaloMinMin && p.moveis > 1) return null;
  const out: Date[] = [];
  for (let i = 0; i < p.moveis; i++) out.push(new Date(inicioLivre.getTime() + i * Math.max(intervalo, p.regras.intervaloMinMin) * MIN));
  if (out[out.length - 1].getTime() >= fim.getTime()) return null;
  return out;
}

/** Estados que ocupam vaga na cadência do dia (seção 5.6: "não enviado" não conta). */
export const ESTADOS_NA_CADENCIA = ['agendado', 'pausado', 'revisar_preco', 'publicado', 'enviado'] as const;

export function contaNaCadencia(estado: string): boolean {
  return (ESTADOS_NA_CADENCIA as readonly string[]).includes(estado);
}

/** Cadência vigente por canal. Na V1 fica fixa no valor inicial (6) até existirem dados de audiência. */
export function cadenciaDoCanal(cfg: { cadenciaInicial: number }): number {
  return cfg.cadenciaInicial;
}
