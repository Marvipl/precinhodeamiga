// Normalização de texto usada pelas regras da Atendente (seção 5.13). Código puro.

/** Minúsculas, sem acentos, só letras/números/espaço simples. */
export function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9$,.\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Números citados no texto (ex.: "30 cm" -> "30"; "1,5 m" -> "1,5"). */
export function numeros(texto: string): string[] {
  return (texto.match(/\d+(?:[.,]\d+)?/g) ?? []).map((n) => n.replace('.', ','));
}

/** Escapa um trecho para uso dentro de uma expressão regular. */
export function escaparRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
