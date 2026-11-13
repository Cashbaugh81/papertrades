-- ---------------------------------------------------------------------------
-- nightly-close: from one run at 20:30 New York to one run every hour from
-- 17:00 to 05:00 New York, the first an hour after the close.
--
-- pg_cron runs in UTC, and New York is UTC-5 in winter and UTC-4 in summer,
-- so the job fires every hour from 21:00 to 10:00 UTC every day and the
-- function itself ignores runs outside 17:00–05:59 New York. Runs with nothing
-- to do (weekends, or every ticker already has the latest close) make one
-- database read and no Tiingo requests.
-- ---------------------------------------------------------------------------
select cron.unschedule('nightly-close');

select cron.schedule(
  'nightly-close',
  '0 21-23,0-10 * * *',
  $$
  select net.http_post(
    url := 'https://rolvlgtxjrcsczinhgbf.supabase.co/functions/v1/nightly-close',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'nightly_close_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 150000
  );
  $$
);
