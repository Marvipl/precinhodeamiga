# Decisões e suposições

Registro das escolhas técnicas e dos itens `[SUPOSIÇÃO]` do documento de produto (`docs/entrada/DOCUMENTO-DE-PRODUTO.md`).
Cada linha diz o que foi decidido e onde está no código. Quando o dono confirmar ou mudar algo, atualize aqui.

## Stack (fundação, 02/11/2026)

| Tema | Decisão | Por quê |
|---|---|---|
| Front | Vite + React 18 + TypeScript, React Router, TanStack Query | Leve, publica no Netlify como site estático (seção 8) |
| Visual | CSS do mock copiado para `src/styles/global.css` (mesmas classes) | O mock é a referência; cada tela reaproveita as classes dele |
| Backend | Supabase: Postgres com RLS em todas as tabelas, Auth, Edge Functions (Deno), pg_cron, Storage | Obrigatório pela seção 8 |
| Regras de negócio | Código puro em `supabase/functions/_shared/core/`, importado pelo front (`@core/...`) e pelas Edge Functions | Uma única fonte para regra determinística, testada com Vitest (seção 5) |
| Validação de contratos dos agentes | zod (mapeado para `npm:zod` no Deno via `supabase/functions/import_map.json`) | Mesmo esquema no front, nos testes e no endpoint de retorno |
| Testes de banco | PGlite (Postgres em WASM) aplica todas as migrações com um esqueleto do schema `auth` | Não há Docker no ambiente de desenvolvimento; pega erro de SQL e de RLS cedo |
| Modo local | Sem `VITE_SUPABASE_URL`, o painel abre sem login e mostra estados vazios | Permite desenvolver e revisar telas antes das contas existirem |
| Modo dos agentes | `AGENTES_MODO` ausente = `simulado` | Padrão seguro: nada é disparado sem o dono ligar |
| Nomes | Tabelas e colunas em português, snake_case | O domínio e o documento estão em português |

## Suposições adotadas

