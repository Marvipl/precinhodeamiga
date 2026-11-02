// Plano de 90 dias (F-24, seção 5.16): períodos, checklists, linha do tempo e tarefas atrasadas.
// Código puro (navegador, Node e Deno). As datas saem da data de início configurável (plano.data_inicio).
// Checklists e responsáveis copiados da aba "Plano de 90 dias" do mock; as chaves p1..p23 são as do mock.

import { dataPorExtenso, diasEntre, somarDias } from '../formato.ts';

export const DIAS_PLANO = 90;

export type IdPeriodo = 'semana1' | 'semanas2a4' | 'gate30' | 'dias31a90';

export interface Periodo {
  id: IdPeriodo;
  titulo: string;
  /** Dias do plano (1 = data de início), inclusive. O gate do dia N é o dia N + 1 (manhã seguinte). */
  inicio: number;
  fim: number;
  /** Foco do período, mostrado no topo da tela quando ele é o atual. */
  foco: string;
}

export const PERIODOS: readonly Periodo[] = [
  {
    id: 'semana1',
    titulo: 'Semana 1: preparação',
    inicio: 1,
    fim: 7,
    foco: 'Esta semana o foco é a base: cadastro, nicho, marca e os primeiros seguidores.',
  },
  {
    id: 'semanas2a4',
    titulo: 'Semanas 2 a 4: temporada de pico',
    inicio: 8,
    fim: 30,
    foco: 'Temporada de pico: rotina diária de aprovação e envio e canais aquecidos antes das datas.',
  },
  {
    id: 'gate30',
    titulo: 'Gate do dia 30',
    inicio: 31,
    fim: 31,
    foco: 'Dia do gate: a Analista calcula os números e vocês decidem escalar, ajustar ou parar.',
  },
  {
    id: 'dias31a90',
    titulo: 'Dias 31 a 90',
    inicio: 31,
    fim: 91,
    foco: 'Repetir o que funcionou nas datas de pico e chegar ao gate do dia 90 com os números do painel.',
  },
];

export interface TarefaPlano {
  id: string;
  periodo: IdPeriodo;
  texto: string | ((inicio: string) => string);
  /** Responsável em texto livre, como no mock. */
  responsavel: string;
  /** A Lana precisa agir? Itens "a plataforma faz" e dos agentes saem da lista dela. */
  dela: boolean;
  /** Já vem marcada (mock: "Feito: Precinho de Amiga"). Uma marca salva no servidor vence. */
  feitaDesdeOInicio?: boolean;
}

