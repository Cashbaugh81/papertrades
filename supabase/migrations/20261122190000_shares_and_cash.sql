-- Buying by shares: a mix may now add up to less than 100%; the rest stays in
-- cash (e.g. 20 shares of NVDA plus 30 of MSFT out of $10,000, leaving $412).
-- Each ticker is still above zero, and the total still can't pass 100%.
create or replace function public.validate_mix(p_weights jsonb)
returns void
language plpgsql
immutable
set search_path = ''
as $$
declare
  k text;
  v jsonb;
  total numeric := 0;
  n int := 0;
begin
  if p_weights is null or jsonb_typeof(p_weights) <> 'object' then
    raise exception 'a mix must be an object of ticker: fraction';
  end if;
  for k, v in select * from jsonb_each(p_weights) loop
    n := n + 1;
    if k !~ '^[A-Z0-9][A-Z0-9.\-]{0,11}$' then
      raise exception 'not a ticker: %', k;
    end if;
    if jsonb_typeof(v) <> 'number' or (v #>> '{}')::numeric <= 0 then
      raise exception 'each percentage must be above zero';
    end if;
    total := total + (v #>> '{}')::numeric;
  end loop;
  if n < 1 or n > 8 then
    raise exception 'a mix holds 1 to 8 tickers';
  end if;
  if total > 1.0001 then
    raise exception 'percentages add up to more than 100';
  end if;
end;
$$;

-- The mix's name mentions the cash it keeps back, if any.
create or replace function public.mix_name(p_weights jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
  select string_agg(key || ' ' || round((value #>> '{}')::numeric * 100)::text || '%', ' · '
                    order by (value #>> '{}')::numeric desc, key)
         || case when 1 - sum((value #>> '{}')::numeric) >= 0.005
                 then ' · Cash ' || round((1 - sum((value #>> '{}')::numeric)) * 100)::text || '%'
                 else '' end
  from jsonb_each(p_weights)
$$;

-- The close each ticker would buy at for a start date: the first close on or
-- after it (a stock not trading yet buys at its first close), or, for a start
-- date with no close yet (today), the latest close as an estimate.
-- Read-only and limited to 10 tickers; prices themselves stay unreadable.
create or replace function public.prices_on(p_tickers text[], p_day date)
returns table (ticker text, day date, close numeric, estimate boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select t.ticker,
         coalesce(a.date, b.date),
         coalesce(a.close, b.close)::numeric,
         a.date is null
  from unnest(p_tickers[1:10]) as t(ticker)
  left join lateral (
    select p.date, p.close from public.prices p
    where p.ticker = t.ticker and p.date >= p_day
    order by p.date limit 1
  ) a on true
  left join lateral (
    select p.date, p.close from public.prices p
    where p.ticker = t.ticker and p.date < p_day
    order by p.date desc limit 1
  ) b on true
  where auth.uid() is not null
    and coalesce(a.close, b.close) is not null
$$;

revoke all on function public.prices_on(text[], date) from public, anon;
grant execute on function public.prices_on(text[], date) to authenticated;
