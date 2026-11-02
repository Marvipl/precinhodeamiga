import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { BotFalso } from './bot.ts';
import { linksSimulados } from './links.ts';
import { tratarUpdateAtendente } from './telegram.ts';
import { rotear, tipoDoUpdate } from '../telegram-webhook/roteador.ts';
import { TRATADORES } from '../telegram-webhook/tratadores.ts';

// Banco que falha se for tocado: /start e mensagens de grupo não gravam nada.
const semBanco = new Proxy({}, { get: () => { throw new Error('banco não deveria ser usado'); } }) as unknown as SupabaseClient;

describe('webhook do Telegram', () => {
  it('identifica o tipo do update', () => {
    expect(tipoDoUpdate({ update_id: 1, message: { text: 'oi' } })).toBe('message');
    expect(tipoDoUpdate({ update_id: 1, callback_query: { id: 'x' } })).toBe('callback_query');
    expect(tipoDoUpdate({ update_id: 1, chat_member: {} })).toBe('chat_member');
    expect(tipoDoUpdate({ update_id: 1 })).toBeNull();
  });
  it('a Atendente atende message e callback_query', () => {
    expect(TRATADORES.message).toBeTypeOf('function');
    expect(TRATADORES.callback_query).toBeTypeOf('function');
  });
  it('tipo sem tratador não faz nada', async () => {
    expect(await rotear({ update_id: 1, edited_message: {} }, { db: semBanco, env: () => undefined }, {})).toEqual({ tipo: null, tratado: false });
  });
});

describe('conversa privada com o bot', () => {
  const msg = (text: string, type = 'private') => ({ update_id: 1, message: { message_id: 1, from: { id: 9, first_name: 'Pessoa' }, chat: { id: 9, type }, text } });

  it('/start manda boas-vindas, aviso de privacidade e o menu do nível 1', async () => {
    const bot = new BotFalso();
    await tratarUpdateAtendente(msg('/start'), { db: semBanco, bot, links: linksSimulados });
    expect(bot.chamadas).toHaveLength(1);
    const texto = String(bot.chamadas[0].corpo.text);
    expect(texto).toContain('não sou a Lana');
    expect(texto).toContain('/apagar');
    const botoes = (bot.chamadas[0].corpo.botoes as Array<Array<{ dados: string }>>).flat().map((b) => b.dados);
    expect(botoes).toEqual(['menu:cupom', 'menu:link', 'menu:como_funciona', 'menu:oferta_vale', 'menu:entrega', 'menu:pedido', 'menu:falar_lana']);
  });

  it('ignora grupos e canais', async () => {
    const bot = new BotFalso();
    await tratarUpdateAtendente(msg('oi', 'group'), { db: semBanco, bot, links: linksSimulados });
    await tratarUpdateAtendente(msg('oi', 'channel'), { db: semBanco, bot, links: linksSimulados });
    expect(bot.chamadas).toHaveLength(0);
  });
});
