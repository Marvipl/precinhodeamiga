// Regras automáticas com o valor vigente (F-23). Os textos vêm das seções 5.6 e 5.9; os valores
// configuráveis vêm da configuração atual (Marcus altera em Configurações). Código puro.

import { porcento, reais } from '../formato.ts';

export interface ValoresRegras {
  cadenciaInicial: number;
  cadenciaMaxima: number;
  cadenciaMinima: number;
  limiteQuedaInicial: number;
}

export interface LinhaRegra {
  regra: string;
  quando: string;
  acontece: string;
}

export function regrasAutomaticas(v: ValoresRegras): LinhaRegra[] {
  const lim = porcento(v.limiteQuedaInicial);
  return [
    { regra: 'Cadência', quando: 'Início', acontece: `${v.cadenciaInicial} posts por dia por canal` },
    { regra: 'Cadência', quando: '2 semanas seguidas com taxa de saída até 1% e cliques por post sem cair mais de 10%', acontece: `Mais 1 post por dia, até ${v.cadenciaMaxima}` },
    { regra: 'Cadência', quando: `Taxa de saída semanal acima do limite de queda (${lim} no início)`, acontece: `Menos 2 posts por dia, nunca abaixo de ${v.cadenciaMinima}. Volta a subir pela regra normal.` },
    { regra: 'Cadência', quando: 'Taxa de saída acima de 5% em uma semana', acontece: 'Um dia sem posts naquele canal e revisão da curadoria com a Lana' },
    { regra: 'Limite de queda', quando: 'Depois de 4 semanas de dados', acontece: 'Passa a ser o dobro da taxa de saída média semanal do canal, entre 2% e 5%' },
    { regra: 'Formalização', quando: `Comissão bruta acima de ${reais(3000)} por 2 meses seguidos`, acontece: `Conversa com contador antes de chegar a ${reais(5000)}, limite da isenção mensal de IR. A plataforma não faz nada fiscal.` },
    { regra: 'Anúncios', quando: 'Gatilho de investimento atingido', acontece: 'Mês de teste com 10% da comissão líquida do mês anterior' },
    { regra: 'Anúncios', quando: 'Sempre', acontece: 'Custo por novo seguidor de até metade do valor do seguidor. O anúncio leva ao canal, nunca a um link de oferta.' },
    { regra: 'Anúncios', quando: 'Custo abaixo do teto no mês de teste', acontece: 'Verba sobe para 20%' },
    { regra: 'Anúncios', quando: 'Custo acima do teto por 2 semanas, ou queda acima de 3% durante a campanha', acontece: 'Pausa e revisão do criativo' },
    { regra: 'Vídeos com IA', quando: 'Gatilho atingido e 8 vídeos manuais medidos', acontece: 'Até 10% da comissão líquida. Anúncios e vídeos somados ficam em até 30%.' },
    { regra: 'Vídeos com IA', quando: 'Cliques por vídeo abaixo da média dos vídeos manuais por 4 semanas', acontece: 'Volta para vídeo manual' },
  ];
}
