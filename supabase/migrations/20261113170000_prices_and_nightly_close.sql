-- Build step 4: price series lookup, and the nightly-close schedule.

-- ---------------------------------------------------------------------------
-- price_series: one row per ticker with its dates and adjusted closes as
-- arrays, so a whole history comes back in one call (PostgREST caps plain
-- selects at 1000 rows). Security invoker: RLS on prices still applies.
-- ---------------------------------------------------------------------------
create function public.price_series(p_tickers text[], p_from date default '1900-01-01')
returns table (ticker text, dates date[], closes numeric[])
language sql
stable
security invoker
set search_path = ''
as $$
  select p.ticker,
         array_agg(p.date order by p.date),
         array_agg(p.close order by p.date)
  from public.prices p
  where p.ticker = any (p_tickers)
    and p.date >= p_from
  group by p.ticker
$$;

revoke execute on function public.price_series(text[], date) from public, anon;
grant execute on function public.price_series(text[], date) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Shared secret between pg_cron and the nightly-close function. Generated
-- here and kept in Vault; the function checks it through this RPC, so the
-- value is never copied anywhere else.
-- ---------------------------------------------------------------------------
select vault.create_secret(
  encode(extensions.gen_random_bytes(32), 'hex'),
  'nightly_close_secret',
  'Sent by pg_cron to the nightly-close edge function in x-cron-secret.'
);

create function public.nightly_close_secret_ok(p_secret text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from vault.decrypted_secrets
    where name = 'nightly_close_secret'
      and decrypted_secret = p_secret
      and length(p_secret) >= 32
  )
$$;

revoke execute on function public.nightly_close_secret_ok(text) from public, anon, authenticated;
grant execute on function public.nightly_close_secret_ok(text) to service_role;

-- ---------------------------------------------------------------------------
-- Schedule: 01:30 UTC Tuesday-Saturday = 20:30 EST / 21:30 EDT, Monday-Friday
-- evenings in New York, after Tiingo has published the day's closes. The
-- function is idempotent, so a missed or doubled run is harmless: anything
-- not settled is picked up the next night.
-- ---------------------------------------------------------------------------
select cron.schedule(
  'nightly-close',
  '30 1 * * 2-6',
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
