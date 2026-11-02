-- P3: montagem do post, Guardiã e Agendadora (F-06, F-07, F-08, F-16; seções 5.3, 5.4, 5.6).
-- Colunas extras em posts e post_envios (tabelas da fundação, RLS já ligado) e o cron do publicar-bloco.

alter table posts
  add column chave_produto text,        -- item da Shopee (regra das 48 horas)
  add column de_manual numeric(12, 2),  -- "de" digitado no post manual (F-16), antes da Guardiã
  add column imagem_url text;           -- foto do produto usada no post do Telegram

alter table post_envios
  add column bloco text check (bloco in ('almoco', 'noite')),
  add column sub_ids jsonb,             -- códigos de origem com que o link foi gerado (seção 5.5); null no post manual
  add column chave_produto text,
  add column checado_em timestamptz,    -- checagem de preço antes do envio (5 min antes)
  add column lembrete_em timestamptz;   -- lembrete do WhatsApp criado

create index post_envios_agenda on post_envios (estado, agendado_para);
create index post_envios_repeticao on post_envios (canal, chave_produto, agendado_para);
create index posts_oferta on posts (oferta_id);

-- Publicação a cada minuto: checagem 5 min antes, Telegram no horário, lembrete do WhatsApp, fim do bloco.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron')
     and exists (select 1 from pg_proc where proname = 'chamar_funcao') then
    perform cron.schedule('publicar-bloco', '* * * * *', $c$ select public.chamar_funcao('publicar-bloco') $c$);
  end if;
end $$;
