// Grava o resultado do curadoria/v1: ofertas na fila, opções dos pedidos e atividade do dia.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Processador } from '../jobs/runtime.ts';
import { entradaCuradoria, type SaidaCuradoria } from '../core/contratos/curadoria.ts';
import { aplicarSaidaCuradoria } from '../core/ofertas/curadoria.ts';
import { lerConfigServidor } from '../ofertas/config.ts';

export const processarCuradoria = (db: SupabaseClient): Processador => async (job, saida) => {
  const entrada = entradaCuradoria.parse(job.entrada);
  const cfg = await lerConfigServidor(db);

  // Pedidos cujas opções também entram na fila: os da Lana e os "achados a pedido" (V2).
  const naFila = new Set<string>();
  if (entrada.pedidos.length) {
    const r = await db.from('pedidos_produto').select('*').in('id', entrada.pedidos.map((p) => p.id));
    if (r.error) throw new Error(`curadoria/pedidos: ${r.error.message}`);
    for (const p of (r.data ?? []) as { id: string; origem: string; achado_a_pedido?: boolean | null }[]) {
      if (p.origem === 'lana' || p.achado_a_pedido === true) naFila.add(p.id);
    }
  }

  const res = aplicarSaidaCuradoria(entrada, saida as SaidaCuradoria, {
    fraseMax: cfg.fraseMaxCaracteres,
    historicoCurtoDias: cfg.historicoCurtoDias,
    jobId: job.id,
    pedidosNaFila: naFila,
  });
  if (res.descartes.length) console.warn(`curadoria ${job.id}: recusado pelo código`, res.descartes);

  if (res.ofertas.length) {
    const r = await db.from('ofertas').upsert(res.ofertas, { onConflict: 'produto_id,data,origem', ignoreDuplicates: true });
    if (r.error) throw new Error(`curadoria/ofertas: ${r.error.message}`);
  }
  if (res.opcoes.length) {
    const r = await db.from('pedido_opcoes').upsert(res.opcoes.map((o) => ({ ...o, job_id: job.id })), { onConflict: 'pedido_id,produto_id' });
    if (r.error) throw new Error(`curadoria/opcoes: ${r.error.message}`);
  }
  if (res.pedidosComOpcao.length) {
    const r = await db.from('pedidos_produto').update({ estado: 'opcoes_encontradas' }).in('id', res.pedidosComOpcao).eq('estado', 'procurando');
    if (r.error) throw new Error(`curadoria/pedidos: ${r.error.message}`);
  }

  const teste = job.simulado ? ' (modo simulado)' : '';
  const daRodada = res.ofertas.filter((o) => o.origem === 'rodada').length;
  const textos: string[] = [];
  if (entrada.tamanho_fila > 0) textos.push(daRodada === 1 ? `1 oferta na fila de hoje${teste}` : `${daRodada} ofertas na fila de hoje${teste}`);
  if (res.pedidosComOpcao.length) textos.push(`Opções encontradas para ${res.pedidosComOpcao.length} ${res.pedidosComOpcao.length === 1 ? 'pedido' : 'pedidos'}${teste}`);
  if (res.pedidosSemOpcao.length) textos.push(`Sem opção ainda para ${res.pedidosSemOpcao.length} ${res.pedidosSemOpcao.length === 1 ? 'pedido' : 'pedidos'}; procura de novo na próxima rodada${teste}`);
  if (textos.length) {
    const r = await db.from('atividades').insert(textos.map((texto) => ({ agente: 'cacadora', texto, link: '/ofertas' })));
    if (r.error) throw new Error(`curadoria/atividades: ${r.error.message}`);
  }
};