| # | Suposição | Valor usado | Onde |
|---|---|---|---|
| S1 | Acesso por e-mail com link mágico (F-01) | `signInWithOtp` com `shouldCreateUser: false`; só e-mails em `acesso_permitido` ganham perfil | `src/lib/auth.tsx`, migração base |
| S2 | Marcus não aprova ofertas nem responde (ponto 6) | Papel `dono` lê tudo; as telas de aprovação devem esconder a ação para o dono | pacotes de Ofertas e Comunidade |
| S3 | Janela do histórico | 30 dias | `core/config.ts` |
| S4 | Preço "de" | Mediana da janela | `core/config.ts` |
| S5 | Desconto real | 10% abaixo da referência | `core/config.ts` |
| S6 | Histórico curto | Menos de 7 dias, post sem de/por | `core/config.ts` |
| S7 | Pesos da nota | 35/25/20/10/10 | `core/config.ts` |
| S8 | Candidatas para a IA | 30 | `core/config.ts` |
| S9 | Tamanho da fila | Maior cadência + 2 | `core/config.ts` |
| S10 | Frase da Redatora | Até 140 caracteres | `core/config.ts` |
| S11 | Bloco padrão | 20h às 23h; almoço desligado (horário 12h às 13h30 é suposição) | `core/config.ts` |
| S12 | Distribuição dos posts | Intervalo = mín(40, duração ÷ posts), nunca < 20 min; recua até 18h | `core/config.ts` (regra no pacote do Agendamento) |
| S13 | Checagem antes do envio | 5 minutos | `core/config.ts` |
| S14 | Blocos de revisão | 12h e 21h | `core/config.ts` |
| S15 | Sessão de trabalho inativa | Fecha após 2 horas sem atividade | `core/config.ts` |
| S16 | Tetos de disparo por dia | curadoria 9, redação 10, Atendente 30, Analista 5, Radar 1, Coach 1 | `core/agentes.ts` |
| S17 | Expiração de job sem retorno | 45 minutos; curadoria ganha nova tentativa | `core/config.ts`, `core/jobs.ts` |
| S18 | Retentativas 5xx | 3 tentativas com espera de 1, 2 e 4 minutos | `core/jobs.ts` |
| S19 | Cabeçalho `anthropic-version` do disparo das rotinas | `2023-06-01` (conferir na documentação oficial no primeiro disparo real) | `_shared/jobs/runtime.ts` |
| S20 | URL da sessão na resposta do disparo | Lida de `session_url` ou `url` | `_shared/jobs/runtime.ts` |
| S21 | Fuso | Brasília UTC-3 fixo (sem horário de verão desde 2019); pg_cron roda em UTC | `core/formato.ts`, migração do relógio |
| S22 | Notificações | Web Push com app instalado; alternativa pelo bot do Telegram | pacote de Notificações |
| S23 | Post manual (F-16) | Mesmo caminho do post normal | pacote de Posts |
| S24 | Região do Supabase | São Paulo | `docs/HUMANO.md` |
| S25 | Repositório dos agentes | `precinho-agentes`, gerado a partir de `agentes/` | pacote dos Agentes |
| S26 | Guarda de dados | Mensagens 90 dias após a última interação; registro dos jobs 90 dias; exclusão a pedido em até 15 dias | pacotes da V2 e limpeza |
| S27 | Eliminatórios da loja | Nota mínima e avaliações mínimas sem valor (`null` = não filtra) até o dono definir | `core/config.ts` |
| S-P6-1 | Estado das integrações | Só o Marcus vê (F-14 lista no papel dele); a Lana não vê o card | `integracoes-estado`, `src/pages/configuracoes/` |
| S-P6-2 | Validação das Configurações | Links só https (WhatsApp em whatsapp.com, Telegram em t.me); pesos da nota somam 100; artes de 3 a 5; blocos com fim depois do início; teto da rotina de 0 a 100 | `core/configuracoes.ts`, `core/painel-agentes.ts` |
| S-P6-3 | Próxima execução no painel | Calculada pelos horários do Anexo A.3 (curadoria 05:37, Atendente a cada 30 min das 8h às 22h30, Coach 06:23, Analista 06:43 e Radar 07:07 às segundas); redação só sob demanda | `core/painel-agentes.ts` |
| S-P6-4 | Uso do dia | Só o Marcus vê o uso contra o teto (as tentativas são só do dono pela RLS) | `src/pages/como-funciona/` |
| S-P8-1 | Arquivo de instrução por rotina (P8) | Cada rotina aponta para o agente principal: curadoria→`cacadora.md`, redação→`redatora.md`, Atendente→`atendente.md`, Analista→`analista.md`, Radar→`radar.md`, Coach→`coach.md`; Redatora e Guardiã são lidas a partir delas. `ping/v1` roda na rotina do Coach | `scripts/agentes/montar.ts` |
| S-P8-2 | Validação antes do envio (P8) | O script da rotina valida a saída contra o JSON Schema antes de enviar, porque saída fora do contrato vira erro sem nova chance. O JSON Schema não aceita campos extras (o zod os ignora), o que é mais restrito e seguro | `agentes/scripts/` |
| S-P8-3 | Avaliações (P8) | Casos fictícios em `agentes/avaliacoes/<contrato>.json`, fora do repositório dos agentes; no CI rodam contra as respostas simuladas. Cada pacote que cria contrato de curadoria, redação ou Atendente acrescenta o seu arquivo de casos | `scripts/agentes/avaliar.ts` |
| P7-1 | Janela do bloco de revisão para o silêncio da Atendente (5.13) | 60 minutos a partir do início de cada bloco; fora dela, notificação da Atendente que não é urgente espera o início do próximo bloco (não sai em silêncio) | `core/notificacoes.ts` |
| P7-2 | Tentativas de envio de notificação | 3 tentativas, 2 minutos entre elas; inscrição de push com resposta 404/410 é apagada | `core/notificacoes.ts`, `_shared/notificacoes/despachar.ts` |
| P7-3 | Alternativa pelo Telegram | Só quando nenhum aparelho da Lana aceitou o push; só para a operadora (chat `TELEGRAM_LANA_CHAT_ID`); o dono recebe só por push | `_shared/notificacoes/despachar.ts` |
| P7-4 | Notificação sem destino | `user_id` nulo vai para os dois membros; sem aparelho nem Telegram, fica só registrada (`resultado.sem_canal`) | `_shared/notificacoes/despachar.ts` |

