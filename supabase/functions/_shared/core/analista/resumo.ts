// Resumo semanal da Analista (seção 5.17): o texto é escrito por IA a partir dos números calculados.
// Uma checagem em código recusa o texto se ele tiver qualquer número que não esteja nos dados de entrada.
// Código puro.

import { lerNumero } from './numeros.ts';

/** Números escritos num texto ("R$ 1.234,56", "12,5%", "2/12", "2026-11-09" viram 1234.56, 12.5, 2, 12, 2026, 11, 9). */
export function numerosDoTexto(texto: string): number[] {
  const out: number[] = [];
  for (const m of texto.matchAll(/\d+(?:[.,]\d+)*/g)) {
    const n = lerNumero(m[0]);
    if (n !== null) out.push(n);
  }
  return out;
}

function textosDe(v: unknown, acc: string[] = []): string[] {
  if (typeof v === 'string') acc.push(v);
  else if (typeof v === 'number') acc.push(String(v).replace('.', ','));
  else if (Array.isArray(v)) v.forEach((x) => textosDe(x, acc));
  else if (v && typeof v === 'object') Object.values(v).forEach((x) => textosDe(x, acc));
  return acc;
}

const chave = (n: number) => n.toFixed(6);

/** Confere que todo número do texto aparece nos dados de entrada (em qualquer campo). */
export function checarNumeros(texto: string, entrada: unknown): { ok: boolean; desconhecidos: number[] } {
  const permitidos = new Set(textosDe(entrada).flatMap(numerosDoTexto).map(chave));
  const desconhecidos = [...new Set(numerosDoTexto(texto).filter((n) => !permitidos.has(chave(n))))];
  return { ok: desconhecidos.length === 0, desconhecidos };
}

export interface NumeroResumo {
  rotulo: string;
  valor: string; // já formatado ("R$ 1.234,56", "3,2%", "aguardando dados")
}
