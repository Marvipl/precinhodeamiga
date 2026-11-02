// Grava o conteúdo extra da Redatora (F-28). O texto final é montado por código a partir da entrada
// (nomes e preços do banco) e das frases da IA. Nada é publicado: a Lana copia e decide.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Processador } from '../jobs/runtime.ts';
import type { EntradaRedacaoExtra, SaidaRedacaoExtra } from '../core/contratos/redacao-extra.ts';
import { montarConteudo } from '../core/crescimento/montar.ts';

export const processarRedacaoExtra = (db: SupabaseClient): Processador => async (job, saida) => {
  const entrada = job.entrada as EntradaRedacaoExtra;
  const atual = await db.from('conteudos_extra').select('id, versao, estado').eq('id', entrada.conteudo_id).maybeSingle();
  if (atual.error) throw new Error(atual.error.message);
  // Conteúdo apagado, descartado ou já numa versão mais nova: o resultado antigo é ignorado.
  if (!atual.data || atual.data.versao !== entrada.versao || atual.data.estado === 'descartado') return;

  const m = montarConteudo(entrada, saida as SaidaRedacaoExtra);
  const r = await db
    .from('conteudos_extra')
    .update({
      estado: 'pronto',
      titulo: m.titulo,
      texto: m.texto,
      cenas: m.cenas,
      alertas: m.alertas,
      simulado: job.simulado,
      erro: null,
    })
    .eq('id', entrada.conteudo_id)
    .eq('versao', entrada.versao);
  if (r.error) throw new Error(r.error.message);

  const a = await db.from('atividades').insert({ agente: 'redatora', texto: m.atividade, link: '/comunidade' });
  if (a.error) throw new Error(a.error.message);
};
