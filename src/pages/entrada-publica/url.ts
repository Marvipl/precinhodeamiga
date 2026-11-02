/** Endereço da função `entrada-clique`. `null` no modo local (Supabase não configurado). */
export function urlEntradaClique(): string | null {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  return url ? `${url.replace(/\/+$/, '')}/functions/v1/entrada-clique` : null;
}
