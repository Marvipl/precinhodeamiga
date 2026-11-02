// Tratadores do webhook do Telegram, por tipo de update. Cada pacote acrescenta a sua linha:
// Audiência (chat_member); Atendente (message, callback_query).
import type { TipoUpdate, Tratador } from './roteador.ts';
import { tratarMembroCanal } from '../audiencia/telegram.ts';

export const TRATADORES: Partial<Record<TipoUpdate, Tratador>> = {
  chat_member: tratarMembroCanal,
};