export const TAREFAS_PLANO: readonly TarefaPlano[] = [
  { id: 'p1', periodo: 'semana1', texto: 'Ler a estratégia e confirmar as premissas', responsavel: 'Lana', dela: true },
  { id: 'p2', periodo: 'semana1', texto: 'Cadastro no programa de afiliados com CPF, PIS/NIS e ShopeePay', responsavel: 'Lana', dela: true },
  { id: 'p3', periodo: 'semana1', texto: 'Preencher a matriz de nicho', responsavel: 'Lana, com os dados da Caçadora', dela: true },
  { id: 'p4', periodo: 'semana1', texto: 'Nome e logo da marca', responsavel: 'Feito: Precinho de Amiga', dela: true, feitaDesdeOInicio: true },
  { id: 'p5', periodo: 'semana1', texto: 'Foto, descrição e chip dedicado', responsavel: 'Lana', dela: true },
  { id: 'p6', periodo: 'semana1', texto: 'Criar o canal do WhatsApp e o canal no Telegram', responsavel: 'Lana', dela: true },
  { id: 'p7', periodo: 'semana1', texto: 'Planilha de controle e modelos de arte', responsavel: 'A plataforma faz', dela: false },
  { id: 'p8', periodo: 'semana1', texto: 'Convidar o núcleo inicial', responsavel: 'Lana, com convite pronto', dela: true },

  { id: 'p9', periodo: 'semanas2a4', texto: 'Rotina diária de aprovação e envio', responsavel: 'Lana, 10 a 20 min por dia', dela: true },
  { id: 'p10', periodo: 'semanas2a4', texto: 'Aquecer os canais antes de 11.11 e Black Friday', responsavel: 'Redatora prepara, Lana envia', dela: true },
  { id: 'p11', periodo: 'semanas2a4', texto: 'Lista de achados da Black Friday', responsavel: 'Redatora', dela: false },
  { id: 'p12', periodo: 'semanas2a4', texto: 'Primeiros vídeos curtos de produto', responsavel: 'Lana, com roteiro pronto', dela: true },
  { id: 'p13', periodo: 'semanas2a4', texto: 'Registro de horas e resultados', responsavel: 'A plataforma faz', dela: false },
  { id: 'p23', periodo: 'semanas2a4', texto: 'Divulgar o link de entrada nos lugares aprovados', responsavel: 'Radar prepara, Lana divulga', dela: true },

  { id: 'p14', periodo: 'gate30', texto: 'Calcular comissão por hora e por 1.000 membros', responsavel: 'Analista', dela: false },
  { id: 'p15', periodo: 'gate30', texto: 'Decidir: escalar, ajustar ou parar', responsavel: 'Lana e Marcus', dela: true },
  { id: 'p16', periodo: 'gate30', texto: 'Definir metas da fase 2', responsavel: 'Lana e Marcus', dela: true },

  { id: 'p17', periodo: 'dias31a90', texto: 'Repetir o roteiro de datas no 12.12 e no Natal', responsavel: 'Coach do Plano', dela: false },
  { id: 'p18', periodo: 'dias31a90', texto: 'Testar Mercado Livre se o nicho tiver boa oferta lá', responsavel: 'Caçadora', dela: false },
  { id: 'p19', periodo: 'dias31a90', texto: 'Levar os produtos campeões para a loja de dropshipping', responsavel: 'Analista sugere, Lana decide', dela: true },
  {
    id: 'p20',
    periodo: 'dias31a90',
    texto: 'Conversar com contador sobre formalização',
    responsavel: 'Lana, quando a comissão bruta passar de R$ 3.000 por 2 meses',
    dela: true,
  },
  { id: 'p22', periodo: 'dias31a90', texto: 'Conferir o gatilho de investimento da versão 4', responsavel: 'Analista', dela: false },
  {
    id: 'p21',
    periodo: 'dias31a90',
    texto: (inicio) => `Gate do dia 90, ${dataAbreviada(dataGate(inicio, DIAS_PLANO), true)}`,
    responsavel: 'Lana e Marcus',
    dela: true,
  },
];

export const IDS_TAREFAS: ReadonlySet<string> = new Set(TAREFAS_PLANO.map((t) => t.id));

export function textoTarefa(t: TarefaPlano, inicio: string): string {
  return typeof t.texto === 'function' ? t.texto(inicio) : t.texto;
}

// ---------------------------------------------------------------------------
// Datas
// ---------------------------------------------------------------------------

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const MESES_ABREV = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const DIAS_SEMANA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

function partes(data: string) {
  const [a, m, d] = data.split('-').map(Number);
  return { a, m, d, semana: new Date(Date.UTC(a, m - 1, d)).getUTCDay() };
}

const maiuscula = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Data do dia N do plano (dia 1 = início). */
export function dataDoDia(inicio: string, dia: number): string {
  return somarDias(inicio, dia - 1);
}

/** Dia do plano numa data (pode ser < 1 antes do início ou > 90 depois do fim). */
export function diaDoPlano(inicio: string, hoje: string): number {
  return diasEntre(inicio, hoje) + 1;
}

/** "Gate do dia N" acontece na manhã seguinte ao fim do dia N (seção 5.16). */
export function dataGate(inicio: string, n: number): string {
  return dataDoDia(inicio, n + 1);
}

/** "31 jan" ou, com dia da semana, "domingo 31 jan". */
export function dataAbreviada(data: string, comSemana = false): string {
  const { m, d, semana } = partes(data);
  return `${comSemana ? DIAS_SEMANA[semana] + ' ' : ''}${d} ${MESES_ABREV[m - 1]}`;
}

/** "2 a 8 de novembro" ou "9 de novembro a 1 de dezembro". */
export function intervaloPorExtenso(de: string, ate: string): string {
  const a = partes(de);
  const b = partes(ate);
  if (de === ate) return maiuscula(dataPorExtenso(de));
  if (a.m === b.m && a.a === b.a) return `${a.d} a ${b.d} de ${MESES[b.m - 1]}`;
  return `${a.d} de ${MESES[a.m - 1]} a ${b.d} de ${MESES[b.m - 1]}`;
}

/** "2 a 8 nov" ou "9 nov a 13 dez". */
export function intervaloAbreviado(de: string, ate: string): string {
  const a = partes(de);
  const b = partes(ate);
  if (a.m === b.m && a.a === b.a) return `${a.d} a ${b.d} ${MESES_ABREV[b.m - 1]}`;
  return `${dataAbreviada(de)} a ${dataAbreviada(ate)}`;
}

