// Quando a Lana pode divulgar o link de entrada em cada lugar aprovado (seção 5.11, itens 2, 3 e 8).
// Código puro com datas AAAA-MM-DD no fuso de Brasília.

import { dataLocal, diaDaSemana, somarDias } from '../formato.ts';

export const JANELA_LEITURA_HORAS = 48;

export interface AgendaLugar {
  dias_permitidos: number[];
  intervalo_dias: number;
  /** Data (Brasília) da última divulgação registrada neste lugar, ou null. */
  ultima_divulgacao: string | null;
}

/**
 * Próxima vez permitida: o primeiro dia, a partir de hoje e depois do intervalo combinado
 * desde a última divulgação, que cai num dos dias permitidos.
 */
export function proximaVezPermitida(a: AgendaLugar, hoje: string): string | null {
  if (!a.dias_permitidos.length || a.intervalo_dias < 1) return null;
  let inicio = hoje;
  if (a.ultima_divulgacao) {
    const liberada = somarDias(a.ultima_divulgacao, a.intervalo_dias);
    if (liberada > inicio) inicio = liberada;
  }
  for (let i = 0; i < 7; i++) {
    const d = somarDias(inicio, i);
    if (a.dias_permitidos.includes(diaDaSemana(d))) return d;
  }
  return null;
}

export type PodeDivulgar = { ok: true } | { ok: false; motivo: string; proxima: string | null };

/** "Divulguei hoje" só vale no dia permitido e depois do intervalo combinado (5.11, item 3). */
export function podeDivulgarHoje(l: AgendaLugar & { estado: string }, hoje: string): PodeDivulgar {
  if (l.estado !== 'aprovado') return { ok: false, motivo: 'Só lugares aprovados recebem divulgação.', proxima: null };
  const proxima = proximaVezPermitida(l, hoje);
  if (proxima === hoje) return { ok: true };
  return { ok: false, motivo: 'Hoje não é um dia permitido para este lugar.', proxima };
}

/**
 * O roteiro só sugere "divulgar seu link em um lugar aprovado" quando há lugar liberado hoje
 * e a última divulgação (em qualquer lugar) tem mais de 48 horas (5.11, item 8; Fluxo C).
 */
export function sugerirDivulgacao(
  lugares: ReadonlyArray<AgendaLugar & { estado: string }>,
  ultimaDivulgacaoGeral: Date | null,
  agora: Date,
): boolean {
  if (ultimaDivulgacaoGeral && agora.getTime() - ultimaDivulgacaoGeral.getTime() <= JANELA_LEITURA_HORAS * 3_600_000) return false;
  const hoje = dataLocal(agora);
  return lugares.some((l) => podeDivulgarHoje(l, hoje).ok);
}

/**
 * Leituras de 48 horas que se sobrepõem ficam "misturadas" e não são atribuídas a nenhuma origem (5.11 item 8; 5.12).
 * Devolve os ids das divulgações misturadas.
 */
export function marcarMisturadas(divulgacoes: ReadonlyArray<{ id: string; divulgado_em: string }>): Set<string> {
  const ord = [...divulgacoes].sort((a, b) => Date.parse(a.divulgado_em) - Date.parse(b.divulgado_em));
  const janela = JANELA_LEITURA_HORAS * 3_600_000;
  const out = new Set<string>();
  for (let i = 1; i < ord.length; i++) {
    if (Date.parse(ord[i].divulgado_em) - Date.parse(ord[i - 1].divulgado_em) < janela) {
      out.add(ord[i].id);
      out.add(ord[i - 1].id);
    }
  }
  return out;
}

export const NOMES_DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

/** "Sex" / "Seg, Qua e Sex" a partir de [5] / [1, 3, 5]. */
export function diasPorExtenso(dias: number[]): string {
  const n = [...dias].sort((a, b) => a - b).map((d) => NOMES_DIAS[d]);
  if (n.length <= 1) return n.join('');
  return `${n.slice(0, -1).join(', ')} e ${n[n.length - 1]}`;
}