## Crescimento e conteúdo extra (pacote P14, F-27 e F-28)

| ID | Tema | Valor adotado | Onde |
|---|---|---|---|
| S-P14-1 | Quando a lista de achados de uma data aparece nas táticas | De hoje até 30 dias antes da data de pico | `core/crescimento/regras.ts` |
| S-P14-2 | Itens da lista de achados | Até 10 ofertas aprovadas nos últimos 14 dias, maior nota primeiro, sem repetir produto | `core/crescimento/regras.ts` |
| S-P14-3 | Origem do link de entrada no convite ao núcleo inicial | `convite` (`/entrar?o=convite`) | `core/crescimento/regras.ts` |
| S-P14-4 | Pedido parado "em preparo" (job com erro ou expirado) | Pode ser pedido de novo após 60 minutos | `core/crescimento/regras.ts` |
| S-P14-5 | Contrato | Novo `redacao-extra/v1` na rotina `pa-redacao` (não estende `redacao/v1`) | `core/contratos/redacao-extra.ts` |
| S-P14-6 | Preços e nomes nos textos extras | A Redatora só escreve frases; nome e preço vêm do banco e o texto é montado por código. A IA não acrescenta itens à lista | `core/crescimento/montar.ts` |
| S-P14-7 | Aviso de comissão | Lista de achados e post de respostas terminam com "Link com comissão" (saem nos canais). O roteiro de vídeo não é post | `core/crescimento/regras.ts` |
| S-P14-8 | Dúvidas repetidas | Tabela `duvidas_registradas` (tema, ID interno da pessoa, pergunta). Quem grava é a Atendente (pacote da Comunidade); a IA da redação recebe só tema e perguntas, sem identificação | migração `20261102230100_crescimento.sql` |
| S-P14-9 | Publicação dos textos extras | Nada sai sozinho: a Lana copia e posta. Levar o post de respostas para a fila de posts do pacote de Publicação fica como evolução | `src/pages/comunidade/Crescimento.tsx` |
| S-P14-10 | Junção de pedidos de 5 minutos da rotina de redação | Não implementada neste pacote: cada pedido vira um job (teto diário de 10 da rotina continua valendo) | `_shared/crescimento/pedir.ts` |

## P12 Plano de 90 dias e Coach (F-24)

| Tema | Decisão | Onde |
|---|---|---|
| Catálogo do plano | Tarefas p1 a p23, textos e responsáveis copiados do mock; ficam no código, só o progresso vai ao banco (`plano_marcas`) | `core/coach/plano.ts` |
| Tarefa da plataforma ou de agente | Aparece no checklist, mas não conta como pendente nem atrasada da Lana | `core/coach/plano.ts` (`dela`) |
| Tarefa atrasada | Tarefa da Lana não feita depois do último dia do seu período | `core/coach/plano.ts` |
| Períodos | Semana 1 = dias 1 a 7; semanas 2 a 4 = dias 8 a 30; gate do dia 30 = dia 31; dias 31 a 90 vão até o gate do dia 90 (dia 91) | `core/coach/plano.ts` |
| Fases da linha do tempo | Em dias a partir do início: 1 a 7, 8 a 42, 43 a 60, 61 a 90 (iguais às do mock com início em 2/11/2026) | `core/coach/plano.ts` |
| Marcas da linha do tempo | Todas as datas de `datas_pico` dentro dos 90 dias (inclui o Natal, que o mock não mostra) e os gates 30 e 90 | `core/coach/plano.ts` |
| "Nome e logo da marca" | Já vem marcada, como no mock; uma marca salva no servidor vence | `core/coach/plano.ts` |
| Revisão da Coach | Até 3 prioridades (só ids de tarefas pendentes da entrada; o código descarta o resto) e uma nota de até 600 caracteres; uma por semana (`coach:<segunda>`) | `core/coach/revisao.ts`, `core/contratos/coach.ts` |
| Resultados enviados à Coach | Horas registradas da semana anterior sem montagem; comissão fica `null` até existir a importação de conversões (P11) | `_shared/coach/semanal.ts` |
| Ajuste do roteiro | `tarefaDaSemana()` devolve a primeira prioridade pendente da última revisão, ou a primeira tarefa pendente da Lana; o roteiro do dia (P5) usa esta função para a "Tarefa da semana do plano" | `core/coach/plano.ts` |
| Pedir revisão na hora | Só o dono, pela tela do Plano; respeita a chave única da semana e o teto diário da rotina | `coach-semanal` |


