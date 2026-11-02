-- P10 Audiência (F-22, seção 5.12).
--   * seguidores_registros: total por canal e dia. WhatsApp = Lana informa (digitado ou print confirmado);
--     Telegram = contagem diária do bot (só a Edge Function grava).
--   * telegram_membros_eventos: entradas e saídas do canal pelo evento chat_member. Sem dado da pessoa.
--   * leituras_print: número lido pela IA no print; só vira registro quando a Lana confirma.
--   * audiencia_semanas: view lida pelo pacote de Resultados (taxa de saída semanal, seção 5.7).

create type fonte_seguidores as enum ('bot', 'digitado', 'print');
create type tipo_evento_membro as enum ('entrou', 'saiu');
create type estado_leitura_print as enum ('lendo', 'lida', 'sem_numero', 'confirmada', 'descartada', 'erro');

create table leituras_print (
  id uuid primary key default gen_random_uuid(),
  canal canal not null default 'wa' check (canal = 'wa'),
  print_path text not null,            -- Storage, bucket `prints`
  estado estado_leitura_print not null default 'lendo',
  numero_lido integer check (numero_lido is null or numero_lido between 0 and 10000000),
  trecho text,
  confianca text check (confianca is null or confianca in ('alta', 'media', 'baixa')),
  job_id uuid references agente_jobs (id) on delete set null,
  enviado_por uuid references auth.users (id),
  confirmado_por uuid references auth.users (id),
  confirmado_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index leituras_print_recentes on leituras_print (criado_em desc);

create table seguidores_registros (
  id uuid primary key default gen_random_uuid(),
  canal canal not null,
  data date not null,                  -- dia em Brasília
  total integer not null check (total between 0 and 10000000),
  fonte fonte_seguidores not null,
  leitura_id uuid references leituras_print (id) on delete set null,
  registrado_por uuid references auth.users (id),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (canal, data),
  check ((canal = 'tg') = (fonte = 'bot')),
  check (fonte <> 'print' or leitura_id is not null)
);

create table telegram_membros_eventos (
  id bigint generated always as identity primary key,
  tipo tipo_evento_membro not null,
  ocorrido_em timestamptz not null,
  update_id bigint unique,             -- idempotência: o Telegram pode reenviar o mesmo update
  criado_em timestamptz not null default now()
);
create index telegram_membros_eventos_quando on telegram_membros_eventos (ocorrido_em);

-- Leitura para os dois membros; escrita só pelas funções abaixo e pelas Edge Functions (service_role).
alter table leituras_print enable row level security;
alter table seguidores_registros enable row level security;
alter table telegram_membros_eventos enable row level security;
create policy leituras_print_leitura on leituras_print for select to authenticated using (e_membro());
create policy seguidores_registros_leitura on seguidores_registros for select to authenticated using (e_membro());
create policy telegram_membros_eventos_leitura on telegram_membros_eventos for select to authenticated using (e_membro());

create trigger leituras_print_atualizado_em before update on leituras_print
  for each row execute function tocar_atualizado_em();
create trigger seguidores_registros_atualizado_em before update on seguidores_registros
  for each row execute function tocar_atualizado_em();

-- Hoje em Brasília.
create or replace function public.hoje_brasilia()
returns date language sql stable as $$ select (now() at time zone 'America/Sao_Paulo')::date $$;

-- Segunda-feira da semana de uma data.
create or replace function public.segunda_da_semana(d date)
returns date language sql immutable as $$ select d - (extract(isodow from d)::int - 1) $$;

-- Lana digita o total do canal do WhatsApp. Um registro por dia: salvar de novo no mesmo dia corrige.
create or replace function public.salvar_seguidores_wa(p_total integer)
returns seguidores_registros
language plpgsql
security definer
set search_path = public
as $$
declare
  r seguidores_registros;
begin
  if not e_membro() then raise exception 'sem permissão' using errcode = '42501'; end if;
  if p_total is null or p_total < 0 or p_total > 10000000 then raise exception 'total inválido'; end if;
  insert into seguidores_registros (canal, data, total, fonte, registrado_por)
  values ('wa', hoje_brasilia(), p_total, 'digitado', auth.uid())
  on conflict (canal, data) do update
    set total = excluded.total, fonte = 'digitado', leitura_id = null, registrado_por = excluded.registrado_por
  returning * into r;
  return r;
end;
$$;

-- Lana confirma (e pode corrigir) o número lido do print. Só aqui um print vira registro (Fluxo E).
create or replace function public.confirmar_leitura_print(p_leitura uuid, p_total integer)
returns seguidores_registros
language plpgsql
security definer
set search_path = public
as $$
declare
  l leituras_print;
  r seguidores_registros;
begin
  if not e_membro() then raise exception 'sem permissão' using errcode = '42501'; end if;
  if p_total is null or p_total < 0 or p_total > 10000000 then raise exception 'total inválido'; end if;
  select * into l from leituras_print where id = p_leitura for update;
  if not found then raise exception 'leitura não encontrada'; end if;
  if l.estado not in ('lida', 'sem_numero') then raise exception 'leitura não está pronta para confirmar (%)', l.estado; end if;
  update leituras_print set estado = 'confirmada', confirmado_por = auth.uid(), confirmado_em = now() where id = p_leitura;
  insert into seguidores_registros (canal, data, total, fonte, leitura_id, registrado_por)
  values ('wa', hoje_brasilia(), p_total, 'print', p_leitura, auth.uid())
  on conflict (canal, data) do update
    set total = excluded.total, fonte = 'print', leitura_id = excluded.leitura_id, registrado_por = excluded.registrado_por
  returning * into r;
  return r;
end;
$$;

create or replace function public.descartar_leitura_print(p_leitura uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not e_membro() then raise exception 'sem permissão' using errcode = '42501'; end if;
  update leituras_print set estado = 'descartada' where id = p_leitura and estado in ('lendo', 'lida', 'sem_numero', 'erro');
end;
$$;

revoke all on function public.salvar_seguidores_wa(integer) from public, anon;
revoke all on function public.confirmar_leitura_print(uuid, integer) from public, anon;
revoke all on function public.descartar_leitura_print(uuid) from public, anon;
grant execute on function public.salvar_seguidores_wa(integer) to authenticated;
grant execute on function public.confirmar_leitura_print(uuid, integer) to authenticated;
grant execute on function public.descartar_leitura_print(uuid) to authenticated;

-- Semanas por canal (contrato com o pacote de Resultados):
--   canal ('wa'|'tg'), semana_inicio (segunda, Brasília), seguidores_inicio, seguidores_fim, saidas.
--   Telegram: início = último total antes da semana (ou o primeiro da semana); saídas = eventos do bot.
--   WhatsApp: início = último total antes da semana (null se não houver); saídas = null (aparece como queda no total).
create view audiencia_semanas with (security_invoker = true) as
with r as (
  select canal, data, total, segunda_da_semana(data) as semana_inicio from seguidores_registros
),
semanas as (
  select distinct canal, semana_inicio from r
)
select
  s.canal::text as canal,
  s.semana_inicio,
  coalesce(
    (select r2.total from r r2 where r2.canal = s.canal and r2.data < s.semana_inicio order by r2.data desc limit 1),
    case when s.canal = 'tg' then
      (select r3.total from r r3 where r3.canal = s.canal and r3.semana_inicio = s.semana_inicio order by r3.data asc limit 1)
    end
  ) as seguidores_inicio,
  (select r4.total from r r4 where r4.canal = s.canal and r4.semana_inicio = s.semana_inicio order by r4.data desc limit 1) as seguidores_fim,
  case when s.canal = 'tg' then
    (select count(*)::int from telegram_membros_eventos e
     where e.tipo = 'saiu' and segunda_da_semana((e.ocorrido_em at time zone 'America/Sao_Paulo')::date) = s.semana_inicio)
  end as saidas
from semanas s;

-- Bucket privado dos prints (só onde o Storage existe).
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage')
     and exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'storage' and c.relname = 'buckets') then
    insert into storage.buckets (id, name, public) values ('prints', 'prints', false) on conflict (id) do nothing;
    execute $p$ create policy prints_membros_leitura on storage.objects for select to authenticated
      using (bucket_id = 'prints' and public.e_membro()) $p$;
    execute $p$ create policy prints_membros_envio on storage.objects for insert to authenticated
      with check (bucket_id = 'prints' and public.e_membro()) $p$;
  end if;
end $$;

-- Contagem diária de inscritos do Telegram às 23:50 de Brasília (02:50 UTC). Só onde o relógio existe.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron')
     and exists (select 1 from pg_proc where proname = 'chamar_funcao') then
    perform cron.schedule('audiencia-contagem-tg', '50 2 * * *', $c$ select public.chamar_funcao('audiencia-contagem-tg') $c$);
  end if;
end $$;
