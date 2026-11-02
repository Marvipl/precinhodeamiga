// Audiência (F-22, seção 5.12). Código puro: totais, funil, leitura por origem, engajamento e gráfico.
// Nada aqui inventa número: quando falta dado, o resultado é `null` e a tela diz "aguardando dados".

import { dataLocal, diasEntre, somarDias, diaDaSemana } from '../formato.ts';

export type Canal = 'wa' | 'tg';

/** Total de seguidores de um canal num dia (WhatsApp: informado pela Lana; Telegram: contagem do bot). */
export interface RegistroSeguidores {
  canal: Canal;
  data: string; // AAAA-MM-DD (Brasília)
  total: number;
}

/** Entrada ou saída no canal do Telegram, pelo evento chat_member do bot. Sem dado da pessoa. */
export interface EventoMembro {
  tipo: 'entrou' | 'saiu';
  em: Date;
}

export const HORAS_LEITURA = 48;
const MS_LEITURA = HORAS_LEITURA * 3_600_000;
/** O gráfico de crescimento aparece depois de duas semanas de registros. */
export const DIAS_PARA_GRAFICO = 14;
/** Leituras de print por semana (seção 8: Analista, 4 leituras de print por semana) [SUPOSIÇÃO]. */
export const LEITURAS_PRINT_POR_SEMANA = 4;
/** Maior total aceito num registro (proteção contra leitura errada de print). */
export const TOTAL_MAXIMO = 10_000_000;

/** Segunda-feira (AAAA-MM-DD) da semana de uma data. */
export function inicioDaSemana(data: string): string {
  const dow = diaDaSemana(data); // 0 = domingo
  return somarDias(data, dow === 0 ? -6 : 1 - dow);
}

function ordenar(rs: RegistroSeguidores[], canal: Canal): RegistroSeguidores[] {
  return rs.filter((r) => r.canal === canal).sort((a, b) => a.data.localeCompare(b.data));
}

/** Último registro de um canal (ou null). */
export function ultimoRegistro(rs: RegistroSeguidores[], canal: Canal): RegistroSeguidores | null {
  const o = ordenar(rs, canal);
  return o.length ? o[o.length - 1] : null;
}

/** Total aceito para salvar: inteiro, não negativo e plausível. */
export function totalValido(n: unknown): n is number {
  return typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= TOTAL_MAXIMO;
}

export interface Totais {
  seguidoresWa: number | null;
  inscritosTg: number | null;
  /** Telegram: entradas nos últimos 7 dias; WhatsApp: alta entre os dois últimos registros. */
  novosNaSemana: number | null;
  /** Telegram: saídas nos últimos 7 dias; WhatsApp: queda entre os dois últimos registros. */
  deixaramDeSeguir: number | null;
  /** Primeiro registro do WhatsApp (linha de base). */
  linhaDeBaseWa: RegistroSeguidores | null;
}

/** Quatro totais do topo da tela. */
export function calcularTotais(rs: RegistroSeguidores[], eventos: EventoMembro[], agora: Date): Totais {
  const wa = ordenar(rs, 'wa');
  const tg = ordenar(rs, 'tg');
  const desde = agora.getTime() - 7 * 86_400_000;
  const recentes = eventos.filter((e) => e.em.getTime() > desde && e.em.getTime() <= agora.getTime());

  // Telegram só conta se o bot já registrou o canal (senão "zero" seria inventado).
  const tgEntradas = tg.length ? recentes.filter((e) => e.tipo === 'entrou').length : null;
  const tgSaidas = tg.length ? recentes.filter((e) => e.tipo === 'saiu').length : null;
  const waDelta = wa.length >= 2 ? wa[wa.length - 1].total - wa[wa.length - 2].total : null;

  const soma = (a: number | null, b: number | null) => (a === null && b === null ? null : (a ?? 0) + (b ?? 0));
  return {
    seguidoresWa: wa.length ? wa[wa.length - 1].total : null,
    inscritosTg: tg.length ? tg[tg.length - 1].total : null,
    novosNaSemana: soma(tgEntradas, waDelta === null ? null : Math.max(0, waDelta)),
    deixaramDeSeguir: soma(tgSaidas, waDelta === null ? null : Math.max(0, -waDelta)),
    linhaDeBaseWa: wa.length ? wa[0] : null,
  };
}

/** Dias cobertos pelos registros (do primeiro ao último, qualquer canal). */
export function diasDeRegistro(rs: RegistroSeguidores[]): number {
  if (!rs.length) return 0;
  const datas = rs.map((r) => r.data).sort();
  return diasEntre(datas[0], datas[datas.length - 1]);
}