## P5 Hoje, roteiro e registro de tempo

| Tema | Decisão | Onde |
|---|---|---|
| Fases com outra data de início | As fases do mock seguem os mesmos números de dia: preparação 1 a 7, temporada 8 a 42, Natal e ajustes 43 a 60, escala 61 a 90 | `core/plano/index.ts` |
| Datas que movem vendas | Datas de pico (`datas_pico`) e gates do dia 30 e 90, a partir de hoje, até 4 itens; a nova leitura do dia 60 fica só em Resultados | `core/plano/index.ts` |
| Telas do roteiro na V1 | `TELAS_PRONTAS = ['ofertas', 'publicar', 'plano']` (a tarefa da semana vem de `tarefaDaSemana` do P12); cada pacote que entrega Radar, Audiência ou Comunidade acrescenta a tela ali e passa a contagem do objeto em `tarefasDoDia` | `core/roteiro.ts`, `src/pages/hoje/index.tsx` |
| Tarefas marcadas | Continuam no roteiro, riscadas, e contam no tempo (como no mock); a marcação vai para `roteiro_marcas` | `core/roteiro.ts` |
| Último uso da sessão | Gravado no máximo a cada 5 minutos quando a pessoa toca ou digita no painel | `src/lib/atividade.ts` |
| Fechamento automático | `fechar_sessoes_inativas()` a cada 10 min pelo pg_cron; fecha no último uso, marca `fechada_automaticamente` e a tela pede confirmação até `confirmada_em` | migração `20261102140000_registro_tempo.sql` |
| Lançamento manual | Fim antes do início vira o dia seguinte; no máximo 16 horas; sem sobrepor outra sessão própria; sem horário no futuro | `core/tempo.ts` |
| Horas da comissão por hora | Soma das sessões da operadora no mês, sem montagem; o dono vê as horas da Lana | `src/pages/hoje/sessoes.ts` |
| Uma sessão aberta por pessoa | Índice único parcial no banco | migração `20261102140000_registro_tempo.sql` |

## Página de entrada e Radar (P9, 02/11/2026)

| # | Suposição ou decisão | Valor usado | Onde |
|---|---|---|---|
| P9-1 | O que é "clique no link de entrada" | Abrir a página (`botao = 'pagina'`); os toques em "Seguir no WhatsApp/Telegram" contam à parte (`wa`, `tg`) | `entrada_cliques`, `core/radar/entrada.ts` |
| P9-2 | Contagem duplicada | Mesmo resumo (sal do dia + IP + navegador + origem + botão, SHA-256) conta uma vez por dia; sal e resumos apagados em 24 horas | migração `20261102180000`, `entrada-clique` |
| P9-3 | Origens fixas além dos lugares | `direto` (sem origem ou desconhecida), `status` (artes do Status) e `convite` (convite pessoal) | `core/radar/entrada.ts` |
| P9-4 | Origem do lugar aprovado | Slug do nome, até 40 caracteres, com `-2`, `-3` se já existir; não muda depois de criada | `gerarOrigem` |
| P9-5 | "Divulguei hoje" fora do dia permitido | Bloqueado pelo código (5.11 item 3); a próxima vez permitida aparece no card | `core/radar/agenda.ts`, `radar-acao` |
| P9-6 | Intervalo combinado | Em dias, de 1 a 365; valor inicial do formulário 7 | tela Radar |
| P9-7 | Lembrete no dia permitido | Uma notificação por dia às 9h (Brasília) com os lugares liberados | `radar-lembrete`, cron `radar-lembrete` |
| P9-8 | Mensagens do Radar | A IA não escreve link nenhum; o convite traz a marca `{link}` e o código põe o link de entrada. `{seguidores}` fica para a Lana completar até a Audiência existir | contrato `radar/v1` |
| P9-9 | Quem muda lugares | Só a função `radar-acao` (membros logados); a tabela é só leitura pelo RLS | migração `20261102180000` |
| P9-10 | Recusados e descartados | Saem da tela e a chave do lugar continua na lista "já vistos" do job semanal | `criar_job_radar`, processador `radar/v1` |

