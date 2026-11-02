import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/**
 * Cliente do painel (chave anônima + login; tudo passa por RLS).
 * `null` = modo local: o Supabase ainda não foi configurado. As telas mostram estados vazios.
 */
export const supabase: SupabaseClient | null =
  url && anon
    ? createClient(url, anon, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'precinho-auth' },
      })
    : null;

export const modoLocal = supabase === null;
