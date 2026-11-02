// Tratadores do webhook do Telegram, por tipo de update. Cada pacote acrescenta a sua linha:
// Audiência (chat_member); Atendente (message, callback_query).
import type { TipoUpdate, Tratador } from './roteador.ts';
import { tratarMembroCanal } from '../audiencia/telegram.ts';
import { tratarUpdateAtendente } from '../atendente/telegram.ts';
import { depsAtendente } from '../atendente/deps.ts';

const atendente: Tratador = (u, d) => tratarUpdateAtendente(u, depsAtendente(d.db, d.env));

export const TRATADORES: Partial<Record<TipoUpdate, Tratador>> = {
  chat_member: tratarMembroCanal,
  message: atendente,
  callback_query: atendente,
};
