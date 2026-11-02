// Avisos de privacidade (seção 7.2). RASCUNHO: o texto final passa por revisão jurídica (docs/HUMANO.md).
import { EXCLUSAO_PRAZO_DIAS, GUARDA_DIAS } from './regras.ts';

export const AVISO_PRIVACIDADE_BOT =
  `Privacidade: guardo seu nome exibido no Telegram e suas mensagens só para responder você, por até ${GUARDA_DIAS} dias depois da última conversa. ` +
  'As mensagens são lidas por uma assistente de inteligência artificial e revisadas pela Lana. ' +
  'Para apagar seus dados, envie /apagar.';

export const AVISO_PRIVACIDADE_FORMULARIO =
  `Guardamos o que você escrever aqui (e o seu primeiro nome e número, se informar) só para responder o seu pedido, por até ${GUARDA_DIAS} dias depois da última conversa. ` +
  'As mensagens são lidas por uma assistente de inteligência artificial e revisadas pela Lana. Nunca pedimos CPF, endereço ou dados de pagamento. ' +
  `Para apagar seus dados, use o link de exclusão que aparece depois do envio (prazo máximo de ${EXCLUSAO_PRAZO_DIAS} dias; pelo link, a exclusão é na hora).`;

export const BOAS_VINDAS_BOT =
  'Oi! Sou a assistente da Precinho de Amiga (não sou a Lana). Ajudo com cupom, link, entrega, como o canal funciona e pedidos de produto. ' +
  'O que eu não souber, a Lana responde nos blocos de revisão. Escolha uma opção abaixo ou escreva sua mensagem.';

export const TEXTO_CONFIRMAR_APAGAR =
  'Quer mesmo apagar suas mensagens, pedidos e contato da Precinho? Isso não tem volta.';
export const TEXTO_APAGADO = 'Pronto, apaguei suas mensagens, pedidos e contato. Se escrever de novo, começamos do zero.';
