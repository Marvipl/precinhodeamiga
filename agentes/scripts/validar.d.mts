export function validar(esquema: unknown, valor: unknown): string[];
export function validarContra(contratoJson: Record<string, unknown>, valor: unknown, parte?: 'entrada' | 'saida'): string[];
