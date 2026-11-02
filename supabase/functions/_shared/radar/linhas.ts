// Converte a saída do Radar em linhas de radar_lugares. Código puro (testado).
import type { SaidaRadar } from '../core/contratos/radar.ts';
import { AVISO_PROIBE_LINKS, chaveLugar } from '../core/radar/lugares.ts';

export function linhasDosLugares(saida: SaidaRadar, jobId: string | null) {
  const vistas = new Set<string>();
  const out = [];
  for (const l of saida.lugares) {
    const chave = chaveLugar(l);
    if (vistas.has(chave)) continue; // a mesma resposta não grava o lugar duas vezes
    vistas.add(chave);
    out.push({
      chave,
      nome: l.nome,
      tipo: l.tipo,
      regiao: l.regiao,
      url: l.url,
      membros: l.membros,
      nota: l.nota,
      regra: l.regra,
      proibe_links: l.proibe_links,
      motivo: l.motivo,
      aviso: l.proibe_links ? AVISO_PROIBE_LINKS : null,
      mensagens: l.mensagens,
      alertas: l.alertas,
      estado: 'novo' as const,
      job_id: jobId,
    });
  }
  return out;
}
