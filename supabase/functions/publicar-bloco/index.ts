// F-08: cron a cada minuto. Checagem 5 min antes, publica no Telegram, lembrete do WhatsApp, fim do bloco.
// Sem TELEGRAM_BOT_TOKEN/TELEGRAM_CHANNEL_ID usa o servidor falso (só registra). Nunca envia nada ao WhatsApp.
import { clienteServico, env, exigirServico, json } from '../_shared/ambiente.ts';
import { publicarBloco } from '../_shared/post/servico.ts';
import { PostStoreSupabase } from '../_shared/post/store-supabase.ts';
import { GeradorLinkIndisponivel } from '../_shared/post/links.ts';
import { TelegramBotApi, TelegramFalso } from '../_shared/telegram/cliente.ts';

Deno.serve(async (req) => {
  const negado = exigirServico(req);
  if (negado) return negado;
  const token = env('TELEGRAM_BOT_TOKEN');
  const canal = env('TELEGRAM_CHANNEL_ID');
  const telegram = token && canal && env('TELEGRAM_MODO') !== 'simulado' ? new TelegramBotApi(token, canal) : new TelegramFalso();
  try {
    const r = await publicarBloco({ store: new PostStoreSupabase(clienteServico()), links: new GeradorLinkIndisponivel(), telegram });
    return json({ telegram: telegram.simulado ? 'simulado' : 'real', ...r });
  } catch (e) {
    console.error(e);
    return json({ erro: e instanceof Error ? e.message : String(e) }, 500);
  }
});
