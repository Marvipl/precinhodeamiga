// Formulário público "Fale com a Precinho" (/fale): recebe a mensagem e apaga os dados a pedido.
// Sem login: valida o próprio corpo. Não guarda IP nem cookie.
import { clienteServico, env, json, preflight } from '../_shared/ambiente.ts';
import { depsAtendente } from '../_shared/atendente/deps.ts';
import { apagarFormulario, enviarFormulario } from '../_shared/atendente/formulario.ts';

Deno.serve(async (req) => {
  const pf = preflight(req);
  if (pf) return pf;
  if (req.method !== 'POST') return json({ erro: 'use POST' }, 405);
  const corpo = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!corpo) return json({ erro: 'pedido inválido' }, 400);
  const deps = depsAtendente(clienteServico(), env);
  const r = corpo.acao === 'apagar' ? await apagarFormulario(deps, corpo) : await enviarFormulario(deps, corpo);
  return r.ok ? json(r.corpo) : json({ erro: r.motivo }, r.status);
});
