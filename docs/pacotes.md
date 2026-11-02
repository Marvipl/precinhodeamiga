# Pacotes de trabalho paralelos

A fundação (este PR) entregou: modelo de dados base com RLS, login (F-01), orquestração dos agentes com modo simulado (F-13), shell do painel no visual do mock e as telas reservadas. Cada pacote abaixo é independente e tem fronteira de arquivos. Todos partem do `main` atual.

Regras comuns: ler `CLAUDE.md`; `npm run check` verde antes do PR; migração nova com prefixo único por pacote: `20261102HHMMSS_<nome>.sql`, onde HH é a hora reservada do pacote (P1=10, P2=11, P3=12, P4=13, P5=14, P6=15, P7=16, P8=17, P9=18, P10=19, P11=20, P12=21, P13=22, P14=23) e MMSS é sequencial dentro do pacote. Arquivos compartilhados que vários pacotes tocam com uma linha cada (resolver conflito por rebase): `core/contratos/index.ts`, `_shared/processadores/index.ts`, `supabase/config.toml`, `docs/HUMANO.md`, `docs/decisions.md`.

## Onda 1: V1 "Achar e enviar"

### P1. Coleta Shopee, histórico de preço e nota (F-02, seção 5.2, 5.5)
- Arquivos: `_shared/core/curadoria/` (mediana da janela, desconto real, histórico curto, eliminatórios, nota 0 a 100, tamanho da fila, comissão estimada), `_shared/shopee/` (cliente GraphQL assinado + modo simulado com respostas gravadas fictícias + geração de link curto com subIDs `sub1..sub5`), função `coleta-shopee`, migração com cron 04:47 (Brasília) e a criação do job diário `curadoria:<data>` às 05:37 com as 30 melhores candidatas.
- Também: coleta sob demanda (Fluxo G, primeira coleta na hora).
- Tabelas: `produtos`, `precos_observados`, `nichos` (já existem).
- Sem chave da Shopee: tudo em modo simulado (`SHOPEE_MODO=simulado` quando faltar a chave).

### P2. Curadoria e fila "Ofertas para aprovar" (F-03, F-04, F-05)
- Arquivos: `core/contratos/curadoria.ts` (contrato `curadoria/v1`: entrada com candidatas e pedidos; saída com ofertas escolhidas, motivos, frase, alertas de promessa, opções para pedidos), `core/contratos/redacao.ts` (`redacao/v1` para "pedir outra versão"), processadores correspondentes, `src/pages/ofertas/`.
- Tela: cards com foto, nicho, nota, de/por, "cerca de R$ X por venda", motivos, alertas, prévia do post completo (usar o formatador do P3 quando mesclado; até lá, importar de `core/post/formato.ts` se existir ou montar a prévia localmente atrás de uma função que o P3 substitui), filtros, contador, "Tudo revisado", estados carregando/vazio/expirada. Ações: aprovar (dois canais marcados), pular com motivo opcional, editar frase, pedir outra versão, ver na Shopee (link comum), campo "procure [produto] até R$ [valor]" criando `pedidos_produto` e job sob demanda.
- Aprovar chama a função `post-aprovar` do P3 (contrato de chamada: `POST {oferta_id, canais: ['wa','tg'], frase}`); se o P3 ainda não estiver mesclado, deixe a chamada pronta e marque a oferta como aprovada.
- O dono (Marcus) não vê os botões de aprovação (suposição S2).

### P3. Montagem do post, Guardiã e Agendadora (F-06, F-07, F-08 backend, F-16 backend, seções 5.3, 5.4, 5.6)
- Arquivos: `_shared/core/post/` (formato padrão 5.4 para WhatsApp e Telegram, checagens da Guardiã 5.3, distribuição no bloco 5.6, cadência fixa 6 na V1), `_shared/telegram/` (cliente Bot API + servidor falso que registra chamadas), funções `post-aprovar` (oferta aprovada → post + envios por canal + Guardiã + agenda), `post-manual` (F-16), `post-atualizar-preco`, `publicar-bloco` (cron a cada minuto: checagem 5 min antes, publica no Telegram, marca WhatsApp "não enviado" no fim do bloco, cria notificações de lembrete).
- Tabelas: `posts`, `post_envios` (já existem).
- Inviolável: nenhum caminho de envio para WhatsApp; testes de aceite da seção 5.1 itens 1 a 4.

### P4. Tela Publicar, artes e post manual (F-08 tela, F-09, F-16 tela)
- Arquivos: `src/pages/publicar/`, `_shared/core/arte/` (modelo fixo da arte em SVG: foto, preço, nome, "Siga o canal"; sem IA de imagem), função `arte-gerar` (SVG para PNG, ex.: resvg-wasm, grava no Storage), migração do bucket `artes`.
- Tela: posts do bloco com horário, selo da Guardiã, texto pronto, estado por canal, Copiar texto, Marcar como enviado, aviso fixo do WhatsApp, artes do Status (3 a 5, link de entrada com origem `status`, nunca link de oferta), formulário do post manual, post pausado com "Atualizar preço e publicar" e "Cancelar post".