## Fila de ofertas (pacote P2, F-03 a F-05)

| ID | Tema | Valor adotado | Onde |
|---|---|---|---|
| S-P2-1 | Opções por pedido de produto (Fluxo B) | Até 2, dentro do preço máximo; gravadas em `pedido_opcoes`; só os pedidos da Lana (e os "achados a pedido") entram na fila | `core/ofertas/curadoria.ts` |
| S-P2-2 | Pedido sob demanda (F-05) | Job `curadoria:pedido:<id>` com candidatas dos produtos já coletados (nome parecido, em estoque, preço até o máximo), sem preço "de"; sem candidata, não gasta disparo e espera a rodada diária | `_shared/ofertas/pedido.ts` |
| S-P2-3 | Oferta não decidida no dia | Expira à meia-noite (Brasília) ou no prazo da oferta; limpeza a cada 10 min | migração `20261102110000_ofertas_fila.sql` |
| S-P2-4 | "Pedir outra versão" sem retorno | Depois de 60 min a oferta volta para a fila com a frase anterior e um aviso | migração `20261102110000_ofertas_fila.sql` |
| S-P2-5 | Aprovar ou editar enquanto a Redatora escreve | Permitido; vale a frase atual e a nova versão é descartada ao chegar | `_shared/ofertas/acoes.ts` |
| S-P2-6 | Prévia do post na fila | Formato 5.4 do WhatsApp com o link indicado por texto (o link real só existe na aprovação); troca pelo formatador do pacote de posts quando estiver no main | `core/ofertas/previa.ts` |
| S-P2-7 | Motivos rápidos do pulo | Quatro sugestões e texto livre (até 200 caracteres); motivo continua opcional | `core/ofertas/fila.ts` |

### P11 Resultados e Analista

| # | Suposição | Valor usado | Onde |
|---|---|---|---|
| P11-S1 | Formato do CSV do relatório de conversões | Colunas reconhecidas por apelidos em português e inglês; obrigatórias: pedido, data, status e comissão total. Linhas repetidas do mesmo pedido e item são somadas | `core/analista/conversoes.ts` |
| P11-S2 | Estados do relatório | Cancelado/inválido/não pago = cancelada; concluído/pago/validado = concluída; pendente/em processamento = pendente; estado desconhecido recusa a linha | `core/analista/conversoes.ts` |
| P11-S3 | Data do pedido sem fuso | Hora de Brasília | `core/analista/conversoes.ts` |
| P11-S4 | Importação diária pela API | Sem chave: não importa nada (nada de dado simulado no banco de produção). Com chave: registra "importação com erro" até a consulta do relatório ser ligada com a documentação da Open API | `_shared/analista/rotina.ts` |
| P11-S5 | Coluna "Hoje" dos indicadores | Mês até hoje para comissões, cliques por oferta, ticket, mix e por 1.000; última semana fechada para conversão; última semana com dado para taxa de saída (maior entre os canais) | `core/analista/painel.ts` |
| P11-S6 | "Sem alta" sem os números das duas semanas | Conta como sem alta | `core/analista/gates.ts` |
| P11-S7 | Antes do dia do gate | Tela mostra leitura parcial até ontem; a decisão só pode ser registrada a partir da manhã do gate | `core/analista/painel.ts` |
| P11-S8 | Gatilho de investimento por hora | Comissão líquida do mês ÷ horas de operação do mesmo mês, nos 3 meses seguidos | `core/analista/gatilhos.ts` |
| P11-S9 | Dias de dados para o gráfico | Dias cobertos pelos períodos das importações bem-sucedidas; gráfico mostra os últimos 30 dias | `core/analista/indicadores.ts` |
| P11-S10 | Audiência | Lida da view `audiencia_semanas` do pacote da Audiência (canal, semana_inicio, seguidores_inicio, seguidores_fim, saidas); ausente = "aguardando dados" | `_shared/analista/leitura.ts` |
| P11-S11 | Metas de taxa em porcentagem | Digitadas em % e guardadas como fração | `src/pages/resultados/Cartoes.tsx` |
