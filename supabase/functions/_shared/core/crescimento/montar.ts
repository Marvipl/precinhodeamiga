// Monta o conteúdo final a partir da entrada (dados do banco) e da saída da Redatora. Código puro.
import type { EntradaRedacaoExtra, SaidaRedacaoExtra } from '../contratos/redacao-extra.ts';
import { textoLista, textoRespostas, textoRoteiro, type Cena } from './regras.ts';

export interface ConteudoMontado {
  titulo: string;
  texto: string;
  cenas: Cena[] | null;
  alertas: { trecho: string; motivo: string }[];
  atividade: string;
}

export function montarConteudo(e: EntradaRedacaoExtra, s: SaidaRedacaoExtra): ConteudoMontado {
  if (e.tipo !== s.tipo) throw new Error(`saída do tipo ${s.tipo} para pedido do tipo ${e.tipo}`);
  switch (s.tipo) {
    case 'roteiro_video':
      return {
        titulo: s.titulo,
        texto: textoRoteiro(s),
        cenas: s.cenas,
        alertas: s.alertas,
        atividade: `Redatora preparou um roteiro de vídeo: ${s.titulo}`,
      };
    case 'lista_data': {
      const ent = e as Extract<EntradaRedacaoExtra, { tipo: 'lista_data' }>;
      return {
        titulo: s.titulo,
        texto: textoLista({ titulo: s.titulo, abertura: s.abertura, achados: ent.achados, itens: s.itens }),
        cenas: null,
        alertas: s.alertas,
        atividade: `Redatora preparou a lista de achados: ${ent.data_pico.nome}`,
      };
    }
    case 'respostas_semana':
      return {
        titulo: s.titulo,
        texto: textoRespostas(s),
        cenas: null,
        alertas: s.alertas,
        atividade: 'Redatora preparou o post de respostas da semana',
      };
  }
}
