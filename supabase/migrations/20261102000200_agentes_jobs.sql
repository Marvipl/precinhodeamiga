-- F-13 Orquestração dos agentes (Anexo A.4).
-- Fluxo: pendente -> disparado -> concluido | erro | expirado. A chave_unica impede jobs duplicados.

create type estado_job as enum ('pendente', 'disparado', 'concluido', 'erro', 'expirado', 'cancelado');

create table agente_jobs (
  id uuid primary key default gen_random_uuid(),
  rotina text not null,                -- pa-curadoria, pa-redacao, pa-atendente, pa-analista, pa-radar, pa-coach
  contrato text not null,              -- ex.: curadoria/v1
  entrada jsonb not null default '{}',
  chave_unica text not null unique,    -- ex.: curadoria:2026-11-09
  estado estado_job not null default 'pendente',
  tentativas integer not null default 0,
  proxima_tentativa_em timestamptz not null default now(),
  sessao_url text,
  erro text,
  saida jsonb,
  simulado boolean not null default false,
  criado_em timestamptz not null default now(),
  disparado_em timestamptz,
  concluido_em timestamptz,
  atualizado_em timestamptz not null default now()
);
create index agente_jobs_fila on agente_jobs (estado, proxima_tentativa_em);
create index agente_jobs_rotina_dia on agente_jobs (rotina, disparado_em);

-- Cada tentativa de disparo tem um nonce de uso único (guardamos só o hash).
create table agente_tentativas (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references agente_jobs (id) on delete cascade,
  nonce_hash text not null unique,
  status_http integer,
  sessao_url text,
  usado_em timestamptz,                -- quando o retorno válido chegou
  criado_em timestamptz not null default now()
);
create index agente_tentativas_dia on agente_tentativas (criado_em);

-- Estado por rotina: pausa individual e teto diário (o valor inicial do teto está em core/agentes.ts).
create table agente_rotinas (
  rotina text primary key,
  pausada boolean not null default false,
  teto_diario integer,                 -- null = usa o padrão do código
  ultima_execucao timestamptz,
  ultimo_erro text,
  ultimo_erro_em timestamptz,
  atualizado_em timestamptz not null default now()
);

insert into agente_rotinas (rotina) values
  ('pa-curadoria'), ('pa-redacao'), ('pa-atendente'), ('pa-analista'), ('pa-radar'), ('pa-coach');

-- Uso do dia (fuso de Brasília) por rotina: tentativas disparadas de verdade ou simuladas.
create view agente_uso_hoje with (security_invoker = true) as
select j.rotina, count(*)::int as disparos
from agente_tentativas t
join agente_jobs j on j.id = t.job_id
where (t.criado_em at time zone 'America/Sao_Paulo')::date = (now() at time zone 'America/Sao_Paulo')::date
group by j.rotina;

alter table agente_jobs enable row level security;
alter table agente_tentativas enable row level security;
alter table agente_rotinas enable row level security;

-- Registro dos trabalhos: Marcus vê tudo (seção 7.1). A Lana vê o estado das rotinas (painel "Como funciona").
create policy agente_jobs_dono on agente_jobs for select to authenticated using (e_dono());
create policy agente_tentativas_dono on agente_tentativas for select to authenticated using (e_dono());
create policy agente_rotinas_leitura on agente_rotinas for select to authenticated using (e_membro());
create policy agente_rotinas_dono on agente_rotinas for update to authenticated using (e_dono()) with check (e_dono());

create trigger agente_jobs_atualizado_em before update on agente_jobs
  for each row execute function tocar_atualizado_em();
create trigger agente_rotinas_atualizado_em before update on agente_rotinas
  for each row execute function tocar_atualizado_em();

-- Tomada atômica de jobs pelo disparador (evita dois disparadores pegarem o mesmo job).
create or replace function public.tomar_jobs_pendentes(limite integer default 10)
returns setof agente_jobs
language sql
security definer
set search_path = public
as $$
  update agente_jobs j
  set estado = 'disparado', disparado_em = now(), tentativas = j.tentativas + 1
  where j.id in (
    select id from agente_jobs
    where estado = 'pendente' and proxima_tentativa_em <= now()
    order by criado_em
    limit limite
    for update skip locked
  )
  returning j.*;
$$;
revoke all on function public.tomar_jobs_pendentes(integer) from public, anon, authenticated;
