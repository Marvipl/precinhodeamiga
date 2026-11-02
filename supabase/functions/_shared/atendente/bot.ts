// Cliente mínimo do bot do Telegram para a conversa privada da Atendente.
// Só fala com chats privados de quem escreveu para o bot. Não existe aqui nenhum caminho para WhatsApp.
// Sem TELEGRAM_BOT_TOKEN, roda em modo simulado: registra a chamada e não envia nada.

export interface BotaoInline {
  texto: string;
  dados: string; // callback_data (até 64 bytes)
}

export interface Bot {
  readonly simulado: boolean;
  enviar(chatId: number, texto: string, botoes?: BotaoInline[][]): Promise<{ ok: boolean; message_id?: number; erro?: string }>;
  responderCallback(callbackId: string): Promise<void>;
}

export interface ChamadaRegistrada {
  metodo: string;
  corpo: Record<string, unknown>;
}

/** Bot falso que só registra as chamadas (testes e modo simulado). */
export class BotFalso implements Bot {
  readonly simulado = true;
  readonly chamadas: ChamadaRegistrada[] = [];
  async enviar(chatId: number, texto: string, botoes?: BotaoInline[][]) {
    this.chamadas.push({ metodo: 'sendMessage', corpo: { chat_id: chatId, text: texto, botoes } });
    return { ok: true, message_id: this.chamadas.length };
  }
  async responderCallback(callbackId: string) {
    this.chamadas.push({ metodo: 'answerCallbackQuery', corpo: { callback_query_id: callbackId } });
  }
}

export class BotTelegram implements Bot {
  readonly simulado = false;
  constructor(private token: string, private f: typeof fetch = fetch) {}

  private async chamar(metodo: string, corpo: Record<string, unknown>) {
    const r = await this.f(`https://api.telegram.org/bot${this.token}/${metodo}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(corpo),
    });
    return (await r.json().catch(() => ({ ok: false, description: `HTTP ${r.status}` }))) as {
      ok: boolean;
      result?: { message_id?: number };
      description?: string;
    };
  }

  async enviar(chatId: number, texto: string, botoes?: BotaoInline[][]) {
    if (chatId <= 0) return { ok: false, erro: 'a Atendente só responde em conversa privada' };
    const corpo: Record<string, unknown> = { chat_id: chatId, text: texto, disable_web_page_preview: true };
    if (botoes?.length) corpo.reply_markup = { inline_keyboard: botoes.map((l) => l.map((b) => ({ text: b.texto, callback_data: b.dados }))) };
    const r = await this.chamar('sendMessage', corpo);
    return r.ok ? { ok: true, message_id: r.result?.message_id } : { ok: false, erro: r.description ?? 'falha no envio' };
  }

  async responderCallback(callbackId: string) {
    await this.chamar('answerCallbackQuery', { callback_query_id: callbackId });
  }
}
