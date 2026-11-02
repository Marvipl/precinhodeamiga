// F-14: diz ao dono se cada segredo das integrações existe. Nunca devolve o valor.
import { clienteDoUsuario, env, json, modoAgentes, preflight } from '../_shared/ambiente.ts';
import { estadoIntegracoes, type RespostaIntegracoes } from '../_shared/core/integracoes.ts';

Deno.serve(async (req) => {
  const pf = preflight(req);
  if (pf) return pf;
  const { data: dono, error } = await clienteDoUsuario(req).rpc('e_dono');
  if (error || dono !== true) return json({ erro: 'só o dono vê o estado das integrações' }, 403);
  const corpo: RespostaIntegracoes = {
    integracoes: estadoIntegracoes((nome) => env(nome) !== undefined),
    modoAgentes: modoAgentes(),
  };
  return json(corpo);
});
