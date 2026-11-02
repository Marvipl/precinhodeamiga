// Roteiro do dia (seção 5.14). Código puro.
// A Coach monta a lista pelo tempo que a Lana tem agora: ordena as tarefas pendentes por prioridade,
// percorre a lista e inclui cada tarefa que ainda cabe no tempo restante, pulando a que não cabe
// e seguindo para a próxima (como no código do mock).

export type Tela = 'ofertas' | 'publicar' | 'radar' | 'audiencia' | 'comunidade' | 'plano';

export const ORCAMENTOS = [10, 20, 40] as const;
export type Orcamento = (typeof ORCAMENTOS)[number];
export const ORCAMENTO_PADRAO: Orcamento = 20;

/**
 * Telas que já existem no painel. Na V1, só entram no roteiro tarefas destas telas (seção 3, "Como a V1 funciona").
 * Cada pacote que entrega uma tela de destino acrescenta o nome aqui (uma linha).
 */
export const TELAS_PRONTAS: readonly Tela[] = ['ofertas', 'publicar'];

export type IdTarefa =
  | 'aprovar_ofertas'
  | 'enviar_bloco_wa'
  | 'divulgar_link'
  | 'status_wa'
  | 'seguidores_wa'
  | 'caixa_mensagens'
  | 'tarefa_semana'
  | 'video_curto';

export interface Tarefa {
  id: IdTarefa;
  prioridade: 1 | 2 | 3;
  minutos: number;
  titulo: string;
  nota: string;
  tela: Tela;
}

/** Catálogo inicial (tabela da seção 5.14; notas do mock). */
export const CATALOGO: readonly Tarefa[] = [
  { id: 'aprovar_ofertas', prioridade: 1, minutos: 5, titulo: 'Aprovar as ofertas do dia', nota: 'A Caçadora já separou e pontuou.', tela: 'ofertas' },
  { id: 'enviar_bloco_wa', prioridade: 1, minutos: 5, titulo: 'Enviar o bloco da noite no canal do WhatsApp', nota: 'Texto e arte prontos. O Telegram sai sozinho.', tela: 'publicar' },
  { id: 'divulgar_link', prioridade: 2, minutos: 3, titulo: 'Divulgar seu link em um lugar aprovado', nota: 'O Radar mostra onde hoje é permitido e deixa o convite pronto.', tela: 'radar' },
  { id: 'status_wa', prioridade: 2, minutos: 3, titulo: 'Postar achados no Status do WhatsApp', nota: 'Artes prontas no modelo da marca.', tela: 'publicar' },
  { id: 'seguidores_wa', prioridade: 2, minutos: 2, titulo: 'Atualizar os seguidores do WhatsApp', nota: 'Uma vez por semana. Digite o número ou mande um print.', tela: 'audiencia' },
  { id: 'caixa_mensagens', prioridade: 2, minutos: 5, titulo: 'Revisar a caixa de mensagens', nota: 'A Atendente já respondeu o simples. Ficam só pedidos e dúvidas que o anúncio não responde.', tela: 'comunidade' },
  { id: 'tarefa_semana', prioridade: 3, minutos: 10, titulo: 'Tarefa da semana do plano', nota: 'A tarefa desta semana do plano de 90 dias.', tela: 'plano' },
  { id: 'video_curto', prioridade: 3, minutos: 9, titulo: 'Gravar um vídeo curto de produto', nota: 'Roteiro de 30 segundos pronto. Pode ser só as mãos e o produto.', tela: 'comunidade' },
];

/** O que existe hoje para cada tarefa. Valores ausentes contam como "sem objeto". */
export interface ContextoDia {
  telasProntas?: readonly Tela[];
  /** 0 = domingo ... 1 = segunda. */
  diaDaSemana: number;
  ofertasPendentes: number;
  /** Envios do WhatsApp ainda não marcados no bloco de hoje. */
  enviosWhatsappPendentes: number;
  /** Artes do Status de hoje. */
  artesStatus: number;
  /** Lugares liberados com última divulgação há mais de 48 horas. */
  lugaresLiberados?: number;
  /** Mensagens que pedem revisão da Lana. */
  mensagensPendentes?: number;
  /** Tarefa da semana do plano ainda aberta (título vindo do plano). */
  tarefaDaSemana?: { titulo: string; minutos?: number } | null;
  /** Roteiro de vídeo pronto para hoje. */
  roteiroVideoPronto?: boolean;
  /** Recalibração dos minutos pelo tempo real registrado [SUPOSIÇÃO]. */
  minutosRecalibrados?: Partial<Record<IdTarefa, number>>;
}

