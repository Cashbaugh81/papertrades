-- Papertrades core schema: portfolios, transactions (orders) and a shared
-- price cache, with row-level security.
--
-- The rules that keep the record honest live here, not in the browser:
--   * A user's own portfolio starts on today's New York date. Its settings
--     (start, capital, monthly amount, weights) can't change afterwards, since
--     changing them would rewrite past contributions with hindsight.
--   * An order's placed_at is the server clock, never the client's.
--   * Users can place orders and cancel pending ones. Only the server
--     (service role, nightly-close) fills or rejects them. Filled rows are
--     immutable.
--   * Prices are readable by signed-in users and written only by the server.
--
-- Example portfolios (example = true) are seeded market history, labelled in
-- the UI. Their rows keep the legacy model: placed_at is null and they fill
-- at the close of trade_date.

-- ---------------------------------------------------------------------------
-- Price cache
-- ---------------------------------------------------------------------------

create table public.tickers (
  ticker      text primary key check (ticker ~ '^[A-Z0-9][A-Z0-9.\-]{0,11}$'),
  name        text,
  first_date  date,
  last_date   date,
  fetched_at  timestamptz,
  status      text not null default 'ok' check (status in ('ok', 'not_found', 'error')),
  error       text
);

comment on table public.tickers is
  'One row per ticker fetched from Tiingo. Written only by edge functions.';

create table public.prices (
  ticker  text not null references public.tickers (ticker) on delete cascade,
  date    date not null,
  close   numeric(18, 6) not null check (close > 0),
  primary key (ticker, date)
);

comment on table public.prices is
  'Daily split- and dividend-adjusted closes (Tiingo adjClose). Shared by all users; written only by edge functions.';
comment on column public.prices.close is 'Adjusted close.';

alter table public.tickers enable row level security;
alter table public.prices  enable row level security;

create policy "signed-in users read tickers"
  on public.tickers for select to authenticated using (true);
create policy "signed-in users read prices"
  on public.prices for select to authenticated using (true);

revoke all on public.tickers, public.prices from anon, authenticated;
grant select on public.tickers, public.prices to authenticated;

-- ---------------------------------------------------------------------------
-- Portfolios
-- ---------------------------------------------------------------------------

create table public.portfolios (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 80),
  thesis      text not null default '' check (char_length(thesis) <= 500),
  start_date  date not null,
  initial     numeric(14, 2) not null default 0 check (initial >= 0),
  monthly     numeric(14, 2) not null default 0 check (monthly >= 0),
  weights     jsonb check (weights is null or jsonb_typeof(weights) = 'object'),
  example     boolean not null default false,
  created_at  timestamptz not null default now()
);

comment on column public.portfolios.weights is
  'Where each monthly contribution goes: {"VTI": 0.6, "BND": 0.4}. Fixed at creation.';
comment on column public.portfolios.example is
  'Seeded market history, not the user''s decisions. Labelled in the UI.';

create index portfolios_user_id_idx on public.portfolios (user_id);

alter table public.portfolios enable row level security;

create policy "own portfolios: read"
  on public.portfolios for select to authenticated
  using (user_id = (select auth.uid()));
create policy "own portfolios: create"
  on public.portfolios for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "own portfolios: rename"
  on public.portfolios for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy "own portfolios: delete"
  on public.portfolios for delete to authenticated
  using (user_id = (select auth.uid()));

-- Column grants: only name and thesis can be edited after creation.
revoke all on public.portfolios from anon, authenticated;
grant select, delete on public.portfolios to authenticated;
grant insert (id, name, thesis, start_date, initial, monthly, weights, example)
  on public.portfolios to authenticated;
grant update (name, thesis) on public.portfolios to authenticated;

-- A user's own (non-example) portfolio starts today in New York, whatever the
-- client sent. Otherwise, back-dating the start would invest contributions
-- at prices that were already known.
create function public.portfolios_before_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon') and not new.example then
    new.start_date := (now() at time zone 'America/New_York')::date;
  end if;
  return new;
end;
$$;

create trigger portfolios_before_insert
  before insert on public.portfolios
  for each row execute function public.portfolios_before_insert();

