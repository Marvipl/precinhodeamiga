-- P13: Atendente no Telegram e no formulário (F-25), pedidos das amigas (F-26), seção 5.13 e 7.
-- Dado pessoal fica só em `contatos`. A IA recebe só ID interno e texto da mensagem.

create type origem_contato as enum ('telegram', 'formulario');
-- Como a pessoa prefere receber a resposta (formulário): pelo canal como "achado a pedido" ou pelo WhatsApp da Lana.
create type preferencia_resposta as enum ('telegram', 'canal', 'whatsapp');

create table contatos (
  id uuid primary key default gen_random_uuid(),
  origem origem_contato not null,
  telegram_user_id bigint unique,
  telegram_chat_id bigint,
  nome_exibido text,                     -- Telegram
  primeiro_nome text,                    -- formulário (opcional)
  whatsapp text,                         -- formulário, só com consentimento
  consentimento_whatsapp_em timestamptz,
  preferencia preferencia_resposta not null default 'telegram',
  aguardando text,                       -- 'pedido' depois do botão "Fazer um pedido"; 'apagar' na confirmação
  ultimo_aviso_em timestamptz,           -- último aviso automático de recebimento
  token_exclusao_hash text unique,       -- formulário: link de exclusão (só o hash)
  anonimizado_em timestamptz,            -- prazo de guarda vencido: dados pessoais apagados, contagens ficam
  ultima_interacao timestamptz not null default now(),
  criado_em timestamptz not null default now(),
  check (whatsapp is null or consentimento_whatsapp_em is not null)
);

create type estado_mensagem as enum (
  'pendente',         -- espera o próximo ciclo da Atendente
  'processando',      -- está num job do ciclo
  'respondida_auto',  -- nível 1 ou 2 respondido sozinho
  'rascunho',         -- esperando a Lana (níveis 2 e 3)
  'urgente',          -- nível 4: chama a Lana
  'respondida',       -- a Lana aprovou e a resposta saiu (ou ela respondeu por fora)
  'descartada'
);

