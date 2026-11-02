// Regras do Crescimento da semana (F-27) e do conteúdo extra da Redatora (F-28).
// Código puro, sem I/O: roda no navegador, no Node (testes) e no Deno.
// A IA só escreve frases; quem decide quando um conteúdo pode ser pedido, o que entra nele
// e como o texto final é montado é este código.

import { dataCurta, diasEntre, reais } from '../formato.ts';

/** Vídeo curto de produto: até 30 segundos (F-28). */
export const DURACAO_MAX_VIDEO_S = 30;
/** "3 pessoas com a mesma dúvida na semana viram um post de respostas" (seção 5.13). */
export const PESSOAS_MIN_RESPOSTAS = 3;
export const JANELA_RESPOSTAS_DIAS = 7;
/** Lista de achados de data: aparece nas táticas quando a data está a até N dias [SUPOSIÇÃO S-P14-1]. */
export const ANTECEDENCIA_LISTA_DIAS = 30;
/** Máximo de achados numa lista de data [SUPOSIÇÃO S-P14-2]. */
export const MAX_ACHADOS_LISTA = 10;
/** Ofertas consideradas para a lista: aprovadas nos últimos N dias [SUPOSIÇÃO S-P14-2]. */
export const JANELA_ACHADOS_DIAS = 14;
/** Origem do link de entrada usado no convite ao núcleo inicial [SUPOSIÇÃO S-P14-3]. */
export const ORIGEM_CONVITE = 'convite';
export const AVISO_COMISSAO = 'Link com comissão';

export type TipoExtra = 'roteiro_video' | 'lista_data' | 'respostas_semana';
export type EstadoExtra = 'em_preparo' | 'pronto' | 'erro' | 'descartado';

// ---------------------------------------------------------------------------
// Link de entrada (página pública do pacote da Página de entrada: /entrar?o=<origem>)
// ---------------------------------------------------------------------------

export function linkEntrada(base: string, origem: string): string {
  const b = base.replace(/\/+$/, '');
  return `${b}/entrar?o=${encodeURIComponent(origem)}`;
}

/** Convite pessoal ao núcleo inicial (texto do mock). Convite pessoal: nunca adicionar sem pedir. */
export function textoConvite(link: string): string {
  return `Oi! Criei o Precinho de Amiga, um canal no WhatsApp e no Telegram onde compartilho só achados que eu mesma compraria, com desconto de verdade. Sem spam. Se quiser, é só seguir: ${link}`;
}

// ---------------------------------------------------------------------------
// Táticas da semana (F-27)
// ---------------------------------------------------------------------------

export interface DataPico {
  id: string;
  data: string; // AAAA-MM-DD
  nome: string;
}

export interface ConteudoResumo {
  id: string;
  tipo: TipoExtra;
  referencia: string;
  estado: EstadoExtra;
}

export type Tatica =
  | { id: 'convite'; titulo: string; nota: string; texto: string }
  | { id: 'radar'; titulo: string; nota: string; leva: '/radar' }
  | { id: 'status'; titulo: string; nota: string; leva: '/publicar' }
  | {
      id: `lista:${string}`;
      titulo: string;
      nota: string;
      dataPicoId: string;
      estado: 'preparar' | EstadoExtra;
      conteudoId: string | null;
    };

export function referenciaLista(dataPicoId: string): string {
  return `lista_data:${dataPicoId}`;
}

/** Datas de pico que pedem lista de achados agora: de hoje até N dias à frente. */
export function datasParaLista(hoje: string, datas: readonly DataPico[], antecedencia = ANTECEDENCIA_LISTA_DIAS): DataPico[] {
  return datas
    .filter((d) => {
      const falta = diasEntre(hoje, d.data);
      return falta >= 0 && falta <= antecedencia;
    })
    .sort((a, b) => a.data.localeCompare(b.data));
}

