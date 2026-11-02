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
