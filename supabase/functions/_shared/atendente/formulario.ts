// Formulário público: grava contato e mensagem e devolve o que mostrar na hora.
import { formularioFale } from '../core/atendente/formulario.ts';
import { gerarNonce, hashNonce } from '../core/jobs.ts';
import { apagarContato, receberMensagem, type Contato, type DepsAtendente } from './servico.ts';

type Resultado = { ok: true; corpo: Record<string, unknown> } | { ok: false; status: 400 | 404; motivo: string };

export async function enviarFormulario(deps: DepsAtendente, corpo: unknown): Promise<Resultado> {
  const v = formularioFale.safeParse(corpo);
  if (!v.success) return { ok: false, status: 400, motivo: v.error.issues[0]?.message ?? 'Confira os campos.' };
  const f = v.data;
  // Robô preencheu o campo isca: finge que deu certo e não guarda nada.
  if (f.site) return { ok: true, corpo: { recebido: true, respostas: [] } };
  const agora = (deps.agora?.() ?? new Date()).toISOString();
  const token = gerarNonce();
  const whats = f.preferencia === 'whatsapp';
  const c = await deps.db
    .from('contatos')
    .insert({
      origem: 'formulario',
      primeiro_nome: f.primeiro_nome || null,
      preferencia: f.preferencia,
      whatsapp: whats ? f.whatsapp!.replace(/\D/g, '') : null,
      consentimento_whatsapp_em: whats ? agora : null,
      token_exclusao_hash: await hashNonce(token),
    })
    .select('id, origem, telegram_chat_id, preferencia, whatsapp, aguardando, ultimo_aviso_em')
    .single();
  if (c.error) throw new Error(c.error.message);
  const r = await receberMensagem(deps, { contato: c.data as Contato, texto: f.texto, preco_max: f.preco_max ?? null });
  return { ok: true, corpo: { recebido: true, respostas: r.respostas, token_exclusao: token } };
}

export async function apagarFormulario(deps: DepsAtendente, corpo: Record<string, unknown>): Promise<Resultado> {
  const token = typeof corpo.token === 'string' ? corpo.token.trim() : '';
  if (token.length < 20 || token.length > 100) return { ok: false, status: 400, motivo: 'Link de exclusão inválido.' };
  const r = await deps.db.from('contatos').select('id').eq('token_exclusao_hash', await hashNonce(token)).maybeSingle();
  if (r.error) throw new Error(r.error.message);
  // Mesma resposta exista ou não, para não revelar se há dados.
  if (r.data) await apagarContato(deps.db, r.data.id);
  return { ok: true, corpo: { apagado: true } };
}
