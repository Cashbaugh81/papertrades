-- Live purchase prices for a live comparison created during market hours.
-- { "NVDA": { "price": 181.42, "at": "2026-11-24T19:42:10Z", "ratio": 0.9987 } }
-- Written only by the live-quotes function (price, at; once, right after the
-- comparison is created) and nightly-close (ratio = price / that day's close,
-- frozen when the close arrives so later dividend re-adjustments don't move it).
-- Users can read it with their portfolios but not change it.
alter table public.portfolios add column if not exists start_quotes jsonb;

-- Freeze each live price as a ratio to that day's close once the close is in
-- (the same evening): price / close. Later re-adjustments of old closes for
-- dividends and splits then scale the purchase price with them.
create or replace function public.freeze_start_ratios()
returns integer
language sql
security definer
set search_path = ''
as $$
  with todo as (
    select p.id,
           (select jsonb_object_agg(
                     e.key,
                     case when e.value ? 'ratio' or pr.close is null then e.value
                          else e.value || jsonb_build_object('ratio', (e.value ->> 'price')::numeric / pr.close) end)
            from jsonb_each(p.start_quotes) e
            left join public.prices pr
              on pr.ticker = e.key
             and pr.date = ((e.value ->> 'at')::timestamptz at time zone 'America/New_York')::date) as q
    from public.portfolios p
    where p.start_quotes is not null
      and exists (select 1 from jsonb_each(p.start_quotes) e where not e.value ? 'ratio')
  ), upd as (
    update public.portfolios p set start_quotes = todo.q
    from todo where p.id = todo.id and todo.q is distinct from p.start_quotes
    returning 1
  )
  select count(*)::int from upd
$$;
revoke all on function public.freeze_start_ratios() from public, anon, authenticated;

-- Every half hour through the evening, after the closes come in.
select cron.schedule('freeze-start-ratios', '15,45 21-23,0-10 * * *', 'select public.freeze_start_ratios()');
