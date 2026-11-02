-- Precinho de Amiga: base do modelo de dados (fundação).
-- Convenções:
--   * nomes em português, snake_case; datas/horas em timestamptz (UTC no banco, America/Sao_Paulo na tela);
--   * RLS ligado em TODAS as tabelas; só os dois usuários do painel (tabela perfis) leem dados internos;
--   * escritas do sistema (Edge Functions) usam service_role, que ignora RLS;
--   * cada pacote de funcionalidade cria suas próprias migrações com prefixo de data/hora novo.

-- gen_random_uuid() é nativo no Postgres 13+.

-- ---------------------------------------------------------------------------
-- F-01 Acesso: lista de e-mails permitidos e perfis
-- ---------------------------------------------------------------------------
create type papel as enum ('operadora', 'dono');

-- Só e-mails desta tabela ganham perfil ao entrar. Não há cadastro aberto.
create table acesso_permitido (
  email text primary key check (email = lower(email)),
  papel papel not null,
  nome text not null,
  criado_em timestamptz not null default now()
);

create table perfis (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  nome text not null,
  papel papel not null,
  criado_em timestamptz not null default now()
);

create or replace function public.criar_perfil_permitido()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  permitido acesso_permitido;
begin
  select * into permitido from acesso_permitido where email = lower(new.email);
  if found then
    insert into perfis (user_id, email, nome, papel)
    values (new.id, lower(new.email), permitido.nome, permitido.papel)
    on conflict (user_id) do nothing;
  end if;
  return new;
end;
$$;

create trigger ao_criar_usuario
after insert on auth.users
for each row execute function public.criar_perfil_permitido();

create or replace function public.e_membro()
returns boolean
language sql
stable
security definer
set search_path = public
as $$ select exists (select 1 from perfis where user_id = auth.uid()) $$;

create or replace function public.e_dono()
returns boolean
language sql
stable
security definer
set search_path = public
as $$ select exists (select 1 from perfis where user_id = auth.uid() and papel = 'dono') $$;

create or replace function public.meu_papel()
returns papel
language sql
stable
security definer
set search_path = public
as $$ select papel from perfis where user_id = auth.uid() $$;

alter table acesso_permitido enable row level security;
create policy acesso_permitido_dono on acesso_permitido for all to authenticated
  using (e_dono()) with check (e_dono());

alter table perfis enable row level security;
create policy perfis_leitura on perfis for select to authenticated using (e_membro());

-- ---------------------------------------------------------------------------
-- F-14 Configurações: chave/valor. Valores iniciais ficam no código (core/config.ts);
-- a tabela só guarda o que foi alterado. so_dono = campo que só Marcus altera.
-- ---------------------------------------------------------------------------
create table configuracoes (
  chave text primary key,
  valor jsonb not null,
  so_dono boolean not null default false,
  atualizado_por uuid references auth.users (id),
  atualizado_em timestamptz not null default now()
);

alter table configuracoes enable row level security;
create policy configuracoes_leitura on configuracoes for select to authenticated using (e_membro());
create policy configuracoes_escrita_operadora on configuracoes for insert to authenticated
  with check (e_membro() and (not so_dono or e_dono()));
create policy configuracoes_update on configuracoes for update to authenticated
  using (e_membro() and (not so_dono or e_dono()))
  with check (e_membro() and (not so_dono or e_dono()));
create policy configuracoes_delete on configuracoes for delete to authenticated
  using (e_membro() and (not so_dono or e_dono()));

-- Nichos e palavras-chave (F-14, usados pela coleta F-02)
create table nichos (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  palavras_chave text[] not null default '{}',
  principal boolean not null default false,
  bloqueado boolean not null default false,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);
create unique index nichos_um_principal on nichos (principal) where principal;

