// F-14: estado das integrações. Diz se cada segredo existe, nunca o valor.
// Código puro: quem chama informa uma função que responde se a variável existe.
import { ROTINAS } from './agentes.ts';

export type IdIntegracao = 'shopee' | 'telegram' | 'rotinas' | 'webpush';

export interface Integracao {
  id: IdIntegracao;
  nome: string;
  serve: string;
  segredos: string[];
  /** O que acontece enquanto faltar segredo. */
  semSegredo: string;
}

export const INTEGRACOES: readonly Integracao[] = [
  {
    id: 'shopee',
    nome: 'Shopee (API de afiliados)',
    serve: 'Coleta de ofertas, histórico de preço e links com comissão',
    segredos: ['SHOPEE_AFFILIATE_APP_ID', 'SHOPEE_AFFILIATE_APP_SECRET'],
    semSegredo: 'A coleta roda em modo simulado, com produtos fictícios.',
  },
  {
    id: 'telegram',
    nome: 'Telegram (bot e canal)',
    serve: 'Publicação automática no canal e lembretes para a Lana',
    segredos: ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHANNEL_ID', 'TELEGRAM_WEBHOOK_SECRET', 'TELEGRAM_LANA_CHAT_ID'],
    semSegredo: 'Nada é publicado no Telegram.',
  },
  {
    id: 'rotinas',
    nome: 'Rotinas do Claude Code (agentes)',
    serve: 'Escolha das ofertas, textos, resumo semanal, Radar e Atendente',
    segredos: ['AGENT_CALLBACK_TOKEN', ...Object.values(ROTINAS).flatMap((r) => [`ROUTINE_${r.sufixoEnv}_ID`, `ROUTINE_${r.sufixoEnv}_TOKEN`])],
    semSegredo: 'Os agentes respondem em modo simulado.',
  },
  {
    id: 'webpush',
    nome: 'Notificações no celular (Web Push)',
    serve: 'Lembretes de envio do WhatsApp e avisos da Guardiã',
    segredos: ['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY'],
    semSegredo: 'Os avisos ficam só dentro do painel.',
  },
];

export type SituacaoIntegracao = 'conectada' | 'incompleta' | 'desconectada';

export interface EstadoIntegracao {
  id: IdIntegracao;
  situacao: SituacaoIntegracao;
  /** Nomes dos segredos que faltam (os nomes não são secretos; os valores nunca saem). */
  faltando: string[];
}

export interface RespostaIntegracoes {
  integracoes: EstadoIntegracao[];
  modoAgentes: 'real' | 'simulado';
}

export function estadoIntegracoes(existe: (nome: string) => boolean): EstadoIntegracao[] {
  return INTEGRACOES.map((i) => {
    const faltando = i.segredos.filter((s) => !existe(s));
    const situacao: SituacaoIntegracao =
      faltando.length === 0 ? 'conectada' : faltando.length === i.segredos.length ? 'desconectada' : 'incompleta';
    return { id: i.id, situacao, faltando };
  });
}

export function integracao(id: IdIntegracao): Integracao {
  const i = INTEGRACOES.find((x) => x.id === id);
  if (!i) throw new Error(`integração desconhecida: ${id}`);
  return i;
}
