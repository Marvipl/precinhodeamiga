-- F-27 Crescimento da semana e F-28 Conteúdo extra da Redatora (pacote P14).

create type tipo_conteudo_extra as enum ('roteiro_video', 'lista_data', 'respostas_semana');
create type estado_conteudo_extra as enum ('em_preparo', 'pronto', 'erro', 'descartado');

-- Um conteúdo por referência (lista_data:<data_pico_id>, roteiro_video:<oferta_id>, respostas_semana:<segunda>).
-- "Pedir outra versão" sobe a versão e volta para em_preparo; a Redatora nunca publica nada (seção 5.1, item 6).
create table conteudos_extra (
  id uuid primary key default gen_random_uuid(),
  tipo tipo_conteudo_extra not null,
  referencia text not null unique,
  estado estado_conteudo_extra not null default 'em_preparo',
  versao integer not null default 1 check (versao > 0),
  data_pico_id uuid references datas_pico (id) on delete set null,
  oferta_id uuid references ofertas (id) on delete set null,
  entrada jsonb not null default '{}',   -- o que foi enviado à Redatora (sem dado pessoal)
  titulo text,
  texto text,                            -- texto final montado por código
  cenas jsonb,                           -- roteiro de vídeo: [{segundos, mostra, fala}]
  alertas jsonb not null default '[]',   -- [{trecho, motivo}] promessas marcadas (seção 5.3)
  simulado boolean not null default false,
  job_id uuid,
  erro text,
  criado_por uuid references auth.users (id),
  copiado_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index conteudos_extra_recentes on conteudos_extra (tipo, criado_em desc);

-- Dúvidas classificadas por tema, para a regra "3 pessoas com a mesma dúvida na semana" (seção 5.13).
-- Quem grava é a Atendente (pacote da Comunidade) com service_role. contato_ref é o ID interno da pessoa.
create table duvidas_registradas (
  id bigint generated always as identity primary key,
  tema text not null check (length(trim(tema)) > 0),
  contato_ref text not null,
  pergunta text not null default '',
  mensagem_id uuid,                      -- mensagem de origem, quando houver
  criado_em timestamptz not null default now()
);
create index duvidas_registradas_semana on duvidas_registradas (criado_em desc);

alter table conteudos_extra enable row level security;
create policy conteudos_extra_leitura on conteudos_extra for select to authenticated using (e_membro());
-- A tela só marca "copiado" ou descarta; criação e versão passam pela função conteudo-extra-pedir.
create policy conteudos_extra_update on conteudos_extra for update to authenticated
  using (e_membro()) with check (e_membro());

alter table duvidas_registradas enable row level security;
create policy duvidas_registradas_leitura on duvidas_registradas for select to authenticated using (e_membro());

create trigger conteudos_extra_atualizado_em before update on conteudos_extra
  for each row execute function tocar_atualizado_em();
