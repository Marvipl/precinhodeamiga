// Interface de persistência dos jobs. Implementações: Supabase (store-supabase.ts) e memória (testes).
import type { IdRotina } from '../core/agentes.ts';
import type { EstadoJob } from '../core/jobs.ts';

export interface Job {
  id: string;
  rotina: IdRotina;
  contrato: string;
  entrada: unknown;
  chave_unica: string;
  estado: EstadoJob;
  tentativas: number;
  proxima_tentativa_em: string;
  sessao_url: string | null;
  erro: string | null;
  saida: unknown;
  simulado: boolean;
  criado_em: string;
  disparado_em: string | null;
  concluido_em: string | null;
}

export interface Tentativa {
  id: string;
  job_id: string;
  nonce_hash: string;
  status_http: number | null;
  sessao_url: string | null;
  usado_em: string | null;
  criado_em: string;
}

export interface NovoJob {
  rotina: IdRotina;
  contrato: string;
  entrada: unknown;
  chave_unica: string;
}

export interface JobStore {
  /** Cria o job; se a chave_unica já existe, devolve o existente com `criado: false`. */
  criarJob(novo: NovoJob): Promise<{ job: Job; criado: boolean }>;
  buscarJob(id: string): Promise<Job | null>;
  /** Marca até `limite` pendentes vencidos como disparado (atômico) e os devolve. */
  tomarPendentes(limite: number): Promise<Job[]>;
  atualizarJob(id: string, patch: Partial<Omit<Job, 'id'>>): Promise<void>;
  jobsDisparadosAntesDe(instante: string): Promise<Job[]>;

  registrarTentativa(jobId: string, nonceHash: string): Promise<Tentativa>;
  atualizarTentativa(id: string, patch: Partial<Pick<Tentativa, 'status_http' | 'sessao_url' | 'usado_em'>>): Promise<void>;
  buscarTentativaPorHash(nonceHash: string): Promise<Tentativa | null>;
  usoHoje(rotina: IdRotina): Promise<number>;

  lerPausaGeral(): Promise<boolean>;
  lerExpiracaoMin(): Promise<number>;
  lerRotina(rotina: IdRotina): Promise<{ pausada: boolean; teto_diario: number | null }>;
  marcarRotina(rotina: IdRotina, patch: { ultima_execucao?: string; ultimo_erro?: string | null; ultimo_erro_em?: string | null }): Promise<void>;
  registrarAtividade(agente: string, texto: string, link?: string): Promise<void>;
}
