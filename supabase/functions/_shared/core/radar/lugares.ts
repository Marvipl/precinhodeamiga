// Radar de Comunidades (F-21, seção 5.11): estados dos lugares e o que cada um permite.
// Código puro: a IA sugere lugares e escreve mensagens; quem decide transição e permissão é este arquivo.

export type EstadoLugar = 'novo' | 'pedir_permissao' | 'aguardando' | 'aprovado' | 'recusou' | 'descartado';

/** Ações da Lana sobre um lugar (botões da tela Radar). "divulguei" fica em agenda.ts. */
export type AcaoLugar = 'adicionar' | 'descartar' | 'ja_pedi' | 'aprovou' | 'recusou';

export type GrupoFiltro = 'novo' | 'conversa' | 'aprovado' | 'fora';

export const ROTULO_ESTADO: Record<EstadoLugar, string> = {
  novo: 'Novo do Radar',
  pedir_permissao: 'Pedir permissão',
  aguardando: 'Aguardando resposta',
  aprovado: 'Aprovado',
  recusou: 'Recusou',
  descartado: 'Descartado',
};

export const AVISO_PROIBE_LINKS = 'A regra do lugar proíbe links. O Radar não recomenda.';

/** Agrupamento usado nos totais e nos filtros (todos, novos, em conversa, aprovados). */
export function grupoDoEstado(e: EstadoLugar): GrupoFiltro {
  if (e === 'novo') return 'novo';
  if (e === 'pedir_permissao' || e === 'aguardando') return 'conversa';
  if (e === 'aprovado') return 'aprovado';
  return 'fora';
}

/** Lugar que recusou ou foi descartado não volta para a lista (5.11, item 5). */
export function estadoFinal(e: EstadoLugar): boolean {
  return e === 'recusou' || e === 'descartado';
}

const TRANSICOES: Record<EstadoLugar, Partial<Record<AcaoLugar, EstadoLugar>>> = {
  novo: { adicionar: 'pedir_permissao', descartar: 'descartado' },
  pedir_permissao: { ja_pedi: 'aguardando', descartar: 'descartado' },
  aguardando: { aprovou: 'aprovado', recusou: 'recusou', descartar: 'descartado' },
  aprovado: { descartar: 'descartado' },
  recusou: {},
  descartado: {},
};

/** Ações disponíveis para um lugar. Lugar cuja regra proíbe links só pode ser descartado (5.11, item 6). */
export function acoesPermitidas(l: { estado: EstadoLugar; proibe_links: boolean }): AcaoLugar[] {
  const todas = Object.keys(TRANSICOES[l.estado]) as AcaoLugar[];
  return l.proibe_links ? todas.filter((a) => a === 'descartar') : todas;
}

export interface DadosAprovacao {
  dias_permitidos: number[]; // 0 = domingo ... 6 = sábado
  intervalo_dias: number;
}

export type ResultadoTransicao = { ok: true; estado: EstadoLugar } | { ok: false; motivo: string };

export function transicionar(
  l: { estado: EstadoLugar; proibe_links: boolean },
  acao: AcaoLugar,
  aprovacao?: Partial<DadosAprovacao>,
): ResultadoTransicao {
  if (!acoesPermitidas(l).includes(acao)) {
    if (l.proibe_links && acao !== 'descartar') return { ok: false, motivo: AVISO_PROIBE_LINKS };
    return { ok: false, motivo: `"${acao}" não vale para um lugar em "${ROTULO_ESTADO[l.estado]}"` };
  }
  if (acao === 'aprovou') {
    const erro = validarAprovacao(aprovacao);
    if (erro) return { ok: false, motivo: erro };
  }
  return { ok: true, estado: TRANSICOES[l.estado][acao]! };
}

/** Ao marcar "Aprovou", a Lana informa os dias permitidos e o intervalo combinado (F-21). */
export function validarAprovacao(a?: Partial<DadosAprovacao>): string | null {
  const dias = a?.dias_permitidos;
  if (!Array.isArray(dias) || dias.length === 0) return 'Informe ao menos um dia permitido.';
  if (dias.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) return 'Dia da semana inválido.';
  if (new Set(dias).size !== dias.length) return 'Dia repetido.';
  const iv = a?.intervalo_dias;
  if (typeof iv !== 'number' || !Number.isInteger(iv) || iv < 1 || iv > 365) return 'Informe o intervalo combinado em dias (de 1 a 365).';
  return null;
}

export interface Totais {
  novos: number;
  em_conversa: number;
  aprovados: number;
}

export function totais(lugares: ReadonlyArray<{ estado: EstadoLugar }>): Totais {
  const t: Totais = { novos: 0, em_conversa: 0, aprovados: 0 };
  for (const l of lugares) {
    const g = grupoDoEstado(l.estado);
    if (g === 'novo') t.novos++;
    else if (g === 'conversa') t.em_conversa++;
    else if (g === 'aprovado') t.aprovados++;
  }
  return t;
}

/** Normaliza texto para comparação e slugs: minúsculas, sem acento, só [a-z0-9-]. */
export function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Chave para não repetir lugares já vistos (inclusive os recusados e descartados).
 * Usa o endereço público quando houver; senão, tipo + nome.
 */
export function chaveLugar(l: { nome: string; tipo: string; url?: string | null }): string {
  if (l.url) {
    try {
      const u = new URL(l.url);
      return `url:${u.hostname.replace(/^www\./, '').toLowerCase()}${u.pathname.replace(/\/+$/, '').toLowerCase()}`;
    } catch {
      // endereço inválido: cai no nome
    }
  }
  return `nome:${normalizar(l.tipo)}:${normalizar(l.nome)}`;
}
