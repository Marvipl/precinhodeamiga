-- P11 Resultados e Analista (F-23, seções 5.7 a 5.10).
-- Relatório de conversões (API ou CSV do plano B), cliques por canal, pagamentos (comissão líquida),
-- decisões dos gates, metas da fase 2 e resumos semanais da Analista.

create type status_conversao as enum ('pendente', 'concluida', 'cancelada');
create type origem_importacao as enum ('api', 'csv');

create table importacoes_conversoes (
  id uuid primary key default gen_random_uuid(),
  origem origem_importacao not null,
  arquivo_nome text,
  periodo_inicio date,
  periodo_fim date,
  linhas_lidas integer not null default 0,
  linhas_gravadas integer not null default 0,
  linhas_com_erro integer not null default 0,
  erros jsonb not null default '[]',           -- [{linha, motivo}] (no máximo as primeiras 50)
  estado text not null check (estado in ('ok', 'parcial', 'erro')),
  mensagem text,
  criado_por uuid references auth.users (id),
  criado_em timestamptz not null default now(),
  check (periodo_fim is null or periodo_inicio <= periodo_fim)
);
create index importacoes_recentes on importacoes_conversoes (criado_em desc);

-- Uma linha por pedido e item do relatório. A Shopee não identifica o comprador.
create table conversoes (
  id uuid primary key default gen_random_uuid(),
  pedido_id text not null,
  item_id text not null default '',
  dia date not null,                           -- dia do pedido em Brasília
  data_pedido timestamptz not null,
  status status_conversao not null,
  valor_pedido numeric(12, 2) not null default 0 check (valor_pedido >= 0),
  comissao numeric(12, 2) not null default 0 check (comissao >= 0),
  comissao_extra numeric(12, 2) not null default 0 check (comissao_extra >= 0),
  sub1 text,                                   -- destino: wa, tg, at (seção 5.5)
  sub2 text,                                   -- id do post
  sub3 text,                                   -- data do bloco AAAAMMDD
  sub4 text,                                   -- rodada ou pedido
  sub5 text,
  origem origem_importacao not null,
  importacao_id uuid references importacoes_conversoes (id) on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (pedido_id, item_id)
);
create index conversoes_dia on conversoes (dia);
create index conversoes_sub1 on conversoes (sub1, dia);

-- Cliques por dia e por destino (sub1). '' = sem código.
create table cliques_diarios (
  dia date not null,
  sub1 text not null default '',
  cliques integer not null check (cliques >= 0),
  origem origem_importacao not null,
  importacao_id uuid references importacoes_conversoes (id) on delete set null,
  atualizado_em timestamptz not null default now(),
  primary key (dia, sub1)
);

-- Comissão líquida paga, por mês de referência (da API ou informada pela Lana uma vez por mês).
create table pagamentos_comissao (
  mes text primary key check (mes ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  valor_liquido numeric(12, 2) not null check (valor_liquido >= 0),
  origem text not null default 'manual' check (origem in ('api', 'manual')),
  informado_por uuid references auth.users (id),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- Decisão registrada por Lana e Marcus em cada gate (Fluxo F). A recomendação é a calculada pela regra.
create type id_gate as enum ('dia30', 'dia60', 'dia90');
create type resultado_gate as enum ('escalar', 'ajustar', 'parar');

create table gate_decisoes (
  gate id_gate primary key,
  recomendacao resultado_gate,
  decisao resultado_gate not null,
  nota text,
  numeros jsonb not null default '{}',         -- retrato dos números no momento da decisão
  registrado_por uuid references auth.users (id),
  registrado_em timestamptz not null default now()
);

-- Metas da fase 2 (coluna "Meta fase 2" dos indicadores), definidas no gate do dia 30.
create table metas_fase2 (
  indicador text primary key,
  valor numeric not null,
  definido_por uuid references auth.users (id),
  definido_em timestamptz not null default now()
);

-- Resumo semanal da Analista (texto de IA já conferido em código).
create table resumos_semanais (
  semana_inicio date primary key,
  semana_fim date not null,
  texto text not null,
  numeros jsonb not null default '[]',
  job_id uuid references agente_jobs (id) on delete set null,
  simulado boolean not null default false,
  criado_em timestamptz not null default now()
);

-- Leitura para a Audiência (engajamento por canal e funil): já sem canceladas.
create view conversoes_por_canal_dia with (security_invoker = true) as
with c as (
  select dia, coalesce(sub1, '') as sub1, count(distinct pedido_id)::int as pedidos,
         sum(valor_pedido) as valor_pedidos, sum(comissao) as comissao
  from conversoes where status <> 'cancelada'
  group by dia, coalesce(sub1, '')
)
select coalesce(c.dia, k.dia) as dia,
       coalesce(c.sub1, k.sub1) as sub1,
       coalesce(k.cliques, 0) as cliques,
       coalesce(c.pedidos, 0) as pedidos,
       coalesce(c.valor_pedidos, 0)::numeric(12, 2) as valor_pedidos,
       coalesce(c.comissao, 0)::numeric(12, 2) as comissao
from c full outer join cliques_diarios k on k.dia = c.dia and k.sub1 = c.sub1;

-- RLS: os dois membros leem tudo. A importação por CSV e os registros manuais são feitos pelo painel.
do $$
declare
  t text;
begin
  foreach t in array array['importacoes_conversoes', 'conversoes', 'cliques_diarios', 'pagamentos_comissao', 'gate_decisoes', 'metas_fase2'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy %I on %I for select to authenticated using (e_membro())', t || '_leitura', t);
    execute format('create policy %I on %I for insert to authenticated with check (e_membro())', t || '_insert', t);
    execute format('create policy %I on %I for update to authenticated using (e_membro()) with check (e_membro())', t || '_update', t);
  end loop;
end $$;
-- Apagar só pagamento e meta (correção de digitação); conversões só saem por nova importação.
create policy pagamentos_comissao_delete on pagamentos_comissao for delete to authenticated using (e_membro());
create policy metas_fase2_delete on metas_fase2 for delete to authenticated using (e_membro());

-- Resumos: só leitura no painel; quem escreve é o processador (service_role).
alter table resumos_semanais enable row level security;
create policy resumos_semanais_leitura on resumos_semanais for select to authenticated using (e_membro());

do $$
declare
  t text;
begin
  foreach t in array array['conversoes', 'cliques_diarios', 'pagamentos_comissao'] loop
    execute format('create trigger %I before update on %I for each row execute function tocar_atualizado_em()', t || '_atualizado_em', t);
  end loop;
end $$;

-- Relógio da Analista (Anexo A.3): cálculos/importação às 06:13 e resumo às segundas 06:43 (Brasília = UTC-3).
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron')
     and exists (select 1 from pg_proc where proname = 'chamar_funcao') then
    perform cron.schedule('analista-diario', '13 9 * * *', $c$ select public.chamar_funcao('analista', '{"acao":"diario"}') $c$);
    perform cron.schedule('analista-resumo', '43 9 * * 1', $c$ select public.chamar_funcao('analista', '{"acao":"resumo"}') $c$);
  end if;
end $$;
