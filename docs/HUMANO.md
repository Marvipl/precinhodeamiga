# O que depende de você (dono)

Tudo aqui fica para o final. Enquanto isso, a plataforma roda em modo local (painel) e modo simulado (agentes).
Ordem sugerida: do item 1 ao 9. Nenhuma chave entra no repositório.

## 1. Shopee Afiliados (primeiro, porque demora)
- [ ] A Lana pede a liberação da API aberta (Open API) no painel de afiliados.
- [ ] Guardar `SHOPEE_AFFILIATE_APP_ID` e `SHOPEE_AFFILIATE_APP_SECRET` como segredos das Edge Functions.
- [ ] Conferir se o painel exporta o CSV do relatório de conversões (plano B da V2).

## 2. Supabase
- [ ] Criar o projeto (região São Paulo) no plano gratuito.
- [ ] `supabase link --project-ref <ref>` e `supabase db push` para aplicar `supabase/migrations/`.
- [ ] Em Authentication: desligar cadastro aberto; em URL Configuration, colocar a URL do Netlify como Site URL e Redirect URL.
- [ ] Liberar os dois acessos (troque pelos e-mails reais):
  ```sql
  insert into acesso_permitido (email, papel, nome) values
    ('<email da Lana>', 'operadora', 'Lana'),
    ('<email do Marcus>', 'dono', 'Marcus');
  ```
  Depois, convidar os dois em Authentication > Users > Invite (o perfil é criado sozinho).