/** Texto "quando" de cada período, como no mock. */
export function quandoPeriodo(p: Periodo, inicio: string): string {
  const de = dataDoDia(inicio, p.inicio);
  if (p.id === 'dias31a90') {
    // Mock: "Dezembro e janeiro" (meses cobertos do dia 31 ao dia 90).
    const meses: string[] = [];
    for (let d = p.inicio; d <= DIAS_PLANO; d++) {
      const nome = MESES[partes(dataDoDia(inicio, d)).m - 1];
      if (!meses.includes(nome)) meses.push(nome);
    }
    const lista = meses.length > 1 ? `${meses.slice(0, -1).join(', ')} e ${meses[meses.length - 1]}` : meses[0];
    return maiuscula(lista);
  }
  return intervaloPorExtenso(de, dataDoDia(inicio, p.fim));
}

// ---------------------------------------------------------------------------
// Estado das tarefas
// ---------------------------------------------------------------------------

export type EstadoPeriodo = 'passado' | 'atual' | 'futuro';

export function estadoPeriodo(p: Periodo, dia: number): EstadoPeriodo {
  if (dia > p.fim) return 'passado';
  if (dia < p.inicio) return 'futuro';
  return 'atual';
}

export function periodo(id: IdPeriodo): Periodo {
  const p = PERIODOS.find((x) => x.id === id);
  if (!p) throw new Error(`período desconhecido: ${id}`);
  return p;
}

export interface MarcaPlano {
  tarefa: string;
  feita: boolean;
}

/** Marcas do servidor + as que já vêm feitas. Ids fora do catálogo são ignorados. */
export function tarefasFeitas(marcas: ReadonlyArray<MarcaPlano>): Set<string> {
  const salvas = new Map(marcas.filter((m) => IDS_TAREFAS.has(m.tarefa)).map((m) => [m.tarefa, m.feita]));
  const feitas = new Set<string>();
  for (const t of TAREFAS_PLANO) {
    const v = salvas.has(t.id) ? salvas.get(t.id) : t.feitaDesdeOInicio === true;
    if (v) feitas.add(t.id);
  }
  return feitas;
}

/** Atrasada: tarefa da Lana, não feita, cujo período já terminou. */
export function estaAtrasada(t: TarefaPlano, dia: number, feitas: ReadonlySet<string>): boolean {
  return t.dela && !feitas.has(t.id) && estadoPeriodo(periodo(t.periodo), dia) === 'passado';
}

export interface ProgressoPeriodo {
  periodo: Periodo;
  estado: EstadoPeriodo;
  feitas: number;
  total: number;
}

export function progressoPorPeriodo(dia: number, feitas: ReadonlySet<string>): ProgressoPeriodo[] {
  return PERIODOS.map((p) => {
    const ts = TAREFAS_PLANO.filter((t) => t.periodo === p.id);
    return { periodo: p, estado: estadoPeriodo(p, dia), feitas: ts.filter((t) => feitas.has(t.id)).length, total: ts.length };
  });
}

/** Tarefas pendentes da Lana até o período atual (atrasadas primeiro, depois na ordem do plano). */
export function pendentesDela(dia: number, feitas: ReadonlySet<string>): TarefaPlano[] {
  const abertas = TAREFAS_PLANO.filter((t) => t.dela && !feitas.has(t.id) && estadoPeriodo(periodo(t.periodo), dia) !== 'futuro');
  const atrasadas = abertas.filter((t) => estaAtrasada(t, dia, feitas));
  return [...atrasadas, ...abertas.filter((t) => !atrasadas.includes(t))];
}

/**
 * Tarefa da semana do plano para o roteiro do dia (seção 5.14, prioridade 3, 10 min).
 * A primeira prioridade da última revisão da Coach que ainda estiver pendente vence;
 * sem revisão, vale a primeira pendente da Lana (atrasadas primeiro). `null` = nada para fazer.
 */
export function tarefaDaSemana(dia: number, feitas: ReadonlySet<string>, prioridadesCoach: ReadonlyArray<string> = []): TarefaPlano | null {
  const pend = pendentesDela(dia, feitas);
  for (const id of prioridadesCoach) {
    const t = pend.find((x) => x.id === id);
    if (t) return t;
  }
  return pend[0] ?? null;
}

// ---------------------------------------------------------------------------
// Linha do tempo
// ---------------------------------------------------------------------------

