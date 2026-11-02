// Ajudantes de leitura e escrita para as telas. No modo local (sem Supabase) devolvem o valor vazio,
// para cada tela mostrar o seu estado vazio em palavras ("aguardando dados").
import { useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from './supabase';

export function useConsulta<T>(chave: QueryKey, buscar: (sb: SupabaseClient) => Promise<T>, vazio: T, opcoes?: { refetchInterval?: number }) {
  return useQuery({
    queryKey: chave,
    queryFn: async () => (supabase ? buscar(supabase) : vazio),
    refetchInterval: opcoes?.refetchInterval,
  });
}

/** Mutação que invalida as chaves informadas ao terminar. */
export function useAcao<A, R = void>(fazer: (sb: SupabaseClient, args: A) => Promise<R>, invalidar: QueryKey[] = []) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: A) => {
      if (!supabase) throw new Error('Supabase não configurado (modo local)');
      return fazer(supabase, args);
    },
    onSuccess: () => Promise.all(invalidar.map((k) => qc.invalidateQueries({ queryKey: k }))),
  });
}

/** Lança o erro do Supabase, se houver, e devolve os dados. */
export function ok<T>(r: { data: T; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message);
  return r.data;
}

/** Como `ok`, para listas: `null` vira `[]`. */
export function lista<T>(r: { data: T[] | null; error: { message: string } | null }): T[] {
  if (r.error) throw new Error(r.error.message);
  return r.data ?? [];
}