### P5. Hoje, roteiro e registro de tempo (F-10, F-11, seções 5.14, 5.15, 5.16)
- Arquivos: `src/pages/hoje/`, `_shared/core/plano/` (dia N de 90, datas dos gates, fases, próxima data de pico), `_shared/core/roteiro.ts` (algoritmo da seção 5.14 com testes), `_shared/core/tempo.ts` (horas válidas sem montagem, fechamento automático), função ou cron de fechamento de sessão inativa.
- Tela: data e dia do plano, saudação, três destaques, roteiro por 10/20/40 min (só tarefas de telas existentes), datas que movem vendas (`datas_pico`), "O que a equipe fez desde a meia-noite" (`atividades`), quatro números com "aguardando dados", começar/encerrar sessão, lista e correção manual de sessões, marcar montagem.

### P6. Configurações e Como funciona (F-14, F-12)
- Arquivos: `src/pages/configuracoes/`, `src/pages/como-funciona/`, função `integracoes-estado` (diz se cada segredo existe, nunca o valor).
- Configurações: campos por papel via `camposDoPapel` e `useSalvarConfig` (`src/lib/config.ts`), nichos e palavras-chave com nicho principal, voltar ao valor inicial, campo do dono bloqueado para a Lana, estado das integrações.
- Como funciona: três princípios, caminho de uma oferta, caminho de um novo seguidor, cards dos oito agentes (`core/agentes.ts`), ordem de construção, estado de cada rotina (`agente_rotinas`, `agente_uso_hoje`), pausar/retomar (só dono), pausa geral, botão "Testar rotina" (função `agente-ping`).

### P7. Notificações (F-15)
- Arquivos: `public/sw.js` (eventos push e notificationclick), `src/components/AtivarNotificacoes.tsx` (o P6 só posiciona o componente na tela de Configurações), `_shared/notificacoes/` (Web Push VAPID e alternativa pelo bot do Telegram para a Lana), função `notificar` (cron a cada minuto envia `notificacoes` vencidas).
- Silêncio da seção 5.13 (fora dos blocos, só nível 4 toca).

### P8. Repositório dos agentes (Anexo A.5, A.6)
- Arquivos: `agentes/` (`CLAUDE.md` curto, um `.md` por agente com tom, critérios, nunca e exemplos fictícios, script de envio do resultado), `scripts/gerar-agentes.ts` (gera JSON Schema a partir de `CONTRATOS` com zod-to-json-schema e monta a pasta do repositório `precinho-agentes`), avaliações com entradas fictícias.
- Depende dos contratos que os outros pacotes criarem; comece pela estrutura e pelo `ping/v1`, e regenere ao final.

## Onda 2: V2 "Crescer e medir" (pode começar junto; não depende da onda 1 além do schema base)

### P9. Página de entrada e Radar de Comunidades (F-20, F-21, seção 5.11)
- Rota pública `/entrar?o=<origem>` (fora do login), função `entrada-clique` (conta por origem e botão, resumo irreversível com sal diário apagado em 24 h), tabelas de lugares e divulgações, `src/pages/radar/`, contrato `radar/v1`.

### P10. Audiência (F-22, seção 5.12)
- Eventos `chat_member` do Telegram (webhook compartilhado com o P13: combinar um único `telegram-webhook` com roteamento por tipo de update), registro semanal do WhatsApp com leitura de print (contrato `analista-print/v1`, confirmação obrigatória), `src/pages/audiencia/`.

### P11. Resultados e Analista (F-23, seções 5.7 a 5.10)
- Importação de conversões (API e CSV de plano B), indicadores, gates, gatilhos, calculadora, resumo semanal (contrato `analista-resumo/v1` com checagem de números), `src/pages/resultados/`.

### P12. Plano de 90 dias e Coach (F-24)
- Checklists do mock com progresso no servidor, linha do tempo, revisão semanal (contrato `coach/v1`), `src/pages/plano/`.

### P13. Atendente, formulário e pedidos das amigas (F-25, F-26)
- Webhook do bot do Telegram, formulário público `/fale`, níveis 1 a 4, caixa de mensagens, regras da seção 5.13, contrato `atendente/v1`, `src/pages/comunidade/`, privacidade e exclusão a pedido.

### P14. Crescimento e conteúdo extra (F-27, F-28)
- Táticas da semana com textos prontos, roteiros de vídeo, listas de datas, post de respostas da semana (estende `redacao/v1` com novos tipos ou cria `redacao-extra/v1`). Seção dentro de `src/pages/comunidade/` combinada com o P13 (componente próprio em `src/pages/comunidade/Crescimento.tsx`).
