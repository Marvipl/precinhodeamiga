import { describe, expect, it } from 'vitest';
import { criarJob, dispararPendentes, expirarJobs, lerEntrada, receberResultado, type DepsJobs } from './runtime.ts';
import { JobStoreMemoria } from './store-memoria.ts';
import { gerarNonce, hashNonce } from '../core/jobs.ts';

function montar(modo: 'real' | 'simulado', opts: { fetch?: typeof fetch; agora?: Date } = {}) {
  let agora = opts.agora ?? new Date('2026-11-09T08:00:00Z');
  const relogio = () => agora;
  const store = new JobStoreMemoria(relogio);
  const gravados: unknown[] = [];
  const deps: DepsJobs = {
    store,
    modo,
    urlRetorno: 'https://exemplo.invalid/functions/v1/agente-resultado',
    urlLeitura: 'https://exemplo.invalid/functions/v1/agente-entrada',
    credencial: () => ({ id: 'trig_teste', token: 'tok' }),
    processadores: { 'ping/v1': async (_j, s) => void gravados.push(s) },
    fetch: opts.fetch,
    agora: relogio,
  };
  return { store, deps, gravados, avancar: (ms: number) => (agora = new Date(agora.getTime() + ms)) };
}

function fakeFetch(status: number, corpo: unknown = {}, headers: Record<string, string> = {}) {
  const chamadas: { url: string; init: RequestInit }[] = [];
  const f = (async (url: string, init: RequestInit) => {
    chamadas.push({ url, init });
    return new Response(JSON.stringify(corpo), { status, headers });
  }) as unknown as typeof fetch;
  return { f, chamadas };
}

describe('criarJob', () => {
  it('impede duplicado pela chave única', async () => {
    const { store } = montar('simulado');
    const a = await criarJob(store, { rotina: 'pa-coach', contrato: 'ping/v1', entrada: { mensagem: 'oi' }, chave_unica: 'ping:1' });
    const b = await criarJob(store, { rotina: 'pa-coach', contrato: 'ping/v1', entrada: { mensagem: 'oi' }, chave_unica: 'ping:1' });
    expect(a.criado).toBe(true);
    expect(b.criado).toBe(false);
    expect(b.job.id).toBe(a.job.id);
  });
  it('recusa entrada fora do contrato e rotina errada', async () => {
    const { store } = montar('simulado');
    await expect(criarJob(store, { rotina: 'pa-coach', contrato: 'ping/v1', entrada: {}, chave_unica: 'x' })).rejects.toThrow(/entrada inválida/);
    await expect(criarJob(store, { rotina: 'pa-radar', contrato: 'ping/v1', entrada: { mensagem: 'a' }, chave_unica: 'y' })).rejects.toThrow(/pertence/);
  });
});

describe('modo simulado', () => {
  it('conclui o job com a resposta pré-gravada sem chamar a API', async () => {
    const { store, deps, gravados } = montar('simulado', { fetch: (() => { throw new Error('não deve chamar'); }) as unknown as typeof fetch });
    const { job } = await criarJob(store, { rotina: 'pa-coach', contrato: 'ping/v1', entrada: { mensagem: 'olá' }, chave_unica: 'p' });
    const r = await dispararPendentes(deps);
    expect(r).toEqual([{ job_id: job.id, resultado: 'simulado', motivo: undefined }]);
    const fim = await store.buscarJob(job.id);
    expect(fim?.estado).toBe('concluido');
    expect(fim?.simulado).toBe(true);
    expect(gravados).toEqual([{ eco: 'olá' }]);
  });
});

