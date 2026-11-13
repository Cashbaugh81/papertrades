-- The product is now "one comparison": a start date, a starting amount and a
-- weekly amount, shared by up to three columns, each holding a mix of
-- tickers with percentages. Column 1 defaults to 100% VTI.
--
--   comparison_sets   start date, amounts, what_if, archived_at
--   portfolios        a column: set_id + slot (1-3), name, its own start date
--   transactions      'rebalance' orders carry the mix (weights) and move all
--                     of a column's money into it at the next close
--
-- Sets started today build a real record: orders get server time and fill at
-- the next close. Sets started in the past are what-ifs (chosen with
-- hindsight) and say so in the UI.
--
-- Sets, columns and their first mix are created only through the RPCs below,
-- so the rules can't be skipped by writing rows directly.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- A mix is {"TICKER": fraction, ...}: 1-8 tickers, each > 0, summing to 1.
create function public.validate_mix(p_weights jsonb)
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
  if abs(total - 1) > 0.0001 then
    raise exception 'percentages must add up to 100';
  end if;
end;
$$;

create function public.mix_name(p_weights jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
  select string_agg(key || ' ' || round((value #>> '{}')::numeric * 100)::text || '%', ' · '
                    order by (value #>> '{}')::numeric desc, key)
  from jsonb_each(p_weights)
$$;

-- ---------------------------------------------------------------------------
-- comparison_sets
-- ---------------------------------------------------------------------------

create table public.comparison_sets (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  start_date   date not null,
  initial      numeric(14, 2) not null check (initial >= 0),
  weekly       numeric(14, 2) not null default 0 check (weekly >= 0),
  what_if      boolean not null,
  created_at   timestamptz not null default now(),
  archived_at  timestamptz,
  constraint some_money check (initial > 0 or weekly > 0)
);

comment on table public.comparison_sets is
  'One comparison: shared start date and amounts for up to three columns. what_if = started in the past.';

create unique index comparison_sets_one_active on public.comparison_sets (user_id) where archived_at is null;
create index comparison_sets_user_id_idx on public.comparison_sets (user_id);

alter table public.comparison_sets enable row level security;
create policy "own sets: read"
  on public.comparison_sets for select to authenticated
  using (user_id = (select auth.uid()));
revoke all on public.comparison_sets from anon, authenticated;
grant select on public.comparison_sets to authenticated;

-- ---------------------------------------------------------------------------
-- portfolios become columns of a set
-- ---------------------------------------------------------------------------

drop trigger portfolios_before_insert on public.portfolios;
drop function public.portfolios_before_insert();
drop policy "own portfolios: create" on public.portfolios;
drop policy "own portfolios: delete" on public.portfolios;
-- The old cancel rule looked at portfolios.example, which goes away below.
drop policy "own transactions: cancel pending" on public.transactions;

alter table public.portfolios
  drop column initial,
  drop column monthly,
  drop column weights,
  drop column example,
  add column set_id uuid not null references public.comparison_sets (id) on delete cascade,
  add column slot smallint not null check (slot between 1 and 3);

comment on column public.portfolios.start_date is
  'When this column''s money starts: the set''s start date, or the day a column was added to a live set.';

create unique index portfolios_set_slot on public.portfolios (set_id, slot);
create index portfolios_set_id_idx on public.portfolios (set_id);

revoke all on public.portfolios from anon, authenticated;
grant select on public.portfolios to authenticated;
grant update (name, thesis) on public.portfolios to authenticated;

-- ---------------------------------------------------------------------------
-- transactions: add mix changes
-- ---------------------------------------------------------------------------

alter table public.transactions
  drop constraint transactions_kind_check,
  drop constraint deposit_has_no_ticker,
  drop constraint sized,
  drop constraint fill_complete,
  add column weights jsonb;

alter table public.transactions
  add constraint transactions_kind_check check (kind in ('deposit', 'buy', 'sell', 'rebalance')),
  add constraint ticker_matches_kind check ((kind in ('buy', 'sell')) = (ticker is not null)),
  add constraint rebalance_has_mix check ((kind = 'rebalance') = (weights is not null)),
  add constraint sized check (kind = 'rebalance' or amount is not null or units is not null),
  add constraint fill_complete check (
    status <> 'filled' or kind in ('deposit', 'rebalance') or placed_at is null
    or (filled_on is not null and fill_price is not null and fill_units is not null)
  );

comment on column public.transactions.weights is
  'For kind = rebalance: the mix to move all of the column''s money into at the next close.';

create policy "own transactions: cancel pending"
  on public.transactions for delete to authenticated
  using (user_id = (select auth.uid()) and status = 'pending');

-- Users may also place orders and mix changes directly; the trigger stamps them.
grant insert (id, portfolio_id, kind, ticker, amount, units, note, trade_date, weights)
  on public.transactions to authenticated;

create or replace function public.transactions_before_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  archived timestamptz;
begin
  if current_user not in ('authenticated', 'anon') then
    return new; -- RPCs (security definer), service role, migrations: trusted
  end if;

  select s.archived_at into archived
  from public.portfolios p
  join public.comparison_sets s on s.id = p.set_id
  where p.id = new.portfolio_id;
  if archived is not null then
    raise exception 'that comparison has been closed';
  end if;

  new.user_id := auth.uid();
  new.filled_on := null;
  new.fill_price := null;
  new.fill_units := null;
  new.fill_amount := null;
  new.reject_reason := null;
  new.processed_at := null;
  new.placed_at := now();
  new.trade_date := (now() at time zone 'America/New_York')::date;

  if new.kind = 'rebalance' then
    perform public.validate_mix(new.weights);
    new.ticker := null;
    new.amount := null;
    new.units := null;
    new.status := 'pending';
  elsif new.kind = 'deposit' then
    new.weights := null;
    new.status := 'filled';
  else
    if new.amount is null then
      raise exception 'orders are sized in dollars (amount)';
    end if;
    new.weights := null;
    new.units := null;
    new.status := 'pending';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

-- Start a comparison. Archives the user's current one (kept, not deleted).
-- p_columns: [{"slot": 1, "name": "...", "weights": {"VTI": 1}}, ...], 1-3 of them.
create function public.create_comparison_set(
  p_start_date date,
  p_initial numeric,
  p_weekly numeric,
  p_columns jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  today date := (now() at time zone 'America/New_York')::date;
  is_what_if boolean;
  set_id uuid;
  col jsonb;
  pid uuid;
  slot_no int;
  seen int[] := '{}';
begin
  if uid is null then raise exception 'sign in first'; end if;
  if p_start_date is null or p_start_date > today then
    raise exception 'the start date can''t be in the future';
  end if;
  if p_start_date < date '2000-01-03' then
    raise exception 'prices go back to January 2000';
  end if;
  if coalesce(p_initial, 0) < 0 or coalesce(p_weekly, 0) < 0 then
    raise exception 'amounts can''t be negative';
  end if;
  if coalesce(p_initial, 0) = 0 and coalesce(p_weekly, 0) = 0 then
    raise exception 'enter a starting amount, a weekly amount, or both';
  end if;
  if p_initial > 100000000 or p_weekly > 1000000 then
    raise exception 'that amount is too large';
  end if;
  if jsonb_typeof(p_columns) <> 'array' or jsonb_array_length(p_columns) not between 1 and 3 then
    raise exception 'choose 1 to 3 columns';
  end if;

  is_what_if := p_start_date < today;

  update public.comparison_sets set archived_at = now()
  where user_id = uid and archived_at is null;

  insert into public.comparison_sets (user_id, start_date, initial, weekly, what_if)
  values (uid, p_start_date, coalesce(p_initial, 0), coalesce(p_weekly, 0), is_what_if)
  returning id into set_id;

  for col in select * from jsonb_array_elements(p_columns) loop
    slot_no := (col ->> 'slot')::int;
    if slot_no is null or slot_no not between 1 and 3 or slot_no = any (seen) then
      raise exception 'each column needs its own slot, 1 to 3';
    end if;
    seen := seen || slot_no;
    perform public.validate_mix(col -> 'weights');

    insert into public.portfolios (user_id, set_id, slot, name, thesis, start_date)
    values (uid, set_id, slot_no,
            left(coalesce(nullif(trim(col ->> 'name'), ''), public.mix_name(col -> 'weights')), 80),
            '', p_start_date)
    returning id into pid;

    -- The first mix. A live set's fills at the next close after now; a
    -- what-if's fills at the start date's close (computed by the engine).
    insert into public.transactions (portfolio_id, user_id, kind, weights, trade_date, placed_at, status)
    values (pid, uid, 'rebalance', col -> 'weights', p_start_date,
            case when is_what_if then null else now() end,
            case when is_what_if then 'filled' else 'pending' end);
  end loop;

  return set_id;
end;
$$;

-- Fill an empty column of the active set. In a live set it starts now; in a
-- what-if it replays from the set's start date like the others.
create function public.add_column(p_set uuid, p_slot int, p_name text, p_weights jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  s public.comparison_sets;
  start date;
  pid uuid;
begin
  if uid is null then raise exception 'sign in first'; end if;
  select * into s from public.comparison_sets where id = p_set and user_id = uid;
  if s.id is null then raise exception 'comparison not found'; end if;
  if s.archived_at is not null then raise exception 'that comparison has been closed'; end if;
  if p_slot is null or p_slot not between 1 and 3 then raise exception 'slot must be 1 to 3'; end if;
  if exists (select 1 from public.portfolios where set_id = p_set and slot = p_slot) then
    raise exception 'that column is already filled';
  end if;
  perform public.validate_mix(p_weights);

  start := case when s.what_if then s.start_date else (now() at time zone 'America/New_York')::date end;

  insert into public.portfolios (user_id, set_id, slot, name, thesis, start_date)
  values (uid, p_set, p_slot, left(coalesce(nullif(trim(p_name), ''), public.mix_name(p_weights)), 80), '', start)
  returning id into pid;

  insert into public.transactions (portfolio_id, user_id, kind, weights, trade_date, placed_at, status)
  values (pid, uid, 'rebalance', p_weights, start,
          case when s.what_if then null else now() end,
          case when s.what_if then 'filled' else 'pending' end);
  return pid;
end;
$$;

revoke execute on function public.create_comparison_set(date, numeric, numeric, jsonb) from public, anon;
revoke execute on function public.add_column(uuid, int, text, jsonb) from public, anon;
grant execute on function public.create_comparison_set(date, numeric, numeric, jsonb) to authenticated;
grant execute on function public.add_column(uuid, int, text, jsonb) to authenticated;
revoke execute on function public.validate_mix(jsonb) from public, anon;
grant execute on function public.validate_mix(jsonb) to authenticated, service_role;