export function linhaDeBaseEmConstrucao(rs: RegistroSeguidores[]): boolean {
  return diasDeRegistro(rs) < DIAS_PARA_GRAFICO;
}

// ---------------------------------------------------------------------------
// Entradas por origem (seção 5.12): cliques da origem e crescimento nas 48 horas seguintes.
// ---------------------------------------------------------------------------

export interface Divulgacao {
  id: string;
  origem: string;
  lugar: string;
  em: Date;
}

/** Um clique no link de entrada (botão "pagina") com a sua origem. */
export interface CliqueEntrada {
  origem: string;
  em: Date;
}

export type EstadoLeitura = 'aguardando' | 'misturada' | 'limpa';

export interface LeituraOrigem {
  divulgacao: Divulgacao;
  cliques: number;
  /** Novos inscritos no Telegram na janela. O WhatsApp é semanal e não entra na leitura de 48 horas. */
  novosTelegram: number | null;
  estado: EstadoLeitura;
  /** Fim da janela de 48 horas. */
  ate: Date;
}

/** Divulgações com outra (de qualquer lugar) a menos de 48 horas ficam "misturadas". */
export function idsMisturadas(divs: Divulgacao[]): Set<string> {
  const o = [...divs].sort((a, b) => a.em.getTime() - b.em.getTime());
  const out = new Set<string>();
  for (let i = 1; i < o.length; i++) {
    if (o[i].em.getTime() - o[i - 1].em.getTime() < MS_LEITURA) {
      out.add(o[i].id);
      out.add(o[i - 1].id);
    }
  }
  return out;
}

export function lerDivulgacoes(
  divs: Divulgacao[],
  cliques: CliqueEntrada[],
  eventos: EventoMembro[],
  agora: Date,
  telegramMedido: boolean,
): LeituraOrigem[] {
  const misturadas = idsMisturadas(divs);
  return divs.map((d) => {
    const ini = d.em.getTime();
    const fim = ini + MS_LEITURA;
    const dentro = (t: Date) => t.getTime() >= ini && t.getTime() < fim;
    const estado: EstadoLeitura = misturadas.has(d.id) ? 'misturada' : agora.getTime() < fim ? 'aguardando' : 'limpa';
    return {
      divulgacao: d,
      cliques: cliques.filter((c) => c.origem === d.origem && dentro(c.em)).length,
      novosTelegram: telegramMedido ? eventos.filter((e) => e.tipo === 'entrou' && dentro(e.em)).length : null,
      estado,
      ate: new Date(fim),
    };
  });
}

/** Uma linha por origem: a leitura da última divulgação daquele lugar. */
export function leituraPorOrigem(leituras: LeituraOrigem[]): LeituraOrigem[] {
  const ultima = new Map<string, LeituraOrigem>();
  for (const l of leituras) {
    const atual = ultima.get(l.divulgacao.origem);
    if (!atual || l.divulgacao.em > atual.divulgacao.em) ultima.set(l.divulgacao.origem, l);
  }
  return [...ultima.values()].sort((a, b) => b.divulgacao.em.getTime() - a.divulgacao.em.getTime());
}

export function textoLeitura(l: LeituraOrigem): string {
  if (l.estado === 'misturada') return 'Misturada: outra divulgação a menos de 48 horas';
  if (l.estado === 'aguardando') return 'Lendo as 48 horas seguintes';
  return 'Leitura limpa';
}

// ---------------------------------------------------------------------------
// Funil e engajamento por canal (sub1 = 'wa' | 'tg').
// ---------------------------------------------------------------------------

/** Linha diária das conversões por canal (view conversoes_por_canal_dia do pacote de Resultados). */
export interface ConversaoDia {
  dia: string;
  sub1: string;
  cliques: number;
  pedidos: number;
  comissao: number;
}

export interface Funil {
  cliquesEntrada: number | null;
  novosSeguidores: number | null;
  cliquesOfertas: number | null;
  pedidos: number | null;
  /** novos ÷ cliques de entrada */
  viramSeguidores: number | null;
  /** cliques em ofertas ÷ seguidores (WhatsApp + Telegram) */
  cliquesPorSeguidor: number | null;
  /** pedidos ÷ cliques em ofertas */
  viramPedidos: number | null;
}

const divisao = (a: number | null, b: number | null) => (a === null || b === null || b <= 0 ? null : a / b);

