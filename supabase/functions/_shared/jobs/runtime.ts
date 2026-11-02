// Ciclo de vida dos jobs dos agentes (F-13, Anexo A.4) aplicado sobre um JobStore.
// Sem Deno.* nem process.*: as dependências entram por parâmetro, para rodar no Deno e nos testes (Node).

import type { IdRotina } from '../core/agentes.ts';
import { contrato as acharContrato } from '../core/contratos/index.ts';
import { instanteLocal, dataLocal, somarDias } from '../core/formato.ts';
import {
  aceitaRetorno,
  aoExpirar,
  decidirResposta,
  expirou,
  gerarNonce,
  hashNonce,
  montarPayload,
  podeDisparar,
} from '../core/jobs.ts';
import type { Job, JobStore, NovoJob } from './store.ts';

export type ModoAgentes = 'real' | 'simulado';

/** Processa a saída já validada de um contrato, gravando nas tabelas de destino. */
export type Processador = (job: Job, saida: unknown) => Promise<void>;

export interface Credencial {
  id: string; // trig_...
  token: string;
}

export interface DepsJobs {
  store: JobStore;
  modo: ModoAgentes;
  /** URL pública do endpoint de retorno (agente-resultado) e de leitura (agente-entrada). */
  urlRetorno: string;
  urlLeitura: string;
  /** Credenciais por rotina (ROUTINE_<SUFIXO>_ID / _TOKEN). Só necessário no modo real. */
  credencial: (rotina: IdRotina) => Credencial | null;
  processadores: Record<string, Processador>;
  fetch?: typeof fetch;
  agora?: () => Date;
}

const URL_FIRE = (id: string) => `https://api.anthropic.com/v1/claude_code/routines/${id}/fire`;
const ANTHROPIC_VERSION = '2023-06-01';

export async function criarJob(store: JobStore, novo: NovoJob): Promise<{ job: Job; criado: boolean }> {
  const c = acharContrato(novo.contrato);
  if (!c) throw new Error(`contrato desconhecido: ${novo.contrato}`);
  if (c.rotina !== novo.rotina) throw new Error(`contrato ${novo.contrato} pertence à rotina ${c.rotina}`);
  const ok = c.entrada.safeParse(novo.entrada);
  if (!ok.success) throw new Error(`entrada inválida para ${novo.contrato}: ${ok.error.message}`);
  return store.criarJob(novo);
}

export interface ResultadoDisparo {
  job_id: string;
  resultado: 'disparado' | 'simulado' | 'adiado' | 'erro' | 'concluido';
  motivo?: string;
}