-- ---------------------------------------------------------------------------
-- Transactions: deposits and orders
-- ---------------------------------------------------------------------------

create table public.transactions (
  id             uuid primary key default gen_random_uuid(),
  portfolio_id   uuid not null references public.portfolios (id) on delete cascade,
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind           text not null check (kind in ('deposit', 'buy', 'sell')),
  ticker         text check (ticker ~ '^[A-Z0-9][A-Z0-9.\-]{0,11}$'),
  -- Orders are sized in dollars (amount). units is for legacy example rows.
  amount         numeric(14, 2) check (amount > 0),
  units          numeric(24, 10) check (units > 0),
  note           text check (char_length(note) <= 280),
  -- New York calendar date of entry. For example rows, the day they fill.
  trade_date     date not null,
  -- Server time the order was placed. Null only on example rows.
  placed_at      timestamptz,
  status         text not null default 'pending'
                   check (status in ('pending', 'filled', 'rejected')),
  -- Set by the server when the order fills (or is rejected).
  filled_on      date,
  fill_price     numeric(18, 6),
  fill_units     numeric(24, 10),
  fill_amount    numeric(14, 2),
  reject_reason  text,
  processed_at   timestamptz,
  created_at     timestamptz not null default now(),

  constraint deposit_has_no_ticker check ((kind = 'deposit') = (ticker is null)),
  constraint sized check (amount is not null or units is not null),
  constraint deposit_in_dollars check (kind <> 'deposit' or amount is not null),
  constraint fill_complete check (
    status <> 'filled' or kind = 'deposit' or placed_at is null
    or (filled_on is not null and fill_price is not null and fill_units is not null)
  )
);

comment on table public.transactions is
  'Deposits and orders. Orders fill at the first 16:00 New York close after placed_at; nightly-close records the fill.';

create index transactions_portfolio_id_idx on public.transactions (portfolio_id);
create index transactions_user_id_idx on public.transactions (user_id);
create index transactions_pending_idx on public.transactions (ticker, placed_at)
  where status = 'pending';

alter table public.transactions enable row level security;

create policy "own transactions: read"
  on public.transactions for select to authenticated
  using (user_id = (select auth.uid()));

create policy "own transactions: place"
  on public.transactions for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.portfolios p
      where p.id = portfolio_id and p.user_id = (select auth.uid())
    )
  );

-- Cancel a pending order. Filled and rejected rows are the record and stay.
-- Rows in example portfolios can be removed freely.
create policy "own transactions: cancel pending"
  on public.transactions for delete to authenticated
  using (
    user_id = (select auth.uid())
    and (
      status = 'pending'
      or exists (
        select 1 from public.portfolios p
        where p.id = portfolio_id and p.example
      )
    )
  );

-- No update policy: users never edit a transaction. Fills are written by the
-- service role, which bypasses RLS.
revoke all on public.transactions from anon, authenticated;
grant select, delete on public.transactions to authenticated;
grant insert (id, portfolio_id, kind, ticker, amount, units, note, trade_date)
  on public.transactions to authenticated;

create function public.transactions_before_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  is_example boolean;
begin
  if current_user not in ('authenticated', 'anon') then
    return new; -- service role / migrations: trusted
  end if;

  select p.example into is_example
  from public.portfolios p
  where p.id = new.portfolio_id;

  new.user_id := auth.uid();
  new.filled_on := null;
  new.fill_price := null;
  new.fill_units := null;
  new.fill_amount := null;
  new.reject_reason := null;
  new.processed_at := null;

  if coalesce(is_example, false) then
    -- Seeded history: fills at the close of trade_date, computed client-side.
    new.placed_at := null;
    new.status := 'filled';
  else
    new.placed_at := now();
    new.trade_date := (now() at time zone 'America/New_York')::date;
    if new.kind = 'deposit' then
      -- Cash has no price; it is available immediately.
      new.status := 'filled';
    else
      if new.amount is null then
        raise exception 'orders are sized in dollars (amount)';
      end if;
      new.units := null;
      new.status := 'pending';
    end if;
  end if;

  return new;
end;
$$;

create trigger transactions_before_insert
  before insert on public.transactions
  for each row execute function public.transactions_before_insert();