function temObjeto(t: Tarefa, c: ContextoDia): boolean {
  switch (t.id) {
    case 'aprovar_ofertas':
      return c.ofertasPendentes > 0;
    case 'enviar_bloco_wa':
      return c.enviosWhatsappPendentes > 0;
    case 'divulgar_link':
      return (c.lugaresLiberados ?? 0) > 0;
    case 'status_wa':
      return c.artesStatus > 0;
    case 'seguidores_wa':
      return c.diaDaSemana === 1;
    case 'caixa_mensagens':
      return (c.mensagensPendentes ?? 0) > 0;
    case 'tarefa_semana':
      return !!c.tarefaDaSemana;
    case 'video_curto':
      return !!c.roteiroVideoPronto;
  }
}

/** Tarefas do dia: só de telas prontas e só com objeto no dia (seção 5.14). */
export function tarefasDoDia(c: ContextoDia, catalogo: readonly Tarefa[] = CATALOGO): Tarefa[] {
  const telas = c.telasProntas ?? TELAS_PRONTAS;
  return catalogo
    .filter((t) => telas.includes(t.tela) && temObjeto(t, c))
    .map((t) => {
      let out: Tarefa = t;
      if (t.id === 'tarefa_semana' && c.tarefaDaSemana) {
        out = { ...t, titulo: c.tarefaDaSemana.titulo, minutos: c.tarefaDaSemana.minutos ?? t.minutos };
      }
      const m = c.minutosRecalibrados?.[t.id];
      if (m && m > 0) out = { ...out, minutos: m };
      if (t.id === 'aprovar_ofertas') out = { ...out, nota: `${c.ofertasPendentes} ${c.ofertasPendentes === 1 ? 'oferta separada' : 'ofertas separadas'} e pontuadas pela Caçadora.` };
      if (t.id === 'status_wa') out = { ...out, nota: `${c.artesStatus} ${c.artesStatus === 1 ? 'arte pronta' : 'artes prontas'} no modelo da marca.` };
      return out;
    });
}

export interface Roteiro {
  incluidas: Tarefa[];
  usados: number;
  orcamento: number;
  /** Tarefas do dia que não couberam. */
  ficaram: number;
}

/**
 * Monta o roteiro: ordena por prioridade (estável) e inclui cada tarefa que cabe no tempo restante.
 * Tarefas já marcadas como feitas continuam na lista (aparecem riscadas) e contam no tempo, como no mock.
 */
export function montarRoteiro(tarefas: readonly Tarefa[], orcamento: number): Roteiro {
  const ordenadas = tarefas
    .map((t, i) => ({ t, i }))
    .sort((a, b) => a.t.prioridade - b.t.prioridade || a.i - b.i)
    .map((x) => x.t);
  const incluidas: Tarefa[] = [];
  let usados = 0;
  for (const t of ordenadas) {
    if (usados + t.minutos > orcamento) continue;
    usados += t.minutos;
    incluidas.push(t);
  }
  return { incluidas, usados, orcamento, ficaram: tarefas.length - incluidas.length };
}

/** Rodapé do roteiro, no texto do mock. */
export function rodapeRoteiro(r: Roteiro): string {
  const base = `${r.usados} min de ${r.orcamento} disponíveis.`;
  if (r.ficaram <= 0) return `${base} Tudo do dia cabe no seu tempo.`;
  return `${base} ${r.ficaram} ${r.ficaram > 1 ? 'tarefas ficam' : 'tarefa fica'} para quando você tiver mais tempo.`;
}
