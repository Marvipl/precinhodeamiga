// Calendário e plano de 90 dias (seção 5.16). Código puro.
// Datas sempre em AAAA-MM-DD no fuso de Brasília (ver formato.ts).
import { diasEntre, somarDias } from '../formato.ts';

export const DURACAO_PLANO = 90;

export type EstadoPlano = 'antes' | 'em_andamento' | 'concluido';

export interface DiaDoPlano {
  estado: EstadoPlano;
  /** Dia N (1 a 90) quando em andamento; null antes do início e depois do fim. */
  dia: number | null;
  /** Dias que faltam para começar (só quando estado = 'antes'). */
  faltam: number | null;
}

/** "Dia N de 90" a partir da data de início; para em 90 e depois diz "concluído". */
export function diaDoPlano(inicio: string, hoje: string): DiaDoPlano {
  const n = diasEntre(inicio, hoje) + 1;
  if (n < 1) return { estado: 'antes', dia: null, faltam: 1 - n };
  if (n > DURACAO_PLANO) return { estado: 'concluido', dia: null, faltam: null };
  return { estado: 'em_andamento', dia: n, faltam: null };
}

/** Texto curto do dia do plano para o cabeçalho da tela Hoje. */
export function rotuloDiaDoPlano(d: DiaDoPlano): string {
  if (d.estado === 'concluido') return 'plano de 90 dias concluído';
  if (d.estado === 'antes') return d.faltam === 1 ? 'o plano começa amanhã' : `o plano começa em ${d.faltam} dias`;
  return `dia ${d.dia} de ${DURACAO_PLANO}`;
}

/** Data de calendário do dia N do plano. */
export function dataDoDia(inicio: string, n: number): string {
  return somarDias(inicio, n - 1);
}

export interface Gate {
  dia: 30 | 60 | 90;
  nome: string;
  /** Manhã seguinte ao fim do dia N. */
  data: string;
  /** O dia 60 é só ponto de verificação (aparece se o dia 30 deu "Ajustar"), não um gate novo (seção 5.8). */
  pontoDeVerificacao: boolean;
}

/** Gates do plano: cada um na manhã seguinte ao fim do dia N (seção 5.16). */
export function datasDosGates(inicio: string): Gate[] {
  return [
    { dia: 30, nome: 'Gate do dia 30', data: somarDias(inicio, 30), pontoDeVerificacao: false },
    { dia: 60, nome: 'Nova leitura do dia 60', data: somarDias(inicio, 60), pontoDeVerificacao: true },
    { dia: 90, nome: 'Gate do dia 90', data: somarDias(inicio, 90), pontoDeVerificacao: false },
  ];
}

export type IdFase = 'preparacao' | 'temporada' | 'natal' | 'escala';

export interface Fase {
  id: IdFase;
  nome: string;
  /** Primeiro e último dia do plano (inclusive). */
  deDia: number;
  ateDia: number;
}

/**
 * Fases do mock (seção 5.16) com início em 2/11/2026: preparação 2 a 8/11 (dias 1 a 7),
 * temporada de ofertas 9/11 a 13/12 (8 a 42), Natal e ajustes 14 a 31/12 (43 a 60), escala em janeiro (61 a 90).
 * [SUPOSIÇÃO] Com outra data de início, as fases seguem os mesmos números de dia (docs/decisions.md).
 */
export const FASES: readonly Fase[] = [
  { id: 'preparacao', nome: 'Preparação', deDia: 1, ateDia: 7 },
  { id: 'temporada', nome: 'Temporada de ofertas', deDia: 8, ateDia: 42 },
  { id: 'natal', nome: 'Natal e ajustes', deDia: 43, ateDia: 60 },
  { id: 'escala', nome: 'Escala', deDia: 61, ateDia: 90 },
];

export function faseDoDia(dia: number | null): Fase | null {
  if (dia === null) return null;
  return FASES.find((f) => dia >= f.deDia && dia <= f.ateDia) ?? null;
}

/** Semana do plano (1 a 13) para um dia N. */
export function semanaDoPlano(dia: number): number {
  return Math.floor((dia - 1) / 7) + 1;
}

export interface DataPico {
  data: string;
  nome: string;
  descricao?: string | null;
}

export interface DataQueMove {
  data: string;
  nome: string;
  descricao: string | null;
  tipo: 'pico' | 'gate';
  /** Dias de hoje até a data (0 = hoje). */
  emDias: number;
}

/** Próxima data de pico a partir de hoje (inclusive), ou null. */
export function proximaDataPico(datas: readonly DataPico[], hoje: string): DataQueMove | null {
  return datasQueMovemVendas(datas, null, hoje, 1).find((d) => d.tipo === 'pico') ?? null;
}

/**
 * "Datas que movem vendas": datas de pico e gates do plano a partir de hoje, em ordem.
 * O ponto de verificação do dia 60 fica de fora (só aparece se o dia 30 deu "Ajustar", na tela de Resultados).
 */
export function datasQueMovemVendas(
  picos: readonly DataPico[],
  inicioPlano: string | null,
  hoje: string,
  limite = 4,
): DataQueMove[] {
  const itens: DataQueMove[] = picos.map((p) => ({
    data: p.data,
    nome: p.nome,
    descricao: p.descricao ?? null,
    tipo: 'pico' as const,
    emDias: diasEntre(hoje, p.data),
  }));
  if (inicioPlano) {
    for (const g of datasDosGates(inicioPlano)) {
      if (g.pontoDeVerificacao) continue;
      itens.push({ data: g.data, nome: g.nome, descricao: 'Decidir: escalar, ajustar ou parar.', tipo: 'gate', emDias: diasEntre(hoje, g.data) });
    }
  }
  return itens
    .filter((d) => d.emDias >= 0)
    .sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : a.tipo === 'pico' ? -1 : 1))
    .slice(0, limite);
}

/** "hoje", "amanhã", "em 9 dias". */
export function emDiasTexto(n: number): string {
  if (n === 0) return 'hoje';
  if (n === 1) return 'amanhã';
  return `em ${n} dias`;
}
