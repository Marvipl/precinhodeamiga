// Envia as notificações vencidas (F-15). Chamada pelo pg_cron a cada minuto com a chave de serviço.
// NOTIFICACOES_MODO=real liga os envios de verdade; sem isso (padrão) tudo é simulado e só registrado.
import { clienteServico, env, exigirServico, json, preflight } from '../_shared/ambiente.ts';
import { despachar, enviadoresSimulados, type EnviadorPush } from '../_shared/notificacoes/despachar.ts';
import { StoreNotificacoesSupabase } from '../_shared/notificacoes/store-supabase.ts';
import { enviarPush } from '../_shared/notificacoes/webpush.ts';
import { enviadorTelegramReal } from '../_shared/notificacoes/telegram.ts';

Deno.serve(async (req) => {
  const pf = preflight(req);
  if (pf) return pf;
  const negado = exigirServico(req);
  if (negado) return negado;

  const real = env('NOTIFICACOES_MODO') === 'real';
  const simulados = enviadoresSimulados();
  const pub = env('VAPID_PUBLIC_KEY');
  const priv = env('VAPID_PRIVATE_KEY');
  const assunto = env('VAPID_SUBJECT');
  const token = env('TELEGRAM_BOT_TOKEN');

  const push: EnviadorPush | null = !real
    ? simulados.push
    : pub && priv && assunto
      ? { enviar: (insc, payload, op) => enviarPush(insc, payload, { publica: pub, privada: priv, assunto }, { urgencia: op.urgencia }) }
      : null;
  const telegram = !real ? simulados.telegram : token ? enviadorTelegramReal(token) : null;

  const resumo = await despachar({
    store: new StoreNotificacoesSupabase(clienteServico()),
    push,
    telegram,
    telegramChatLana: env('TELEGRAM_LANA_CHAT_ID') ?? (real ? null : 'simulado'),
    urlSite: env('PUBLIC_SITE_URL'),
  });
  return json({ modo: real ? 'real' : 'simulado', ...resumo });
});
