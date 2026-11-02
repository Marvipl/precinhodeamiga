-- P5 Registro de tempo (F-11, seção 5.15).
-- * no máximo uma sessão aberta por pessoa;
-- * sessão aberta há N horas sem atividade fecha sozinha no último uso e pede confirmação (confirmada_em);
-- * N vem da configuração 'regras.sessao_inativa_horas' (padrão 2, core/config.ts).

alter table sessoes_trabalho add column confirmada_em timestamptz;

create unique index sessoes_uma_aberta on sessoes_trabalho (user_id) where fim is null;
create index sessoes_por_inicio on sessoes_trabalho (user_id, inicio desc);

create or replace function public.fechar_sessoes_inativas(agora timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  horas numeric;
  n integer;
begin
  select (valor #>> '{}')::numeric into horas from configuracoes where chave = 'regras.sessao_inativa_horas';
  if horas is null or horas <= 0 then
    horas := 2;
  end if;
  update sessoes_trabalho
     set fim = greatest(inicio, coalesce(ultima_atividade, inicio)),
         fechada_automaticamente = true,
         confirmada_em = null
   where fim is null
     and greatest(inicio, coalesce(ultima_atividade, inicio)) <= agora - make_interval(secs => horas * 3600);
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.fechar_sessoes_inativas(timestamptz) from public, anon, authenticated;

-- Relógio: a cada 10 minutos (só onde pg_cron existe, como na migração do relógio).
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('sessoes-inativas', '*/10 * * * *', $c$ select public.fechar_sessoes_inativas() $c$);
  end if;
end $$;
