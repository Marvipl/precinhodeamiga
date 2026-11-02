// Monta as dependências da Atendente a partir do ambiente (sem Deno.*: o leitor de ambiente entra por parâmetro).
import type { SupabaseClient } from '@supabase/supabase-js';
import { BotFalso, BotTelegram } from './bot.ts';
import { geradorLinksAtendente } from './links.ts';
import { GeradorLinkSimulado, geradorLinkPara } from '../post/links.ts';
import type { DepsAtendente } from './servico.ts';

export type LerEnv = (nome: string) => string | undefined;

export function depsAtendente(db: SupabaseClient, env: LerEnv): DepsAtendente {
  const token = env('TELEGRAM_BOT_TOKEN');
  return {
    db,
    bot: token ? new BotTelegram(token) : new BotFalso(),
    // Com as chaves da Shopee: link curto real com sub1=at. Sem elas: link fictício (modo simulado, bot falso).
    links: geradorLinksAtendente(
      db,
      geradorLinkPara(
        { SHOPEE_MODO: env('SHOPEE_MODO'), SHOPEE_AFFILIATE_APP_ID: env('SHOPEE_AFFILIATE_APP_ID'), SHOPEE_AFFILIATE_APP_SECRET: env('SHOPEE_AFFILIATE_APP_SECRET') },
        new GeradorLinkSimulado(),
      ),
    ),
  };
}

/** Leitor de ambiente para quem não recebe `env` por parâmetro (processadores). Fora do Deno devolve nada. */
export const envDoAmbiente: LerEnv = (nome) => {
  const d = (globalThis as { Deno?: { env: { get(n: string): string | undefined } } }).Deno;
  const v = d?.env.get(nome);
  return v && v.length > 0 ? v : undefined;
};
