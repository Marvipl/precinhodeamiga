-- pg_cron como relógio único (Anexo A.2). Só roda onde as extensões existem (Supabase).
-- Pré-requisito do dono (docs/HUMANO.md): guardar no Vault os segredos 'project_url' e 'service_role_key'.
-- Atenção: pg_cron usa UTC. Brasília = UTC-3 (sem horário de verão desde 2019).
--   Ex.: 04:47 em Brasília = '47 7 * * *'.

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron')
     and exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_cron;
    create extension if not exists pg_net;

    -- Chama uma Edge Function com a chave de serviço guardada no Vault.
    execute $f$
      create or replace function public.chamar_funcao(nome text, corpo jsonb default '{}'::jsonb)
      returns bigint
      language plpgsql
      security definer
      set search_path = public
      as $body$
      declare
        base text;
        chave text;
        req bigint;
      begin
        select decrypted_secret into base from vault.decrypted_secrets where name = 'project_url';
        select decrypted_secret into chave from vault.decrypted_secrets where name = 'service_role_key';
        if base is null or chave is null then
          raise notice 'chamar_funcao: segredos project_url/service_role_key ausentes no Vault';
          return null;
        end if;
        select net.http_post(
          url := base || '/functions/v1/' || nome,
          headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || chave),
          body := corpo
        ) into req;
        return req;
      end;
      $body$;
    $f$;
    execute 'revoke all on function public.chamar_funcao(text, jsonb) from public, anon, authenticated';

    -- Disparador de jobs: a cada minuto pega pendentes, respeita pausa e teto, dispara ou simula.
    perform cron.schedule('agente-disparar', '* * * * *', $c$ select public.chamar_funcao('agente-disparar') $c$);
    -- Expira jobs sem retorno (45 min) e agenda nova tentativa da curadoria.
    perform cron.schedule('agente-expirar', '*/5 * * * *', $c$ select public.chamar_funcao('agente-disparar', '{"acao":"expirar"}') $c$);
  end if;
end $$;
