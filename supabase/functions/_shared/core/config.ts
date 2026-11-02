// Valores iniciais das regras (seção 5 do documento de produto) e das configurações (F-14).
// A tabela `configuracoes` guarda só o que foi alterado; `lerConfig` junta os dois.
// Itens marcados [SUPOSIÇÃO] estão registrados em docs/decisions.md.
//
// Código puro: sem dependências, roda no navegador, no Node (testes) e no Deno (Edge Functions).

export type Papel = 'operadora' | 'dono';

export interface CampoConfig<T = unknown> {
  chave: string;
  rotulo: string;
  padrao: T;
  soDono: boolean;
  grupo: 'operacao' | 'regras' | 'agentes' | 'integracoes';
  ajuda?: string;
}

function campo<T>(c: CampoConfig<T>): CampoConfig<T> {
  return c;
}

export const CONFIG = {
  // --- Lana (operação) ---
  dataInicioPlano: campo({
    chave: 'plano.data_inicio',
    rotulo: 'Data de início do plano',
    padrao: '2026-11-02',
    soDono: false,
    grupo: 'operacao',
    ajuda: 'O dia 1 do plano de 90 dias.',
  }),
  blocoNoite: campo({
    chave: 'agenda.bloco_noite',
    rotulo: 'Bloco da noite',
    padrao: { inicio: '20:00', fim: '23:00', ligado: true },
    soDono: false,
    grupo: 'operacao',
  }),
  blocoAlmoco: campo({
    chave: 'agenda.bloco_almoco',
    rotulo: 'Bloco do almoço',
    padrao: { inicio: '12:00', fim: '13:30', ligado: false }, // [SUPOSIÇÃO] horário; desligado no início (ponto 7)
    soDono: false,
    grupo: 'operacao',
  }),
  blocosRevisao: campo({
    chave: 'atendente.blocos_revisao',
    rotulo: 'Blocos de revisão das mensagens',
    padrao: ['12:00', '21:00'] as string[],
    soDono: false,
    grupo: 'operacao',
  }),
  linkCanalWhatsapp: campo({
    chave: 'canais.whatsapp_link',
    rotulo: 'Link do canal do WhatsApp',
    padrao: '' as string,
    soDono: false,
    grupo: 'operacao',
  }),
  linkCanalTelegram: campo({
    chave: 'canais.telegram_link',
    rotulo: 'Link do canal no Telegram',
    padrao: '' as string,
    soDono: false,
    grupo: 'operacao',
  }),
  artesStatusPorDia: campo({
    chave: 'status.artes_por_dia',
    rotulo: 'Artes do Status por dia',
    padrao: 3,
    soDono: false,
    grupo: 'operacao',
    ajuda: 'De 3 a 5.',
  }),
  temasAutomaticos: campo({
    chave: 'atendente.temas_automaticos',
    rotulo: 'Temas que a Atendente responde sozinha (nível 2)',
    padrao: [] as string[],
    soDono: false,
    grupo: 'operacao',
  }),

  // --- Marcus (regras, seção 5) ---
  janelaHistoricoDias: campo({ chave: 'regras.janela_historico_dias', rotulo: 'Janela do histórico (dias)', padrao: 30, soDono: true, grupo: 'regras' }),
  descontoRealMinimo: campo({ chave: 'regras.desconto_real_minimo', rotulo: 'Desconto real mínimo', padrao: 0.1, soDono: true, grupo: 'regras' }),
  historicoCurtoDias: campo({ chave: 'regras.historico_curto_dias', rotulo: 'Histórico curto (menos de N dias)', padrao: 7, soDono: true, grupo: 'regras' }),
  lojaNotaMinima: campo({ chave: 'regras.loja_nota_minima', rotulo: 'Nota mínima da loja', padrao: null as number | null, soDono: true, grupo: 'regras', ajuda: 'A definir pelo dono.' }),
  lojaAvaliacoesMinimas: campo({ chave: 'regras.loja_avaliacoes_minimas', rotulo: 'Avaliações mínimas da loja', padrao: null as number | null, soDono: true, grupo: 'regras', ajuda: 'A definir pelo dono.' }),
  pesosNota: campo({
    chave: 'regras.pesos_nota',
    rotulo: 'Pesos da nota (0 a 100)',
    padrao: { desconto: 35, comissao: 25, avaliacao: 20, aderencia: 10, prazo: 10 },
    soDono: true,
    grupo: 'regras',
  }),
  candidatasParaIa: campo({ chave: 'regras.candidatas_ia', rotulo: 'Candidatas enviadas à Caçadora', padrao: 30, soDono: true, grupo: 'regras' }),
  folgaFila: campo({ chave: 'regras.folga_fila', rotulo: 'Folga da fila (cadência + N)', padrao: 2, soDono: true, grupo: 'regras' }),
  fraseMaxCaracteres: campo({ chave: 'regras.frase_max', rotulo: 'Tamanho máximo da frase', padrao: 140, soDono: true, grupo: 'regras' }),
  repeticaoHoras: campo({ chave: 'regras.repeticao_horas', rotulo: 'Sem repetir produto no canal (horas)', padrao: 48, soDono: true, grupo: 'regras' }),
  cadenciaInicial: campo({ chave: 'regras.cadencia_inicial', rotulo: 'Cadência inicial (posts/dia/canal)', padrao: 6, soDono: true, grupo: 'regras' }),
  cadenciaMaxima: campo({ chave: 'regras.cadencia_maxima', rotulo: 'Cadência máxima', padrao: 10, soDono: true, grupo: 'regras' }),
  cadenciaMinima: campo({ chave: 'regras.cadencia_minima', rotulo: 'Cadência mínima após redução', padrao: 2, soDono: true, grupo: 'regras' }),
  limiteQuedaInicial: campo({ chave: 'regras.limite_queda', rotulo: 'Limite de queda semanal', padrao: 0.03, soDono: true, grupo: 'regras' }),
  intervaloMaxMin: campo({ chave: 'regras.intervalo_max_min', rotulo: 'Intervalo máximo entre posts (min)', padrao: 40, soDono: true, grupo: 'regras' }),
  intervaloMinMin: campo({ chave: 'regras.intervalo_min_min', rotulo: 'Intervalo mínimo entre posts (min)', padrao: 20, soDono: true, grupo: 'regras' }),
  inicioLimitePico: campo({ chave: 'regras.inicio_limite_pico', rotulo: 'Início mais cedo do bloco', padrao: '18:00', soDono: true, grupo: 'regras' }),
  checagemAntesEnvioMin: campo({ chave: 'regras.checagem_antes_envio_min', rotulo: 'Checagem de preço antes do envio (min)', padrao: 5, soDono: true, grupo: 'regras' }),
  sessaoInativaHoras: campo({ chave: 'regras.sessao_inativa_horas', rotulo: 'Fechar sessão sem atividade (horas)', padrao: 2, soDono: true, grupo: 'regras' }),
  valorHoraReferencia: campo({ chave: 'regras.valor_hora_referencia', rotulo: 'Valor-hora de referência (R$)', padrao: 7.37, soDono: true, grupo: 'regras' }),
  valorHoraParar: campo({ chave: 'regras.valor_hora_parar', rotulo: 'Valor-hora para "parar ou repensar" (R$)', padrao: 3.68, soDono: true, grupo: 'regras' }),

  // --- Marcus (agentes) ---
  pausaGeral: campo({ chave: 'agentes.pausa_geral', rotulo: 'Pausar todos os agentes', padrao: false, soDono: true, grupo: 'agentes' }),
  jobExpiraMin: campo({ chave: 'agentes.job_expira_min', rotulo: 'Job sem retorno expira em (min)', padrao: 45, soDono: true, grupo: 'agentes' }),
} as const;

export type ChaveConfig = keyof typeof CONFIG;
export type ValorConfig<K extends ChaveConfig> = (typeof CONFIG)[K]['padrao'];
export type ConfigResolvida = { [K in ChaveConfig]: ValorConfig<K> };

/** Junta os valores iniciais com as linhas salvas na tabela `configuracoes` ({chave, valor}). */
export function resolverConfig(linhas: ReadonlyArray<{ chave: string; valor: unknown }>): ConfigResolvida {
  const porChave = new Map(linhas.map((l) => [l.chave, l.valor]));
  const out: Record<string, unknown> = {};
  for (const [nome, def] of Object.entries(CONFIG)) {
    out[nome] = porChave.has(def.chave) ? porChave.get(def.chave) : def.padrao;
  }
  return out as ConfigResolvida;
}

export function camposDoPapel(papel: Papel): CampoConfig[] {
  return Object.values(CONFIG).filter((c) => papel === 'dono' || !c.soDono) as CampoConfig[];
}
