// Lembrete no dia permitido (F-21). A conta do dia fica em core/radar/agenda.ts.
import type { SupabaseClient } from '@supabase/supabase-js';
import { dataLocal, instanteLocal } from '../core/formato.ts';
import { podeDivulgarHoje } from '../core/radar/agenda.ts';

export interface LugarAprovado {
  id: string;
  nome: string;
  estado: string;
  dias_permitidos: number[];
  intervalo_dias: number;
  ultima: string | null; // ISO da última divulgação
}

/** Nomes dos lugares liberados hoje. Código puro. */
export function liberadosHoje(lugares: LugarAprovado[], agora: Date): string[] {
  const hoje = dataLocal(agora);
  return lugares
    .filter((l) => podeDivulgarHoje({ ...l, ultima_divulgacao: l.ultima ? dataLocal(new Date(l.ultima)) : null }, hoje).ok)
    .map((l) => l.nome);
}

export function textoLembrete(nomes: string[]): { titulo: string; corpo: string } {
  const lista = nomes.length === 1 ? `"${nomes[0]}"` : `${nomes.slice(0, -1).map((n) => `"${n}"`).join(', ')} e "${nomes[nomes.length - 1]}"`;
  return {
    titulo: 'Dia de divulgar o seu link',
    corpo: `Hoje é dia permitido em ${lista}. O convite já está pronto no Radar.`,
  };
}

export async function lembreteDoDia(db: SupabaseClient, agora = new Date()): Promise<{ lugares: number; criado: boolean }> {
  const hoje = dataLocal(agora);
  const r = await db.from('radar_lugares').select('id, nome, estado, dias_permitidos, intervalo_dias').eq('estado', 'aprovado');
  if (r.error) throw new Error(r.error.message);
  const lugares: LugarAprovado[] = [];
  for (const l of r.data ?? []) {
    const d = await db.from('radar_divulgacoes').select('divulgado_em').eq('lugar_id', l.id).order('divulgado_em', { ascending: false }).limit(1);
    if (d.error) throw new Error(d.error.message);
    lugares.push({ ...l, ultima: d.data?.[0]?.divulgado_em ?? null });
  }
  const nomes = liberadosHoje(lugares, agora);
  if (!nomes.length) return { lugares: 0, criado: false };

  const inicio = instanteLocal(hoje, '00:00').toISOString();
  const ja = await db.from('notificacoes').select('id').eq('tipo', 'radar_lembrete').gte('criado_em', inicio).limit(1);
  if (ja.error) throw new Error(ja.error.message);
  if (ja.data?.length) return { lugares: nomes.length, criado: false };

  const { titulo, corpo } = textoLembrete(nomes);
  const ins = await db.from('notificacoes').insert({ tipo: 'radar_lembrete', titulo, corpo, link: '/radar' });
  if (ins.error) throw new Error(ins.error.message);
  return { lugares: nomes.length, criado: true };
}
