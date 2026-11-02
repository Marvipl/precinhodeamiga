// JobStore em memória, para testes e simulações locais.
import type { IdRotina } from '../core/agentes.ts';
import { dataLocal } from '../core/formato.ts';
import type { Job, JobStore, NovoJob, Tentativa } from './store.ts';

export class JobStoreMemoria implements JobStore {
  jobs = new Map<string, Job>();
  tentativas = new Map<string, Tentativa>();
  rotinas = new Map<IdRotina, { pausada: boolean; teto_diario: number | null; ultima_execucao?: string; ultimo_erro?: string | null }>();
  atividades: { agente: string; texto: string; link?: string }[] = [];
  pausaGeral = false;
  expiracaoMin = 45;
  private seq = 0;

  constructor(private agora: () => Date = () => new Date()) {}

  private id(): string {
    this.seq += 1;
    return `00000000-0000-4000-8000-${String(this.seq).padStart(12, '0')}`;
  }

  async criarJob(novo: NovoJob) {
    const existente = [...this.jobs.values()].find((j) => j.chave_unica === novo.chave_unica);
    if (existente) return { job: existente, criado: false };
    const agora = this.agora().toISOString();
    const job: Job = {
      id: this.id(),
      ...novo,
      estado: 'pendente',
      tentativas: 0,
      proxima_tentativa_em: agora,
      sessao_url: null,
      erro: null,
      saida: null,
      simulado: false,
      criado_em: agora,
      disparado_em: null,
      concluido_em: null,
    };
    this.jobs.set(job.id, job);
    return { job: { ...job }, criado: true };
  }
  async buscarJob(id: string) {
    const j = this.jobs.get(id);
    return j ? { ...j } : null;
  }
  async tomarPendentes(limite: number) {
    const agora = this.agora();
    const lista = [...this.jobs.values()]
      .filter((j) => j.estado === 'pendente' && Date.parse(j.proxima_tentativa_em) <= agora.getTime())
      .sort((a, b) => a.criado_em.localeCompare(b.criado_em))
      .slice(0, limite);
    for (const j of lista) {
      j.estado = 'disparado';
      j.disparado_em = agora.toISOString();
      j.tentativas += 1;
    }
    return lista.map((j) => ({ ...j }));
  }
  async atualizarJob(id: string, patch: Partial<Omit<Job, 'id'>>) {
    const j = this.jobs.get(id);
    if (j) Object.assign(j, patch);
  }
  async jobsDisparadosAntesDe(instante: string) {
    return [...this.jobs.values()].filter((j) => j.estado === 'disparado' && j.disparado_em && j.disparado_em < instante).map((j) => ({ ...j }));
  }
  async registrarTentativa(jobId: string, nonceHash: string) {
    const t: Tentativa = { id: this.id(), job_id: jobId, nonce_hash: nonceHash, status_http: null, sessao_url: null, usado_em: null, criado_em: this.agora().toISOString() };
    this.tentativas.set(t.id, t);
    return { ...t };
  }
  async atualizarTentativa(id: string, patch: Partial<Pick<Tentativa, 'status_http' | 'sessao_url' | 'usado_em'>>) {
    const t = this.tentativas.get(id);
    if (t) Object.assign(t, patch);
  }
  async buscarTentativaPorHash(h: string) {
    const t = [...this.tentativas.values()].find((x) => x.nonce_hash === h);
    return t ? { ...t } : null;
  }
  async usoHoje(rotina: IdRotina) {
    const hoje = dataLocal(this.agora());
    return [...this.tentativas.values()].filter((t) => this.jobs.get(t.job_id)?.rotina === rotina && dataLocal(new Date(t.criado_em)) === hoje).length;
  }
  async lerPausaGeral() {
    return this.pausaGeral;
  }
  async lerExpiracaoMin() {
    return this.expiracaoMin;
  }
  async lerRotina(rotina: IdRotina) {
    const r = this.rotinas.get(rotina);
    return { pausada: r?.pausada ?? false, teto_diario: r?.teto_diario ?? null };
  }
  async marcarRotina(rotina: IdRotina, patch: { ultima_execucao?: string; ultimo_erro?: string | null }) {
    const r = this.rotinas.get(rotina) ?? { pausada: false, teto_diario: null };
    this.rotinas.set(rotina, { ...r, ...patch });
  }
  async registrarAtividade(agente: string, texto: string, link?: string) {
    this.atividades.push({ agente, texto, link });
  }
}
