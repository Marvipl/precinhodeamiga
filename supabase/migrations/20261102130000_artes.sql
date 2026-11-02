-- P4: artes do Status (F-09) e bucket `artes` no Storage (seção 8).
-- Uma arte por oferta por dia (a função arte-gerar regrava a mesma linha se for chamada de novo).
create unique index artes_status_dia_oferta on artes_status (data, oferta_id);

-- Bucket privado: só os dois membros do painel leem; quem grava é a função arte-gerar (service_role).
-- Nos testes locais (PGlite) o schema `storage` não existe; o bloco só roda no Supabase.
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    insert into storage.buckets (id, name, public)
    values ('artes', 'artes', false)
    on conflict (id) do nothing;

    execute $p$
      create policy artes_leitura_membros on storage.objects
        for select to authenticated
        using (bucket_id = 'artes' and public.e_membro())
    $p$;
  end if;
end $$;
