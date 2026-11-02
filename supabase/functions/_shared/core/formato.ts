// Formatos brasileiros (seção 8): R$ 1.621,00; "quarta, 2 de dezembro"; fuso America/Sao_Paulo.
// Código puro (navegador, Node e Deno).

export const FUSO = 'America/Sao_Paulo';

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const pct = new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 1 });

/** "R$ 1.621,00" (com espaço comum, não o espaço fino do Intl). */
export function reais(valor: number): string {
  return brl.format(valor).replace(/ /g, ' ');
}

/** "3%" / "12,5%" a partir de fração (0.03). */
export function porcento(fracao: number): string {
  return pct.format(fracao).replace(/ /g, '');
}

/** Data de calendário (AAAA-MM-DD) no fuso de Brasília para um instante. */
export function dataLocal(instante: Date = new Date()): string {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit' }).format(instante);
  return p; // en-CA já sai como AAAA-MM-DD
}

/** "HH:MM" no fuso de Brasília. */
export function horaLocal(instante: Date): string {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, hour: '2-digit', minute: '2-digit', hour12: false }).format(instante);
}

/** Instante (UTC) para uma data AAAA-MM-DD e hora HH:MM de Brasília. Brasília é UTC-3 fixo desde 2019. */
export function instanteLocal(data: string, hora: string): Date {
  return new Date(`${data}T${hora.length === 5 ? hora + ':00' : hora}-03:00`);
}

const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

function partes(data: string): { a: number; m: number; d: number; semana: number } {
  const [a, m, d] = data.split('-').map(Number);
  const semana = new Date(Date.UTC(a, m - 1, d)).getUTCDay();
  return { a, m, d, semana };
}

/** "quarta, 2 de dezembro" a partir de AAAA-MM-DD. */
export function dataPorExtenso(data: string): string {
  const { m, d, semana } = partes(data);
  return `${DIAS[semana]}, ${d} de ${MESES[m - 1]}`;
}

/** "2/12" a partir de AAAA-MM-DD. */
export function dataCurta(data: string): string {
  const { m, d } = partes(data);
  return `${d}/${m}`;
}

/** Dia da semana (0 = domingo) de uma data AAAA-MM-DD. */
export function diaDaSemana(data: string): number {
  return partes(data).semana;
}

/** Soma dias a uma data AAAA-MM-DD. */
export function somarDias(data: string, dias: number): string {
  const { a, m, d } = partes(data);
  const t = new Date(Date.UTC(a, m - 1, d + dias));
  return t.toISOString().slice(0, 10);
}

/** Diferença em dias de calendário (b - a). */
export function diasEntre(a: string, b: string): number {
  const pa = partes(a);
  const pb = partes(b);
  return Math.round((Date.UTC(pb.a, pb.m - 1, pb.d) - Date.UTC(pa.a, pa.m - 1, pa.d)) / 86_400_000);
}
