// F-09: prepara as artes do Status do dia. Chamada pelo painel (Lana ou Marcus logados).
// Corpo: { data?: 'AAAA-MM-DD', refazer?: boolean }.
import { clienteDoUsuario, clienteServico, env, json, preflight } from '../_shared/ambiente.ts';
import { gerarArtesDoDia } from '../_shared/arte/gerar.ts';
import { dataLocal } from '../_shared/core/formato.ts';

Deno.serve(async (req) => {
  const pf = preflight(req);
  if (pf) return pf;
  if (req.method !== 'POST') return json({ erro: 'use POST' }, 405);

  const { data: membro, error } = await clienteDoUsuario(req).rpc('e_membro');
  if (error || membro !== true) return json({ erro: 'só a equipe do painel pode preparar artes' }, 403);

  const siteUrl = env('PUBLIC_SITE_URL');
  if (!siteUrl) return json({ erro: 'PUBLIC_SITE_URL não configurado: o link de entrada do Status depende dele' }, 503);

  let corpo: { data?: unknown; refazer?: unknown } = {};
  try {
    corpo = await req.json();
  } catch {
    corpo = {};
  }
  const data = typeof corpo.data === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(corpo.data) ? corpo.data : dataLocal();

  try {
    const r = await gerarArtesDoDia(clienteServico(), { data, siteUrl, refazer: corpo.refazer === true });
    return json(r);
  } catch (e) {
    return json({ erro: (e as Error).message }, 500);
  }
});