/** Pega os pendentes vencidos e dispara (ou simula) cada um. Chamado pelo pg_cron a cada minuto. */
export async function dispararPendentes(deps: DepsJobs, limite = 10): Promise<ResultadoDisparo[]> {
  const { store } = deps;
  const agora = deps.agora?.() ?? new Date();
  const jobs = await store.tomarPendentes(limite);
  const out: ResultadoDisparo[] = [];
  const pausaGeral = jobs.length ? await store.lerPausaGeral() : false;

  for (const job of jobs) {
    const rot = await store.lerRotina(job.rotina);
    const uso = await store.usoHoje(job.rotina);
    const pode = podeDisparar({ pausaGeral, rotinaPausada: rot.pausada, usoHoje: uso, tetoDiario: rot.teto_diario, rotina: job.rotina });
    if (!pode.ok) {
      // Volta para a fila sem gastar tentativa. Teto: espera o dia seguinte (00:05 de Brasília).
      const proxima =
        pode.motivo === 'teto_atingido'
          ? instanteLocal(somarDias(dataLocal(agora), 1), '00:05')
          : new Date(agora.getTime() + 5 * 60_000);
      await store.atualizarJob(job.id, {
        estado: 'pendente',
        tentativas: job.tentativas - 1,
        disparado_em: null,
        proxima_tentativa_em: proxima.toISOString(),
        erro: pode.motivo === 'teto_atingido' ? 'teto do dia atingido; tenta amanhã' : null,
      });
      out.push({ job_id: job.id, resultado: 'adiado', motivo: pode.motivo });
      continue;
    }

    const nonce = gerarNonce();
    const tentativa = await store.registrarTentativa(job.id, await hashNonce(nonce));

    if (deps.modo === 'simulado') {
      const c = acharContrato(job.contrato);
      if (!c) {
        await store.atualizarJob(job.id, { estado: 'erro', erro: `contrato desconhecido: ${job.contrato}` });
        out.push({ job_id: job.id, resultado: 'erro', motivo: 'contrato desconhecido' });
        continue;
      }
      await store.atualizarJob(job.id, { simulado: true, sessao_url: null });
      const saida = c.simular(job.entrada);
      const r = await receberResultado(deps, { job_id: job.id, nonce, saida });
      out.push({ job_id: job.id, resultado: r.ok ? 'simulado' : 'erro', motivo: r.ok ? undefined : r.motivo });
      continue;
    }

    const cred = deps.credencial(job.rotina);
    if (!cred) {
      const motivo = `rotina ${job.rotina} sem credencial configurada`;
      await store.atualizarJob(job.id, { estado: 'erro', erro: motivo });
      await store.marcarRotina(job.rotina, { ultimo_erro: motivo, ultimo_erro_em: agora.toISOString() });
      out.push({ job_id: job.id, resultado: 'erro', motivo });
      continue;
    }

    const { texto } = montarPayload({ job, nonce, urlRetorno: deps.urlRetorno, urlLeitura: deps.urlLeitura });
    let status = 0;
    let retryAfter: string | null = null;
    let sessaoUrl: string | null = null;
    try {
      const resp = await (deps.fetch ?? fetch)(URL_FIRE(cred.id), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${cred.token}`,
          'anthropic-version': ANTHROPIC_VERSION,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ text: texto }),
      });
      status = resp.status;
      retryAfter = resp.headers.get('retry-after');
      if (resp.ok) {
        const corpo = (await resp.json().catch(() => ({}))) as Record<string, unknown>;
        sessaoUrl = (corpo.session_url ?? corpo.url ?? null) as string | null;
      }
    } catch (e) {
      status = 503; // falha de rede conta como 5xx
      retryAfter = null;
      console.error('disparo falhou', job.id, e);
    }
    await store.atualizarTentativa(tentativa.id, { status_http: status, sessao_url: sessaoUrl });

    const d = decidirResposta({ status, retryAfter, tentativas: job.tentativas, agora });
    if (d.estado === 'disparado') {
      await store.atualizarJob(job.id, { sessao_url: sessaoUrl, erro: null });
      await store.marcarRotina(job.rotina, { ultima_execucao: agora.toISOString() });
      out.push({ job_id: job.id, resultado: 'disparado' });
    } else if (d.estado === 'pendente') {
      await store.atualizarJob(job.id, {
        estado: 'pendente',
        disparado_em: null,
        erro: d.motivo,
        proxima_tentativa_em: new Date(agora.getTime() + d.esperarMs).toISOString(),
        // 429 não gasta tentativa
        tentativas: status === 429 ? job.tentativas - 1 : job.tentativas,
      });
      out.push({ job_id: job.id, resultado: 'adiado', motivo: d.motivo });
    } else {
      await store.atualizarJob(job.id, { estado: 'erro', erro: d.motivo });
      await store.marcarRotina(job.rotina, { ultimo_erro: d.motivo, ultimo_erro_em: agora.toISOString() });
      out.push({ job_id: job.id, resultado: 'erro', motivo: d.motivo });
    }
  }
  return out;
}

/** Expira jobs disparados sem retorno. Curadoria volta para pendente (nova tentativa). */
export async function expirarJobs(deps: Pick<DepsJobs, 'store' | 'agora'>): Promise<string[]> {
  const agora = deps.agora?.() ?? new Date();
  const min = await deps.store.lerExpiracaoMin();
  const limite = new Date(agora.getTime() - min * 60_000).toISOString();
  const jobs = await deps.store.jobsDisparadosAntesDe(limite);
  const ids: string[] = [];
  for (const j of jobs) {
    if (!expirou(j.disparado_em, agora, min)) continue;
    const novo = aoExpirar(j.rotina);
    await deps.store.atualizarJob(j.id, {
      estado: novo,
      erro: `sem retorno em ${min} minutos`,
      ...(novo === 'pendente' ? { proxima_tentativa_em: agora.toISOString() } : {}),
    });
    ids.push(j.id);
  }
  return ids;
}

export type RespostaRetorno = { ok: true; status: 200; ignorado?: boolean } | { ok: false; status: 400 | 403 | 404 | 409 | 422; motivo: string };

/** Endpoint de retorno (passo 5): valida nonce e contrato, grava e conclui. */
export async function receberResultado(
  deps: Pick<DepsJobs, 'store' | 'processadores' | 'agora'>,
  corpo: { job_id?: unknown; nonce?: unknown; saida?: unknown },
): Promise<RespostaRetorno> {
  const { store } = deps;
  const agora = deps.agora?.() ?? new Date();
  if (typeof corpo.job_id !== 'string' || typeof corpo.nonce !== 'string') {
    return { ok: false, status: 400, motivo: 'job_id e nonce são obrigatórios' };
  }
  const tentativa = await store.buscarTentativaPorHash(await hashNonce(corpo.nonce));
  if (!tentativa || tentativa.job_id !== corpo.job_id) return { ok: false, status: 403, motivo: 'nonce inválido' };
  const job = await store.buscarJob(corpo.job_id);
  if (!job) return { ok: false, status: 404, motivo: 'job não encontrado' };
  if (job.estado === 'concluido') return { ok: true, status: 200, ignorado: true }; // vale o primeiro resultado válido
  if (tentativa.usado_em) return { ok: false, status: 409, motivo: 'nonce já usado' };
  if (!aceitaRetorno(job.estado)) return { ok: false, status: 409, motivo: `job em estado ${job.estado}` };

  const c = acharContrato(job.contrato);
  if (!c) return { ok: false, status: 422, motivo: `contrato desconhecido: ${job.contrato}` };
  const v = c.saida.safeParse(corpo.saida);
  if (!v.success) {
    const motivo = `saída fora do contrato ${job.contrato}: ${v.error.message.slice(0, 500)}`;
    await store.atualizarJob(job.id, { estado: 'erro', erro: motivo });
    await store.marcarRotina(job.rotina, { ultimo_erro: motivo, ultimo_erro_em: agora.toISOString() });
    return { ok: false, status: 422, motivo };
  }
  const proc = deps.processadores[job.contrato];
  if (!proc) {
    const motivo = `sem processador para ${job.contrato}`;
    await store.atualizarJob(job.id, { estado: 'erro', erro: motivo });
    return { ok: false, status: 422, motivo };
  }
  try {
    await proc(job, v.data);
  } catch (e) {
    const motivo = `erro ao gravar resultado: ${e instanceof Error ? e.message : String(e)}`;
    await store.atualizarJob(job.id, { estado: 'erro', erro: motivo });
    await store.marcarRotina(job.rotina, { ultimo_erro: motivo, ultimo_erro_em: agora.toISOString() });
    return { ok: false, status: 422, motivo };
  }
  await store.atualizarTentativa(tentativa.id, { usado_em: agora.toISOString() });
  await store.atualizarJob(job.id, { estado: 'concluido', saida: v.data, concluido_em: agora.toISOString(), erro: null });
  await store.marcarRotina(job.rotina, { ultima_execucao: agora.toISOString(), ultimo_erro: null, ultimo_erro_em: null });
  return { ok: true, status: 200 };
}

/** Endpoint de leitura (passo 7): devolve a entrada de um job a quem tem o nonce. */
export async function lerEntrada(
  store: JobStore,
  p: { job_id?: unknown; nonce?: unknown },
): Promise<{ ok: true; entrada: unknown } | { ok: false; status: 400 | 403; motivo: string }> {
  if (typeof p.job_id !== 'string' || typeof p.nonce !== 'string') return { ok: false, status: 400, motivo: 'job_id e nonce são obrigatórios' };
  const t = await store.buscarTentativaPorHash(await hashNonce(p.nonce));
  if (!t || t.job_id !== p.job_id || t.usado_em) return { ok: false, status: 403, motivo: 'nonce inválido' };
  const job = await store.buscarJob(p.job_id);
  if (!job) return { ok: false, status: 403, motivo: 'nonce inválido' };
  return { ok: true, entrada: job.entrada };
}

