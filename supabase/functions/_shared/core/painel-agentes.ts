// F-12: estado de cada rotina no painel "Como funciona" (última, próxima, erro, uso contra o teto).
// Código puro. Horários das rotinas do Anexo A.3 (Brasília, UTC-3 fixo).
import { ROTINAS, type IdRotina } from './agentes.ts';
import { dataLocal, instanteLocal, somarDias } from './formato.ts';

export interface AgendaRotina {
  /** Texto para a tela. */
  descricao: string;
  /** Horários fixos HH:MM e dias da semana (0 = domingo); vazio = só sob demanda. */
  horarios: string[];
  dias: number[] | 'todos';
}

function cadaMeiaHora(de: string, ate: string): string[] {
  const out: string[] = [];
  const [h0, m0] = de.split(':').map(Number);
  const [h1, m1] = ate.split(':').map(Number);
  for (let m = h0 * 60 + m0; m <= h1 * 60 + m1; m += 30) out.push(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
  return out;
}

export const AGENDA: Record<IdRotina, AgendaRotina> = {
  'pa-curadoria': { descricao: 'Todo dia às 05:37 e sob demanda para pedidos', horarios: ['05:37'], dias: 'todos' },
  'pa-redacao': { descricao: 'Sob demanda, quando você pede outra versão', horarios: [], dias: 'todos' },
  'pa-atendente': { descricao: 'A cada 30 minutos, das 8h às 22h30, se houver mensagem', horarios: cadaMeiaHora('08:00', '22:30'), dias: 'todos' },
  'pa-analista': { descricao: 'Segundas às 06:43; leitura de print sob demanda', horarios: ['06:43'], dias: [1] },
  'pa-radar': { descricao: 'Segundas às 07:07', horarios: ['07:07'], dias: [1] },
  'pa-coach': { descricao: 'Segundas às 06:23', horarios: ['06:23'], dias: [1] },
};

/** Próximo horário agendado da rotina depois de `agora`, ou null se só roda sob demanda. */
export function proximaExecucao(rotina: IdRotina, agora: Date): Date | null {
  const a = AGENDA[rotina];
  if (a.horarios.length === 0) return null;
  const hoje = dataLocal(agora);
  for (let d = 0; d <= 7; d++) {
    const data = somarDias(hoje, d);
    const semana = new Date(`${data}T12:00:00Z`).getUTCDay();
    if (a.dias !== 'todos' && !a.dias.includes(semana)) continue;
    for (const h of a.horarios) {
      const t = instanteLocal(data, h);
      if (t.getTime() > agora.getTime()) return t;
    }
  }
  return null;
}

export type SituacaoRotina = 'pausa_geral' | 'pausada' | 'teto' | 'erro' | 'ok' | 'nunca';

export interface EstadoRotina {
  situacao: SituacaoRotina;
  rotulo: string;
  uso: number;
  teto: number;
}

export function estadoRotina(p: {
  rotina: IdRotina;
  pausaGeral: boolean;
  pausada: boolean;
  tetoDiario: number | null;
  usoHoje: number;
  ultimaExecucao: string | null;
  ultimoErro: string | null;
}): EstadoRotina {
  const teto = p.tetoDiario ?? ROTINAS[p.rotina].tetoDiario;
  const base = { uso: p.usoHoje, teto };
  if (p.pausaGeral) return { ...base, situacao: 'pausa_geral', rotulo: 'Pausada (todos os agentes)' };
  if (p.pausada) return { ...base, situacao: 'pausada', rotulo: 'Pausada' };
  if (p.ultimoErro) return { ...base, situacao: 'erro', rotulo: 'Com erro' };
  if (p.usoHoje >= teto) return { ...base, situacao: 'teto', rotulo: 'Teto do dia atingido' };
  if (!p.ultimaExecucao) return { ...base, situacao: 'nunca', rotulo: 'Ainda não rodou' };
  return { ...base, situacao: 'ok', rotulo: 'Funcionando' };
}

/** Valida o teto diário que o dono informa: inteiro de 0 a 100 (0 = não dispara). */
export function validarTeto(v: unknown): { ok: true; valor: number } | { ok: false; erro: string } {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= 100
    ? { ok: true, valor: n }
    : { ok: false, erro: 'Teto entre 0 e 100 disparos por dia.' };
}
