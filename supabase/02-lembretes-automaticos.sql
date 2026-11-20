-- Sessio · envio automático dos lembretes (a cada 15 minutos)
-- Rode DEPOIS de publicar a função "lembretes" e de criar o segredo LEMBRETE_CHAVE nela.
-- 1. Em Database → Extensions, ative "pg_cron" e "pg_net".
-- 2. Rode o bloco A uma única vez, trocando os dois valores. A chave fica guardada no cofre (Vault)
--    do Supabase, e não neste arquivo.
-- 3. Rode o bloco B.

-- Bloco A (uma vez só):
-- select vault.create_secret('https://SEU-PROJETO.supabase.co/functions/v1/lembretes', 'sessio_lembretes_url');
-- select vault.create_secret('A-MESMA-LEMBRETE-CHAVE-DA-FUNCAO', 'sessio_lembretes_chave');

-- Bloco B:
select cron.unschedule('sessio-lembretes') where exists (select 1 from cron.job where jobname = 'sessio-lembretes');
select cron.schedule('sessio-lembretes', '*/15 * * * *', $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'sessio_lembretes_url'),
    headers := jsonb_build_object('Content-Type', 'application/json',
               'x-chave', (select decrypted_secret from vault.decrypted_secrets where name = 'sessio_lembretes_chave')),
    body := '{}'::jsonb
  );
$$);

-- Para conferir as últimas execuções:
-- select * from cron.job_run_details order by start_time desc limit 10;
