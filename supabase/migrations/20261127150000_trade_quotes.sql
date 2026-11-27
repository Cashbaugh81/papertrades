-- Trades, phase 3: "now" trades. A buy or sell placed while the market is
-- open fills at the live price the server took at that moment; otherwise at
-- the next close. The live price is stored with the trade and, once that
-- day's close is in, frozen as price / close so later dividend re-adjustments
-- of old closes move it with them (as for live starts).
alter table public.transactions add column if not exists quote jsonb;

comment on column public.transactions.quote is
  'For a "now" trade placed in market hours: { price, at, ratio? } (live price, when taken, price/close once frozen).';

create or replace function public.freeze_trade_ratios()
returns integer
language sql
security definer
set search_path = ''
as $$
  with todo as (
    select t.id, t.quote || jsonb_build_object('ratio', (t.quote ->> 'price')::numeric / pr.close) as q
    from public.transactions t
    join public.prices pr
      on pr.ticker = t.ticker
     and pr.date = ((t.quote ->> 'at')::timestamptz at time zone 'America/New_York')::date
    where t.quote is not null and not t.quote ? 'ratio' and pr.close > 0
  ), upd as (
    update public.transactions t set quote = todo.q from todo where t.id = todo.id returning 1
  )
  select count(*)::int from upd
$$;
revoke all on function public.freeze_trade_ratios() from public, anon, authenticated;

select cron.schedule('freeze-trade-ratios', '15,45 21-23,0-10 * * *', 'select public.freeze_trade_ratios()');
