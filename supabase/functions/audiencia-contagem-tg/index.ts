// Contagem diária de inscritos do canal do Telegram (pg_cron, 23:50 de Brasília). Só com a chave de serviço.
import { clienteServico, env, exigirServico, json } from '../_shared/ambiente.ts';
import { contarInscritos } from '../_shared/audiencia/telegram.ts';

Deno.serve(async (req) => {
  const negado = exigirServico(req);
  if (negado) return negado;
  const r = await contarInscritos({ db: clienteServico(), token: env('TELEGRAM_BOT_TOKEN'), canalId: env('TELEGRAM_CHANNEL_ID') });
  return json(r, r.resultado === 'erro' ? 502 : 200);
});