describe('modo real', () => {
  it('dispara com token e payload e guarda a URL da sessão', async () => {
    const { f, chamadas } = fakeFetch(200, { id: 'ses_1', session_url: 'https://claude.ai/code/ses_1' });
    const { store, deps } = montar('real', { fetch: f });
    const { job } = await criarJob(store, { rotina: 'pa-coach', contrato: 'ping/v1', entrada: { mensagem: 'a' }, chave_unica: 'p' });
    await dispararPendentes(deps);
    expect(chamadas[0].url).toBe('https://api.anthropic.com/v1/claude_code/routines/trig_teste/fire');
    expect((chamadas[0].init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
    const texto = JSON.parse(String(chamadas[0].init.body)).text;
    const payload = JSON.parse(texto);
    expect(payload).toMatchObject({ contrato: 'ping/v1', job_id: job.id, entrada: { mensagem: 'a' } });
    expect((await store.buscarJob(job.id))?.estado).toBe('disparado');
    expect((await store.buscarJob(job.id))?.sessao_url).toBe('https://claude.ai/code/ses_1');
  });

  it('429 volta para pendente respeitando Retry-After, sem gastar tentativa', async () => {
    const { f } = fakeFetch(429, {}, { 'retry-after': '120' });
    const { store, deps } = montar('real', { fetch: f });
    const { job } = await criarJob(store, { rotina: 'pa-coach', contrato: 'ping/v1', entrada: { mensagem: 'a' }, chave_unica: 'p' });
    await dispararPendentes(deps);
    const j = await store.buscarJob(job.id);
    expect(j?.estado).toBe('pendente');
    expect(j?.tentativas).toBe(0);
    expect(j?.proxima_tentativa_em).toBe('2026-11-09T08:02:00.000Z');
  });

  it('5xx tenta de novo até 3 vezes e depois vira erro', async () => {
    const { f } = fakeFetch(503);
    const { store, deps, avancar } = montar('real', { fetch: f });
    store.rotinas.set('pa-coach', { pausada: false, teto_diario: 10 });
    const { job } = await criarJob(store, { rotina: 'pa-coach', contrato: 'ping/v1', entrada: { mensagem: 'a' }, chave_unica: 'p' });
    await dispararPendentes(deps);
    expect((await store.buscarJob(job.id))?.estado).toBe('pendente');
    avancar(60_000);
    await dispararPendentes(deps);
    expect((await store.buscarJob(job.id))?.estado).toBe('pendente');
    avancar(120_000);
    await dispararPendentes(deps);
    const j = await store.buscarJob(job.id);
    expect(j?.estado).toBe('erro');
    expect(j?.erro).toMatch(/3 tentativas/);
  });

  it('401 vira erro com motivo', async () => {
    const { f } = fakeFetch(401);
    const { store, deps } = montar('real', { fetch: f });
    const { job } = await criarJob(store, { rotina: 'pa-coach', contrato: 'ping/v1', entrada: { mensagem: 'a' }, chave_unica: 'p' });
    await dispararPendentes(deps);
    expect((await store.buscarJob(job.id))?.erro).toMatch(/401/);
  });

  it('sem credencial vira erro', async () => {
    const { store, deps } = montar('real');
    deps.credencial = () => null;
    const { job } = await criarJob(store, { rotina: 'pa-coach', contrato: 'ping/v1', entrada: { mensagem: 'a' }, chave_unica: 'p' });
    await dispararPendentes(deps);
    expect((await store.buscarJob(job.id))?.erro).toMatch(/sem credencial/);
  });
});

describe('pausa e teto', () => {
  it('pausa geral adia sem disparar', async () => {
    const { store, deps } = montar('simulado');
    store.pausaGeral = true;
    const { job } = await criarJob(store, { rotina: 'pa-coach', contrato: 'ping/v1', entrada: { mensagem: 'a' }, chave_unica: 'p' });
    const r = await dispararPendentes(deps);
    expect(r[0]).toMatchObject({ resultado: 'adiado', motivo: 'pausa_geral' });
    expect((await store.buscarJob(job.id))?.estado).toBe('pendente');
  });
  it('teto do dia atingido espera o dia seguinte', async () => {
    const { store, deps } = montar('simulado');
    // teto da pa-coach = 1
    await criarJob(store, { rotina: 'pa-coach', contrato: 'ping/v1', entrada: { mensagem: 'a' }, chave_unica: 'p1' });
    await dispararPendentes(deps);
    const { job } = await criarJob(store, { rotina: 'pa-coach', contrato: 'ping/v1', entrada: { mensagem: 'b' }, chave_unica: 'p2' });
    const r = await dispararPendentes(deps);
    expect(r[0]).toMatchObject({ resultado: 'adiado', motivo: 'teto_atingido' });
    // 08:00Z = 05:00 em Brasília do dia 9 -> próximo dia 10 às 00:05 BRT = 03:05Z
    expect((await store.buscarJob(job.id))?.proxima_tentativa_em).toBe('2026-11-10T03:05:00.000Z');
  });
});

describe('retorno', () => {
  async function disparado() {
    const { f } = fakeFetch(200, {});
    const m = montar('real', { fetch: f });
    const { job } = await criarJob(m.store, { rotina: 'pa-coach', contrato: 'ping/v1', entrada: { mensagem: 'a' }, chave_unica: 'p' });
    await dispararPendentes(m.deps);
    // descobrir o nonce: registramos uma tentativa manual conhecida
    const nonce = gerarNonce();
    await m.store.registrarTentativa(job.id, await hashNonce(nonce));
    return { ...m, job, nonce };
  }

  it('aceita saída válida e conclui; segundo retorno é ignorado', async () => {
    const { deps, store, job, nonce, gravados } = await disparado();
    const r = await receberResultado(deps, { job_id: job.id, nonce, saida: { eco: 'a' } });
    expect(r).toEqual({ ok: true, status: 200 });
    expect((await store.buscarJob(job.id))?.estado).toBe('concluido');
    const r2 = await receberResultado(deps, { job_id: job.id, nonce, saida: { eco: 'b' } });
    expect(r2).toMatchObject({ ok: true, ignorado: true });
    expect(gravados).toEqual([{ eco: 'a' }]);
  });
  it('recusa nonce errado', async () => {
    const { deps, job } = await disparado();
    expect(await receberResultado(deps, { job_id: job.id, nonce: 'x', saida: { eco: 'a' } })).toMatchObject({ status: 403 });
  });
  it('saída fora do contrato vira erro', async () => {
    const { deps, store, job, nonce } = await disparado();
    expect(await receberResultado(deps, { job_id: job.id, nonce, saida: { outro: 1 } })).toMatchObject({ status: 422 });
    expect((await store.buscarJob(job.id))?.estado).toBe('erro');
  });
  it('leitura da entrada exige nonce', async () => {
    const { store, job, nonce } = await disparado();
    expect(await lerEntrada(store, { job_id: job.id, nonce })).toEqual({ ok: true, entrada: { mensagem: 'a' } });
    expect(await lerEntrada(store, { job_id: job.id, nonce: 'nao' })).toMatchObject({ ok: false, status: 403 });
  });
});

describe('expiração', () => {
  it('curadoria volta para pendente; outras ficam expiradas', async () => {
    const { f } = fakeFetch(200, {});
    const { store, deps, avancar } = montar('real', { fetch: f });
    const { job } = await criarJob(store, { rotina: 'pa-coach', contrato: 'ping/v1', entrada: { mensagem: 'a' }, chave_unica: 'p' });
    await dispararPendentes(deps);
    avancar(44 * 60_000);
    expect(await expirarJobs(deps)).toEqual([]);
    avancar(2 * 60_000);
    expect(await expirarJobs(deps)).toEqual([job.id]);
    expect((await store.buscarJob(job.id))?.estado).toBe('expirado');
  });
});
