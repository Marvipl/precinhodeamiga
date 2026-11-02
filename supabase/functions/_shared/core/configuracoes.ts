// F-14: tipos de campo e validação dos valores das Configurações. O código decide o que é válido.
// Código puro.
import { CONFIG, type ChaveConfig, type Papel } from './config.ts';

export type TipoCampo = 'data' | 'bloco' | 'blocosRevisao' | 'link' | 'artes' | 'temas' | 'numero' | 'fracao' | 'hora' | 'pesos' | 'booleano' | 'numeroOuVazio';

/** Temas do nível 2 da Atendente (seção 5.13) que a Lana pode ligar. */
export const TEMAS_NIVEL2 = [
  { id: 'medidas', rotulo: 'Medidas' },
  { id: 'cores', rotulo: 'Cores' },
  { id: 'prazo', rotulo: 'Prazo' },
] as const;

/** Opções dos blocos de revisão (seção 5.13): 12h e 21h, ou só 21h. */
export const OPCOES_REVISAO: ReadonlyArray<{ id: string; rotulo: string; valor: string[] }> = [
  { id: 'dois', rotulo: '12h e 21h', valor: ['12:00', '21:00'] },
  { id: 'noite', rotulo: 'Só 21h', valor: ['21:00'] },
];

export const PESOS_NOTA = ['desconto', 'comissao', 'avaliacao', 'aderencia', 'prazo'] as const;
export const ROTULOS_PESOS: Record<(typeof PESOS_NOTA)[number], string> = {
  desconto: 'Desconto real',
  comissao: 'Comissão',
  avaliacao: 'Avaliação',
  aderencia: 'Aderência ao nicho',
  prazo: 'Prazo de entrega',
};

const TIPOS: Record<ChaveConfig, TipoCampo> = {
  dataInicioPlano: 'data',
  blocoNoite: 'bloco',
  blocoAlmoco: 'bloco',
  blocosRevisao: 'blocosRevisao',
  linkCanalWhatsapp: 'link',
  linkCanalTelegram: 'link',
  artesStatusPorDia: 'artes',
  temasAutomaticos: 'temas',
  janelaHistoricoDias: 'numero',
  descontoRealMinimo: 'fracao',
  historicoCurtoDias: 'numero',
  lojaNotaMinima: 'numeroOuVazio',
  lojaAvaliacoesMinimas: 'numeroOuVazio',
  pesosNota: 'pesos',
  candidatasParaIa: 'numero',
  folgaFila: 'numero',
  fraseMaxCaracteres: 'numero',
  repeticaoHoras: 'numero',
  cadenciaInicial: 'numero',
  cadenciaMaxima: 'numero',
  cadenciaMinima: 'numero',
  limiteQuedaInicial: 'fracao',
  intervaloMaxMin: 'numero',
  intervaloMinMin: 'numero',
  inicioLimitePico: 'hora',
  checagemAntesEnvioMin: 'numero',
  sessaoInativaHoras: 'numero',
  valorHoraReferencia: 'numero',
  valorHoraParar: 'numero',
  pausaGeral: 'booleano',
  jobExpiraMin: 'numero',
};

export function tipoCampo(nome: ChaveConfig): TipoCampo {
  return TIPOS[nome];
}

/** Quem pode alterar o campo: a Lana só os dela; o Marcus todos. */
export function podeEditar(papel: Papel, nome: ChaveConfig): boolean {
  return papel === 'dono' || !CONFIG[nome].soDono;
}

export type Validacao = { ok: true; valor: unknown } | { ok: false; erro: string };

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

function minutos(h: string): number {
  const [a, b] = h.split(':').map(Number);
  return a * 60 + b;
}

