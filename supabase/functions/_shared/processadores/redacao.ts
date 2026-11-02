// Grava o resultado do redacao/v1 ("pedir outra versão"): nova frase volta para a fila.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Processador } from '../jobs/runtime.ts';
import { entradaRedacao, type SaidaRedacao } from '../core/contratos/redacao.ts';
import { aplicarSaidaRedacao, type OfertaAtual } from '../core/ofertas/redacao.ts';
import { lerConfigServidor } from '../ofertas/config.ts';

export const processarRedacao = (db: SupabaseClient): Processador => async (job, saida) => {
  const entrada = entradaRedacao.parse(job.entrada);
  const cfg = await lerConfigServidor(db);
  const ids = entrada.pedidos.map((p) => p.oferta_id);
  const r = await db.from('ofertas').select('id, estado, frase, frase_versao, alertas').in('id', ids);
  if (r.error) throw new Error(`redacao/ofertas: ${r.error.message}`);
  const atualizacoes = aplicarSaidaRedacao(entrada, saida as SaidaRedacao, (r.data ?? []) as OfertaAtual[], cfg.fraseMaxCaracteres);
  for (const { id, ...patch } of atualizacoes) {
    // Condicional: se a Lana decidiu a oferta enquanto a Redatora escrevia, nada muda.
    const u = await db.from('ofertas').update(patch).eq('id', id).eq('estado', 'aguardando_redacao');
    if (u.error) throw new Error(`redacao/atualizar: ${u.error.message}`);
  }
  if (atualizacoes.length) {
    const n = atualizacoes.length;
    const teste = job.simulado ? ' (modo simulado)' : '';
    const a = await db.from('atividades').insert({
      agente: 'redatora',
      texto: n === 1 ? `Nova versão de 1 frase voltou para a fila${teste}` : `Novas versões de ${n} frases voltaram para a fila${teste}`,
      link: '/ofertas',
    });
    if (a.error) throw new Error(`redacao/atividades: ${a.error.message}`);
  }
};
