// Despachante das notificações vencidas (função `notificar`, cron a cada minuto).
// Ordem por pessoa: Web Push em todos os aparelhos inscritos; se nenhum aceitar, bot do Telegram (só a Lana).
// Não usa Deno.*: o armazenamento e os enviadores são injetados (testes usam versões em memória).
import {
  MAX_TENTATIVAS,
  decidirEnvio,
  destinatarios,
  payloadPush,
  textoTelegram,
  urgenciaPush,
  type Membro,
} from '../core/notificacoes.ts';
import type { InscricaoPush } from './webpush.ts';
import type { EnviadorTelegram } from './telegram.ts';

export interface Notificacao {
  id: string;
  user_id: string | null;
  tipo: string;
  titulo: string;
  corpo: string | null;
  link: string | null;
  enviar_em: string;
  tentativas: number;
}

export interface InscricaoSalva extends InscricaoPush {
  id: string;
  user_id: string;
}

export interface ResultadoPessoa {
  user_id: string;
  canal: 'push' | 'telegram' | 'nenhum';
  push_ok: number;
  push_falhas: number;
  push_removidas: number;
  telegram?: 'ok' | 'falhou';
}

export interface StoreNotificacoes {
  /** Toma as vencidas de forma atômica (rpc tomar_notificacoes): cada uma já vem com a tentativa contada. */
  tomar(limite: number): Promise<Notificacao[]>;
  membros(): Promise<Membro[]>;
  blocosRevisao(): Promise<string[]>;
  inscricoes(userIds: string[]): Promise<InscricaoSalva[]>;
  removerInscricao(id: string): Promise<void>;
  marcarUsoInscricao(id: string, quando: Date): Promise<void>;
  concluir(id: string, resultado: unknown, quando: Date): Promise<void>;
  adiar(id: string, para: Date): Promise<void>;
  /** Falha nesta tentativa: tenta de novo em `proxima` (a tomada já empurrou 2 minutos) ou desiste quando `desistir`. */
  falhar(id: string, resultado: unknown, desistir: boolean, quando: Date): Promise<void>;
}

export interface EnviadorPush {
  enviar(inscricao: InscricaoPush, payload: unknown, opcoes: { urgencia: 'high' | 'normal' }): Promise<{ status: number }>;
}

export interface Dependencias {
  store: StoreNotificacoes;
  push: EnviadorPush | null;
  telegram: EnviadorTelegram | null;
  /** Chat privado da Lana no bot. A alternativa pelo Telegram só vale para a operadora. */
  telegramChatLana: string | null;
  urlSite?: string;
  agora?: () => Date;
}

export interface Resumo {
  tomadas: number;
  enviadas: number;
  adiadas: number;
  sem_canal: number;
  falhas: number;
  desistencias: number;
}

const OK = (s: number) => s >= 200 && s < 300;
const INSCRICAO_MORTA = (s: number) => s === 404 || s === 410;

async function entregarPara(m: Membro, n: Notificacao, inscricoes: InscricaoSalva[], d: Dependencias): Promise<ResultadoPessoa> {
  const agora = d.agora?.() ?? new Date();
  const r: ResultadoPessoa = { user_id: m.user_id, canal: 'nenhum', push_ok: 0, push_falhas: 0, push_removidas: 0 };
  if (d.push) {
    const payload = payloadPush(n);
    for (const insc of inscricoes.filter((i) => i.user_id === m.user_id)) {
      let status = 0;
      try {
        status = (await d.push.enviar(insc, payload, { urgencia: urgenciaPush(n.tipo) })).status;
      } catch {
        status = 0;
      }
      if (OK(status)) {
        r.push_ok++;
        await d.store.marcarUsoInscricao(insc.id, agora);
      } else if (INSCRICAO_MORTA(status)) {
        r.push_removidas++;
        await d.store.removerInscricao(insc.id);
      } else {
        r.push_falhas++;
      }
    }
  }
  if (r.push_ok > 0) {
    r.canal = 'push';
    return r;
  }
  if (m.papel === 'operadora' && d.telegram && d.telegramChatLana) {
    let ok = false;
    try {
      ok = (await d.telegram.enviar(d.telegramChatLana, textoTelegram(n, d.urlSite))).ok;
    } catch {
      ok = false;
    }
    r.telegram = ok ? 'ok' : 'falhou';
    if (ok) r.canal = 'telegram';
  }
  return r;
}

/** Processa um lote de notificações vencidas. */
export async function despachar(d: Dependencias, limite = 50): Promise<Resumo> {
  const resumo: Resumo = { tomadas: 0, enviadas: 0, adiadas: 0, sem_canal: 0, falhas: 0, desistencias: 0 };
  const lote = await d.store.tomar(limite);
  resumo.tomadas = lote.length;
  if (lote.length === 0) return resumo;

  const [membros, blocos] = await Promise.all([d.store.membros(), d.store.blocosRevisao()]);
  const inscricoes = await d.store.inscricoes(membros.map((m) => m.user_id));

  for (const n of lote) {
    const agora = d.agora?.() ?? new Date();
    const decisao = decidirEnvio(n.tipo, agora, blocos);
    if (decisao.acao === 'adiar') {
      await d.store.adiar(n.id, decisao.ate);
      resumo.adiadas++;
      continue;
    }
    const pessoas = destinatarios(n.user_id, membros);
    const resultados: ResultadoPessoa[] = [];
    for (const m of pessoas) resultados.push(await entregarPara(m, n, inscricoes, d));

    const alguem = resultados.some((x) => x.canal !== 'nenhum');
    const tentouCanal = resultados.some((x) => x.push_falhas > 0 || x.telegram === 'falhou');
    if (alguem) {
      await d.store.concluir(n.id, { pessoas: resultados }, agora);
      resumo.enviadas++;
    } else if (tentouCanal) {
      const desistir = n.tentativas >= MAX_TENTATIVAS;
      await d.store.falhar(n.id, { pessoas: resultados }, desistir, agora);
      resumo.falhas++;
      if (desistir) resumo.desistencias++;
    } else {
      // Ninguém tem aparelho inscrito nem Telegram: a notificação fica só na lista do painel.
      await d.store.concluir(n.id, { pessoas: resultados, sem_canal: true }, agora);
      resumo.sem_canal++;
    }
  }
  return resumo;
}

/** Modo simulado: nada sai para a internet; cada envio é aceito e registrado em memória. */
export function enviadoresSimulados() {
  const registro: Array<{ canal: 'push' | 'telegram'; destino: string; conteudo: unknown }> = [];
  const push: EnviadorPush = {
    async enviar(insc, payload) {
      registro.push({ canal: 'push', destino: insc.endpoint, conteudo: payload });
      return { status: 201 };
    },
  };
  const telegram: EnviadorTelegram = {
    async enviar(chatId, texto) {
      registro.push({ canal: 'telegram', destino: chatId, conteudo: texto });
      return { ok: true, status: 200 };
    },
  };
  return { push, telegram, registro };
}