export interface FaseLinha {
  id: 's1' | 's2' | 's3' | 's4';
  nome: string;
  curto: string;
  inicio: number;
  fim: number;
}

/** Fases do mock (seção 5.16): preparação 2 a 8/11, temporada 9/11 a 13/12, Natal e ajustes 14 a 31/12, escala janeiro. */
export const FASES: readonly FaseLinha[] = [
  { id: 's1', nome: 'Preparação', curto: 'Prep.', inicio: 1, fim: 7 },
  { id: 's2', nome: 'Temporada de ofertas', curto: 'Temporada de ofertas', inicio: 8, fim: 42 },
  { id: 's3', nome: 'Natal e ajustes', curto: 'Natal e ajustes', inicio: 43, fim: 60 },
  { id: 's4', nome: 'Escala', curto: 'Escala', inicio: 61, fim: 90 },
];

export interface MarcaLinha {
  rotulo: string;
  /** Posição de 0 a 100 (% da barra). */
  pos: number;
  gate: boolean;
  baixa: boolean;
  fim: boolean;
}

export interface LinhaDoTempo {
  fases: Array<FaseLinha & { dias: number; legenda: string }>;
  marcas: MarcaLinha[];
  eixo: string[];
  /** Posição de hoje (0 a 100) ou null fora do plano. */
  hoje: number | null;
  rotuloAcessivel: string;
}

const posicao = (dia: number) => Math.round(((dia - 1) / DIAS_PLANO) * 1000) / 10;

/** Monta a linha do tempo a partir da data de início e das datas de pico da tabela `datas_pico`. */
export function linhaDoTempo(inicio: string, datasPico: ReadonlyArray<{ data: string; nome: string }>, hoje?: string): LinhaDoTempo {
  const gate30 = dataGate(inicio, 30);
  const gate90 = dataGate(inicio, DIAS_PLANO);

  const fases = FASES.map((f) => {
    const de = dataDoDia(inicio, f.inicio);
    const ate = dataDoDia(inicio, f.fim);
    return { ...f, dias: f.fim - f.inicio + 1, legenda: `${f.nome}, ${intervaloAbreviado(de, ate)}` };
  });

  const pontos: Array<{ rotulo: string; dia: number; gate: boolean }> = [
    ...datasPico
      .map((p) => ({ rotulo: p.nome, dia: diaDoPlano(inicio, p.data), gate: false }))
      .filter((p) => p.dia >= 1 && p.dia <= DIAS_PLANO),
    { rotulo: 'Gate 30', dia: diaDoPlano(inicio, gate30), gate: true },
    { rotulo: 'Gate 90', dia: diaDoPlano(inicio, gate90), gate: true },
  ].sort((a, b) => a.dia - b.dia || Number(a.gate) - Number(b.gate));

  const marcas = pontos.map((p, i) => {
    const fim = p.dia > DIAS_PLANO;
    return { rotulo: p.rotulo, pos: Math.min(100, posicao(p.dia)), gate: p.gate, baixa: !fim && i % 2 === 1, fim };
  });

  const eixo = [inicio, dataDoDia(inicio, 30), dataDoDia(inicio, 60), gate90].map((d) => dataAbreviada(d));
  const diaHoje = hoje ? diaDoPlano(inicio, hoje) : null;
  return {
    fases,
    marcas,
    eixo,
    hoje: diaHoje !== null && diaHoje >= 1 && diaHoje <= DIAS_PLANO ? posicao(diaHoje) : null,
    rotuloAcessivel: `Linha do tempo de ${dataPorExtenso(inicio).split(', ')[1]} a ${dataPorExtenso(gate90).split(', ')[1]}`,
  };
}

/** "dia 1 de 90"; antes do início, "começa em ..."; depois do dia 90, "plano de 90 dias concluído". */
export function rotuloDia(inicio: string, hoje: string): string {
  const dia = diaDoPlano(inicio, hoje);
  if (dia < 1) return `O plano começa em ${dataPorExtenso(inicio)}`;
  if (dia > DIAS_PLANO) return 'Plano de 90 dias concluído';
  return `Dia ${dia} de ${DIAS_PLANO}`;
}

/** Fim do plano (dia 90), para referência. */
export function fimDoPlano(inicio: string): string {
  return dataDoDia(inicio, DIAS_PLANO);
}

/** Segunda-feira da semana de uma data (AAAA-MM-DD). */
export function segundaDaSemana(data: string): string {
  const s = partes(data).semana; // 0 = domingo
  return somarDias(data, s === 0 ? -6 : 1 - s);
}
