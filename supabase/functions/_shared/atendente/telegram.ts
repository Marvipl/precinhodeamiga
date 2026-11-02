// Conversa privada com o bot do Telegram (seção 4.3): boas-vindas com aviso de privacidade, menu do nível 1,
// texto livre para a Atendente e comando para apagar os próprios dados.
// Registrado no roteador do webhook compartilhado (`_shared/telegram-webhook/tratadores.ts`).
import { MENU_BOT, TEXTO_FALAR_LANA, TEXTO_PEDIR_PRODUTO, preencher } from '../core/atendente/niveis.ts';
import { AVISO_PRIVACIDADE_BOT, BOAS_VINDAS_BOT, TEXTO_APAGADO, TEXTO_CONFIRMAR_APAGAR } from '../core/atendente/privacidade.ts';
import type { BotaoInline } from './bot.ts';
import { apagarContato, lerConfigAtendente, proximoBlocoTexto, receberMensagem, type Contato, type DepsAtendente } from './servico.ts';

type Update = Record<string, unknown>;

interface TgUser {
  id: number;
  is_bot?: boolean;
  first_name?: string;
  last_name?: string;
  username?: string;
}
interface TgMessage {
  message_id: number;
  from?: TgUser;
  chat: { id: number; type: string };
  text?: string;
}
interface TgCallback {
  id: string;
  from: TgUser;
  data?: string;
  message?: TgMessage;
}

export const TECLADO_MENU: BotaoInline[][] = MENU_BOT.map((b) => [{ texto: b.rotulo, dados: `menu:${b.id}` }]);
const TECLADO_APAGAR: BotaoInline[][] = [[{ texto: 'Sim, apagar meus dados', dados: 'apagar:sim' }], [{ texto: 'Não, manter', dados: 'apagar:nao' }]];

function nomeExibido(u: TgUser): string {
  return [u.first_name, u.last_name].filter(Boolean).join(' ').slice(0, 80) || (u.username ? `@${u.username}` : 'Sem nome');
}

async function contatoDoTelegram(deps: DepsAtendente, u: TgUser, chatId: number): Promise<Contato> {
  const { db } = deps;
  const achado = await db.from('contatos').select('id, origem, telegram_chat_id, preferencia, whatsapp, aguardando, ultimo_aviso_em').eq('telegram_user_id', u.id).maybeSingle();
  if (achado.error) throw new Error(achado.error.message);
  if (achado.data) {
    if (achado.data.telegram_chat_id !== chatId) await db.from('contatos').update({ telegram_chat_id: chatId, nome_exibido: nomeExibido(u) }).eq('id', achado.data.id);
    return { ...(achado.data as Contato), telegram_chat_id: chatId };
  }
  const novo = await db
    .from('contatos')
    .insert({ origem: 'telegram', telegram_user_id: u.id, telegram_chat_id: chatId, nome_exibido: nomeExibido(u), preferencia: 'telegram' })
    .select('id, origem, telegram_chat_id, preferencia, whatsapp, aguardando, ultimo_aviso_em')
    .single();
  if (novo.error) throw new Error(novo.error.message);
  return novo.data as Contato;
}

async function contatoExistente(deps: DepsAtendente, userId: number) {
  const r = await deps.db.from('contatos').select('id').eq('telegram_user_id', userId).maybeSingle();
  if (r.error) throw new Error(r.error.message);
  return r.data as { id: string } | null;
}

/** Trata `message` e `callback_query` de conversas privadas. Grupos e canais são ignorados aqui. */
export async function tratarUpdateAtendente(update: Update, deps: DepsAtendente): Promise<void> {
  if (update.callback_query) return tratarCallback(update.callback_query as TgCallback, deps);
  const msg = update.message as TgMessage | undefined;
  if (!msg || msg.chat?.type !== 'private' || !msg.from || msg.from.is_bot) return;
  const chatId = msg.chat.id;
  const texto = (msg.text ?? '').trim();

  if (!texto) {
    await deps.bot.enviar(chatId, 'Por enquanto eu só leio texto. Pode escrever sua dúvida ou pedido?', TECLADO_MENU);
    return;
  }
  if (/^\/start\b/.test(texto) || /^\/menu\b/.test(texto)) {
    await deps.bot.enviar(chatId, `${BOAS_VINDAS_BOT}\n\n${AVISO_PRIVACIDADE_BOT}`, TECLADO_MENU);
    return;
  }
  if (/^\/(apagar|apagar_dados|excluir)\b/.test(texto)) {
    const c = await contatoExistente(deps, msg.from.id);
    if (!c) {
      await deps.bot.enviar(chatId, 'Não tenho nenhum dado seu guardado.');
      return;
    }
    await deps.bot.enviar(chatId, TEXTO_CONFIRMAR_APAGAR, TECLADO_APAGAR);
    return;
  }
  if (/^\/privacidade\b/.test(texto)) {
    await deps.bot.enviar(chatId, AVISO_PRIVACIDADE_BOT);
    return;
  }

  const contato = await contatoDoTelegram(deps, msg.from, chatId);
  const r = await receberMensagem(deps, { contato, texto: texto.slice(0, 4000) });
  for (const t of r.respostas) await deps.bot.enviar(chatId, t, r.nivel === 1 ? TECLADO_MENU : undefined);
}

async function tratarCallback(cb: TgCallback, deps: DepsAtendente) {
  await deps.bot.responderCallback(cb.id);
  const chatId = cb.message?.chat.id;
  if (!chatId || cb.message?.chat.type !== 'private') return;
  const dados = cb.data ?? '';
  const agora = deps.agora?.() ?? new Date();

  if (dados === 'apagar:sim') {
    const c = await contatoExistente(deps, cb.from.id);
    if (c) await apagarContato(deps.db, c.id);
    await deps.bot.enviar(chatId, TEXTO_APAGADO);
    return;
  }
  if (dados === 'apagar:nao') {
    await deps.bot.enviar(chatId, 'Tudo certo, seus dados continuam guardados pelo prazo do aviso de privacidade.');
    return;
  }
  if (!dados.startsWith('menu:')) return;
  const opcao = dados.slice(5);
  const conf = await lerConfigAtendente(deps.db);
  const bloco = proximoBlocoTexto(conf, agora);
  const contato = await contatoDoTelegram(deps, cb.from, chatId);

  if (opcao === 'pedido') {
    await deps.db.from('contatos').update({ aguardando: 'pedido' }).eq('id', contato.id);
    await deps.bot.enviar(chatId, preencher(TEXTO_PEDIR_PRODUTO, { proximo_bloco: bloco }));
    return;
  }
  if (opcao === 'falar_lana') {
    // Pedido explícito para falar com a Lana: entra na caixa como mensagem esperando por ela.
    await receberMensagem(deps, { contato: { ...contato, ultimo_aviso_em: agora.toISOString() }, texto: 'Quero falar com a Lana.' });
    await deps.bot.enviar(chatId, preencher(TEXTO_FALAR_LANA, { proximo_bloco: bloco }));
    return;
  }
  const rotulo = MENU_BOT.find((b) => b.id === opcao)?.rotulo;
  if (!rotulo) return;
  const r = await receberMensagem(deps, { contato, texto: rotulo, categoriaMenu: opcao });
  for (const t of r.respostas) await deps.bot.enviar(chatId, t, TECLADO_MENU);
}
