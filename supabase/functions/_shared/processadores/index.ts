// Registro dos processadores: gravam no banco a saída já validada de cada contrato.
// Para adicionar: crie `processadores/<nome>.ts` exportando uma fábrica `(db) => Processador`
// e acrescente uma linha em `processadoresPara`.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Processador } from '../jobs/runtime.ts';
import { processarPing } from './ping.ts';

export function processadoresPara(db: SupabaseClient): Record<string, Processador> {
  return {
    'ping/v1': processarPing(db),
  };
}
