// Calculadora "Quanto preciso vender?" (seção 5.10). Código puro.
// Vendas atribuídas necessárias = comissão bruta desejada ÷ comissão média. Mês de 30 dias. Antes das retenções.

export const CALC_PADRAO = { desejada: 1000, mediaPct: 8 } as const;
export const CALC_FAIXA_MEDIA = { min: 3, max: 30 } as const;

export function vendasNecessarias(desejada: number, mediaFracao: number): { mes: number; dia: number } | null {
  if (!Number.isFinite(desejada) || !Number.isFinite(mediaFracao) || desejada <= 0 || mediaFracao <= 0) return null;
  const mes = desejada / mediaFracao;
  return { mes: Math.round(mes * 100) / 100, dia: Math.round((mes / 30) * 100) / 100 };
}
