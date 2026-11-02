// Registro de tempo (seção 5.15). Código puro.
// - Sessão começa e termina por botão.
// - Sessão aberta há mais de N horas sem atividade fecha sozinha no último uso registrado e pede confirmação.
// - Só o tempo marcado como "montagem" fica fora da comissão por hora.

export interface Sessao {
  id?: string;
  inicio: string; // ISO
  fim: string | null; // ISO; null = aberta
  ultima_atividade?: string | null;
  montagem: boolean;
}

const MIN = 60_000;
const HORA = 3_600_000;

const ms = (iso: string) => new Date(iso).getTime();

/** Duração em minutos; sessão aberta conta até `agora`. */
export function duracaoMin(s: Sessao, agora: Date = new Date()): number {
  const fim = s.fim ? ms(s.fim) : agora.getTime();
  return Math.max(0, Math.round((fim - ms(s.inicio)) / MIN));
}

/** "1 h 05 min", "45 min". */
export function duracaoTexto(minutos: number): string {
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  if (h === 0) return `${m} min`;
  return `${h} h ${String(m).padStart(2, '0')} min`;
}

/**
 * Horas válidas para a comissão por hora: soma das sessões que não são montagem,
 * recortadas no período [de, ate). Sessão aberta conta até `agora`.
 */
export function horasValidas(sessoes: readonly Sessao[], de: Date, ate: Date, agora: Date = new Date()): number {
  let total = 0;
  for (const s of sessoes) {
    if (s.montagem) continue;
    const ini = Math.max(ms(s.inicio), de.getTime());
    const fim = Math.min(s.fim ? ms(s.fim) : agora.getTime(), ate.getTime());
    if (fim > ini) total += fim - ini;
  }
  return total / HORA;
}

/** Horas de montagem no período (para mostrar à parte). */
export function horasMontagem(sessoes: readonly Sessao[], de: Date, ate: Date, agora: Date = new Date()): number {
  return horasValidas(
    sessoes.filter((s) => s.montagem).map((s) => ({ ...s, montagem: false })),
    de,
    ate,
    agora,
  );
}

/** Comissão por hora (null sem horas ou sem comissão). Nunca estima: recebe a comissão bruta real. */
export function comissaoPorHora(comissao: number | null, horas: number): number | null {
  if (comissao === null || horas <= 0) return null;
  return comissao / horas;
}

/**
 * Fechamento automático: se a sessão está aberta e o último uso foi há N horas ou mais,
 * devolve o instante de fechamento (o último uso registrado). Senão, null.
 */
export function fechamentoAutomatico(s: Sessao, agora: Date, horasInativa: number): string | null {
  if (s.fim) return null;
  const ultimo = s.ultima_atividade && ms(s.ultima_atividade) > ms(s.inicio) ? s.ultima_atividade : s.inicio;
  if (agora.getTime() - ms(ultimo) < horasInativa * HORA) return null;
  return new Date(ms(ultimo)).toISOString();
}

export const DURACAO_MAX_SESSAO_HORAS = 16; // [SUPOSIÇÃO] teto de um lançamento manual (docs/decisions.md)

/** Valida um lançamento ou correção manual. Devolve a mensagem de erro, ou null quando está certo. */
export function validarSessaoManual(
  s: { inicio: string; fim: string | null },
  outras: readonly Sessao[],
  agora: Date = new Date(),
): string | null {
  const ini = ms(s.inicio);
  if (Number.isNaN(ini)) return 'Informe o início.';
  if (ini > agora.getTime()) return 'O início não pode estar no futuro.';
  if (s.fim === null) return null;
  const fim = ms(s.fim);
  if (Number.isNaN(fim)) return 'Informe o fim.';
  if (fim <= ini) return 'O fim precisa ser depois do início.';
  if (fim > agora.getTime() + MIN) return 'O fim não pode estar no futuro.';
  if (fim - ini > DURACAO_MAX_SESSAO_HORAS * HORA) return `Uma sessão tem no máximo ${DURACAO_MAX_SESSAO_HORAS} horas.`;
  for (const o of outras) {
    const oi = ms(o.inicio);
    const of = o.fim ? ms(o.fim) : agora.getTime();
    if (ini < of && fim > oi) return 'Este horário se sobrepõe a outra sessão.';
  }
  return null;
}

/** Intervalo de ativação do "último uso": no máximo uma escrita a cada N minutos. */
export const INTERVALO_REGISTRO_ATIVIDADE_MIN = 5;

/** Diz se já é hora de gravar de novo o último uso. */
export function deveRegistrarAtividade(ultimoRegistro: number | null, agora: number): boolean {
  return ultimoRegistro === null || agora - ultimoRegistro >= INTERVALO_REGISTRO_ATIVIDADE_MIN * MIN;
}
