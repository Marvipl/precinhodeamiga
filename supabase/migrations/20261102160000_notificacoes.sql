-- P7 Notificações (F-15): controle de envio, tomada atômica pelo despachante e cron a cada minuto.
-- Tabelas `notificacoes` e `push_inscricoes` vêm da migração base.
--   enviada_em = processada (enviada por algum canal, ou sem canal disponível; ver `resultado`)
--   falhou_em  = desistiu depois de MAX_TENTATIVAS (core/notificacoes.ts)

alter table notificacoes
  add column tentativas integer not null default 0,
  add column resultado jsonb,
  add column falhou_em timestamptz;

create index notificacoes_pendentes on notificacoes (enviar_em)
  where enviada_em is null and falhou_em is null;

alter table push_inscricoes
  add column dispositivo text,            -- rótulo legível ("Android", "iPhone"), só para a tela
  add column ultimo_envio_em timestamptz;

-- Cada membro cria só o próprio teste ("Enviar notificação de teste"). O resto é criado pelo sistema.
create policy notificacoes_teste on notificacoes for insert to authenticated
  with check (e_membro() and user_id = auth.uid() and tipo = 'teste');

-- Tomada atômica: empurra enviar_em 2 minutos para frente (se a função cair no meio, a notificação volta sozinha)
-- e conta a tentativa. Dois despachantes simultâneos nunca pegam a mesma linha.
create or replace function public.tomar_notificacoes(limite integer default 50)
returns setof notificacoes
language sql
security definer
set search_path = public
as $$
  update notificacoes n
  set tentativas = n.tentativas + 1, enviar_em = now() + interval '2 minutes'
  where n.id in (
    select id from notificacoes
    where enviada_em is null and falhou_em is null and enviar_em <= now()
    order by enviar_em
    limit limite
    for update skip locked
  )
  returning n.*;
$$;
revoke all on function public.tomar_notificacoes(integer) from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron')
     and exists (select 1 from pg_proc where proname = 'chamar_funcao') then
    perform cron.schedule('notificar', '* * * * *', $c$ select public.chamar_funcao('notificar') $c$);
  end if;
end $$;
