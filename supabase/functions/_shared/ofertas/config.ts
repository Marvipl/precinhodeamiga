// Configuração vigente lida pelas Edge Functions (valores iniciais do código + o que foi salvo).
import type { SupabaseClient } from '@supabase/supabase-js';
import { resolverConfig, type ConfigResolvida } from '../core/config.ts';

export async function lerConfigServidor(db: SupabaseClient): Promise<ConfigResolvida> {
  const r = await db.from('configuracoes').select('chave, valor');
  if (r.error) throw new Error(`configuracoes: ${r.error.message}`);
  return resolverConfig((r.data ?? []) as { chave: string; valor: unknown }[]);
}
