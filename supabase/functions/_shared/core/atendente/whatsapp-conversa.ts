// Resposta do formulário por WhatsApp (seção 5.13, "Formulário com resposta por WhatsApp (V2)"):
// sem número oficial, a resposta aprovada abre o WhatsApp da própria Lana com o texto preenchido
// (link de conversa do próprio WhatsApp) e ELA toca em enviar. Nada é enviado por código.
// Único arquivo liberado na checagem da regra 5.1 item 2 (post/aceite.test.ts): só monta um link, não chama nada.

/** Link de conversa do WhatsApp com o texto preenchido. A Lana toca em enviar; nada sai sozinho. */
export function linkConversaWhatsapp(numero: string, texto: string): string {
  const digitos = numero.replace(/\D/g, '');
  const comPais = digitos.length <= 11 ? `55${digitos}` : digitos;
  return `https://wa.me/${comPais}?text=${encodeURIComponent(texto)}`;
}
