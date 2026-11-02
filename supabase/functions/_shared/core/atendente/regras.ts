// Regras determinísticas da Atendente (seção 5.13, 7.1). A IA classifica e escreve; este código
// decide horário, envio sozinho, limites, links, agrupamento e guarda. Código puro, sem I/O.
import { dataLocal, horaLocal, instanteLocal, somarDias } from '../formato.ts';
import { eCategoriaNivel2, type CategoriaFechada, type Nivel } from './niveis.ts';
import { escaparRegex, normalizar, numeros } from './texto.ts';

// ---------------------------------------------------------------------------
// Ciclos (a cada 30 min, das 8h às 22h30) e blocos de revisão
// ---------------------------------------------------------------------------
export const CICLO_PRIMEIRO = '08:00';
export const CICLO_ULTIMO = '22:30';
export const CICLOS_POR_DIA = 30;

function minutos(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/** Instante dentro da janela de ciclos (horário de Brasília)? */
export function emJanelaDeCiclo(agora: Date): boolean {
  const m = minutos(horaLocal(agora));
  return m >= minutos(CICLO_PRIMEIRO) && m <= minutos(CICLO_ULTIMO);
}

/** Rótulo do ciclo (data e hora cheia ou meia hora), usado na chave única do job. */
export function rotuloCiclo(agora: Date): string {
  const m = minutos(horaLocal(agora));
  const slot = Math.floor(m / 30) * 30;
  const hh = String(Math.floor(slot / 60)).padStart(2, '0');
  const mm = String(slot % 60).padStart(2, '0');
  return `${dataLocal(agora)}T${hh}:${mm}`;
}

/** Próximo ciclo a partir de agora (inclusive no mesmo minuto). */
export function proximoCiclo(agora: Date): Date {
  const data = dataLocal(agora);
  const m = minutos(horaLocal(agora));
  const slot = Math.ceil(m / 30) * 30;
  if (slot < minutos(CICLO_PRIMEIRO)) return instanteLocal(data, CICLO_PRIMEIRO);
  if (slot > minutos(CICLO_ULTIMO)) return instanteLocal(somarDias(data, 1), CICLO_PRIMEIRO);
  return instanteLocal(data, `${String(Math.floor(slot / 60)).padStart(2, '0')}:${String(slot % 60).padStart(2, '0')}`);
}

/** Só "12h e 21h" ou "só 21h" (seção 5.13). Qualquer outro valor salvo volta ao padrão. */
export function blocosValidos(blocos: unknown): string[] {
  const ok = Array.isArray(blocos) && blocos.length > 0 && blocos.every((b) => typeof b === 'string' && /^\d{2}:\d{2}$/.test(b));
  return ok ? [...(blocos as string[])].sort() : ['12:00', '21:00'];
}

/** Próximo bloco de revisão. À noite, o próximo é o primeiro do dia seguinte. */
export function proximoBloco(agora: Date, blocos: string[]): { instante: Date; hora: string; amanha: boolean } {
  const lista = blocosValidos(blocos);
  const hoje = dataLocal(agora);
  for (const b of lista) {
    const inst = instanteLocal(hoje, b);
    if (inst.getTime() > agora.getTime()) return { instante: inst, hora: b, amanha: false };
  }
  const amanha = somarDias(hoje, 1);
  return { instante: instanteLocal(amanha, lista[0]), hora: lista[0], amanha: true };
}

/** "21h", "12h30". */
export function horaCurta(hhmm: string): string {
  const [h, m] = hhmm.split(':');
  return `${Number(h)}h${m === '00' ? '' : m}`;
}

/** "21h" ou "12h de amanhã". */
export function rotuloProximoBloco(agora: Date, blocos: string[]): string {
  const p = proximoBloco(agora, blocos);
  return `${horaCurta(p.hora)}${p.amanha ? ' de amanhã' : ''}`;
}

/** Aviso automático de recebimento (seção 5.13, texto do documento). */
export function avisoRecebimento(agora: Date, blocos: string[]): string {
  return `Oi! Sou a assistente da Precinho de Amiga. Respondo agora o que der, e o resto a Lana responde até as ${rotuloProximoBloco(agora, blocos)}.`;
}

/** Manda o aviso de novo só se o último foi para outro bloco (evita repetir a cada mensagem). */
export function deveAvisar(ultimoAvisoEm: Date | null, agora: Date, blocos: string[]): boolean {
  if (!ultimoAvisoEm) return true;
  return proximoBloco(ultimoAvisoEm, blocos).instante.getTime() !== proximoBloco(agora, blocos).instante.getTime();
}

/** Estamos dentro de um bloco de revisão? (janela de 60 min a partir do horário) [SUPOSIÇÃO] */
export const DURACAO_BLOCO_MIN = 60;
export function emBlocoDeRevisao(agora: Date, blocos: string[]): boolean {
  const hoje = dataLocal(agora);
  return blocosValidos(blocos).some((b) => {
    const ini = instanteLocal(hoje, b).getTime();
    return agora.getTime() >= ini && agora.getTime() < ini + DURACAO_BLOCO_MIN * 60_000;
  });
}

/**
 * Silêncio (seção 5.13): fora dos blocos de revisão, só o nível 4 faz o celular tocar.
 * Devolve quando a notificação deve sair.
 */
export function quandoNotificar(nivel: Nivel, agora: Date, blocos: string[]): Date {
  if (nivel === 4 || emBlocoDeRevisao(agora, blocos)) return agora;
  return proximoBloco(agora, blocos).instante;
}

// ---------------------------------------------------------------------------
// Nível 2: sai sozinho só se o tema estiver ligado e o trecho estiver no anúncio
// ---------------------------------------------------------------------------
export type DecisaoNivel2 = { enviar: true } | { enviar: false; motivo: string };

export function decidirNivel2(p: {
  categoria: string | null | undefined;
  temasLigados: readonly string[];
  trechoCitado: string | null | undefined;
  textoAnuncio: string | null | undefined;
  resposta: string;
}): DecisaoNivel2 {
  if (!eCategoriaNivel2(p.categoria)) return { enviar: false, motivo: 'tema fora de medidas, cores e prazo' };
  if (!p.temasLigados.includes(p.categoria)) return { enviar: false, motivo: 'tema não está ligado para resposta automática' };
  if (!p.textoAnuncio) return { enviar: false, motivo: 'sem texto do anúncio' };
  const trecho = normalizar(p.trechoCitado ?? '');
  if (trecho.length < 3) return { enviar: false, motivo: 'sem trecho citado' };
  const anuncio = normalizar(p.textoAnuncio);
  if (!anuncio.includes(trecho)) return { enviar: false, motivo: 'o trecho citado não aparece no anúncio' };
  // Todo número da resposta precisa estar no anúncio (nunca promete além do anúncio).
  const nums = new Set(numeros(p.textoAnuncio));
  const fora = numeros(p.resposta).filter((n) => !nums.has(n));
  if (fora.length) return { enviar: false, motivo: `número fora do anúncio: ${fora.join(', ')}` };
  const lim = checarLimites(p.resposta);
  if (lim.some((a) => a.bloqueia)) return { enviar: false, motivo: 'resposta fere um limite da Atendente' };
  if (lim.length) return { enviar: false, motivo: 'resposta com alerta' };
  return { enviar: true };
}

// ---------------------------------------------------------------------------
// Limites (seção 5.13): dados sensíveis, promessas, fingir ser a Lana
// ---------------------------------------------------------------------------
export interface AlertaResposta {
  tipo: 'dado_sensivel' | 'promessa' | 'finge_lana';
  trecho: string;
  /** Bloqueia o envio até a Lana editar. */
  bloqueia: boolean;
}

const SENSIVEL = /\b(cpf|rg|endereco|seu cep|numero do cartao|cartao de credito|dados do cartao|codigo de seguranca|cvv|senha|dados de pagamento|chave pix)\b/;
const NEGACAO_SENSIVEL = /\b(nunca|nao) (peco|pedimos|vou pedir|precisa (passar|enviar|mandar))\b/;
const PROMESSA = /\b(menor preco do brasil|menor preco|mais barato do brasil|garantid[oa]s?|garantia de|preco vai (subir|cair)|estoque garantido|ultimas unidades|nunca mais)\b/;
const FINGE_LANA = /\b(sou a lana|aqui e a lana|aqui quem fala e a lana|eu sou a lana)\b/;

export function checarLimites(resposta: string): AlertaResposta[] {
  const t = normalizar(resposta);
  const out: AlertaResposta[] = [];
  const s = t.match(SENSIVEL);
  if (s && !NEGACAO_SENSIVEL.test(t)) out.push({ tipo: 'dado_sensivel', trecho: s[0], bloqueia: true });
  const p = t.match(PROMESSA);
  if (p) out.push({ tipo: 'promessa', trecho: p[0], bloqueia: false });
  const f = t.match(FINGE_LANA);
  if (f) out.push({ tipo: 'finge_lana', trecho: f[0], bloqueia: true });
  return out;
}

// ---------------------------------------------------------------------------
// Links nas respostas: só link de afiliado com sub1=at, sempre com o aviso de comissão
// ---------------------------------------------------------------------------
export const AVISO_LINKS = 'Os links geram comissão para a Precinho.';
const TOKEN_LINK = /\{link:([0-9a-f-]{36})\}/g;

/** Produtos citados por token {link:<produto_id>} no rascunho. */
export function produtosCitados(texto: string): string[] {
  return [...new Set([...texto.matchAll(TOKEN_LINK)].map((m) => m[1]))];
}

/**
 * Troca {link:<produto_id>} pelo link de afiliado (sub1=at) e garante o aviso de comissão.
 * URL solta escrita pela IA não é aceita: todo link sai do gerador com destino `at` (_shared/atendente/links.ts).
 */
export function montarResposta(texto: string, links: Record<string, string>): string {
  if (/https?:\/\//i.test(texto.replace(TOKEN_LINK, ''))) throw new Error('a resposta tem link escrito à mão; use {link:<produto>}');
  let usouLink = false;
  const out = texto.replace(TOKEN_LINK, (_m, id: string) => {
    const l = links[id];
    if (!l) throw new Error(`sem link para o produto ${id}`);
    usouLink = true;
    return l;
  });
  if (!usouLink) return out.trim();
  const temAviso = new RegExp(escaparRegex(normalizar(AVISO_LINKS))).test(normalizar(out));
  return temAviso ? out.trim() : `${out.trim()}\n\n${AVISO_LINKS}`;
}

// ---------------------------------------------------------------------------
// Vira automática: 3 aprovações seguidas sem editar, só para categorias fechadas
// ---------------------------------------------------------------------------
export const APROVACOES_PARA_AUTOMATICA = 3;

export interface EstadoCategoria {
  aprovacoes_seguidas: number;
  automatica: boolean;
  desligada: boolean;
}

export function registrarAprovacao(
  atual: EstadoCategoria,
  p: { categoria: string | null | undefined; nivel: Nivel; editada: boolean },
): EstadoCategoria & { virouAutomatica: boolean } {
  const fechada = p.nivel <= 2 && typeof p.categoria === 'string';
  if (!fechada) return { ...atual, virouAutomatica: false };
  if (p.editada) return { ...atual, aprovacoes_seguidas: 0, virouAutomatica: false };
  const n = atual.aprovacoes_seguidas + 1;
  const vira = !atual.automatica && !atual.desligada && n >= APROVACOES_PARA_AUTOMATICA;
  return { ...atual, aprovacoes_seguidas: n, automatica: atual.automatica || vira, virouAutomatica: vira };
}

/** A categoria responde sozinha agora? */
export function respondeSozinha(c: EstadoCategoria | undefined): boolean {
  return !!c && c.automatica && !c.desligada;
}

// ---------------------------------------------------------------------------
// Uma resposta para todas: 2 pedidos do mesmo produto, 3 pessoas com a mesma dúvida na semana
// ---------------------------------------------------------------------------
const PARADAS = new Set(
  ('a o as os um uma uns umas de da do das dos para pra pro com sem que e em no na nos nas por favor oi ola bom boa dia tarde noite ' +
    'me meu minha procuro procurando quero queria preciso precisando gostaria alguem tem voces vcs achar encontrar indicar indica ' +
    'ate reais real r$ rs barato barata bom boa algum alguma tipo tipo um uma sobre quem ai la isso esse essa mais menos valor preco')
    .split(' '),
);

/** Chave de produto para juntar pedidos iguais (ordem e plural não importam). */
export function chaveProduto(texto: string): string {
  const tokens = normalizar(texto)
    .replace(/r\$\s*\d+([.,]\d+)?/g, ' ')
    .replace(/\d+([.,]\d+)?/g, ' ')
    .replace(/[$,.]/g, ' ')
    .split(' ')
    .filter((w) => w.length > 1 && !PARADAS.has(w))
    .map((w) => (w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w));
  return [...new Set(tokens)].sort().join(' ');
}

export const PEDIDOS_PARA_ACHADO = 2;
export const DUVIDAS_PARA_POST = 3;

export interface PedidoParaAgrupar {
  id: string;
  chave: string | null;
  /** Quem pediu; null = a própria Lana. */
  contato_id: string | null;
  estado: string;
}

/** Grupos de pedidos abertos do mesmo produto, de pessoas diferentes, que viram "achado a pedido". */
export function gruposAchadoAPedido(pedidos: readonly PedidoParaAgrupar[]): Array<{ chave: string; ids: string[] }> {
  const porChave = new Map<string, PedidoParaAgrupar[]>();
  for (const p of pedidos) {
    if (!p.chave || p.estado === 'cancelado' || p.estado === 'respondido') continue;
    porChave.set(p.chave, [...(porChave.get(p.chave) ?? []), p]);
  }
  const out: Array<{ chave: string; ids: string[] }> = [];
  for (const [chave, lista] of porChave) {
    const pessoas = new Set(lista.map((p) => p.contato_id ?? 'lana'));
    if (pessoas.size >= PEDIDOS_PARA_ACHADO) out.push({ chave, ids: lista.map((p) => p.id) });
  }
  return out;
}

/** Dúvidas iguais (mesmo tema) de 3 pessoas diferentes nos últimos 7 dias viram post de respostas. */
export function duvidasRepetidas(
  mensagens: ReadonlyArray<{ tema_duvida: string | null; contato_id: string; recebida_em: string }>,
  agora: Date,
): string[] {
  const limite = agora.getTime() - 7 * 86_400_000;
  const porTema = new Map<string, Set<string>>();
  for (const m of mensagens) {
    if (!m.tema_duvida || Date.parse(m.recebida_em) < limite) continue;
    const tema = normalizar(m.tema_duvida);
    porTema.set(tema, (porTema.get(tema) ?? new Set()).add(m.contato_id));
  }
  return [...porTema].filter(([, s]) => s.size >= DUVIDAS_PARA_POST).map(([t]) => t);
}

// ---------------------------------------------------------------------------
// Guarda (seção 7.1) e exclusão a pedido (seção 7.2)
// ---------------------------------------------------------------------------
export const GUARDA_DIAS = 90;
export const EXCLUSAO_PRAZO_DIAS = 15;

/** Texto e contato saem depois de 90 dias da última interação; ficam só contagens. */
export function vencidoParaGuarda(ultimaInteracao: string | Date, agora: Date): boolean {
  const t = typeof ultimaInteracao === 'string' ? Date.parse(ultimaInteracao) : ultimaInteracao.getTime();
  return agora.getTime() - t > GUARDA_DIAS * 86_400_000;
}

/** Número de celular brasileiro plausível (DDD + 8 ou 9 dígitos, com ou sem 55). */
export function celularValido(numero: string): boolean {
  const d = numero.replace(/\D/g, '');
  return /^(55)?[1-9]{2}9?\d{8}$/.test(d);
}

export type { CategoriaFechada };