- [ ] Guardar no Vault (para o pg_cron chamar as funções): `project_url` (https://<ref>.supabase.co) e `service_role_key`.
  ```sql
  select vault.create_secret('https://<ref>.supabase.co', 'project_url');
  select vault.create_secret('<service role key>', 'service_role_key');
  ```
- [ ] Publicar as funções: `supabase functions deploy` (todas as pastas de `supabase/functions/` exceto `_shared`).
- [ ] Segredos das funções: `supabase secrets set AGENT_CALLBACK_TOKEN=<valor aleatório longo> AGENTES_MODO=simulado PUBLIC_SITE_URL=<url do site>`.

## 3. Netlify
- [ ] Criar o site a partir do repositório (o `netlify.toml` já tem build e rotas).
- [ ] Variáveis: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_PUBLIC_SITE_URL` (e `VITE_VAPID_PUBLIC_KEY` quando o pacote de notificações estiver pronto).
- [ ] Domínio próprio (opcional; até lá vale o endereço do Netlify).

## 4. Telegram
- [ ] Criar o bot no BotFather e o canal; pôr o bot como administrador com permissão de postar.
- [ ] Segredos: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHANNEL_ID`, `TELEGRAM_WEBHOOK_SECRET`, `TELEGRAM_LANA_CHAT_ID`.

## 5. WhatsApp
- [ ] Criar o canal no chip dedicado e informar o link em Configurações.

## 6. Rotinas do Claude Code (agentes)
- [ ] Criar o repositório `precinho-agentes` (o conteúdo é gerado a partir de `agentes/`, quando o pacote dos agentes estiver pronto).
- [ ] Criar o ambiente de nuvem com rede "Custom" liberando `<ref>.supabase.co` e o segredo de rede com o `AGENT_CALLBACK_TOKEN`.
- [ ] Criar as seis rotinas em claude.ai/code/routines (pa-curadoria, pa-redacao, pa-atendente, pa-analista, pa-radar, pa-coach), cada uma com gatilho de API. Copiar o token na hora.
- [ ] Segredos: `ROUTINE_<CURADORIA|REDACAO|ATENDENTE|ANALISTA|RADAR|COACH>_ID` e `_TOKEN`.
- [ ] Testar com o botão "Testar rotina" (Como funciona) e depois trocar `AGENTES_MODO=real`.

## 7. Web Push
- [ ] Gerar as chaves VAPID e guardar `VAPID_PUBLIC_KEY` e `VAPID_PRIVATE_KEY` (a pública também no Netlify).

## 8. Decisões pendentes
- [ ] Orçamento mensal de infraestrutura (até lá, só planos gratuitos).
- [ ] Prazo.
- [ ] Celular da Lana (Android ou iPhone).
- [ ] Nicho principal (sai da matriz de nicho).
- [ ] Nota mínima e número mínimo de avaliações da loja (eliminatórios da curadoria).
- [ ] Confirmar as suposições de `docs/decisions.md`.

## 9. Jurídico
- [ ] Revisão do aviso de privacidade (página de entrada, formulário e bot).

## Itens acrescentados pelos pacotes
<!-- Cada pacote acrescenta aqui o que só o dono pode fazer, com uma linha por item. -->
- [ ] (P14) Confirmar as suposições S-P14-1 a S-P14-10 de `docs/decisions.md` (crescimento e conteúdo extra da Redatora).
- [ ] (P14) Publicar a função `conteudo-extra-pedir` junto com as demais (`supabase functions deploy`).
- [ ] (P6) Depois de cadastrar os segredos, abrir Configurações > Integrações e conferir que cada integração aparece "Conectada".
- [ ] P12: publicar a função `coach-semanal` e, com `AGENTES_MODO=real`, conferir na primeira segunda-feira (06:23) que a revisão da Coach aparece na aba Plano de 90 dias.
- [ ] (P7 Notificações) Gerar as chaves VAPID com `npx web-push generate-vapid-keys` e guardar: `supabase secrets set VAPID_PUBLIC_KEY=<pública> VAPID_PRIVATE_KEY=<privada> VAPID_SUBJECT=mailto:<seu e-mail>`; a pública também vai no Netlify como `VITE_VAPID_PUBLIC_KEY`.
- [ ] (P7 Notificações) Ligar os envios de verdade com `supabase secrets set NOTIFICACOES_MODO=real` (sem isso a função `notificar` só simula e registra).
- [ ] (P7 Notificações) Alternativa pelo Telegram: a Lana manda qualquer mensagem ao bot e o Marcus guarda o id do chat dela em `TELEGRAM_LANA_CHAT_ID` (dá para ver em `https://api.telegram.org/bot<token>/getUpdates`).
- [ ] (P7 Notificações) No celular da Lana: instalar o app na tela inicial (obrigatório no iPhone) e tocar em "Ativar notificações neste aparelho" em Configurações; depois "Enviar notificação de teste".
- [ ] (P8) Criar o repositório privado `precinho-agentes` no GitHub, rodar `npm run agentes:gerar -- <clone do precinho-agentes>` e fazer o commit; repetir sempre que um contrato ou instrução mudar. A instrução fixa de cada rotina está em `ROTINAS.md` da pasta gerada.
- [ ] (P8) Ao criar o ambiente de nuvem das rotinas, conferir como o segredo de rede entrega o `AGENT_CALLBACK_TOKEN` (variável de ambiente ou cabeçalho injetado); o script `scripts/enviar-resultado.mjs` aceita os dois.
- [ ] (P8) Antes de trocar instrução ou modelo das rotinas: rodar as rotinas com as entradas de `agentes/avaliacoes/`, salvar as saídas em `<pasta>/<contrato>/<caso>.json` e rodar `npm run agentes:avaliar -- --respostas <pasta>`.
- [ ] (P9) Preencher em Configurações os links dos canais (`canais.whatsapp_link` e `canais.telegram_link`, começando com `https://`); sem eles a página de entrada mostra "os canais ainda estão sendo preparados".
- [ ] (P9) Definir a variável `SITE_URL` das Edge Functions com o endereço público do painel (ex.: o domínio do Netlify), para a página de entrada voltar ao lugar certo quando um canal não estiver configurado.
- [ ] (P9) Informar a região do Radar: salvar em `configuracoes` a chave `radar.regiao` (texto, ex.: cidade e região). Sem ela a busca semanal vai só pelos nichos.
- [ ] (P9) Revisão jurídica do aviso de privacidade da página de entrada (`src/pages/entrada-publica/index.tsx`).
- [ ] (P9) No primeiro disparo real do `pa-radar`, conferir se a busca na web funciona no ambiente com rede restrita (ponto 14 da seção 11).
