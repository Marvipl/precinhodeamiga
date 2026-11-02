-- P9: Página de entrada com link por origem (F-20) e Radar de Comunidades (F-21, seção 5.11).
-- Privacidade (seção 7.1): cliques sem IP nem cookie; resumo irreversível com sal diário, apagado em 24 horas;
-- detalhe por 90 dias, depois só totais por dia.

-- ---------------------------------------------------------------------------
-- Radar: lugares e divulgações
-- ---------------------------------------------------------------------------
create type estado_lugar as enum ('novo', 'pedir_permissao', 'aguardando', 'aprovado', 'recusou', 'descartado');

create table radar_lugares (
  id uuid primary key default gen_random_uuid(),
  chave text not null unique,          -- core/radar/lugares.ts chaveLugar: não repetir lugar já visto
  nome text not null,
  tipo text not null,                  -- ex.: "Grupo de Facebook", "Canal no Telegram"
  regiao text,
  url text,                            -- página pública onde o lugar foi achado
  membros integer check (membros is null or membros >= 0),
  nota integer check (nota between 0 and 100),
  regra text not null,                 -- regra observada
  proibe_links boolean not null default false,
  motivo text,
  aviso text,                          -- ex.: "A regra do lugar proíbe links. O Radar não recomenda."
  mensagens jsonb not null default '{}', -- {pedido_admin, troca, convite} sem link; o código põe o link de entrada
  alertas jsonb not null default '[]',   -- [{trecho, texto}] promessas marcadas pela Guardiã
  estado estado_lugar not null default 'novo',
  origem text unique check (origem is null or origem ~ '^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$'),
  dias_permitidos smallint[] not null default '{}', -- 0 = domingo ... 6 = sábado
  intervalo_dias integer check (intervalo_dias is null or intervalo_dias between 1 and 365),
  pedido_em timestamptz,
  aprovado_em timestamptz,
  recusado_em timestamptz,
  descartado_em timestamptz,
  job_id uuid references agente_jobs (id) on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  check (estado <> 'aprovado' or (origem is not null and intervalo_dias is not null and cardinality(dias_permitidos) > 0)),
  check (not proibe_links or estado in ('novo', 'descartado'))
);
create index radar_lugares_estado on radar_lugares (estado);

create table radar_divulgacoes (
  id uuid primary key default gen_random_uuid(),
  lugar_id uuid not null references radar_lugares (id) on delete cascade,
  origem text not null,
  divulgado_em timestamptz not null default now(),
  registrado_por uuid references auth.users (id),
  criado_em timestamptz not null default now()
);
create index radar_divulgacoes_lugar on radar_divulgacoes (lugar_id, divulgado_em desc);
create index radar_divulgacoes_quando on radar_divulgacoes (divulgado_em desc);

create trigger radar_lugares_atualizado_em before update on radar_lugares
  for each row execute function tocar_atualizado_em();

-- Membros leem; as mudanças passam pela função radar-acao, que aplica as regras do código (service_role).
alter table radar_lugares enable row level security;
alter table radar_divulgacoes enable row level security;
create policy radar_lugares_leitura on radar_lugares for select to authenticated using (e_membro());
create policy radar_divulgacoes_leitura on radar_divulgacoes for select to authenticated using (e_membro());

-- ---------------------------------------------------------------------------
-- Página de entrada: cliques por origem e botão
-- ---------------------------------------------------------------------------
-- botao: 'pagina' = abriu o link de entrada; 'wa' / 'tg' = tocou em seguir no WhatsApp / Telegram.
create table entrada_cliques (
  id bigint generated always as identity primary key,
  origem text not null,
  botao text not null check (botao in ('pagina', 'wa', 'tg')),
  criado_em timestamptz not null default now()
);
create index entrada_cliques_quando on entrada_cliques (criado_em);
create index entrada_cliques_origem on entrada_cliques (origem, criado_em);

-- Depois de 90 dias o detalhe vira total por dia (data em Brasília).
create table entrada_cliques_totais (
  data date not null,
  origem text not null,
  botao text not null check (botao in ('pagina', 'wa', 'tg')),
  total integer not null check (total >= 0),
  primary key (data, origem, botao)
);

-- Sal do dia e resumos de acesso: só o service_role mexe (RLS ligado, sem política). Apagados em 24 horas.
create table entrada_sal (
  data date primary key,
  sal text not null,
  criado_em timestamptz not null default now()
);
create table entrada_vistos (
  resumo text primary key,
  criado_em timestamptz not null default now()
);

alter table entrada_cliques enable row level security;
alter table entrada_cliques_totais enable row level security;
alter table entrada_sal enable row level security;
alter table entrada_vistos enable row level security;
create policy entrada_cliques_leitura on entrada_cliques for select to authenticated using (e_membro());
create policy entrada_cliques_totais_leitura on entrada_cliques_totais for select to authenticated using (e_membro());

