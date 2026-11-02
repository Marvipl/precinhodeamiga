-- F-24 Plano de 90 dias e Coach do Plano (pacote P12).
-- Progresso dos checklists no servidor (o catálogo das tarefas fica no código: core/coach/plano.ts)
-- e revisões semanais da Coach (contrato coach/v1).

create table plano_marcas (
  tarefa text primary key check (tarefa ~ '^p[0-9]{1,3}$'),
  feita boolean not null,
  marcado_por uuid references auth.users (id) on delete set null default auth.uid(),
  marcado_em timestamptz not null default now()
);

alter table plano_marcas enable row level security;
create policy plano_marcas_leitura on plano_marcas for select to authenticated using (e_membro());
create policy plano_marcas_insert on plano_marcas for insert to authenticated with check (e_membro());
create policy plano_marcas_update on plano_marcas for update to authenticated using (e_membro()) with check (e_membro());
create policy plano_marcas_delete on plano_marcas for delete to authenticated using (e_membro());

-- Uma revisão por semana (segunda-feira). Só o sistema grava (service_role); os dois leem.
create table plano_revisoes (
  semana date primary key,
  dia_plano integer not null,
  prioridades jsonb not null default '[]'::jsonb,
  nota text not null,
  job_id uuid references agente_jobs (id) on delete set null,
  simulado boolean not null default false,
  criado_em timestamptz not null default now()
);

alter table plano_revisoes enable row level security;
create policy plano_revisoes_leitura on plano_revisoes for select to authenticated using (e_membro());

-- Segundas às 06:23 em Brasília = 09:23 UTC (Anexo A.3).
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('coach-semanal', '23 9 * * 1', $c$ select public.chamar_funcao('coach-semanal') $c$);
  end if;
end $$;
