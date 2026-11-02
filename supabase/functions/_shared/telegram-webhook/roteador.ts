// Webhook único do bot do Telegram: roteia cada update para o tratador do seu tipo. Sem Deno.*: testável no Node.
import type { SupabaseClient } from '@supabase/supabase-js';

export interface DepsWebhook {
  db: SupabaseClient;
  env: (nome: string) => string | undefined;
}

export type Tratador = (update: Record<string, unknown>, deps: DepsWebhook) => Promise<void>;

export type TipoUpdate = 'chat_member' | 'my_chat_member' | 'message' | 'callback_query';

const TIPOS: TipoUpdate[] = ['chat_member', 'my_chat_member', 'message', 'callback_query'];

export function tipoDoUpdate(update: Record<string, unknown>): TipoUpdate | null {
  return TIPOS.find((t) => update[t] !== undefined) ?? null;
}

/** Despacha o update. Tipo sem tratador é ignorado (o Telegram recebe 200 e não reenvia). */
export async function rotear(
  update: Record<string, unknown>,
  deps: DepsWebhook,
  tratadores: Partial<Record<TipoUpdate, Tratador>>,
): Promise<{ tipo: TipoUpdate | null; tratado: boolean }> {
  const tipo = tipoDoUpdate(update);
  const t = tipo ? tratadores[tipo] : undefined;
  if (!t) return { tipo, tratado: false };
  await t(update, deps);
  return { tipo, tratado: true };
}