create table atendente_mensagens (
  id uuid primary key default gen_random_uuid(),
  contato_id uuid not null references contatos (id) on delete cascade,
  origem origem_contato not null,
  texto text,                            -- null depois do prazo de guarda
  preco_max numeric(12, 2),              -- formulário: faixa de preço (opcional)
  recebida_em timestamptz not null default now(),
  nivel smallint check (nivel between 1 and 4),
  categoria text,
  estado estado_mensagem not null default 'pendente',
  motivo text,                           -- por que virou rascunho ou urgente
  rascunho text,                         -- texto da Atendente; links como {link:<produto_id>}
  rascunho_versao integer not null default 0,
  outra_versao_pedida boolean not null default false,
  trecho_citado text,
  produto_id uuid references produtos (id) on delete set null,
  tema_duvida text,
  alertas jsonb not null default '[]',
  pedido_id uuid references pedidos_produto (id) on delete set null,
  job_id uuid,
  resposta_final text,
  resposta_editada boolean not null default false,
  resposta_via text,                     -- telegram, simulado, whatsapp_manual, canal, tela_formulario
  respondida_em timestamptz,
  respondida_por uuid references auth.users (id),
  erro_envio text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index atendente_mensagens_estado on atendente_mensagens (estado, recebida_em);
create index atendente_mensagens_contato on atendente_mensagens (contato_id);

-- Categorias fechadas (seção 5.13): texto fixo aprovado, contador de aprovações seguidas e chave de desligar.
create table atendente_categorias (
  categoria text primary key,
  nivel smallint not null check (nivel in (1, 2)),
  aprovacoes_seguidas integer not null default 0,
  automatica boolean not null default false,
  desligada boolean not null default false,
  modelo text,                           -- null = usa o texto sugerido do código
  atualizado_em timestamptz not null default now()
);
insert into atendente_categorias (categoria, nivel) values
  ('cupom', 1), ('link', 1), ('como_funciona', 1), ('oferta_vale', 1), ('entrega', 1),
  ('medidas', 2), ('cores', 2), ('prazo', 2);

-- Pedidos das amigas (F-26): chave para juntar pedidos iguais e marca de "achado a pedido".
alter table pedidos_produto
  add column chave_produto text,
  add column achado_a_pedido boolean not null default false,
  add constraint pedidos_produto_contato_fk foreign key (contato_id) references contatos (id) on delete cascade;
create index pedidos_produto_chave on pedidos_produto (chave_produto) where chave_produto is not null;

-- RLS: os dois membros leem. Escritas nas mensagens e contatos só pelas funções (service_role),
-- que conferem o papel (o dono não aprova respostas, suposição S2).
alter table contatos enable row level security;
alter table atendente_mensagens enable row level security;
alter table atendente_categorias enable row level security;

create policy contatos_leitura on contatos for select to authenticated using (e_membro());
create policy atendente_mensagens_leitura on atendente_mensagens for select to authenticated using (e_membro());
create policy atendente_categorias_leitura on atendente_categorias for select to authenticated using (e_membro());
-- A Lana liga, desliga e aprova textos fixos das categorias.
create policy atendente_categorias_operadora on atendente_categorias for update to authenticated
  using (meu_papel() = 'operadora') with check (meu_papel() = 'operadora');

create trigger atendente_mensagens_atualizado_em before update on atendente_mensagens
  for each row execute function tocar_atualizado_em();
create trigger atendente_categorias_atualizado_em before update on atendente_categorias
  for each row execute function tocar_atualizado_em();

-- Prazo de guarda (seção 7.1): 90 dias após a última interação o texto é apagado e só ficam contagens.
create or replace function public.atendente_aplicar_guarda(dias integer default 90)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  with vencidos as (
    update contatos
    set nome_exibido = null, primeiro_nome = null, whatsapp = null, consentimento_whatsapp_em = null,
        telegram_user_id = null, telegram_chat_id = null, token_exclusao_hash = null, aguardando = null,
        anonimizado_em = now()
    where anonimizado_em is null and ultima_interacao < now() - make_interval(days => dias)
    returning id
  ), msgs as (
    update atendente_mensagens m
    set texto = null, rascunho = null, resposta_final = null, trecho_citado = null
    where m.contato_id in (select id from vencidos)
    returning m.id
  ), duv as (
    -- dúvidas registradas para o post de respostas (tabela do pacote de crescimento): some o texto, fica o tema
    update duvidas_registradas d
    set pergunta = ''
    where d.contato_ref in (select id::text from vencidos)
    returning d.id
  ), peds as (
    update pedidos_produto p
    set texto = 'texto apagado pelo prazo de guarda'
    where p.contato_id in (select id from vencidos)
    returning p.id
  )
  select count(*) into n from vencidos;
  return n;
end;
$$;
revoke all on function public.atendente_aplicar_guarda(integer) from public, anon, authenticated;

-- Relógio (pg_cron em UTC; Brasília = UTC-3): ciclos às :00 e :30 das 8h às 22h30 e limpeza diária às 03:17.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron')
     and exists (select 1 from pg_proc where proname = 'chamar_funcao') then
    -- 08:00 a 20:30 (11:00 a 23:30 UTC) e 21:00 a 22:30 (00:00 a 01:30 UTC): 30 ciclos por dia.
    perform cron.schedule('atendente-ciclo-dia', '0,30 11-23 * * *', $c$ select public.chamar_funcao('atendente-ciclo') $c$);
    perform cron.schedule('atendente-ciclo-noite', '0,30 0-1 * * *', $c$ select public.chamar_funcao('atendente-ciclo') $c$);
    perform cron.schedule('atendente-guarda', '17 6 * * *', $c$ select public.atendente_aplicar_guarda(90) $c$);
  end if;
end $$;
