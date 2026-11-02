// Acesso a variáveis de ambiente e utilitários HTTP das Edge Functions (Deno).
// Este arquivo usa Deno.*: não importe em código que roda no navegador ou nos testes.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { iguaisSeguro } from './core/jobs.ts';
import type { IdRotina } from './core/agentes.ts';
import { ROTINAS } from './core/agentes.ts';
import type { ModoAgentes, Credencial } from './jobs/runtime.ts';

export function env(nome: string): string | undefined {
  const v = Deno.env.get(nome);
  return v && v.length > 0 ? v : undefined;
}

export function envObrigatoria(nome: string): string {
  const v = env(nome);
  if (!v) throw new Error(`variável de ambiente ausente: ${nome}`);
  return v;
}

/** Cliente com a chave de serviço (ignora RLS). Só nas Edge Functions. */
export function clienteServico(): SupabaseClient {
  return createClient(envObrigatoria('SUPABASE_URL'), envObrigatoria('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Cliente com o login de quem chamou (respeita RLS). */
export function clienteDoUsuario(req: Request): SupabaseClient {
  return createClient(envObrigatoria('SUPABASE_URL'), envObrigatoria('SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Modo dos agentes. Padrão seguro: simulado. */
export function modoAgentes(): ModoAgentes {
  return env('AGENTES_MODO') === 'real' ? 'real' : 'simulado';
}

export function credencialRotina(rotina: IdRotina): Credencial | null {
  const s = ROTINAS[rotina].sufixoEnv;
  const id = env(`ROUTINE_${s}_ID`);
  const token = env(`ROUTINE_${s}_TOKEN`);
  return id && token ? { id, token } : null;
}

export function urlFuncao(nome: string): string {
  return `${envObrigatoria('SUPABASE_URL')}/functions/v1/${nome}`;
}

function bearer(req: Request): string {
  const h = req.headers.get('Authorization') ?? '';
  return h.startsWith('Bearer ') ? h.slice(7) : '';
}

/** Chamadas internas (pg_cron): exige a chave de serviço. */
export function exigirServico(req: Request): Response | null {
  const chave = env('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!chave || !iguaisSeguro(bearer(req), chave)) return json({ erro: 'não autorizado' }, 401);
  return null;
}

/** Retorno das rotinas: exige AGENT_CALLBACK_TOKEN (vem do segredo de rede do ambiente das rotinas). */
export function exigirTokenAgente(req: Request): Response | null {
  const t = env('AGENT_CALLBACK_TOKEN') ?? '';
  const recebido = bearer(req) || req.headers.get('x-agent-token') || '';
  if (!t || !iguaisSeguro(recebido, t)) return json({ erro: 'não autorizado' }, 401);
  return null;
}

export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

export function json(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), { status, headers: { ...CORS, 'content-type': 'application/json; charset=utf-8' } });
}

export function preflight(req: Request): Response | null {
  return req.method === 'OPTIONS' ? new Response('ok', { headers: CORS }) : null;
}
