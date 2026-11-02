// Registro dos contratos de saída dos agentes (Anexo A.4, passo 5; A.5).
// Cada contrato define: rotina, esquema da saída (zod) e a resposta simulada (modo AGENTES_MODO=simulado).
// A resposta simulada usa só dados fictícios e deixa isso claro no texto.
//
// Para adicionar um contrato: crie `core/contratos/<nome>.ts` exportando um `Contrato`
// e acrescente-o à lista CONTRATOS abaixo (uma linha). O processador que grava o resultado
// no banco fica em `_shared/processadores/<nome>.ts`.

import type { z } from 'zod';
import type { IdRotina } from '../agentes.ts';
import { ping } from './ping.ts';
import { redacaoExtra } from './redacao-extra.ts';
import { coach } from './coach.ts';

export interface Contrato<E = unknown, S = unknown> {
  id: string; // ex.: 'curadoria/v1'
  rotina: IdRotina;
  descricao: string;
  entrada: z.ZodType<E>;
  saida: z.ZodType<S>;
  /** Resposta pré-gravada usada no modo simulado. Deve depender só da entrada (determinística). */
  simular: (entrada: E) => S;
}

// deno-lint-ignore no-explicit-any
export const CONTRATOS: Contrato<any, any>[] = [
  ping,
  redacaoExtra,
  coach,
];

export function contrato(id: string): Contrato | undefined {
  return CONTRATOS.find((c) => c.id === id);
}
