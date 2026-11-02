// Leitura de números escritos no formato brasileiro ou internacional ("R$ 1.234,56", "1234.56", "12,5%").
// Código puro.

/** Converte texto em número. Devolve null se não houver número legível. */
export function lerNumero(texto: string | number | null | undefined): number | null {
  if (texto === null || texto === undefined) return null;
  if (typeof texto === 'number') return Number.isFinite(texto) ? texto : null;
  let s = texto.trim();
  if (!s) return null;
  const negativo = /^-|^\(.*\)$|-\s*R\$/.test(s);
  s = s.replace(/[^0-9.,]/g, '');
  if (!/[0-9]/.test(s)) return null;
  const ultVirgula = s.lastIndexOf(',');
  const ultPonto = s.lastIndexOf('.');
  if (ultVirgula >= 0 && ultPonto >= 0) {
    // O separador que aparece por último é o decimal.
    if (ultVirgula > ultPonto) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
  } else if (ultVirgula >= 0) {
    s = /^\d{1,3}(,\d{3}){2,}$/.test(s) ? s.replace(/,/g, '') : s.replace(/,/g, '.');
    if ((s.match(/\./g) ?? []).length > 1) return null;
  } else if (ultPonto >= 0) {
    // "1.234" e "1.234.567" são milhares; "12.5" é decimal.
    if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
    else if ((s.match(/\./g) ?? []).length > 1) return null;
  }
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return negativo ? -n : n;
}

/** Arredonda para centavos (evita somas como 0.1 + 0.2). */
export function centavos(n: number): number {
  return Math.round(n * 100) / 100;
}

export function soma(xs: readonly number[]): number {
  return centavos(xs.reduce((a, b) => a + b, 0));
}
