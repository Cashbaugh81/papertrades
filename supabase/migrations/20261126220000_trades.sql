-- Trades, phase 2 (buy/sell plan): dated buys and sells on top of a
-- portfolio's starting mix.
--
-- * A sale can be a share of the holding (fraction, 1 = all of it) as well as
--   dollars. Trades are never stored as share counts: prices are dividend-
--   adjusted and old ones get rewritten, which would move a share count.
-- * Trades are placed and deleted only through the `trades` edge function,
--   which replays the whole history with the app's engine and saves only if
--   every trade still works (and the plan allows trading). Users can no longer
--   insert transactions directly (nothing in the app did).
-- * Changing a portfolio's starting mix keeps its trades.

alter table public.transactions
  add column if not exists fraction numeric(12, 10) check (fraction > 0 and fraction <= 1);

comment on column public.transactions.fraction is
  'For a sell: the share of the holding sold (1 = all of it). Else null.';

alter table public.transactions drop constraint sized;
alter table public.transactions
  add constraint sized check (kind = 'rebalance' or amount is not null or units is not null or fraction is not null);

-- Only the trades function (service role) and the RPCs write transactions now.
revoke insert on public.transactions from authenticated;

-- Changing the starting mix: keep the trades, replace only the mix.
create or replace function public.replace_column(p_portfolio uuid, p_weights jsonb, p_name text default '', p_note text default '')
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  p public.portfolios;
  s public.comparison_sets;
  first_tx public.transactions;
  old_mix jsonb;
  today date := (now() at time zone 'America/New_York')::date;
  note text;
begin
  if uid is null then raise exception 'sign in first'; end if;
  select * into p from public.portfolios where id = p_portfolio and user_id = uid;
  if p.id is null then raise exception 'portfolio not found'; end if;
  select * into s from public.comparison_sets where id = p.set_id;
  if s.archived_at is not null then raise exception 'that comparison has been closed'; end if;
  perform public.validate_mix(p_weights);
  perform public.check_plan(uid, p.slot, p_weights);

  select * into first_tx from public.transactions
  where portfolio_id = p.id and kind = 'rebalance'
  order by coalesce(placed_at, trade_date::timestamptz), created_at
  limit 1;

  select weights into old_mix from public.transactions
  where portfolio_id = p.id and kind = 'rebalance'
  order by coalesce(placed_at, trade_date::timestamptz) desc, created_at desc
  limit 1;

  note := 'Replaced ' || coalesce(public.mix_name(old_mix), 'the old mix') || ' on '
          || to_char(today, 'Mon FMDD, YYYY') || '.';
  if nullif(trim(coalesce(p_note, '')), '') is not null then
    note := note || ' ' || left(trim(p_note), 500);
  end if;

  -- Only the mix: buys and sells stay (the app checks they still work first).
  delete from public.transactions where portfolio_id = p.id and kind = 'rebalance';

  update public.portfolios
  set name = left(coalesce(nullif(trim(p_name), ''), public.mix_name(p_weights)), 80)
  where id = p.id;

  insert into public.transactions (portfolio_id, user_id, kind, weights, trade_date, placed_at, status, note)
  values (
    p.id, uid, 'rebalance', p_weights,
    coalesce(first_tx.trade_date, p.start_date),
    case when s.what_if then null else coalesce(first_tx.placed_at, p.created_at) end,
    case when s.what_if then 'filled' else 'pending' end,
    note
  );
  return p.id;
end;
$$;

revoke execute on function public.replace_column(uuid, jsonb, text, text) from public, anon;
grant execute on function public.replace_column(uuid, jsonb, text, text) to authenticated;
