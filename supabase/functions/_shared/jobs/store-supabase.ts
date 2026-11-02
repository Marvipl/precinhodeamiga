// JobStore sobre o Supabase (service_role). Usado pelas Edge Functions.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { IdRotina } from '../core/agentes.ts';
import { CONFIG } from '../core/config.ts';
import type { Job, JobStore, NovoJob, Tentativa } from './store.ts';

function falha(op: string, e: { message: string } | null): void {
  if (e) throw new Error(`${op}: ${e.message}`);
}

export class JobStoreSupabase implements JobStore {
  constructor(private db: SupabaseClient) {}

  async criarJob(novo: NovoJob) {
    const ins = await this.db.from('agente_jobs').insert(novo).select().single();
    if (!ins.error) return { job: ins.data as Job, criado: true };
    if (ins.error.code !== '23505') falha('criarJob', ins.error);
    const ex = await this.db.from('agente_jobs').select().eq('chave_unica', novo.chave_unica).single();
    falha('criarJob/existente', ex.error);
    return { job: ex.data as Job, criado: false };
  }
  async buscarJob(id: string) {
    const r = await this.db.from('agente_jobs').select().eq('id', id).maybeSingle();
    falha('buscarJob', r.error);
    return (r.data as Job) ?? null;
  }
  async tomarPendentes(limite: number) {
    const r = await this.db.rpc('tomar_jobs_pendentes', { limite });
    falha('tomarPendentes', r.error);
    return (r.data ?? []) as Job[];
  }
  async atualizarJob(id: string, patch: Partial<Omit<Job, 'id'>>) {
    const r = await this.db.from('agente_jobs').update(patch).eq('id', id);
    falha('atualizarJob', r.error);
  }
  async jobsDisparadosAntesDe(instante: string) {
    const r = await this.db.from('agente_jobs').select().eq('estado', 'disparado').lt('disparado_em', instante);
    falha('jobsDisparadosAntesDe', r.error);
    return (r.data ?? []) as Job[];
  }
  async registrarTentativa(jobId: string, nonceHash: string) {
    const r = await this.db.from('agente_tentativas').insert({ job_id: jobId, nonce_hash: nonceHash }).select().single();
    falha('registrarTentativa', r.error);
    return r.data as Tentativa;
  }
  async atualizarTentativa(id: string, patch: Partial<Pick<Tentativa, 'status_http' | 'sessao_url' | 'usado_em'>>) {
    const r = await this.db.from('agente_tentativas').update(patch).eq('id', id);
    falha('atualizarTentativa', r.error);
  }
  async buscarTentativaPorHash(h: string) {
    const r = await this.db.from('agente_tentativas').select().eq('nonce_hash', h).maybeSingle();
    falha('buscarTentativaPorHash', r.error);
    return (r.data as Tentativa) ?? null;
  }
  async usoHoje(rotina: IdRotina) {
    const r = await this.db.from('agente_uso_hoje').select('disparos').eq('rotina', rotina).maybeSingle();
    falha('usoHoje', r.error);
    return (r.data?.disparos as number | undefined) ?? 0;
  }
  private async lerConfig<T>(chave: string, padrao: T): Promise<T> {
    const r = await this.db.from('configuracoes').select('valor').eq('chave', chave).maybeSingle();
    falha('lerConfig', r.error);
    return r.data ? (r.data.valor as T) : padrao;
  }
  lerPausaGeral() {
    return this.lerConfig(CONFIG.pausaGeral.chave, CONFIG.pausaGeral.padrao as boolean);
  }
  lerExpiracaoMin() {
    return this.lerConfig(CONFIG.jobExpiraMin.chave, CONFIG.jobExpiraMin.padrao as number);
  }
  async lerRotina(rotina: IdRotina) {
    const r = await this.db.from('agente_rotinas').select('pausada, teto_diario').eq('rotina', rotina).maybeSingle();
    falha('lerRotina', r.error);
    return { pausada: r.data?.pausada ?? false, teto_diario: r.data?.teto_diario ?? null };
  }
  async marcarRotina(rotina: IdRotina, patch: Record<string, unknown>) {
    const r = await this.db.from('agente_rotinas').update(patch).eq('rotina', rotina);
    falha('marcarRotina', r.error);
  }
  async registrarAtividade(agente: string, texto: string, link?: string) {
    const r = await this.db.from('atividades').insert({ agente, texto, link });
    falha('registrarAtividade', r.error);
  }
}
