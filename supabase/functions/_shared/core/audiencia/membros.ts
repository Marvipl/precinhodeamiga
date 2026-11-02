// Interpreta o update `chat_member` do Telegram (seção 5.12): entrou ou saiu do canal.
// Código puro. Não guarda nada da pessoa: só o tipo do evento e o instante.

export interface MembroInterpretado {
  tipo: 'entrou' | 'saiu';
  em: Date;
  updateId: number | null;
}

interface ChatMemberStatus {
  status?: string;
  is_member?: boolean;
}

function ehMembro(m: ChatMemberStatus | undefined): boolean {
  if (!m?.status) return false;
  if (m.status === 'member' || m.status === 'administrator' || m.status === 'creator') return true;
  if (m.status === 'restricted') return m.is_member === true;
  return false; // left, kicked
}

/**
 * Devolve o evento quando o update é `chat_member` do canal configurado e muda a condição de membro.
 * `canalId` vem de TELEGRAM_CHANNEL_ID (número como texto, ex.: "-100..." ou "@nome").
 */
export function interpretarChatMember(update: Record<string, unknown>, canalId: string | undefined): MembroInterpretado | null {
  const cm = update.chat_member as
    | { chat?: { id?: number; username?: string }; date?: number; old_chat_member?: ChatMemberStatus; new_chat_member?: ChatMemberStatus }
    | undefined;
  if (!cm || !cm.chat) return null;
  if (canalId) {
    const porId = cm.chat.id !== undefined && String(cm.chat.id) === canalId;
    const porNome = cm.chat.username !== undefined && `@${cm.chat.username}`.toLowerCase() === canalId.toLowerCase();
    if (!porId && !porNome) return null;
  }
  const antes = ehMembro(cm.old_chat_member);
  const depois = ehMembro(cm.new_chat_member);
  if (antes === depois) return null;
  const em = typeof cm.date === 'number' ? new Date(cm.date * 1000) : new Date();
  const updateId = typeof update.update_id === 'number' ? update.update_id : null;
  return { tipo: depois ? 'entrou' : 'saiu', em, updateId };
}
