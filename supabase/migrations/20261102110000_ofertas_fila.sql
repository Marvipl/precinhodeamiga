-- P2: Curadoria e fila "Ofertas para aprovar" (F-03, F-04, F-05).

-- ---------------------------------------------------------------------------
-- Opções que a Caçadora devolveu para cada pedido (Fluxo B). Gravadas pelo processador
-- do curadoria/v1 (service_role). A Atendente (V2) lê para rascunhar a resposta ao seguidor.
-- ---------------------------------------------------------------------------
create table pedido_opcoes (
  pedido_id uuid not null references pedidos_produto (id) on delete cascade,
  produto_id uuid not null references produtos (id) on delete cascade,
  ordem smallint not null check (ordem between 1 and 5),
  motivos text[] not null default '{}',
  preco_atual numeric(12, 2),
  job_id uuid,
  criado_em timestamptz not null default now(),
  primary key (pedido_id, produto_id)
);

alter table pedido_opcoes enable row level security;
create policy pedido_opcoes_leitura on pedido_opcoes for select to authenticated using (e_membro());

create index ofertas_pedido on ofertas (pedido_id) where pedido_id is not null;

-- ---------------------------------------------------------------------------
-- Suposição S2: o dono não aprova nem pula ofertas. A tela esconde os botões e a função
-- ofertas-acao recusa; esta trava garante o mesmo para quem escrever direto pela API.
-- Escritas do sistema (service_role, sem auth.uid()) passam.
-- ---------------------------------------------------------------------------
create or replace function public.ofertas_so_operadora_decide()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null
     and new.estado is distinct from old.estado
     and new.estado in ('aprovada', 'pulada')
     and coalesce(meu_papel()::text, '') <> 'operadora' then
    raise exception 'só a operadora aprova ou pula ofertas' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger ofertas_so_operadora_decide
before update on ofertas
for each row execute function public.ofertas_so_operadora_decide();

-- ---------------------------------------------------------------------------
-- Limpeza da fila:
--  * oferta com prazo vencido, ou de um dia anterior, ainda sem decisão -> expirada;
--  * oferta esperando outra versão há mais de 60 minutos (job com erro ou expirado) volta
--    para a fila com a frase anterior e um aviso.
-- ---------------------------------------------------------------------------
create or replace function public.limpar_fila_ofertas()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
  m integer;
begin
  update ofertas
  set estado = 'expirada'
  where estado in ('pendente', 'aguardando_redacao')
    and ((prazo is not null and prazo <= now())
         or data < (now() at time zone 'America/Sao_Paulo')::date);
  get diagnostics n = row_count;

  update ofertas
  set estado = 'pendente',
      alertas = coalesce(alertas, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
        'tipo', 'sem_versao',
        'texto', 'A Redatora não devolveu outra versão. A frase anterior foi mantida.'))
  where estado = 'aguardando_redacao'
    and atualizado_em < now() - interval '60 minutes';
  get diagnostics m = row_count;

  return n + m;
end;
$$;
revoke all on function public.limpar_fila_ofertas() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('ofertas-limpar-fila', '*/10 * * * *', $c$ select public.limpar_fila_ofertas() $c$);
  end if;
end $$;