-- Datas de pico editáveis (seção 5.16)
create table datas_pico (
  id uuid primary key default gen_random_uuid(),
  data date not null unique,
  nome text not null,
  descricao text,
  criado_em timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- F-02 Produtos e histórico de preço próprio
-- ---------------------------------------------------------------------------
create table produtos (
  id uuid primary key default gen_random_uuid(),
  shopee_item_id text not null,
  shopee_shop_id text not null,
  nome text not null,
  nicho_id uuid references nichos (id) on delete set null,
  url_produto text not null,          -- link comum (botão "ver na Shopee"), nunca o de afiliado
  imagem_url text,
  loja_nome text,
  loja_nota numeric(3, 2),
  loja_avaliacoes integer,
  produto_nota numeric(3, 2),
  vendas integer,
  em_estoque boolean not null default true,
  comissao_taxa numeric(6, 4),        -- taxa padrão, ex.: 0.0300
  comissao_extra_taxa numeric(6, 4),  -- Comissão Extra, se houver
  dados_brutos jsonb,
  primeira_vez_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (shopee_shop_id, shopee_item_id)
);

create table precos_observados (
  id bigint generated always as identity primary key,
  produto_id uuid not null references produtos (id) on delete cascade,
  observado_em date not null,
  preco numeric(12, 2) not null check (preco >= 0),
  criado_em timestamptz not null default now(),
  unique (produto_id, observado_em)
);

-- ---------------------------------------------------------------------------
-- F-05 / F-26 Pedidos de produto
-- ---------------------------------------------------------------------------
create type origem_pedido as enum ('lana', 'formulario', 'bot');
create type estado_pedido as enum ('procurando', 'opcoes_encontradas', 'respondido', 'cancelado');

create table pedidos_produto (
  id uuid primary key default gen_random_uuid(),
  origem origem_pedido not null,
  texto text not null,
  preco_max numeric(12, 2),
  estado estado_pedido not null default 'procurando',
  contato_id uuid,                    -- V2: contato interno (nunca vai para a IA)
  criado_por uuid references auth.users (id),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- F-03 / F-04 Ofertas (fila de aprovação)
-- ---------------------------------------------------------------------------
create type origem_oferta as enum ('rodada', 'pedido', 'manual');
create type estado_oferta as enum ('pendente', 'aprovada', 'pulada', 'expirada', 'aguardando_redacao');

create table ofertas (
  id uuid primary key default gen_random_uuid(),
  produto_id uuid not null references produtos (id) on delete cascade,
  data date not null,                 -- dia da fila (America/Sao_Paulo)
  origem origem_oferta not null default 'rodada',
  pedido_id uuid references pedidos_produto (id) on delete set null,
  nota integer check (nota between 0 and 100),
  nota_detalhe jsonb,                 -- componentes da nota (seção 5.2)
  motivos text[] not null default '{}',
  alertas jsonb not null default '[]', -- [{tipo, texto, trecho?}]
  fora_nicho_principal boolean not null default false,
  preco_atual numeric(12, 2) not null,
  preco_referencia numeric(12, 2),    -- mediana calculada; null = sem de/por
  dias_historico integer not null default 0,
  comissao_taxa numeric(6, 4),
  comissao_extra boolean not null default false,
  cupom text,
  prazo timestamptz,
  frase text,                         -- frase da Redatora (null = sai sem frase)
  frase_versao integer not null default 1,
  frase_editada boolean not null default false,
  estado estado_oferta not null default 'pendente',
  pulo_motivo text,
  decidido_por uuid references auth.users (id),
  decidido_em timestamptz,
  job_id uuid,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (produto_id, data, origem)
);
create index ofertas_fila on ofertas (data, estado);

-- ---------------------------------------------------------------------------
-- F-06 / F-07 / F-08 / F-16 Posts e envio por canal
-- ---------------------------------------------------------------------------
create type tipo_post as enum ('oferta', 'manual', 'achado_pedido', 'respostas');
create type canal as enum ('wa', 'tg');
create type estado_envio as enum (
  'agendado',        -- na fila do bloco
  'pausado',         -- Telegram pausado pela Guardiã até a Lana revisar
  'revisar_preco',   -- WhatsApp: selo "Revisar preço"
  'bloqueado',       -- Guardiã bloqueou neste canal (motivo em guardia)
  'publicado',       -- Telegram publicado pelo bot
  'enviado',         -- WhatsApp marcado como enviado pela Lana
  'nao_enviado',     -- WhatsApp não marcado até o fim do bloco
  'cancelado'
);

create table posts (
  id uuid primary key default gen_random_uuid(),
  tipo tipo_post not null default 'oferta',
  oferta_id uuid references ofertas (id) on delete set null,
  produto_id uuid references produtos (id) on delete set null,
  titulo text not null,               -- nome do produto
  preco_atual numeric(12, 2) not null,
  preco_referencia numeric(12, 2),    -- só quando a Guardiã libera de/por
  cupom text,
  prazo timestamptz,
  frase text,
  arte_path text,                     -- Storage
  origem_oferta origem_oferta not null default 'rodada',
  aprovado_por uuid references auth.users (id),
  aprovado_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table post_envios (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references posts (id) on delete cascade,
  canal canal not null,
  link_afiliado text,
  texto text not null,                -- texto final já formatado para o canal
  bloco_data date not null,
  agendado_para timestamptz not null,
  estado estado_envio not null default 'agendado',
  guardia jsonb not null default '[]', -- resultado das checagens [{checagem, ok, mensagem, quando}]
  publicado_em timestamptz,
  enviado_por uuid references auth.users (id),
  telegram_message_id bigint,
  erro text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (post_id, canal)
);
create index post_envios_bloco on post_envios (bloco_data, canal, estado);

-- F-09 Artes do Status (só link de entrada)
create table artes_status (
  id uuid primary key default gen_random_uuid(),
  data date not null,
  oferta_id uuid references ofertas (id) on delete set null,
  arte_path text,
  legenda text not null,
  baixada_em timestamptz,
  criado_em timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- F-11 Registro de tempo
-- ---------------------------------------------------------------------------
create table sessoes_trabalho (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  inicio timestamptz not null,
  fim timestamptz,
  ultima_atividade timestamptz,
  montagem boolean not null default false,
  manual boolean not null default false,
  fechada_automaticamente boolean not null default false,
  nota text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  check (fim is null or fim >= inicio)
);

-- F-10 marcações do roteiro do dia
create table roteiro_marcas (
  data date not null,
  tarefa text not null,
  feita boolean not null default true,
  marcado_por uuid references auth.users (id),
  marcado_em timestamptz not null default now(),
  primary key (data, tarefa)
);

-- "O que a equipe fez desde a meia-noite" (F-10) e linha do tempo dos agentes
create table atividades (
  id bigint generated always as identity primary key,
  agente text not null,
  texto text not null,
  link text,
  criado_em timestamptz not null default now()
);
create index atividades_recentes on atividades (criado_em desc);

-- ---------------------------------------------------------------------------
-- F-15 Notificações
-- ---------------------------------------------------------------------------
create table notificacoes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade, -- null = para todos
  tipo text not null,                 -- lembrete_wa, guardia_pausa, atendente_urgente, ...
  titulo text not null,
  corpo text,
  link text,
  enviar_em timestamptz not null default now(),
  enviada_em timestamptz,
  lida_em timestamptz,
  criado_em timestamptz not null default now()
);

create table push_inscricoes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  criado_em timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- RLS padrão para as tabelas internas: os dois membros leem e escrevem.
-- Regras mais finas ficam nas funções (ex.: aprovar oferta) e nas políticas específicas abaixo.
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'nichos', 'datas_pico', 'produtos', 'precos_observados', 'pedidos_produto', 'ofertas',
    'posts', 'post_envios', 'artes_status', 'roteiro_marcas', 'atividades'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy %I on %I for select to authenticated using (e_membro())', t || '_leitura', t);
    execute format('create policy %I on %I for insert to authenticated with check (e_membro())', t || '_insert', t);
    execute format('create policy %I on %I for update to authenticated using (e_membro()) with check (e_membro())', t || '_update', t);
    execute format('create policy %I on %I for delete to authenticated using (e_membro())', t || '_delete', t);
  end loop;
end $$;

-- Sessões de trabalho: os dois veem tudo; cada um mexe só nas próprias.
alter table sessoes_trabalho enable row level security;
create policy sessoes_leitura on sessoes_trabalho for select to authenticated using (e_membro());
create policy sessoes_escrita on sessoes_trabalho for all to authenticated
  using (e_membro() and user_id = auth.uid()) with check (e_membro() and user_id = auth.uid());

-- Notificações: cada um vê as suas e as gerais.
alter table notificacoes enable row level security;
create policy notificacoes_leitura on notificacoes for select to authenticated
  using (e_membro() and (user_id is null or user_id = auth.uid()));
create policy notificacoes_marcar on notificacoes for update to authenticated
  using (e_membro() and (user_id is null or user_id = auth.uid()))
  with check (e_membro() and (user_id is null or user_id = auth.uid()));

alter table push_inscricoes enable row level security;
create policy push_proprias on push_inscricoes for all to authenticated
  using (e_membro() and user_id = auth.uid()) with check (e_membro() and user_id = auth.uid());

-- atualizado_em automático
create or replace function public.tocar_atualizado_em()
returns trigger language plpgsql as $$
begin
  new.atualizado_em = now();
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array['produtos', 'pedidos_produto', 'ofertas', 'posts', 'post_envios', 'sessoes_trabalho'] loop
    execute format('create trigger %I before update on %I for each row execute function tocar_atualizado_em()', t || '_atualizado_em', t);
  end loop;
end $$;

-- Datas de pico de 2026 conforme a seção 5.16 do documento de produto (datas de calendário, não dados de negócio).
insert into datas_pico (data, nome, descricao) values
  ('2026-11-11', '11.11', 'Posts concentrados entre 18h e 23h; aquecer os canais 2 a 3 dias antes'),
  ('2026-11-27', 'Black Friday', 'Posts concentrados entre 18h e 23h; aquecer os canais 2 a 3 dias antes'),
  ('2026-12-12', '12.12', 'Posts concentrados entre 18h e 23h; aquecer os canais 2 a 3 dias antes'),
  ('2026-12-25', 'Natal', 'Posts concentrados entre 18h e 23h; aquecer os canais 2 a 3 dias antes');
