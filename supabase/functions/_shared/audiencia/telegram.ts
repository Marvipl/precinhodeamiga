// Audiência pelo bot do Telegram (seção 5.12): entradas e saídas (chat_member) e total diário de inscritos.
// Sem Deno.*: o ambiente entra por parâmetro.
import type { SupabaseClient } from '@supabase/supabase-js';
import { interpretarChatMember } from '../core/audiencia/membros.ts';
import { dataLocal } from '../core/formato.ts';


/** Grava a entrada ou saída de um membro do canal. Updates repetidos são ignorados (update_id único). */
export async function tratarMembroCanal(
  update: Record<string, unknown>,
  deps: { db: SupabaseClient; env: (nome: string) => string | undefined },
): Promise<void> {
  const ev = interpretarChatMember(update, deps.env('TELEGRAM_CHANNEL_ID'));
  if (!ev) return;
  const r = await deps.db
    .from('telegram_membros_eventos')
    .upsert({ tipo: ev.tipo, ocorrido_em: ev.em.toISOString(), update_id: ev.updateId }, { onConflict: 'update_id', ignoreDuplicates: true });
  if (r.error) throw new Error(r.error.message);
}

export type ResultadoContagem =
  | { resultado: 'gravado'; total: number; data: string }
  | { resultado: 'simulado'; motivo: string }
  | { resultado: 'erro'; motivo: string };

/**
 * Lê o total de inscritos (getChatMemberCount) e grava o registro do dia.
 * Sem token ou sem canal: modo simulado, não grava nada (nenhum número inventado).
 */
export async function contarInscritos(deps: {
  db: SupabaseClient;
  token?: string;
  canalId?: string;
  fetch?: typeof fetch;
  agora?: Date;
}): Promise<ResultadoContagem> {
  if (!deps.token || !deps.canalId) return { resultado: 'simulado', motivo: 'TELEGRAM_BOT_TOKEN ou TELEGRAM_CHANNEL_ID ausente' };
  const url = `https://api.telegram.org/bot${deps.token}/getChatMemberCount?chat_id=${encodeURIComponent(deps.canalId)}`;
  let corpo: { ok?: boolean; result?: unknown; description?: string };
  try {
    const resp = await (deps.fetch ?? fetch)(url);
    corpo = (await resp.json()) as typeof corpo;
  } catch (e) {
    return { resultado: 'erro', motivo: `falha ao chamar o Telegram: ${(e as Error).message}` };
  }
  if (!corpo.ok || typeof corpo.result !== 'number' || !Number.isInteger(corpo.result) || corpo.result < 0) {
    return { resultado: 'erro', motivo: corpo.description ?? 'resposta inesperada do Telegram' };
  }
  const data = dataLocal(deps.agora ?? new Date());
  const r = await deps.db
    .from('seguidores_registros')
    .upsert({ canal: 'tg', data, total: corpo.result, fonte: 'bot' }, { onConflict: 'canal,data' });
  if (r.error) return { resultado: 'erro', motivo: r.error.message };
  return { resultado: 'gravado', total: corpo.result, data };
}
