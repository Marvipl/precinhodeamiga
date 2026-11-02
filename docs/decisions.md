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
