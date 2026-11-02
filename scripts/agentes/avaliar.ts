// Avaliações dos agentes (Anexo A.6): entradas fictícias com critérios verificáveis.
// Rodadas antes de trocar instrução ou modelo. No CI, rodam contra as respostas simuladas.
import type { Contrato } from '../../supabase/functions/_shared/core/contratos/index.ts';

export type Criterio =
  | { tipo: 'igualEntrada'; campo: string; campoEntrada: string }
  | { tipo: 'tamanhoMax'; campo: string; max: number }
  | { tipo: 'contem'; campo: string; texto: string }
  | { tipo: 'naoContem'; campo: string; texto: string }
  | { tipo: 'semPromessa'; campo: string }
  | { tipo: 'semEmoji'; campo: string }
  | { tipo: 'semNumeroInventado'; campo: string }
  | { tipo: 'maxItens'; campo: string; max: number }
  | { tipo: 'minItens'; campo: string; min: number };

export interface Caso {
  nome: string;
  entrada: unknown;
  criterios: Criterio[];
}

export interface ArquivoAvaliacao {
  contrato: string;
  descricao?: string;
  casos: Caso[];
}

export interface ResultadoCaso {
  contrato: string;
  caso: string;
  falhas: string[];
}

/** Promessas que o anúncio não sustenta (seção 5.3). Lista inicial para as avaliações; a revisão real é da Guardiã. */
export const PROMESSAS_PROIBIDAS = [
  'menor preço',
  'mais barato',
  'garantido',
  'garantida',
  'imperdível',
  'última chance',
  'últimas unidades',
  'só hoje',
  'corre',
  'não perca',
  'melhor do brasil',
  'melhor preço',
  '100%',
] as const;

const EMOJI = /\p{Extended_Pictographic}/u;

/** Coleta os valores de um caminho como `ofertas[].frase` ou `resumo`. */
export function valoresNoCaminho(raiz: unknown, caminho: string): unknown[] {
  let atuais: unknown[] = [raiz];
  for (const parte of caminho.split('.')) {
    const lista = parte.endsWith('[]');
    const chave = lista ? parte.slice(0, -2) : parte;
    const prox: unknown[] = [];
    for (const v of atuais) {
      if (v === null || typeof v !== 'object') continue;
      const x = chave === '' ? v : (v as Record<string, unknown>)[chave];
      if (x === undefined) continue;
      if (lista) {
        if (Array.isArray(x)) prox.push(...x);
      } else prox.push(x);
    }
    atuais = prox;
  }
  return atuais;
}

function textos(raiz: unknown, caminho: string): string[] {
  return valoresNoCaminho(raiz, caminho).filter((v): v is string => typeof v === 'string');
}

function normalizar(s: string): string {
  return s.toLocaleLowerCase('pt-BR').normalize('NFC');
}

/** Números escritos no texto (ex.: "1.234,56", "22%", "120"), normalizados para comparação. */
export function numerosDoTexto(s: string): string[] {
  const achados = s.match(/\d+(?:[.,]\d+)*/g) ?? [];
  return achados.map(normalizarNumero);
}

function normalizarNumero(n: string): string {
  // "1.234,56" -> "1234.56"; "1,5" -> "1.5"; "1.234" -> "1234"; "3.5" -> "3.5"
  let x = n;
  if (x.includes(',')) x = x.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(x)) x = x.replace(/\./g, '');
  const num = Number(x);
  return Number.isFinite(num) ? String(num) : x;
}

/** Todos os números que aparecem na entrada (valores numéricos e números dentro de textos). */
export function numerosDaEntrada(entrada: unknown): Set<string> {
  const out = new Set<string>();
  const visitar = (v: unknown): void => {
    if (typeof v === 'number') out.add(String(v));
    else if (typeof v === 'string') numerosDoTexto(v).forEach((n) => out.add(n));
    else if (Array.isArray(v)) v.forEach(visitar);
    else if (v && typeof v === 'object') Object.values(v).forEach(visitar);
  };
  visitar(entrada);
  return out;
}

export function checarCriterio(cr: Criterio, entrada: unknown, saida: unknown): string[] {
  switch (cr.tipo) {
    case 'igualEntrada': {
      const a = valoresNoCaminho(saida, cr.campo);
      const b = valoresNoCaminho(entrada, cr.campoEntrada);
      return JSON.stringify(a) === JSON.stringify(b) ? [] : [`${cr.campo} deveria ser igual a entrada.${cr.campoEntrada}`];
    }
    case 'tamanhoMax':
      return textos(saida, cr.campo)
        .filter((t) => [...t].length > cr.max)
        .map((t) => `${cr.campo} passa de ${cr.max} caracteres: "${t.slice(0, 60)}"`);
    case 'contem': {
      const ts = textos(saida, cr.campo);
      if (ts.length === 0) return [`${cr.campo} ausente`];
      return ts.filter((t) => !t.includes(cr.texto)).map(() => `${cr.campo} sem "${cr.texto}"`);
    }
    case 'naoContem':
      return textos(saida, cr.campo)
        .filter((t) => normalizar(t).includes(normalizar(cr.texto)))
        .map(() => `${cr.campo} contém "${cr.texto}"`);
    case 'semPromessa': {
      const falhas: string[] = [];
      for (const t of textos(saida, cr.campo)) {
        const n = normalizar(t);
        for (const p of PROMESSAS_PROIBIDAS) {
          const re = new RegExp(`(^|[^\\p{L}])${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^\\p{L}])`, 'u');
          if (re.test(n)) falhas.push(`${cr.campo} tem promessa "${p}"`);
        }
      }
      return falhas;
    }
    case 'semEmoji':
      return textos(saida, cr.campo)
        .filter((t) => EMOJI.test(t))
        .map(() => `${cr.campo} tem emoji`);
    case 'semNumeroInventado': {
      const permitidos = numerosDaEntrada(entrada);
      const falhas: string[] = [];
      for (const t of textos(saida, cr.campo)) {
        for (const n of numerosDoTexto(t)) if (!permitidos.has(n)) falhas.push(`${cr.campo} tem número que não está na entrada: ${n}`);
      }
      return falhas;
    }
    case 'maxItens': {
      const v = valoresNoCaminho(saida, cr.campo)[0];
      return Array.isArray(v) && v.length > cr.max ? [`${cr.campo} tem ${v.length} itens (máximo ${cr.max})`] : [];
    }
    case 'minItens': {
      const v = valoresNoCaminho(saida, cr.campo)[0];
      return !Array.isArray(v) || v.length < cr.min ? [`${cr.campo} tem menos de ${cr.min} itens`] : [];
    }
  }
}

/**
 * Avalia um caso: a entrada precisa estar no contrato, a saída precisa estar no contrato
 * (mesmo esquema do endpoint de retorno) e cumprir cada critério.
 */
export function avaliarCaso(c: Contrato, caso: Caso, saida: unknown): ResultadoCaso {
  const falhas: string[] = [];
  const e = c.entrada.safeParse(caso.entrada);
  if (!e.success) falhas.push(`entrada do caso fora do contrato: ${e.error.issues.map((i) => i.path.join('.') + ' ' + i.message).join('; ')}`);
  const s = c.saida.safeParse(saida);
  if (!s.success) falhas.push(`saída fora do contrato: ${s.error.issues.map((i) => i.path.join('.') + ' ' + i.message).join('; ')}`);
  else for (const cr of caso.criterios) falhas.push(...checarCriterio(cr, caso.entrada, s.data));
  return { contrato: c.id, caso: caso.nome, falhas };
}
