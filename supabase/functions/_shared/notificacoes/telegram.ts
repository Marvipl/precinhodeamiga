// Alternativa ao Web Push: mensagem do bot do Telegram para a própria Lana (F-15).
// Só fala com o chat privado da Lana (TELEGRAM_LANA_CHAT_ID). Nunca com o canal, nunca com o WhatsApp.

export interface EnviadorTelegram {
  enviar(chatId: string, textoHtml: string): Promise<{ ok: boolean; status: number }>;
}

export function enviadorTelegramReal(token: string, buscar: typeof fetch = fetch): EnviadorTelegram {
  return {
    async enviar(chatId, textoHtml) {
      const r = await buscar(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: textoHtml, parse_mode: 'HTML', disable_web_page_preview: true }),
      });
      return { ok: r.ok, status: r.status };
    },
  };
}