export function taticasDaSemana(p: {
  hoje: string;
  linkConvite: string;
  artesStatusPorDia: number;
  datasPico: readonly DataPico[];
  conteudos: readonly ConteudoResumo[];
}): Tatica[] {
  const out: Tatica[] = [
    {
      id: 'convite',
      titulo: 'Convidar o núcleo inicial',
      nota: 'Convite pessoal para amigas e família. Nunca adicionar sem pedir.',
      texto: textoConvite(p.linkConvite),
    },
    {
      id: 'radar',
      titulo: 'Divulgar o link em lugares aprovados',
      nota: 'O Radar mostra onde hoje é permitido e deixa o convite pronto.',
      leva: '/radar',
    },
    {
      id: 'status',
      titulo: `${Math.min(5, Math.max(3, p.artesStatusPorDia))} a 5 achados por dia no Status`,
      nota: 'Artes prontas na aba Publicar. A arte leva o link de entrada, não link de oferta.',
      leva: '/publicar',
    },
  ];
  for (const d of datasParaLista(p.hoje, p.datasPico)) {
    const ref = referenciaLista(d.id);
    const c = p.conteudos.find((x) => x.referencia === ref && x.estado !== 'descartado');
    out.push({
      id: `lista:${d.id}`,
      titulo: `Lista de achados: ${d.nome}`,
      nota: `A Redatora prepara a isca de entrada antes do dia ${dataCurta(d.data)}.`,
      dataPicoId: d.id,
      estado: c ? c.estado : 'preparar',
      conteudoId: c?.id ?? null,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Respostas da semana: quando a mesma dúvida se repete (seção 5.13)
// ---------------------------------------------------------------------------

export interface DuvidaRegistrada {
  tema: string;
  contato_ref: string; // identificador interno da pessoa (nunca vai para a IA)
  pergunta: string;
  criado_em: string; // ISO
}

export interface TemaRepetido {
  tema: string;
  pessoas: number;
  perguntas: string[];
}

export function normalizarTema(t: string): string {
  return t
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Temas com pelo menos 3 pessoas diferentes nos últimos 7 dias, do mais pedido ao menos. */
export function temasRepetidos(
  duvidas: readonly DuvidaRegistrada[],
  agora: Date,
  minimo = PESSOAS_MIN_RESPOSTAS,
  janelaDias = JANELA_RESPOSTAS_DIAS,
): TemaRepetido[] {
  const desde = agora.getTime() - janelaDias * 86_400_000;
  const grupos = new Map<string, { tema: string; pessoas: Set<string>; perguntas: string[] }>();
  for (const d of duvidas) {
    const t = Date.parse(d.criado_em);
    if (Number.isNaN(t) || t < desde || t > agora.getTime()) continue;
    const chave = normalizarTema(d.tema);
    if (!chave) continue;
    const g = grupos.get(chave) ?? { tema: d.tema.trim(), pessoas: new Set<string>(), perguntas: [] };
    g.pessoas.add(d.contato_ref);
    if (g.perguntas.length < 10 && d.pergunta.trim()) g.perguntas.push(d.pergunta.trim().slice(0, 500));
    grupos.set(chave, g);
  }
  return [...grupos.values()]
    .filter((g) => g.pessoas.size >= minimo)
    .map((g) => ({ tema: g.tema, pessoas: g.pessoas.size, perguntas: g.perguntas }))
    .sort((a, b) => b.pessoas - a.pessoas || a.tema.localeCompare(b.tema))
    .slice(0, 5);
}

/** Referência da semana (segunda-feira da semana de `hoje`), para um post de respostas por semana. */
export function referenciaRespostas(hoje: string): string {
  const [a, m, d] = hoje.split('-').map(Number);
  const dt = new Date(Date.UTC(a, m - 1, d));
  const recuo = (dt.getUTCDay() + 6) % 7; // segunda = 0
  dt.setUTCDate(dt.getUTCDate() - recuo);
  return `respostas_semana:${dt.toISOString().slice(0, 10)}`;
}

// ---------------------------------------------------------------------------
// Achados para a lista de data
// ---------------------------------------------------------------------------

export interface OfertaAchado {
  id: string;
  nome: string;
  preco: number;
  nota: number | null;
  motivos: string[];
  produto_id: string;
}

/** Melhores ofertas aprovadas, sem repetir produto, pela nota. */
export function escolherAchados(ofertas: readonly OfertaAchado[], max = MAX_ACHADOS_LISTA): OfertaAchado[] {
  const vistos = new Set<string>();
  return [...ofertas]
    .sort((a, b) => (b.nota ?? -1) - (a.nota ?? -1) || a.nome.localeCompare(b.nome))
    .filter((o) => (vistos.has(o.produto_id) ? false : (vistos.add(o.produto_id), true)))
    .slice(0, max);
}

// ---------------------------------------------------------------------------
// Montagem do texto final (código, não IA)
// ---------------------------------------------------------------------------

export interface Cena {
  segundos: number;
  mostra: string;
  fala: string;
}

export function duracaoTotal(cenas: readonly Cena[]): number {
  return cenas.reduce((s, c) => s + c.segundos, 0);
}

export function textoRoteiro(p: { titulo: string; cenas: readonly Cena[]; legenda: string }): string {
  let t = 0;
  const linhas = [`*${p.titulo}*`, `Duração: ${duracaoTotal(p.cenas)} segundos`, ''];
  for (const c of p.cenas) {
    const fim = t + c.segundos;
    linhas.push(`${t}s a ${fim}s: ${c.mostra}${c.fala ? `\nFala: ${c.fala}` : ''}`);
    t = fim;
  }
  if (p.legenda) linhas.push('', `Legenda: ${p.legenda}`);
  return linhas.join('\n');
}

/**
 * Lista de achados: título, abertura e um item por achado com o preço do banco.
 * Só entram itens cuja `ref` veio na entrada (a IA não acrescenta produto).
 * Termina com o aviso de comissão, porque sai nos canais com links de oferta (seção 5.1, item 3).
 */
export function textoLista(p: {
  titulo: string;
  abertura: string;
  achados: readonly { ref: string; nome: string; preco: number }[];
  itens: readonly { ref: string; frase: string }[];
}): string {
  const frases = new Map(p.itens.map((i) => [i.ref, i.frase.trim()]));
  const linhas = [`*${p.titulo}*`];
  if (p.abertura.trim()) linhas.push(p.abertura.trim());
  linhas.push('');
  for (const a of p.achados) {
    const f = frases.get(a.ref);
    linhas.push(`- ${a.nome}: por ${reais(a.preco)}${f ? `. ${f}` : ''}`);
  }
  linhas.push('', AVISO_COMISSAO);
  return linhas.join('\n');
}

/** Post de respostas da semana. Leva o aviso de comissão, como todo post dos canais. */
export function textoRespostas(p: { titulo: string; itens: readonly { tema: string; resposta: string }[] }): string {
  const linhas = [`*${p.titulo}*`, ''];
  for (const i of p.itens) linhas.push(`*${i.tema}*`, i.resposta.trim(), '');
  linhas.push(AVISO_COMISSAO);
  return linhas.join('\n');
}

/** Pedido parado em preparo por mais que isto pode ser refeito (job com erro ou expirado) [SUPOSIÇÃO S-P14-4]. */
export const PREPARO_TRAVADO_MIN = 60;

/** "Pedir outra versão": vale para pronto, erro ou descartado, e para preparo travado há mais de 60 minutos. */
export function podePedirOutraVersao(estado: EstadoExtra, atualizadoEm: string, agora: Date): boolean {
  if (estado !== 'em_preparo') return true;
  const t = Date.parse(atualizadoEm);
  return !Number.isNaN(t) && agora.getTime() - t > PREPARO_TRAVADO_MIN * 60_000;
}
