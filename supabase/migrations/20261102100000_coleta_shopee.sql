-- P1: coleta da Shopee (F-02) e job diário da curadoria (Anexo A.3).
-- Prazo da oferta (periodEndTime da API) para a nota ("prazo claro") e para "Oferta válida até".
alter table produtos add column if not exists prazo timestamptz;

-- A curadoria lê os preços do dia de muitos produtos; a unique (produto_id, observado_em) já indexa por produto.
create index if not exists precos_observados_dia on precos_observados (observado_em);

-- Relógio (UTC; Brasília = UTC-3): coleta às 04:47 e job da curadoria às 05:37.
-- Só onde pg_cron existe (Supabase); chamar_funcao vem da migração do relógio.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('coleta-shopee', '47 7 * * *', $c$ select public.chamar_funcao('coleta-shopee', '{"acao":"coletar"}'::jsonb) $c$);
    perform cron.schedule('curadoria-diaria', '37 8 * * *', $c$ select public.chamar_funcao('coleta-shopee', '{"acao":"curadoria"}'::jsonb) $c$);
  end if;
end $$;
