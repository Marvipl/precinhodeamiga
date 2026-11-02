// Revisão semanal da Coach do Plano (F-24, Anexo A.3: pa-coach, segundas às 06:23).
// O código monta a entrada e decide o que vale da saída: a IA só escolhe e escreve.
// Código puro.

import {
  DIAS_PLANO,
  PERIODOS,
  diaDoPlano,
  estaAtrasada,
  estadoPeriodo,
  pendentesDela,
  periodo,
  tarefasFeitas,
  textoTarefa,
  type MarcaPlano,
} from './plano.ts';

export const MAX_PRIORIDADES = 3;
export const MAX_NOTA = 600;
export const MAX_MOTIVO = 200;

export interface TarefaEntradaCoach {
  id: string;
  texto: string;
  responsavel: string;
  periodo: string;
  atrasada: boolean;
}

export interface EntradaCoach {
  /** Segunda-feira da semana revisada (AAAA-MM-DD). */
  semana: string;
  dia_plano: number;
  periodos_atuais: string[];
  tarefas_pendentes: TarefaEntradaCoach[];
  /** Resultados da semana anterior. `null` = aguardando dados; a Coach não inventa número. */
  resultados: {
    horas_registradas: number | null;
    comissao_bruta: number | null;
  };
}

export interface SaidaCoach {
  prioridades: Array<{ tarefa_id: string; motivo: string }>;
  nota: string;
}

/**
 * Monta a entrada da revisão. Devolve `null` fora da janela do plano
 * (antes do dia 1 ou depois do gate do dia 90): sem revisão nesses dias.
 */
export function montarEntradaCoach(p: {
  inicio: string;
  semana: string;
  marcas: ReadonlyArray<MarcaPlano>;
  horasRegistradas: number | null;
  comissaoBruta: number | null;
}): EntradaCoach | null {
  const dia = diaDoPlano(p.inicio, p.semana);
  if (dia < 1 || dia > DIAS_PLANO + 1) return null;
  const feitas = tarefasFeitas(p.marcas);
  return {
    semana: p.semana,
    dia_plano: dia,
    periodos_atuais: PERIODOS.filter((x) => estadoPeriodo(x, dia) === 'atual').map((x) => x.titulo),
    tarefas_pendentes: pendentesDela(dia, feitas).map((t) => ({
      id: t.id,
      texto: textoTarefa(t, p.inicio),
      responsavel: t.responsavel,
      periodo: periodo(t.periodo).titulo,
      atrasada: estaAtrasada(t, dia, feitas),
    })),
    resultados: {
      horas_registradas: p.horasRegistradas === null ? null : Math.round(p.horasRegistradas * 10) / 10,
      comissao_bruta: p.comissaoBruta,
    },
  };
}

/**
 * O que vale da saída: só prioridades que apontam para tarefas pendentes da entrada,
 * sem repetição, no máximo três. A nota é aparada no limite.
 */
export function aplicarSaidaCoach(entrada: EntradaCoach, saida: SaidaCoach): SaidaCoach {
  const validas = new Set(entrada.tarefas_pendentes.map((t) => t.id));
  const vistas = new Set<string>();
  const prioridades: SaidaCoach['prioridades'] = [];
  for (const pr of saida.prioridades) {
    if (!validas.has(pr.tarefa_id) || vistas.has(pr.tarefa_id)) continue;
    vistas.add(pr.tarefa_id);
    prioridades.push({ tarefa_id: pr.tarefa_id, motivo: pr.motivo.trim().slice(0, MAX_MOTIVO) });
    if (prioridades.length === MAX_PRIORIDADES) break;
  }
  return { prioridades, nota: saida.nota.trim().slice(0, MAX_NOTA) };
}

/** Resposta pré-gravada do modo simulado: determinística e marcada como simulada. */
export function simularCoach(e: EntradaCoach): SaidaCoach {
  const prioridades = e.tarefas_pendentes.slice(0, MAX_PRIORIDADES).map((t) => ({
    tarefa_id: t.id,
    motivo: t.atrasada ? 'Resposta simulada: tarefa atrasada.' : 'Resposta simulada: tarefa do período atual.',
  }));
  const atrasadas = e.tarefas_pendentes.filter((t) => t.atrasada).length;
  const nota =
    `Revisão simulada (modo de teste, sem IA). Dia ${e.dia_plano} do plano: ` +
    `${e.tarefas_pendentes.length} tarefa(s) sua(s) em aberto, ${atrasadas} atrasada(s).`;
  return { prioridades, nota };
}
