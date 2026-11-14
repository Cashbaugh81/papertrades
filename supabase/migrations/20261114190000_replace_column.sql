-- ---------------------------------------------------------------------------
-- Changing a portfolio's mix restarts it from its start date.
--
-- Before: a mix change was a rebalance order, filled at the next close.
-- Now (Chris, 14 Nov): a change replaces the column as if it had always held
-- the new mix. Its history is cleared and one starting mix is written with the
-- same timing as the original start:
--   * what-if set: fills at the start date's close (placed_at null, filled);
--   * live set: fills at the first close after the original start was placed
--     (same placed_at, pending until nightly-close records the fill).
-- The decision log keeps a note of what was replaced and when.
-- ---------------------------------------------------------------------------

create function public.replace_column(p_portfolio uuid, p_weights jsonb, p_name text default '', p_note text default '')
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

  -- The original start: the earliest mix in this column.
  select * into first_tx from public.transactions
  where portfolio_id = p.id and kind = 'rebalance'
  order by coalesce(placed_at, trade_date::timestamptz), created_at
  limit 1;

  -- What it holds now, for the note: the latest mix.
  select weights into old_mix from public.transactions
  where portfolio_id = p.id and kind = 'rebalance'
  order by coalesce(placed_at, trade_date::timestamptz) desc, created_at desc
  limit 1;

  note := 'Replaced ' || coalesce(public.mix_name(old_mix), 'the old mix') || ' on '
          || to_char(today, 'Mon FMDD, YYYY') || '.';
  if nullif(trim(coalesce(p_note, '')), '') is not null then
    note := note || ' ' || left(trim(p_note), 500);
  end if;

  delete from public.transactions where portfolio_id = p.id;

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
