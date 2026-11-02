// Lembrete no dia permitido (F-21): uma notificação por dia com os lugares liberados hoje. Chamado pelo pg_cron.
import { clienteServico, exigirServico, json } from '../_shared/ambiente.ts';
import { lembreteDoDia } from '../_shared/radar/lembrete.ts';

Deno.serve(async (req) => {
  const negado = exigirServico(req);
  if (negado) return negado;
  return json(await lembreteDoDia(clienteServico()));
});