function dataValida(s: unknown): s is string {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function numero(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v.replace(',', '.')) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

const erro = (e: string): Validacao => ({ ok: false, erro: e });

/** Valida e normaliza um valor antes de salvar. */
export function validarValorConfig(nome: ChaveConfig, valor: unknown): Validacao {
  switch (TIPOS[nome]) {
    case 'data':
      return dataValida(valor) ? { ok: true, valor } : erro('Informe uma data válida.');
    case 'hora':
      return typeof valor === 'string' && HORA.test(valor) ? { ok: true, valor } : erro('Use o formato HH:MM.');
    case 'bloco': {
      const b = valor as { inicio?: unknown; fim?: unknown; ligado?: unknown } | null;
      if (!b || typeof b.inicio !== 'string' || typeof b.fim !== 'string' || !HORA.test(b.inicio) || !HORA.test(b.fim))
        return erro('Use horários no formato HH:MM.');
      if (minutos(b.fim) <= minutos(b.inicio)) return erro('O fim precisa ser depois do início.');
      return { ok: true, valor: { inicio: b.inicio, fim: b.fim, ligado: b.ligado !== false } };
    }
    case 'blocosRevisao': {
      const op = OPCOES_REVISAO.find((o) => JSON.stringify(o.valor) === JSON.stringify(valor));
      return op ? { ok: true, valor: op.valor } : erro('Escolha 12h e 21h, ou só 21h.');
    }
    case 'link': {
      if (valor === '') return { ok: true, valor: '' };
      if (typeof valor !== 'string') return erro('Cole o link completo, começando com https://');
      const t = valor.trim();
      try {
        const u = new URL(t);
        if (u.protocol !== 'https:') return erro('O link precisa começar com https://');
      } catch {
        return erro('Cole o link completo, começando com https://');
      }
      if (nome === 'linkCanalWhatsapp' && !/(^|\.)whatsapp\.com$/.test(new URL(t).hostname)) return erro('Use o link do canal do WhatsApp (whatsapp.com).');
      if (nome === 'linkCanalTelegram' && !/^(t\.me|telegram\.me)$/.test(new URL(t).hostname)) return erro('Use o link do canal do Telegram (t.me).');
      return { ok: true, valor: t };
    }
    case 'artes': {
      const n = numero(valor);
      return n !== null && Number.isInteger(n) && n >= 3 && n <= 5 ? { ok: true, valor: n } : erro('De 3 a 5 artes por dia.');
    }
    case 'temas': {
      const validos = TEMAS_NIVEL2.map((t) => t.id as string);
      if (!Array.isArray(valor) || valor.some((t) => !validos.includes(t))) return erro('Tema desconhecido.');
      return { ok: true, valor: validos.filter((t) => valor.includes(t)) };
    }
    case 'numero': {
      const n = numero(valor);
      return n !== null && n > 0 ? { ok: true, valor: n } : erro('Informe um número maior que zero.');
    }
    case 'numeroOuVazio': {
      if (valor === null || valor === '') return { ok: true, valor: null };
      const n = numero(valor);
      return n !== null && n >= 0 ? { ok: true, valor: n } : erro('Informe um número ou deixe em branco.');
    }
    case 'fracao': {
      const n = numero(valor);
      return n !== null && n > 0 && n < 1 ? { ok: true, valor: n } : erro('Informe uma porcentagem entre 0 e 100.');
    }
    case 'pesos': {
      const p = valor as Record<string, unknown> | null;
      if (!p || typeof p !== 'object') return erro('Pesos inválidos.');
      const out: Record<string, number> = {};
      for (const k of PESOS_NOTA) {
        const n = numero(p[k]);
        if (n === null || n < 0) return erro('Cada peso precisa ser um número de 0 a 100.');
        out[k] = n;
      }
      const soma = Object.values(out).reduce((a, b) => a + b, 0);
      return soma === 100 ? { ok: true, valor: out } : erro(`Os pesos somam ${soma}; precisam somar 100.`);
    }
    case 'booleano':
      return typeof valor === 'boolean' ? { ok: true, valor } : erro('Valor inválido.');
  }
}

/** Valida um nicho (nome e palavras-chave). Palavras repetidas ou vazias saem. */
export function validarNicho(nome: string, palavras: string): { ok: true; nome: string; palavras: string[] } | { ok: false; erro: string } {
  const n = nome.trim();
  if (n.length < 2) return { ok: false, erro: 'Dê um nome ao nicho.' };
  if (n.length > 60) return { ok: false, erro: 'Nome do nicho com até 60 caracteres.' };
  const vistos = new Set<string>();
  const lista: string[] = [];
  for (const p of palavras.split(/[,\n]/)) {
    const t = p.trim();
    const k = t.toLowerCase();
    if (t && !vistos.has(k)) {
      vistos.add(k);
      lista.push(t);
    }
  }
  if (lista.length === 0) return { ok: false, erro: 'Informe ao menos uma palavra-chave.' };
  return { ok: true, nome: n, palavras: lista };
}
