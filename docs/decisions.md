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
