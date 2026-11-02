// Webhook único do bot do Telegram. Valida o segredo do cabeçalho e roteia por tipo de update.
// Nenhum caminho aqui envia mensagem ao WhatsApp.
import { clienteServico, env, json } from '../_shared/ambiente.ts';
import { iguaisSeguro } from '../_shared/core/jobs.ts';
import { rotear } from '../_shared/telegram-webhook/roteador.ts';
import { TRATADORES } from '../_shared/telegram-webhook/tratadores.ts';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ erro: 'método não permitido' }, 405);
  const segredo = env('TELEGRAM_WEBHOOK_SECRET') ?? '';
  const recebido = req.headers.get('x-telegram-bot-api-secret-token') ?? '';
  if (!segredo || !iguaisSeguro(recebido, segredo)) return json({ erro: 'não autorizado' }, 401);
  const update = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!update || typeof update !== 'object') return json({ erro: 'corpo inválido' }, 400);
  try {
    const r = await rotear(update, { db: clienteServico(), env }, TRATADORES);
    return json({ ok: true, ...r });
  } catch (e) {
    console.error('telegram-webhook', (e as Error).message);
    return json({ ok: false }, 500);
  }
});
