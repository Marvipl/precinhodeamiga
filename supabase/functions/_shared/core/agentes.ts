// Os oito agentes (seção 5.17) e as seis rotinas do Claude Code (Anexo A.3).
// Código puro.

export type IdAgente =
  | 'cacadora'
  | 'redatora'
  | 'guardia'
  | 'agendadora'
  | 'analista'
  | 'coach'
  | 'radar'
  | 'atendente';

export interface Agente {
  id: IdAgente;
  nome: string;
  faz: string;
  quando: string;
  onde: string;
  nunca: string;
}

export const AGENTES: readonly Agente[] = [
  {
    id: 'cacadora',
    nome: 'Caçadora de Ofertas',
    faz: 'Escolhe as ofertas do dia entre as melhores notas, explica os motivos e atende pedidos',
    quando: 'Rodada diária de madrugada e sob demanda',
    onde: 'Coleta e nota em código; escolha em rotina de IA',
    nunca: 'Indica loja mal avaliada ou "de/por" sem histórico',
  },
  {
    id: 'redatora',
    nome: 'Redatora',
    faz: 'Frase de cada post, outra versão, roteiros de vídeo, listas de datas, mensagens do Radar, rascunhos da Atendente',
    quando: 'Na rodada diária e quando você pede outra versão',
    onde: 'Papel dentro das rotinas de curadoria, redação, Radar e Atendente; montagem do post e da arte em código',
    nunca: 'Publica sozinha',
  },
  {
    id: 'guardia',
    nome: 'Guardiã',
    faz: 'Barra post com problema e acompanha sinais de risco',
    quando: 'Na montagem, no agendamento e antes do envio',
    onde: 'Código (checagens); IA só para revisar promessas no texto',
    nunca: 'Libera post sem aviso de comissão',
  },
  {
    id: 'agendadora',
    nome: 'Agendadora',
    faz: 'Monta os blocos no horário de pico e publica no Telegram',
    quando: 'Todo dia',
    onde: 'Código',
    nunca: 'Envia mensagem automática no WhatsApp',
  },
  {
    id: 'analista',
    nome: 'Analista',
    faz: 'Indicadores, gates, regras automáticas, resumo semanal e leitura de print',
    quando: 'Cálculos todo dia; resumo toda segunda; print sob demanda',
    onde: 'Cálculos em código; texto do resumo e leitura de print em IA',
    nunca: 'Mostra número que não veio do painel',
  },
  {
    id: 'coach',
    nome: 'Coach do Plano',
    faz: 'Roteiro do dia e revisão semanal do plano',
    quando: 'Toda manhã (roteiro) e toda segunda (revisão)',
    onde: 'Roteiro em código; revisão semanal em IA',
    nunca: 'Passa do tempo que você informou',
  },
  {
    id: 'radar',
    nome: 'Radar de Comunidades',
    faz: 'Acha lugares, confere regras, escreve o pedido de permissão e mede cliques por lugar',
    quando: 'Busca semanal e lembrete no dia permitido',
    onde: 'Busca em IA; lembretes e medição em código',
    nunca: 'Posta oferta fora dos seus canais, entra em grupos ou adiciona pessoas',
  },
  {
    id: 'atendente',
    nome: 'Atendente',
    faz: 'Recebe mensagens, responde o simples e junta o resto para os blocos',
    quando: '24 horas por dia (nível 1); ciclos de 30 minutos das 8h às 22h30 (níveis 2 a 4)',
    onde: 'Nível 1 e respostas automáticas em código; demais níveis em IA',
    nunca: 'Finge ser você ou responde fora dos temas da Precinho',
  },
];

export type IdRotina = 'pa-curadoria' | 'pa-redacao' | 'pa-atendente' | 'pa-analista' | 'pa-radar' | 'pa-coach';

export interface Rotina {
  id: IdRotina;
  agentes: IdAgente[];
  /** Teto de disparos por dia (seção 8) [SUPOSIÇÃO]. */
  tetoDiario: number;
  /** Nome da variável de ambiente sem prefixo: ROUTINE_<SUFIXO>_ID / _TOKEN. */
  sufixoEnv: string;
  /** Jobs expirados desta rotina ganham nova tentativa automática (Anexo A.4, passo 6). */
  retentaAoExpirar: boolean;
}

export const ROTINAS: Record<IdRotina, Rotina> = {
  // curadoria: 1 diária + 8 sob demanda
  'pa-curadoria': { id: 'pa-curadoria', agentes: ['cacadora', 'redatora', 'guardia'], tetoDiario: 9, sufixoEnv: 'CURADORIA', retentaAoExpirar: true },
  'pa-redacao': { id: 'pa-redacao', agentes: ['redatora', 'guardia'], tetoDiario: 10, sufixoEnv: 'REDACAO', retentaAoExpirar: false },
  'pa-atendente': { id: 'pa-atendente', agentes: ['atendente', 'redatora', 'guardia'], tetoDiario: 30, sufixoEnv: 'ATENDENTE', retentaAoExpirar: false },
  // analista: 1 resumo semanal + 4 leituras de print por semana -> teto diário de 5 (o semanal é conferido pelo pacote da Analista)
  'pa-analista': { id: 'pa-analista', agentes: ['analista'], tetoDiario: 5, sufixoEnv: 'ANALISTA', retentaAoExpirar: false },
  'pa-radar': { id: 'pa-radar', agentes: ['radar', 'redatora', 'guardia'], tetoDiario: 1, sufixoEnv: 'RADAR', retentaAoExpirar: false },
  'pa-coach': { id: 'pa-coach', agentes: ['coach'], tetoDiario: 1, sufixoEnv: 'COACH', retentaAoExpirar: false },
};

export function agente(id: IdAgente): Agente {
  const a = AGENTES.find((x) => x.id === id);
  if (!a) throw new Error(`agente desconhecido: ${id}`);
  return a;
}