-- Leitura única para telas (Radar, Audiência): detalhe recente + totais antigos, por dia de Brasília.
create view entrada_cliques_diarios with (security_invoker = true) as
select data, origem, botao, sum(total)::int as total
from (
  select (criado_em at time zone 'America/Sao_Paulo')::date as data, origem, botao, count(*)::int as total
  from entrada_cliques
  group by 1, 2, 3
  union all
  select data, origem, botao, total from entrada_cliques_totais
) x
group by data, origem, botao;

-- Sal do dia (cria na primeira chamada). Só para o service_role.
create or replace function public.entrada_sal_do_dia()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  s text;
begin
  select sal into s from entrada_sal where data = hoje;
  if s is null then
    insert into entrada_sal (data, sal)
    values (hoje, replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
    on conflict (data) do nothing;
    select sal into s from entrada_sal where data = hoje;
  end if;
  return s;
end;
$$;
revoke all on function public.entrada_sal_do_dia() from public, anon, authenticated;

-- Conta um clique se o mesmo resumo ainda não foi visto. Devolve true quando contou.
create or replace function public.entrada_registrar(p_origem text, p_botao text, p_resumo text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  insert into entrada_vistos (resumo) values (p_resumo) on conflict (resumo) do nothing;
  get diagnostics n = row_count;
  if n > 0 then
    insert into entrada_cliques (origem, botao) values (p_origem, p_botao);
  end if;
  return n > 0;
end;
$$;
revoke all on function public.entrada_registrar(text, text, text) from public, anon, authenticated;

-- Limpeza: resumos e sais com mais de 24 horas; detalhe com mais de 90 dias vira total por dia.
create or replace function public.entrada_limpar()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  corte timestamptz := now() - interval '90 days';
begin
  delete from entrada_vistos where criado_em < now() - interval '24 hours';
  delete from entrada_sal where criado_em < now() - interval '24 hours'
    and data < (now() at time zone 'America/Sao_Paulo')::date;
  insert into entrada_cliques_totais (data, origem, botao, total)
  select (criado_em at time zone 'America/Sao_Paulo')::date, origem, botao, count(*)::int
  from entrada_cliques where criado_em < corte
  group by 1, 2, 3
  on conflict (data, origem, botao) do update set total = entrada_cliques_totais.total + excluded.total;
  delete from entrada_cliques where criado_em < corte;
end;
$$;
revoke all on function public.entrada_limpar() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Job semanal do Radar (pa-radar, segundas 07:07 de Brasília): nichos, região e lugares já vistos.
-- A região vem de configuracoes.chave = 'radar.regiao' (texto), quando o dono preencher.
-- ---------------------------------------------------------------------------
create or replace function public.criar_job_radar()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  novo_id uuid;
begin
  insert into agente_jobs (rotina, contrato, entrada, chave_unica)
  values (
    'pa-radar',
    'radar/v1',
    jsonb_build_object(
      'data', to_char(hoje, 'YYYY-MM-DD'),
      'nichos', coalesce((select jsonb_agg(nome order by principal desc, nome) from nichos where ativo and not bloqueado), '[]'::jsonb),
      'regiao', (select case when jsonb_typeof(valor) = 'string' then valor #>> '{}' end from configuracoes where chave = 'radar.regiao'),
      'ja_vistos', coalesce((select jsonb_agg(chave order by criado_em desc) from (select chave, criado_em from radar_lugares order by criado_em desc limit 2000) v), '[]'::jsonb)
    ),
    'radar:' || to_char(hoje, 'YYYY-MM-DD')
  )
  on conflict (chave_unica) do nothing
  returning id into novo_id;
  return novo_id;
end;
$$;
revoke all on function public.criar_job_radar() from public, anon, authenticated;

-- Relógio (pg_cron em UTC; Brasília = UTC-3). Só onde as extensões existem (Supabase).
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    -- Busca semanal: segundas 07:07 em Brasília = 10:07 UTC.
    perform cron.schedule('radar-semanal', '7 10 * * 1', $c$ select public.criar_job_radar() $c$);
    -- Limpeza da página de entrada: a cada hora.
    perform cron.schedule('entrada-limpar', '17 * * * *', $c$ select public.entrada_limpar() $c$);
    -- Lembrete no dia permitido: 09:00 em Brasília = 12:00 UTC [SUPOSIÇÃO].
    if exists (select 1 from pg_proc where proname = 'chamar_funcao') then
      perform cron.schedule('radar-lembrete', '0 12 * * *', $c$ select public.chamar_funcao('radar-lembrete') $c$);
    end if;
  end if;
end $$;
