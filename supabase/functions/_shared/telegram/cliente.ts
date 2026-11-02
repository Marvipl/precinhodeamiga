// Cliente da Bot API do Telegram (publicação no canal e mensagens para a Lana) e servidor falso.
// Sem Deno.*: roda no Deno (Edge Functions) e no Node (testes). O token vem de quem constrói.
// Nunca existe cliente equivalente para o WhatsApp (seção 5.1, item 2).

export interface PublicacaoTelegram {
  /** Texto já no formato HTML do bot (core/post/formato.ts). */
  texto: string;
  fotoUrl?: string | null;
}

export interface ClienteTelegram {
  readonly simulado: boolean;
  publicarNoCanal(p: PublicacaoTelegram): Promise<{ message_id: number }>;
  enviarMensagem(chatId: string, textoHtml: string): Promise<{ message_id: number }>;
}

/** Legenda de foto tem limite de 1.024 caracteres na Bot API; acima disso sai como mensagem de texto. */
export const LIMITE_LEGENDA = 1024;

type Fetch = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export class TelegramBotApi implements ClienteTelegram {
  readonly simulado = false;
  constructor(
    private token: string,
    private canalId: string,
    private fetchFn: Fetch = (u, i) => fetch(u, i),
    private base = 'https://api.telegram.org',
  ) {}

  private async chamar(metodo: string, corpo: Record<string, unknown>): Promise<{ message_id: number }> {
    const r = await this.fetchFn(`${this.base}/bot${this.token}/${metodo}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(corpo),
    });
    const j = (await r.json().catch(() => ({}))) as { ok?: boolean; result?: { message_id?: number }; description?: string };
    if (!r.ok || !j.ok || typeof j.result?.message_id !== 'number') {
      throw new Error(`Telegram ${metodo} falhou (${r.status}): ${j.description ?? 'sem descrição'}`);
    }
    return { message_id: j.result.message_id };
  }

  publicarNoCanal(p: PublicacaoTelegram) {
    if (p.fotoUrl && p.texto.length <= LIMITE_LEGENDA) {
      return this.chamar('sendPhoto', { chat_id: this.canalId, photo: p.fotoUrl, caption: p.texto, parse_mode: 'HTML' });
    }
    return this.chamar('sendMessage', { chat_id: this.canalId, text: p.texto, parse_mode: 'HTML' });
  }

  enviarMensagem(chatId: string, textoHtml: string) {
    return this.chamar('sendMessage', { chat_id: chatId, text: textoHtml, parse_mode: 'HTML' });
  }
}

/** Servidor falso: registra as chamadas em vez de falar com o Telegram. */
export class TelegramFalso implements ClienteTelegram {
  readonly simulado = true;
  chamadas: Array<{ metodo: 'canal' | 'mensagem'; chatId?: string; texto: string; fotoUrl?: string | null }> = [];
  falhar = false;
  private proximo = 1;

  async publicarNoCanal(p: PublicacaoTelegram) {
    if (this.falhar) throw new Error('Telegram falso: falha simulada');
    this.chamadas.push({ metodo: 'canal', texto: p.texto, fotoUrl: p.fotoUrl ?? null });
    return { message_id: this.proximo++ };
  }
  async enviarMensagem(chatId: string, textoHtml: string) {
    if (this.falhar) throw new Error('Telegram falso: falha simulada');
    this.chamadas.push({ metodo: 'mensagem', chatId, texto: textoHtml });
    return { message_id: this.proximo++ };
  }
}