/** Funil dos últimos 7 dias. `cliquesEntrada` e `conversoes` vêm `null` quando a fonte ainda não existe. */
export function calcularFunil(p: {
  totais: Totais;
  cliquesEntrada: number | null;
  conversoes: ConversaoDia[] | null;
  hoje: string;
}): Funil {
  const desde = somarDias(p.hoje, -6);
  const doCanal = p.conversoes?.filter((c) => (c.sub1 === 'wa' || c.sub1 === 'tg') && c.dia >= desde && c.dia <= p.hoje) ?? null;
  const cliquesOfertas = doCanal && doCanal.length ? doCanal.reduce((s, c) => s + c.cliques, 0) : null;
  const pedidos = doCanal && doCanal.length ? doCanal.reduce((s, c) => s + c.pedidos, 0) : null;
  const seguidores =
    p.totais.seguidoresWa === null && p.totais.inscritosTg === null ? null : (p.totais.seguidoresWa ?? 0) + (p.totais.inscritosTg ?? 0);
  return {
    cliquesEntrada: p.cliquesEntrada,
    novosSeguidores: p.totais.novosNaSemana,
    cliquesOfertas,
    pedidos,
    viramSeguidores: divisao(p.totais.novosNaSemana, p.cliquesEntrada),
    cliquesPorSeguidor: divisao(cliquesOfertas, seguidores),
    viramPedidos: divisao(pedidos, cliquesOfertas),
  };
}

export interface EngajamentoCanal {
  canal: Canal;
  posts: number | null;
  cliquesPorPost: number | null;
  pedidos: number | null;
  comissao: number | null;
}

/** Engajamento dos últimos 7 dias. `posts` = envios publicados (Telegram) ou marcados como enviados (WhatsApp). */
export function calcularEngajamento(p: {
  postsPorCanal: Record<Canal, number> | null;
  conversoes: ConversaoDia[] | null;
  hoje: string;
}): EngajamentoCanal[] {
  const desde = somarDias(p.hoje, -6);
  return (['wa', 'tg'] as const).map((canal) => {
    const linhas = p.conversoes?.filter((c) => c.sub1 === canal && c.dia >= desde && c.dia <= p.hoje) ?? null;
    const tem = linhas !== null && linhas.length > 0;
    const cliques = tem ? linhas.reduce((s, c) => s + c.cliques, 0) : null;
    const posts = p.postsPorCanal ? p.postsPorCanal[canal] : null;
    return {
      canal,
      posts,
      cliquesPorPost: divisao(cliques, posts),
      pedidos: tem ? linhas.reduce((s, c) => s + c.pedidos, 0) : null,
      comissao: tem ? linhas.reduce((s, c) => s + c.comissao, 0) : null,
    };
  });
}

// ---------------------------------------------------------------------------
// Gráfico de crescimento: total por dia de cada canal, repetindo o último valor conhecido.
// ---------------------------------------------------------------------------

export interface PontoCrescimento {
  data: string;
  wa: number | null;
  tg: number | null;
}

export function serieCrescimento(rs: RegistroSeguidores[]): PontoCrescimento[] | null {
  if (diasDeRegistro(rs) < DIAS_PARA_GRAFICO) return null;
  const datas = rs.map((r) => r.data).sort();
  const porDia = new Map(rs.map((r) => [`${r.canal}:${r.data}`, r.total]));
  const out: PontoCrescimento[] = [];
  let wa: number | null = null;
  let tg: number | null = null;
  for (let d = datas[0]; d <= datas[datas.length - 1]; d = somarDias(d, 1)) {
    wa = porDia.get(`wa:${d}`) ?? wa;
    tg = porDia.get(`tg:${d}`) ?? tg;
    out.push({ data: d, wa, tg });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Leitura de print (Fluxo E): nada lido de print é salvo sem a confirmação da Lana.
// ---------------------------------------------------------------------------

/** Pode pedir mais uma leitura de print? Conta as leituras dos últimos 7 dias. */
export function podeLerPrint(leiturasNaSemana: number): boolean {
  return leiturasNaSemana < LEITURAS_PRINT_POR_SEMANA;
}

/** O roteiro sugere atualizar o WhatsApp às segundas (seção 5.14), se ainda não houver registro nesta semana. */
export function pedirRegistroWa(rs: RegistroSeguidores[], agora: Date): boolean {
  const hoje = dataLocal(agora);
  if (diaDaSemana(hoje) !== 1) return false;
  const ult = ultimoRegistro(rs, 'wa');
  return !ult || inicioDaSemana(ult.data) !== inicioDaSemana(hoje);
}
